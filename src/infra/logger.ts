type LogFields = Record<string, unknown>;

function timestamp(): string {
  return new Date().toISOString();
}

function format(level: string, message: string, fields?: LogFields): string {
  const suffix = fields && Object.keys(fields).length ? ` ${JSON.stringify(fields)}` : "";
  return `[${timestamp()}] ${level.toUpperCase()} ${message}${suffix}`;
}

export const logger = {
  info(message: string, fields?: LogFields): void {
    console.log(format("info", message, fields));
  },
  warn(message: string, fields?: LogFields): void {
    console.warn(format("warn", message, fields));
  },
  error(message: string, fields?: LogFields): void {
    console.error(format("error", message, fields));
  },
  debug(message: string, fields?: LogFields): void {
    if (process.env.DEBUG) {
      console.debug(format("debug", message, fields));
    }
  },
};
