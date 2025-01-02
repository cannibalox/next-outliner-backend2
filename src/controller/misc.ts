import {
  FetchWebpageTitleSchema,
  PingSchema,
} from "../common/type-and-schemas/api/misc";
import { Controller, RegisterHandlerParams } from "./controller";
import axios from "axios";
import { decode } from "html-entities";

export class MiscController extends Controller {
  registerHandlers({ onPost }: RegisterHandlerParams): void {
    onPost(
      "/ping",
      "检测服务器是否正常",
      PingSchema.request,
      PingSchema.result,
      ["admin", "kb-editor", "visitor"],
      async () => {
        return {};
      },
    );

    onPost(
      "/fetch-webpage-title",
      "获取网页标题",
      FetchWebpageTitleSchema.request,
      FetchWebpageTitleSchema.result,
      ["admin", "kb-editor"],
      async ({ webpageUrl }) => {
        const inner = async (url: string) => {
          const resp = await axios.get(url, {
            responseType: "text",
            maxRedirects: 10,
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
          });
          const regex = /<title(?:\s+[^>]*?)?>([^<>\n\r]+)<\/title>/;
          const match = regex.exec(resp.data);
          if (!match) return null;
          // decode html entities
          const content = match[1];
          return decode(content);
        };
        webpageUrl = webpageUrl.trim();
        const rawUrl = webpageUrl.startsWith("https://")
          ? webpageUrl.slice(8)
          : webpageUrl.startsWith("http://")
            ? webpageUrl.slice(7)
            : webpageUrl;
        const title =
          (await inner("https://" + rawUrl)) ||
          (await inner("http://" + rawUrl));
        // 如果 title 为空，则返回网页 URL
        return { title: title ?? webpageUrl };
      },
    );
  }
}
