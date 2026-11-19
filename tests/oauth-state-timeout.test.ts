import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeOAuthTransaction, createOAuthTransaction, type OAuthStateNamespace, type OAuthTransaction } from "../src/oauth/state.js";

const payload: OAuthTransaction = {
  responseType: "code", clientId: "synthetic-client", redirectUri: "https://client.example/callback",
  state: "synthetic-state", scope: ["mcp:read"],
};

function namespace(fetch: (request: Request) => Promise<Response>): OAuthStateNamespace {
  return {
    idFromName: name => ({ toString: () => name }) as DurableObjectId,
    get: () => ({ fetch }) as unknown as DurableObjectStub,
  };
}

async function operation(kind: "create" | "consume", fetch: (request: Request) => Promise<Response>) {
  const token = "synthetic-transaction-token";
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  const binding = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
  const request = new Request("https://mcp.example/callback", {
    headers: { cookie: `__Host-MCP_GOOGLE=${binding}` },
  });
  return () => kind === "create"
    ? createOAuthTransaction(namespace(fetch), "google", payload)
    : consumeOAuthTransaction(namespace(fetch), "google", token, request);
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("OAuth state fetch deadlines", () => {
  for (const kind of ["create", "consume"] as const) {
    it(`aborts a stalled ${kind} request at five seconds`, async () => {
      let started!: (request: Request) => void;
      const reachedFetch = new Promise<Request>(resolve => { started = resolve; });
      const run = await operation(kind, request => new Promise((_resolve, reject) => {
        request.signal.addEventListener("abort", () => reject(new DOMException("synthetic deadline", "AbortError")), { once: true });
        started(request);
      }));
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const pending = run();
      const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
      const request = await reachedFetch;
      expect(request.method).toBe(kind === "create" ? "PUT" : "POST");
      if (kind === "consume") expect(request.headers.get("x-mcp-oauth-binding")).toMatch(/^[a-f0-9]{64}$/);
      await vi.advanceTimersByTimeAsync(4999);
      expect(request.signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await rejected;
      expect(request.signal.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });

    for (const failure of [false, true]) {
      it(`clears the ${kind} deadline after ${failure ? "fetch failure" : "success"}`, async () => {
        const run = await operation(kind, async () => {
          if (failure) throw new Error("synthetic_transport_failure");
          return Response.json(kind === "create" ? { ok: true } : { payload });
        });
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        if (failure) await expect(run()).rejects.toThrow("synthetic_transport_failure");
        else if (kind === "create") expect(await run()).toMatchObject({ token: expect.any(String), setCookie: expect.stringContaining("HttpOnly; Secure;") });
        else expect(await run()).toEqual(payload);
        expect(vi.getTimerCount()).toBe(0);
      });
    }
  }

  it("rejects a mismatched browser binding before calling the state object", async () => {
    const fetch = vi.fn(async () => Response.json({ payload }));
    await expect(consumeOAuthTransaction(namespace(fetch), "google", "synthetic-token",
      new Request("https://mcp.example/callback", { headers: { cookie: "__Host-MCP_GOOGLE=wrong-binding" } })))
      .rejects.toThrow("oauth_state_not_bound");
    expect(fetch).not.toHaveBeenCalled();
  });
});
