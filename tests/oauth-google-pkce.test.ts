import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleGoogleAuth, type GoogleOAuthEnv } from "../src/oauth/google-auth.js";
import { createOAuthTransaction } from "../src/oauth/state.js";

const ORIGIN = "https://mcp.example.com";
const EMAIL = "pkce-fixture@example.com";
const DOWNSTREAM_CHALLENGE = "downstream-mcp-challenge-is-independent";
const GOOGLE_SECRET = "synthetic-google-client-secret";
const GOOGLE_CODE = "synthetic-google-code";
const GOOGLE_TOKEN = "synthetic-google-access-token";

type Stored = {
  payload: AuthRequest & { googleCodeVerifier?: unknown };
  binding: string;
  expiresAt: number;
};

// Sequential storage double only: no claim about production concurrency.
class MemoryState {
  readonly values = new Map<string, Stored>();

  idFromName(name: string): DurableObjectId {
    return { toString: () => name } as DurableObjectId;
  }

  get(id: DurableObjectId): DurableObjectStub {
    const key = id.toString();
    return { fetch: async (request: Request) => {
      if (request.method === "PUT") {
        this.values.set(key, await request.json() as Stored);
        return Response.json({ ok: true });
      }
      const value = this.values.get(key);
      if (!value || value.expiresAt <= Date.now()) {
        this.values.delete(key);
        return Response.json({ ok: false }, { status: 404 });
      }
      const binding = request.headers.get("x-mcp-oauth-binding") ?? request.headers.get("x-amf-oauth-binding");
      if (binding !== value.binding) return Response.json({ ok: false }, { status: 403 });
      this.values.delete(key);
      return Response.json({ payload: value.payload });
    }} as DurableObjectStub;
  }

  google(token: string): Stored {
    const value = this.values.get(`mcp:oauth:google:${token}`);
    if (!value) throw new Error("synthetic_google_state_missing");
    return value;
  }
}

function authRequest(): AuthRequest {
  return { responseType: "code", clientId: "synthetic-mcp-client",
    redirectUri: "https://claude.ai/api/mcp/auth_callback", scope: ["jurisprudence:read"],
    state: "synthetic-downstream-state", issuer: ORIGIN, resource: `${ORIGIN}/mcp`,
    codeChallenge: DOWNSTREAM_CHALLENGE, codeChallengeMethod: "S256" };
}

function cookie(response: Response, kind: "CONSENT" | "GOOGLE"): string {
  const match = new RegExp(`__Host-[A-Z_]*${kind}=[^;,]*`).exec(response.headers.get("set-cookie") ?? "");
  if (!match) throw new Error("synthetic_cookie_missing");
  return match[0];
}

function fixture() {
  const state = new MemoryState();
  const tokenBodies: URLSearchParams[] = [];
  const complete = vi.fn(async () => ({
    redirectTo: "https://claude.ai/api/mcp/auth_callback?code=synthetic-mcp-code",
  }));
  const env = {
    OAUTH_STATE: state,
    MCP_GOOGLE_CLIENT_ID: "synthetic-google-client",
    MCP_GOOGLE_CLIENT_SECRET: GOOGLE_SECRET,
    MCP_PUBLIC_ORIGIN: ORIGIN,
    MCP_GOOGLE_CALLBACK_ORIGIN: ORIGIN,
    MCP_ALLOWED_EMAILS: EMAIL,
    OAUTH_PROVIDER: {
      parseAuthRequest: vi.fn(async () => authRequest()),
      lookupClient: vi.fn(async () => ({ clientName: "Synthetic MCP client" })),
      completeAuthorization: complete,
    },
  } satisfies GoogleOAuthEnv;
  const googleFetch = vi.fn(async (input: RequestInfo | URL) => {
    const request = input instanceof Request ? input : new Request(input);
    if (request.url === "https://oauth2.googleapis.com/token") {
      tokenBodies.push(new URLSearchParams(await request.text()));
      return Response.json({ access_token: GOOGLE_TOKEN });
    }
    if (request.url === "https://openidconnect.googleapis.com/v1/userinfo") {
      expect(request.headers.get("authorization")).toBe(`Bearer ${GOOGLE_TOKEN}`);
      return Response.json({ sub: "synthetic-google-sub", email: EMAIL, email_verified: true });
    }
    throw new Error("unexpected_synthetic_network_request");
  });
  const send = (request: Request) => handleGoogleAuth(request, env, async () => new Response("fallback"), googleFetch);

  async function begin() {
    const consent = await send(new Request(`${ORIGIN}/authorize`));
    expect(consent.status).toBe(200);
    const html = await consent.text();
    const transaction = /name="transaction" value="([^"]+)"/.exec(html)?.[1];
    if (!transaction) throw new Error("synthetic_transaction_missing");
    const start = await send(new Request(`${ORIGIN}/authorize`, { method: "POST",
      headers: { cookie: cookie(consent, "CONSENT"), "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ transaction }) }));
    expect(start.status).toBe(302);
    const location = start.headers.get("location")!;
    const url = new URL(location);
    const token = url.searchParams.get("state")!;
    return { token, cookie: cookie(start, "GOOGLE"), url, location, html };
  }

  const finish = (pending: { token: string; cookie: string }) => send(
    new Request(`${ORIGIN}/oauth/google/callback?code=${GOOGLE_CODE}&state=${pending.token}`,
      { headers: { cookie: pending.cookie } }),
  );

  return { state, env, googleFetch, tokenBodies, complete, send, begin, finish };
}

async function s256(value: string): Promise<string> {
  return Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))).toString("base64url");
}

