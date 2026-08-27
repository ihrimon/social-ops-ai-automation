import pino from "pino";
import { appConfig } from "../config/env.js";

type LogFields = Record<string, unknown>;

const level = process.env.DEBUG ? "debug" : appConfig.logLevel;

const pinoLogger = pino({
  level,
  // Human-readable output locally; raw NDJSON in production for log aggregators.
  transport:
    appConfig.nodeEnv === "production"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } },
});

export const logger = {
  info(message: string, fields?: LogFields): void {
    pinoLogger.info(fields ?? {}, message);
  },
  warn(message: string, fields?: LogFields): void {
    pinoLogger.warn(fields ?? {}, message);
  },
  error(message: string, fields?: LogFields): void {
    pinoLogger.error(fields ?? {}, message);
  },
  debug(message: string, fields?: LogFields): void {
    pinoLogger.debug(fields ?? {}, message);
  },
};
