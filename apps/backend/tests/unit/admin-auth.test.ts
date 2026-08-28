import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

// appConfig is provided since infra/logger.js (imported transitively) reads
// it for the pino level/transport setup — same fix as webhook-verifier.test.ts.
vi.mock("../../src/config/env.js", () => ({
  adminConfig: {
    dashboardJwtSecret: "test-jwt-secret",
    dashboardPassword: "test-admin-password",
  },
  appConfig: {
    nodeEnv: "test",
    logLevel: "silent",
  },
}));

const { signAdminToken, isValidAdminPassword, requireAdminAuth } =
  await import("../../src/modules/admin/auth.js");

function fakeResponse(): Response {
  const res: Partial<Response> = {
    statusCode: 200,
    status: vi.fn(function (this: Response, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

describe("isValidAdminPassword", () => {
  it("accepts the configured password", () => {
    expect(isValidAdminPassword("test-admin-password")).toBe(true);
  });

  it("rejects a wrong password", () => {
    expect(isValidAdminPassword("wrong-password")).toBe(false);
  });

  it("rejects a wrong password of a different length", () => {
    expect(isValidAdminPassword("short")).toBe(false);
  });

  it("rejects a non-string password", () => {
    expect(isValidAdminPassword(undefined)).toBe(false);
    expect(isValidAdminPassword(12345)).toBe(false);
  });
});

describe("requireAdminAuth", () => {
  it("calls next() for a token signed by signAdminToken", () => {
    const token = signAdminToken();
    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as Request;
    const res = fakeResponse();
    const next = vi.fn() as NextFunction;

    requireAdminAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects a missing Authorization header", () => {
    const req = { headers: {} } as unknown as Request;
    const res = fakeResponse();
    const next = vi.fn() as NextFunction;

    requireAdminAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects a tampered/invalid token", () => {
    const req = { headers: { authorization: "Bearer not-a-real-token" } } as unknown as Request;
    const res = fakeResponse();
    const next = vi.fn() as NextFunction;

    requireAdminAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
