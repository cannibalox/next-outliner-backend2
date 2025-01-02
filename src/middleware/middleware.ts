import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export type ClassType<T> = new (...args: any[]) => T;

export class Middleware {
  onRequest(
    request: FastifyRequest,
    reply: FastifyReply,
    fastify: FastifyInstance,
  ) {}
}

export const applyMiddlewares = (
  app: FastifyInstance,
  middlewares: ClassType<Middleware>[],
) => {
  for (const middleware of middlewares) {
    const instance = new middleware();
    app.addHook("onRequest", (request, reply, done) => {
      instance.onRequest(request, reply, app);
      done();
    });
  }
};
