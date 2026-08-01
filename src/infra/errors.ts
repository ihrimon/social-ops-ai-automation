/** Base class for errors that are expected/handled parts of app operation (vs. programmer bugs). */
export class AppError extends Error {
  readonly isOperational = true;

  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** A required configuration value is missing or invalid at boot time. */
export class ConfigError extends AppError {}

/** A call to an external API (Facebook Graph, Gemini, AI Horde, Cloudinary) failed. */
export class ExternalServiceError extends AppError {
  constructor(
    public readonly service: string,
    message: string,
    cause?: unknown
  ) {
    super(message, cause);
  }
}

/** Incoming data (webhook payload, etc.) failed validation. */
export class ValidationError extends AppError {}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
