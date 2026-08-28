import crypto from "crypto";
import type { IncomingMessage } from "http";
import { facebookConfig } from "../../config/env.js";
import { logger } from "../../infra/logger.js";
import { errorMessage } from "../../infra/errors.js";

/** Verifies the `x-hub-signature-256` HMAC header Facebook sends on webhook POSTs. */
export function verifyFacebookSignature(request: IncomingMessage, body: string | Buffer): boolean {
  if (!facebookConfig.appSecret) {
    logger.warn("FB_APP_SECRET is not configured. Skipping webhook signature verification.");
    return true;
  }

  const signatureHeader = request.headers["x-hub-signature-256"];
  if (!signatureHeader || typeof signatureHeader !== "string") {
    logger.warn("Missing x-hub-signature-256 header in webhook request.");
    return false;
  }

  const [algorithm, signature] = signatureHeader.split("=");
  if (algorithm !== "sha256" || !signature) {
    logger.warn("Invalid x-hub-signature-256 header format.");
    return false;
  }

  try {
    const expectedSignature = crypto
      .createHmac("sha256", facebookConfig.appSecret)
      .update(body)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch (error) {
    logger.error("Error verifying webhook signature:", { error: errorMessage(error) });
    return false;
  }
}

/** Verifies the `hub.verify_token` handshake Facebook sends on the webhook GET subscription check. */
export function isValidWebhookVerification(mode: unknown, token: unknown): boolean {
  return mode === "subscribe" && typeof token === "string" && token === facebookConfig.verifyToken;
}