describe("Google upstream PKCE with synthetic provider and storage", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it("binds the Google S256 challenge to the stored verifier sent only in the token POST", async () => {
    const f = fixture();
    const pending = await f.begin();
    const stored = f.state.google(pending.token);
    const verifier = stored.payload.googleCodeVerifier;
    expect(typeof verifier).toBe("string");
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(verifier as string, "base64url")).toHaveLength(32);
    expect(pending.url.searchParams.get("code_challenge")).toBe(await s256(verifier as string));
    expect(pending.url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(pending.url.searchParams.get("scope")).toBe("openid email profile");
    expect(pending.url.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/oauth/google/callback`);
    expect(pending.url.searchParams.has("code_verifier")).toBe(false);
    expect(stored.payload.codeChallenge).toBe(DOWNSTREAM_CHALLENGE);
    expect(stored.expiresAt - Date.now()).toBeGreaterThan(590_000);
    expect(stored.expiresAt - Date.now()).toBeLessThanOrEqual(600_000);

    const callback = await f.finish(pending);
    expect(callback.status).toBe(302);
    expect(f.tokenBodies).toHaveLength(1);
    expect(f.tokenBodies[0]!.get("code_verifier")).toBe(verifier);
    expect(f.tokenBodies[0]!.get("code")).toBe(GOOGLE_CODE);
    expect(f.tokenBodies[0]!.get("client_secret")).toBe(GOOGLE_SECRET);
    expect(f.complete).toHaveBeenCalledOnce();
    expect(JSON.stringify(f.complete.mock.calls).includes(verifier as string)).toBe(false);
    expect(f.state.values.size).toBe(0);
    const logs = [console.log, console.warn, console.error]
      .flatMap(logger => vi.mocked(logger).mock.calls).flat().map(String).join("\n");
    const surfaces = pending.location + pending.html + callback.headers.get("location") + logs;
    expect(surfaces.includes(verifier as string)).toBe(false);
    for (const secret of [GOOGLE_SECRET, GOOGLE_CODE, GOOGLE_TOKEN]) expect(logs.includes(secret)).toBe(false);
  });

  it("generates independent verifiers and challenges for two transactions", async () => {
    const f = fixture();
    const first = await f.begin();
    const second = await f.begin();
    const firstVerifier = f.state.google(first.token).payload.googleCodeVerifier as string;
    const secondVerifier = f.state.google(second.token).payload.googleCodeVerifier as string;
    expect(firstVerifier).not.toBe(secondVerifier);
    expect(first.url.searchParams.get("code_challenge")).not.toBe(second.url.searchParams.get("code_challenge"));
    await f.finish(first);
    await f.finish(second);
    expect(f.tokenBodies.map(body => body.get("code_verifier"))).toEqual([firstVerifier, secondVerifier]);
  });

  it.each(["", "short-verifier", null, 42])("rejects a present malformed stored verifier %j before contacting Google", async badVerifier => {
    const f = fixture();
    const pending = await f.begin();
    f.state.google(pending.token).payload.googleCodeVerifier = badVerifier;
    await expect(f.finish(pending)).rejects.toThrow("oauth_state_invalid");
    expect(f.googleFetch).not.toHaveBeenCalled();
    expect(f.complete).not.toHaveBeenCalled();
  });

  it("completes a still-live legacy Google transaction without fabricating a verifier", async () => {
    const f = fixture();
    const legacy = await createOAuthTransaction(f.state, "google", authRequest());
    expect(f.state.google(legacy.token).payload).not.toHaveProperty("googleCodeVerifier");
    expect(f.state.google(legacy.token).expiresAt - Date.now()).toBeLessThanOrEqual(600_000);
    const response = await f.finish({ token: legacy.token, cookie: legacy.setCookie.split(";", 1)[0]! });
    expect(response.status).toBe(302);
    expect(f.tokenBodies).toHaveLength(1);
    expect(f.tokenBodies[0]!.has("code_verifier")).toBe(false);
    expect(f.complete).toHaveBeenCalledOnce();
  });

  it("does not accept an expired legacy Google transaction", async () => {
    const f = fixture();
    const legacy = await createOAuthTransaction(f.state, "google", authRequest());
    f.state.google(legacy.token).expiresAt = Date.now() - 1;
    await expect(f.finish({ token: legacy.token, cookie: legacy.setCookie.split(";", 1)[0]! }))
      .rejects.toThrow("oauth_state_invalid");
    expect(f.googleFetch).not.toHaveBeenCalled();
  });

  it("rejects a sequential callback replay before another Google exchange", async () => {
    const f = fixture();
    const pending = await f.begin();
    expect((await f.finish(pending)).status).toBe(302);
    expect(f.googleFetch).toHaveBeenCalledTimes(2);
    await expect(f.finish(pending)).rejects.toThrow("oauth_state_invalid");
    expect(f.googleFetch).toHaveBeenCalledTimes(2);
    expect(f.complete).toHaveBeenCalledOnce();
  });

  it("rejects the callback in another browser without consuming the bound transaction", async () => {
    const f = fixture();
    const pending = await f.begin();
    await expect(f.finish({ ...pending, cookie: "unrelated=synthetic" })).rejects.toThrow("oauth_state_not_bound");
    expect(f.googleFetch).not.toHaveBeenCalled();
    expect(f.state.values.size).toBe(1);
    expect((await f.finish(pending)).status).toBe(302);
  });
});
