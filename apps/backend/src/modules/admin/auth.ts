import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { adminConfig } from "../../config/env.js";

const TOKEN_EXPIRY = "12h";

/** Signs a short-lived admin session token. Callers must confirm `adminConfig.dashboardJwtSecret` is set first. */
export function signAdminToken(): string {
  return jwt.sign({ role: "admin" }, adminConfig.dashboardJwtSecret as string, {
    expiresIn: TOKEN_EXPIRY,
  });
}

/** Verifies a submitted password against the configured admin password using a constant-time comparison. */
export function isValidAdminPassword(password: unknown): boolean {
  if (typeof password !== "string" || !adminConfig.dashboardPassword) {
    return false;
  }

  const submitted = Buffer.from(password);
  const expected = Buffer.from(adminConfig.dashboardPassword);

  // timingSafeEqual throws on length mismatch, so pad the shorter side rather
  // than short-circuit on `.length` (which would itself leak length via timing).
  if (submitted.length !== expected.length) {
    crypto.timingSafeEqual(submitted, submitted);
    return false;
  }

  return crypto.timingSafeEqual(submitted, expected);
}

/** Express middleware: requires a valid `Authorization: Bearer <token>` admin session token. */
export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  if (!adminConfig.dashboardJwtSecret) {
    res.status(503).json({ error: "Admin dashboard is not configured." });
    return;
  }

  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (!token) {
    res.status(401).json({ error: "Missing admin session token." });
    return;
  }

  try {
    jwt.verify(token, adminConfig.dashboardJwtSecret);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired admin session token." });
  }
}
