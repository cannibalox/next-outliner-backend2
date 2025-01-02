import axios from "axios";
import { decode } from "html-entities";

let webpageUrl = "https://www.baidu.com";

(async () => {
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
    (await inner("https://" + rawUrl)) || (await inner("http://" + rawUrl));
  console.log(title);
})();
