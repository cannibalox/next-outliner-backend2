import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AssembledServices, Service } from "../service/service";
import { z } from "zod";
import { RoleType } from "../common/type-and-schemas/role";
import { logger } from "../utils/logger";
import { RESP_CODES } from "../common/constants";
import { BusinessError } from "../utils/helper-functions/error";

type ClassType<T> = new (...args: any[]) => T;

export type ControllerInitContext = {
  getService<T extends Service>(classType: ClassType<T>): T;
};

type OnPost = <
  PARAMS_SCHEMA extends z.ZodType<any, any, any>,
  RESULT_SCHEMA extends z.ZodType<any, any, any>,
>(
  endpoint: string,
  desc: string,
  paramsSchema: PARAMS_SCHEMA,
  resultSchema: RESULT_SCHEMA,
  auth: RoleType[],
  handler: (
    params: z.infer<PARAMS_SCHEMA>,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<z.infer<RESULT_SCHEMA>> | z.infer<RESULT_SCHEMA>,
) => void;

export type RegisterHandlerParams = {
  fastify: FastifyInstance;
  // onGet: never; // TODO: implement
  onPost: OnPost;
  // onPut: never; // TODO: implement
  // onDelete: never; // TODO: implement
  // onPatch: never; // TODO: implement
};

export abstract class Controller {
  init(context: ControllerInitContext) {}
  registerHandlers(params: RegisterHandlerParams) {}
}

export class AssembledControllers {
  private _controllers: Map<ClassType<Controller>, Controller>;

  constructor(controllers: Map<ClassType<Controller>, Controller>) {
    this._controllers = controllers;
  }

  get<T extends Controller>(classType: ClassType<T>): T {
    if (!this._controllers.has(classType)) {
      throw new Error(`Controller ${classType.name} not found`);
    }
    return this._controllers.get(classType) as T;
  }

  registerToFastify(fastify: FastifyInstance) {
    for (const controller of this._controllers.values()) {
      controller.registerHandlers({
        fastify,
        onPost: (endpoint, desc, paramsSchema, resultSchema, auth, handler) => {
          logger.info(`[POST] ${endpoint.padEnd(40, " ")} ${desc}`);
          fastify.post(endpoint, async (req, res) => {
            // 权限不正确
            if (!req.role || !auth.includes(req.role)) {
              return { success: false, code: RESP_CODES.NO_AUTHORIZATION };
            }

            const params = {
              ...((req.body as any) ?? {}),
              ...req.headers,
              ...((req.query as any) ?? {}),
            };

            // 参数校验
            const validationResult = paramsSchema.safeParse(params);
            if (!validationResult.success) {
              const errCodeName = RESP_CODES[RESP_CODES.INVALID_REQUEST];
              logger.error(
                `[${errCodeName}] ${validationResult.error.message}`,
              );
              return {
                success: false,
                code: RESP_CODES.INVALID_REQUEST,
                msg: validationResult.error.toString(),
              };
            }
            const validatedParams = validationResult.data;

            try {
              const result = await handler(validatedParams, req, res);
              return { success: true, data: result };
            } catch (err) {
              if (err instanceof BusinessError) {
                const errCodeName =
                  RESP_CODES[err.code as keyof typeof RESP_CODES];
                logger.error(`[${errCodeName}] ${err.message}`);
                return { success: false, code: err.code, msg: err.message };
              }
              const errCodeName = RESP_CODES[RESP_CODES.UNKNOWN_ERROR];
              logger.error(`[${errCodeName}] ${err}`);
              return { success: false, code: RESP_CODES.UNKNOWN_ERROR };
            }
          });
        },
      });
    }
  }
}

export const autowireControllers = (
  controllerClasses: ClassType<Controller>[],
  services: AssembledServices,
): AssembledControllers => {
  const registry = new Map<ClassType<Controller>, Controller>();

  // Instantiate all controllers
  for (const controllerClass of controllerClasses) {
    const controller = new controllerClass();
    registry.set(controllerClass, controller);
  }

  // Create a context object that provides a method to get services
  const context: ControllerInitContext = {
    getService: <T extends Service>(classType: ClassType<T>) => {
      const service = services.get(classType);
      if (!service) throw new Error(`Service ${classType.name} not found`);
      return service as T;
    },
  };

  // Initialize all controllers, with all dependencies autowired
  for (const controllerClass of controllerClasses) {
    const controller = registry.get(controllerClass);
    controller!.init(context);
  }

  return new AssembledControllers(registry);
};
