import crypto from "crypto";
import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "http";

// Mocked so signature verification is deterministic regardless of the real
// .env's FB_APP_SECRET/FB_VERIFY_TOKEN — verifyFacebookSignature() reads
// facebookConfig directly rather than taking the secret as a parameter.
vi.mock("../../src/config/env.js", () => ({
  facebookConfig: {
    appSecret: "test-app-secret",
    verifyToken: "test-verify-token",
  },
}));

const { verifyFacebookSignature, isValidWebhookVerification } =
  await import("../../src/integrations/facebook/webhook-verifier.js");

function requestWithSignature(signatureHeader?: string): IncomingMessage {
  return {
    headers: signatureHeader ? { "x-hub-signature-256": signatureHeader } : {},
  } as unknown as IncomingMessage;
}

describe("verifyFacebookSignature", () => {
  it("accepts a body signed with the configured app secret", () => {
    const body = JSON.stringify({ hello: "world" });
    const signature = crypto.createHmac("sha256", "test-app-secret").update(body).digest("hex");

    expect(verifyFacebookSignature(requestWithSignature(`sha256=${signature}`), body)).toBe(true);
  });

  it("rejects a body with a signature computed from the wrong secret", () => {
    const body = JSON.stringify({ hello: "world" });
    const wrongSignature = crypto.createHmac("sha256", "wrong-secret").update(body).digest("hex");

    expect(verifyFacebookSignature(requestWithSignature(`sha256=${wrongSignature}`), body)).toBe(
      false
    );
  });

  it("rejects a request with no signature header", () => {
    expect(verifyFacebookSignature(requestWithSignature(), "{}")).toBe(false);
  });

  it("rejects a malformed signature header", () => {
    expect(verifyFacebookSignature(requestWithSignature("not-a-valid-header"), "{}")).toBe(false);
  });
});

describe("isValidWebhookVerification", () => {
  it("accepts a subscribe request with the matching verify token", () => {
    expect(isValidWebhookVerification("subscribe", "test-verify-token")).toBe(true);
  });

  it("rejects a wrong verify token", () => {
    expect(isValidWebhookVerification("subscribe", "wrong-token")).toBe(false);
  });

  it("rejects a non-subscribe mode", () => {
    expect(isValidWebhookVerification("unsubscribe", "test-verify-token")).toBe(false);
  });
});
