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
  const stateFetch = vi.fn(async (_request: Request) => Response.json({ ok: true }));
  const externalFetch = vi.fn(async () => { throw new Error("External fetch is forbidden in this regression"); });
  vi.stubGlobal("fetch", externalFetch);
  const env = { OAUTH_KV: kv,
    OAUTH_STATE: { idFromName: () => ({ toString: () => "synthetic-state" }), get: () => ({ fetch: stateFetch }) },
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
});
