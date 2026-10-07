import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/worker.js";
import { validateMcpClientRegistration } from "../src/oauth/client-registration.js";
import type { Env } from "../src/types.js";

const origin = "https://chatgpt-callback.test";
const stableCallback = "https://chatgpt.com/connector_platform_oauth_redirect";
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

function metadata(callback: string) {
  return { client_name: "ChatGPT synthetic diagnostic", redirect_uris: [callback],
    token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] };
}

function fixture() {
  const stored = new Map<string, string>();
  const kv = {
    get: async (key: string, options?: string | { type?: string }) => {
      const value = stored.get(key) ?? null;
      const type = typeof options === "string" ? options : options?.type;
      return value !== null && type === "json" ? JSON.parse(value) : value;
    },
    put: async (key: string, value: string) => { stored.set(key, value); }
  } as unknown as KVNamespace;
  const transactions = new Map<string, { payload: unknown; binding: string }>();
  const stateFetch = vi.fn(async (request: Request, key: string) => {
    if (request.method === "PUT") {
      transactions.set(key, await request.clone().json() as { payload: unknown; binding: string });
      return Response.json({ ok: true });
    }
    const transaction = transactions.get(key);
    if (!transaction) return Response.json({ ok: false }, { status: 404 });
    if (request.headers.get("x-mcp-oauth-binding") !== transaction.binding)
      return Response.json({ ok: false }, { status: 403 });
    transactions.delete(key);
    return Response.json({ payload: transaction.payload });
  });
  const externalFetch = vi.fn(async () => { throw new Error("External fetch is forbidden in this regression"); });
  vi.stubGlobal("fetch", externalFetch);
  const env = { OAUTH_KV: kv,
    OAUTH_STATE: { idFromName: (key: string) => ({ toString: () => key }),
      get: (id: { toString(): string }) => ({ fetch: (request: Request) => stateFetch(request, id.toString()) }) },
    MCP_PUBLIC_ORIGIN: origin, MCP_GOOGLE_CLIENT_ID: "synthetic-google-client", MCP_GOOGLE_CLIENT_SECRET: "synthetic-only",
    MCP_ALLOWED_EMAILS: "synthetic@example.test"
  } as unknown as Env;
  return { env, stored, stateFetch, externalFetch };
}

afterEach(() => vi.unstubAllGlobals());

describe("ChatGPT callback registration through the installed provider", () => {
  it("accepts the stable callback in the active registration validator", () => {
    expect(validateMcpClientRegistration({ clientMetadata: metadata(stableCallback),
      request: new Request(`${origin}/oauth/register`) })).toBeUndefined();
  });

  it.each([stableCallback, "https://chatgpt.com/connector/oauth/abcdefgh1234"])(
    "registers %s and reaches consent without external authentication", async (callback) => {
      const t = fixture();
      const registration = await worker.fetch(new Request(`${origin}/oauth/register`, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(metadata(callback)) }), t.env, ctx);
      expect(registration.status).toBe(201);
      const client = await registration.json() as { client_id: string; redirect_uris: string[]; token_endpoint_auth_method: string };
      expect(client.redirect_uris).toEqual([callback]);
      expect(client.token_endpoint_auth_method).toBe("none");
      const query = new URLSearchParams({ client_id: client.client_id, redirect_uri: callback, response_type: "code",
        state: "synthetic-state", scope: "jurisprudence:read", resource: `${origin}/mcp`,
        code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", code_challenge_method: "S256" });
      const consent = await worker.fetch(new Request(`${origin}/authorize?${query}`), t.env, ctx);
      expect(consent.status).toBe(200);
      expect(consent.headers.get("content-type")).toContain("text/html");
      expect(await consent.text()).toContain("<form");
      expect(t.stateFetch).toHaveBeenCalledOnce();
      const transaction = await t.stateFetch.mock.calls[0]![0].json();
      expect(transaction).toMatchObject({ payload: { redirectUri: callback, codeChallengeMethod: "S256" } });
      expect([...t.stored.keys()].every(key => key.startsWith("client:"))).toBe(true);
      expect(t.externalFetch).not.toHaveBeenCalled();
    }
  );

  it.each([stableCallback, "https://chatgpt.com/connector/oauth/abcdefgh1234"])(
    "returns the advertised issuer after synthetic Google login to %s", async (callback) => {
      const t = fixture();
      const googleFetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "synthetic-google-token" });
        if (url === "https://openidconnect.googleapis.com/v1/userinfo")
          return Response.json({ sub: "synthetic-google-user", email: "synthetic@example.test", email_verified: true });
        throw new Error("Unexpected external request");
      });
      vi.stubGlobal("fetch", googleFetch);
      const discovery = await worker.fetch(new Request(`${origin}/.well-known/oauth-authorization-server`), t.env, ctx);
      const advertised = await discovery.json() as { issuer: string; authorization_response_iss_parameter_supported: boolean };
      expect(advertised.authorization_response_iss_parameter_supported).toBe(true);
      const registration = await worker.fetch(new Request(`${origin}/oauth/register`, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(metadata(callback)) }), t.env, ctx);
      expect(registration.status).toBe(201);
      const client = await registration.json() as { client_id: string };
      const query = new URLSearchParams({ client_id: client.client_id, redirect_uri: callback, response_type: "code",
        state: "synthetic-chatgpt-state", scope: "jurisprudence:read", resource: `${origin}/mcp`,
        code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", code_challenge_method: "S256" });
      const consent = await worker.fetch(new Request(`${origin}/authorize?${query}`), t.env, ctx);
      const transaction = /name="transaction" value="([^"]+)"/.exec(await consent.text())?.[1];
      expect(transaction).toBeTruthy();
      const consentCookie = /__Host-MCP_CONSENT=[^;,]*/.exec(consent.headers.get("set-cookie") ?? "")?.[0];
      const googleStart = await worker.fetch(new Request(`${origin}/authorize`, { method: "POST",
        headers: { Cookie: consentCookie!, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ transaction: transaction! }) }), t.env, ctx);
      expect(googleStart.status).toBe(302);
      const googleUrl = new URL(googleStart.headers.get("location")!);
      const googleCookie = /__Host-MCP_GOOGLE=[^;,]*/.exec(googleStart.headers.get("set-cookie") ?? "")?.[0];
      const returned = await worker.fetch(new Request(`${origin}/oauth/google/callback?code=synthetic-google-code&state=${googleUrl.searchParams.get("state")}`,
        { headers: { Cookie: googleCookie! } }), t.env, ctx);
      expect(returned.status).toBe(302);
      const redirect = new URL(returned.headers.get("location")!);
      expect(`${redirect.origin}${redirect.pathname}`).toBe(callback);
      expect(redirect.searchParams.get("state")).toBe("synthetic-chatgpt-state");
      expect(redirect.searchParams.get("code")).toBeTruthy();
      expect(redirect.searchParams.getAll("iss")).toEqual([advertised.issuer]);
      expect(googleFetch).toHaveBeenCalledTimes(2);
    }
  );
});
