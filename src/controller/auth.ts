import { FastifyInstance } from "fastify";
import {
  Controller,
  ControllerInitContext,
  RegisterHandlerParams,
} from "./controller";
import {
  AdminLoginSchema,
  KbEditorLoginSchema,
} from "../common/type-and-schemas/api/auth";
import {
  MAX_ADMIN_LOGIN_ATTEMPTS,
  MAX_KB_EDITOR_LOGIN_ATTEMPTS,
} from "../utils/constants";
import { RESP_CODES } from "../common/constants";
import { BusinessError } from "../utils/helper-functions/error";
import { ConfigService } from "../service/config";
import crypto from "crypto";
import { KbService } from "../service/kb";
import { fastifyJwt } from "@fastify/jwt";

export class AuthController extends Controller {
  private _configService: ConfigService | null = null;
  private _kbService: KbService | null = null;

  private _adminLoginAttempts = new Map<string, number>();
  private _kbEditorLoginAttempts = new Map<string, number>();

  init(ctx: ControllerInitContext) {
    this._configService = ctx.getService(ConfigService);
    this._kbService = ctx.getService(KbService);
  }

  registerHandlers({ fastify, onPost }: RegisterHandlerParams) {
    const config = this._configService!.getConfig();
    fastify.register(fastifyJwt, { secret: config.jwtSecret });
    fastify.decorateRequest("role", "visitor");

    onPost(
      "/login/admin",
      "管理员登录",
      AdminLoginSchema.request,
      AdminLoginSchema.result,
      ["admin", "kb-editor", "visitor"],
      async ({ serverUrl, password }, request) => {
        const ip = request.ip;

        // 密码错误超过最大尝试次数
        if ((this._adminLoginAttempts.get(ip) ?? 0) > MAX_ADMIN_LOGIN_ATTEMPTS)
          throw new BusinessError(RESP_CODES.EXCEED_MAX_ATTEMPTS);

        const config = this._configService!.getConfig();
        const correctPasswordHash = config.adminPasswordHash;
        const salt = config.adminSalt;
        const receivedPasswordHash = crypto
          .pbkdf2Sync(password, salt, 100000, 64, "sha512")
          .toString("hex");

        // 密码错误，错误尝试计数加1
        if (receivedPasswordHash !== correctPasswordHash) {
          this._adminLoginAttempts.set(
            ip,
            (this._adminLoginAttempts.get(ip) ?? 0) + 1,
          );
          throw new BusinessError(RESP_CODES.PASSWORD_INCORRECT);
        }

        // 密码正确，错误尝试计数清零
        this._adminLoginAttempts.delete(ip);
        return {
          token: fastify.jwt.sign({
            role: "admin",
            serverUrl,
          }),
        };
      },
    );

    onPost(
      "/login/kb-editor",
      "知识库编辑器登录",
      KbEditorLoginSchema.request,
      KbEditorLoginSchema.result,
      ["admin", "kb-editor", "visitor"],
      async ({ location, serverUrl, password }, request) => {
        const ip = request.ip;

        // 密码错误超过最大尝试次数
        if (
          (this._kbEditorLoginAttempts.get(ip) ?? 0) >
          MAX_KB_EDITOR_LOGIN_ATTEMPTS
        )
          throw new BusinessError(RESP_CODES.EXCEED_MAX_ATTEMPTS);

        const kbInfo = await this._kbService!.getKbInfo(location);
        if (!kbInfo)
          throw new BusinessError(
            RESP_CODES.TARGET_NOT_FOUND,
            `知识库 ${location} 不存在`,
          );

        const correctPasswordHash = kbInfo.passwordHash;
        const salt = kbInfo.salt;
        const receivedPasswordHash = crypto
          .pbkdf2Sync(password, salt, 100000, 64, "sha512")
          .toString("hex");

        // 密码错误，错误尝试计数加
        if (receivedPasswordHash !== correctPasswordHash) {
          this._kbEditorLoginAttempts.set(
            ip,
            (this._kbEditorLoginAttempts.get(ip) ?? 0) + 1,
          );
          throw new BusinessError(RESP_CODES.PASSWORD_INCORRECT);
        }

        // 密码正确，错误尝试计数清零
        this._kbEditorLoginAttempts.delete(ip);
        return {
          token: fastify.jwt.sign({
            role: "kb-editor",
            location,
            serverUrl,
          }),
        };
      },
    );
  }
}
