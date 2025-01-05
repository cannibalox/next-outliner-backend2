import winston from "winston";
// @ts-ignore
import { serializers } from "fastify/lib/logger";

const levels = Object.assign(
  { fatal: 0, warn: 4, trace: 7 },
  winston.config.syslog.levels,
);

export const logger = winston.createLogger({
  level: "debug",
  levels,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.splat(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console({ format: winston.format.simple() }),
    new winston.transports.File({
      filename: "combined.log",
    }),
  ],
});

const LEVEL = Symbol.for("level");
const SPLAT = Symbol.for("splat");

export const logFastify = (level: string, ...args: any[]) => {
  const [arg0, arg1] = args;

  if (!arg0) return;

  let info: Record<string | symbol, unknown> = {};

  if (typeof arg0 === "string") {
    // format: message [...splat]
    info.message = arg0;
    info[SPLAT] = args.slice(1);
  } else {
    // format: meta [message] [...splat]
    info = arg0 as Record<string, unknown>;

    if (arg0 instanceof Error) info = { err: arg0, message: arg0.message };

    // serialize fastify req, res, err
    for (const key in info)
      if (serializers[key]) info[key] = serializers[key](info[key]);

    if (arg1) info.message = arg1;
    info[SPLAT] = args.slice(2);
  }

  info[LEVEL] = info.level = level;

  Object.assign(info, logger.defaultMeta);

  logger.write(info);
};

export const loggerFastify = Object.keys(levels).reduce((acc, level) => {
  acc[level] = (...args: any[]) => logFastify(level, ...args);
  return acc;
}, {} as any);
loggerFastify.child = logger.child;
