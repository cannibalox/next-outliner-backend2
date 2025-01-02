import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { RESP_CODES } from "../../common/constants";
import { BusinessError } from "./error";
import { RoleType } from "../../common/type-and-schemas/role";
import { logger } from "../logger";

export const definePostApi = <
  PARAMS_SCHEMA extends z.ZodType<any, any, any>,
  RESULT_SCHEMA extends z.ZodType<any, any, any>,
>(
  app: FastifyInstance,
  endpoint: string,
  description: string,
  paramsSchema: PARAMS_SCHEMA,
  resultSchema: RESULT_SCHEMA,
  handler: (
    params: z.infer<PARAMS_SCHEMA>,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<z.infer<RESULT_SCHEMA>> | z.infer<RESULT_SCHEMA>,
  auth: RoleType[],
) => {
  logger.info(`[POST] ${endpoint}\t\t\t${description}`);
  app.post(endpoint, async (request, reply) => {
    if (!request.role || !auth.includes(request.role)) {
      return { success: false, code: RESP_CODES.NO_AUTHORIZATION };
    }

    const params = {
      ...((request.body as any) ?? {}),
      ...request.headers,
      ...((request.query as any) ?? {}),
    };

    const validationResult = paramsSchema.safeParse(params);
    if (!validationResult.success) {
      const errCodeName = RESP_CODES[RESP_CODES.INVALID_REQUEST];
      logger.error(`[${errCodeName}] ${validationResult.error.message}`);
      return {
        success: false,
        code: RESP_CODES.INVALID_REQUEST,
        msg: validationResult.error.toString(),
      };
    }
    const validatedParams = validationResult.data;

    try {
      const result = await handler(validatedParams, request, reply);
      return { success: true, data: result };
    } catch (err) {
      if (err instanceof BusinessError) {
        const errCodeName = RESP_CODES[err.code as keyof typeof RESP_CODES];
        logger.error(`[${errCodeName}] ${err.message}\n ${err.debugMessage}`);
        return { success: false, code: err.code, msg: err.message };
      }
      const errCodeName = RESP_CODES[RESP_CODES.UNKNOWN_ERROR];
      logger.error(`[${errCodeName}] ${(err as Error).toString()}`);
      console.error(err);
      return { success: false, code: RESP_CODES.UNKNOWN_ERROR };
    }
  });
};
