import "express";

declare global {
  namespace Express {
    interface Request {
      /** Raw request body bytes, captured by the JSON body-parser's `verify` hook so the Facebook HMAC signature can be checked against the exact bytes received. */
      rawBody?: Buffer;
    }
  }
}
