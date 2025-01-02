import path from "path";
import { JwtPayloadSchema } from "../common/type-and-schemas/jwtPayload";
import { WebsocketServerNetwork } from "../utils/helper-functions/loro/network/impl/websocket/server";
import { logger } from "../utils/logger";
import {
  Controller,
  ControllerInitContext,
  RegisterHandlerParams,
} from "./controller";
import { ServerNetworkSetupTool } from "../utils/helper-functions/loro/setupNetwork";
import { SqliteLoroDocPersister } from "../utils/helper-functions/loro/persister/impl/sqlite";
import { MockCoordinator } from "../utils/helper-functions/loro/coordinator/mockCoordinator";

export class WsController extends Controller {
  private _wsNetwork: WebsocketServerNetwork | null = null;

  init(context: ControllerInitContext): void {
    this._wsNetwork = new WebsocketServerNetwork();
    const setupTool = new ServerNetworkSetupTool(
      new SqliteLoroDocPersister(),
      new MockCoordinator(),
    );
    setupTool.setup(this._wsNetwork);
  }

  registerHandlers({ fastify }: RegisterHandlerParams): void {
    fastify.server.on("upgrade", (req, socket, head) => {
      // parse url
      let url;
      try {
        url = new URL(req.url!, `http://${req.headers.host}`);
      } catch (err) {
        logger.info(`invalid url ${req.url}`);
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        socket.destroy();
      }

      const params = url!.searchParams;
      logger.info(`params: ${params}`);

      // 检查参数是否完整
      if (!params.has("location") || !params.has("authorization")) {
        logger.info(
          "invalid ws request, missing `authorization` or `location`",
        );
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        socket.destroy();
        return;
      }

      // 验证 jwt，并从 payload 中获取要访问的知识库的 location
      const authorization = params.get("authorization")!;
      let location: string;
      try {
        const payload = fastify.jwt.verify(authorization);
        const validationResult = JwtPayloadSchema.safeParse(payload);
        if (
          !validationResult.success ||
          validationResult.data.role !== "kb-editor"
        )
          throw new Error("invalid jwt payload");
        location = validationResult.data.location;
      } catch (err) {
        logger.info("ws request authorization failed");
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }

      // 建立 websocket 连接
      const wss = this._wsNetwork!.wss!;
      const dbLocation = path.join(location, "app-data.db");
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, { location: dbLocation }); // 将 location 作为参数传递给事件处理器
      });
    });
  }
}
