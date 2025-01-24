import { AuthController } from "./controller/auth";
import { autowireControllers } from "./controller/controller";
import { WsController } from "./controller/ws";
import { applyMiddlewares } from "./middleware/middleware";
import { ConfigService } from "./service/config";
import { KbService } from "./service/kb";
import { autowireServices } from "./service/service";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { fastifyMultipart } from "@fastify/multipart";
import { AuthMiddleware } from "./middleware/auth";
import { KbController } from "./controller/kb";
import { MiscController } from "./controller/misc";
import { FsController } from "./controller/fs";
import { loggerFastify } from "./utils/logger";
import { LogsService } from "./service/logs";
import fs from "fs";

const main = async () => {
  const services = autowireServices([ConfigService, KbService, LogsService]);
  const controllers = autowireControllers(
    [AuthController, FsController, WsController, KbController, MiscController],
    services,
  );

  const configService = services.get(ConfigService) as ConfigService;
  const config = configService.getConfig();

  // https
  const httpsOptions = config.https
    ? {
        https: {
          key: fs.readFileSync(config.https.key),
          cert: fs.readFileSync(config.https.cert),
        },
      }
    : {};

  const fastify = Fastify({
    ...config,
    logger: config.logger ? loggerFastify : false,
    ...httpsOptions,
  });

  fastify.register(cors, {
    origin: true, // use the origin of the request
  });
  fastify.register(fastifyMultipart, {
    limits: {
      fileSize: config.maxFileSize * 1024 * 1024,
    },
  });
  controllers.registerToFastify(fastify);
  applyMiddlewares(fastify, [AuthMiddleware]);

  await fastify.listen({
    host: config.host ?? "0.0.0.0",
    port: config.port ?? 8080,
  });
};

main();
