import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { JwtPayloadSchema } from "../common/type-and-schemas/jwtPayload";
import { RoleType } from "../common/type-and-schemas/role";
import { Middleware } from "./middleware";
import { fastifyJwt } from "@fastify/jwt";
import { logger } from "../utils/logger";

declare module "fastify" {
  interface FastifyRequest {
    role: RoleType;
    location?: string;
  }
}

export class AuthMiddleware extends Middleware {
  onRequest(
    request: FastifyRequest,
    reply: FastifyReply,
    fastify: FastifyInstance,
  ) {
    const token = request.headers.authorization;

    if (!token) {
      logger.info("No token provided");
      request.role = "visitor";
      return;
    }

    try {
      const payload = fastify.jwt.verify(token);
      const validationResult = JwtPayloadSchema.safeParse(payload);
      if (!validationResult.success) {
        logger.info("Invalid token payload, ", payload);
        request.role = "visitor";
        return;
      }

      request.role = validationResult.data.role;
      // 如果角色是 kb-editor，则需要将其编辑的数据库路径放到 request 中
      if (validationResult.data.role === "kb-editor") {
        request.location = validationResult.data.location;
      }
    } catch (error) {
      logger.info("Error verifying token, ", error);
      request.role = "visitor";
    }
  }
}
