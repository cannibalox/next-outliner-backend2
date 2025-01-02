import winston from "winston";

export const logger = winston.createLogger({
  level: "debug",
  transports: [
    new winston.transports.Console({
      format: winston.format.printf((log) => log.message), // show msg only in console
    }),
    new winston.transports.File({
      filename: "error.log",
      level: "error",
      format: winston.format.json(),
    }),
    new winston.transports.File({
      filename: "combined.log",
      format: winston.format.json(),
    }),
  ],
});
