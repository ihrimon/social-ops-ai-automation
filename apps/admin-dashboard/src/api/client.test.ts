import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, clearToken, getToken, login } from "./client";

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  } as Response;
}

/**
 * A minimal in-memory Storage stand-in, stubbed in for the real
 * `localStorage` global. Avoids depending on the test runtime's own
 * Web Storage implementation (jsdom's vs. Node's built-in one, which behave
 * differently across Node versions) — this only needs to satisfy the
 * get/set/removeItem calls client.ts actually makes.
 */
function createFakeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

describe("token storage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createFakeStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getToken returns null when nothing is stored", () => {
    expect(getToken()).toBeNull();
  });

  it("clearToken removes a stored token", () => {
    localStorage.setItem("admin_token", "abc");
    clearToken();
    expect(getToken()).toBeNull();
  });
});

describe("login", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createFakeStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores the returned token on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { token: "session-token-123" }))
    );

    await login("correct-password");

    expect(getToken()).toBe("session-token-123");
  });

  it("throws ApiError with the server message and does not store a token on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(401, { error: "Invalid password." }))
    );

    await expect(login("wrong-password")).rejects.toThrow("Invalid password.");
    expect(getToken()).toBeNull();
  });

  it("falls back to a generic message when the server response has no error field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, {})));

    await expect(login("x")).rejects.toThrow("Request failed (500)");
  });

  it("ApiError carries the HTTP status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { error: "nope" })));

    const error = await login("x").catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
  });

  it("clears a stale token when a request comes back 401", async () => {
    localStorage.setItem("admin_token", "stale-token");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse(401, { error: "Invalid or expired admin session token." }))
    );

    await expect(login("x")).rejects.toThrow();
    expect(getToken()).toBeNull();
  });

  it("sends the Authorization header from a previously stored token on subsequent requests", async () => {
    localStorage.setItem("admin_token", "existing-token");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { token: "new-token" }));
    vi.stubGlobal("fetch", fetchMock);

    await login("x");

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer existing-token");
  });
});
