import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import worker from "../src/worker.js";
import type { Env } from "../src/types.js";

const ORIGIN = "https://mcp.example.com";
const RESOURCE = `${ORIGIN}/mcp`;
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const EMAIL = "fixture-user@example.com";
const USER = "fixture-google-sub";
const VERIFIER = "synthetic-verifier-abcdefghijklmnopqrstuvwxyz-0123456789";
const GOOGLE_TOKEN = "synthetic-google-access-token-SENTINEL";
const GOOGLE_SECRET = "synthetic-google-client-secret-SENTINEL";
const GOOGLE_CODE = "synthetic-google-code-SENTINEL";

class MemoryKv {
  readonly values = new Map<string, { value: string; expiresAt?: number }>();

  async get(key: string, options?: { type?: string } | string): Promise<unknown> {
    const entry = this.values.get(key);
    if (!entry || entry.expiresAt !== undefined && entry.expiresAt <= Date.now() / 1000) return null;
    return (typeof options === "string" ? options : options?.type) === "json"
      ? JSON.parse(entry.value) : entry.value;
  }

  async put(key: string, value: string, options?: { expiration?: number; expirationTtl?: number }): Promise<void> {
    this.values.set(key, { value, expiresAt: options?.expiration ??
      (options?.expirationTtl === undefined ? undefined : Date.now() / 1000 + options.expirationTtl) });
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  async list(options?: { prefix?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor: string }> {
    return { keys: [...this.values.keys()].filter(key => key.startsWith(options?.prefix ?? ""))
      .map(name => ({ name })), list_complete: true, cursor: "" };
  }

  mutateToken(token: string, patch: Record<string, unknown>): void {
    const [userId, grantId] = token.split(":");
    const key = [...this.values.keys()].find(item => item.startsWith(`token:${userId}:${grantId}:`));
    if (!key) throw new Error("synthetic_token_record_missing");
    const entry = this.values.get(key)!;
    this.values.set(key, { ...entry, value: JSON.stringify({ ...JSON.parse(entry.value), ...patch }) });
  }
}

// This in-memory double verifies browser binding and sequential consumption.
// It does not model Durable Object scheduling or establish concurrent one-shot safety.
class MemoryState {
  readonly values = new Map<string, { payload: unknown; binding: string; expiresAt: number }>();
  writes = 0;

  idFromName(name: string): DurableObjectId {
    return { toString: () => name } as DurableObjectId;
  }

  get(id: DurableObjectId): DurableObjectStub {
    const key = id.toString();
    return { fetch: async (request: Request) => {
      if (request.method === "PUT") {
        this.writes++;
        this.values.set(key, await request.json() as { payload: unknown; binding: string; expiresAt: number });
        return Response.json({ ok: true });
      }
      const value = this.values.get(key);
      if (!value || value.expiresAt <= Date.now()) return Response.json({ ok: false }, { status: 404 });
      const binding = request.headers.get("x-mcp-oauth-binding") ?? request.headers.get("x-amf-oauth-binding");
      if (binding !== value.binding) return Response.json({ ok: false }, { status: 403 });
      this.values.delete(key);
      return Response.json({ payload: value.payload });
    }} as DurableObjectStub;
  }
}

type TokenResponse = { access_token: string; refresh_token: string; scope: string; resource: string; expires_in: number };
type Authorization = { clientId: string; code: string; callback: URL; state: string };
let fixtureNumber = 0;

function browserCookie(response: Response, kind: "CONSENT" | "GOOGLE"): string {
  const match = new RegExp(`__Host-[A-Z_]*${kind}=[^;,]*`).exec(response.headers.get("set-cookie") ?? "");
  if (!match) throw new Error("synthetic_browser_cookie_missing");
  return match[0];
}

async function challenge(): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(VERIFIER));
  return Buffer.from(digest).toString("base64url");
}

function fixture() {
  const kv = new MemoryKv();
  const state = new MemoryState();
  const ip = `192.0.2.${++fixtureNumber}`;
  const env = {
    OAUTH_KV: kv,
    OAUTH_STATE: state,
    MCP_PUBLIC_ORIGIN: ORIGIN,
    MCP_GOOGLE_CALLBACK_ORIGIN: ORIGIN,
    MCP_GOOGLE_CLIENT_ID: "synthetic-google-client",
    MCP_GOOGLE_CLIENT_SECRET: GOOGLE_SECRET,
    MCP_ALLOWED_EMAILS: EMAIL,
    JURISPRUDENCIAIA_URL: "https://upstream.invalid/",
    RATE_LIMIT_MAX_REQUESTS: "200",
  } as unknown as Env;

  async function send(path: string | URL, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("cf-connecting-ip", ip);
    const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
    return worker.fetch(new Request(new URL(path, ORIGIN), { ...init, headers }), env, ctx);
  }

  async function register(redirectUris: string[] = [REDIRECT]): Promise<string> {
    const response = await send("/oauth/register", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "Synthetic MCP fixture", redirect_uris: redirectUris,
        token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"] }),
    });
    expect(response.status).toBe(201);
    return (await response.json() as { client_id: string }).client_id;
  }

  async function authorizationUrl(clientId: string, scope = "jurisprudence:read"): Promise<URL> {
    const url = new URL("/authorize", ORIGIN);
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: REDIRECT,
      response_type: "code", scope, state: "synthetic-client-state", resource: RESOURCE,
      code_challenge: await challenge(), code_challenge_method: "S256" }).toString();
    return url;
  }

  async function begin(clientId: string, scope = "jurisprudence:read") {
    const consent = await send(await authorizationUrl(clientId, scope));
    expect(consent.status).toBe(200);
    const transaction = /name="transaction" value="([^"]+)"/.exec(await consent.text())?.[1];
    if (!transaction) throw new Error("synthetic_transaction_missing");
    const start = await send("/authorize", { method: "POST",
      headers: { cookie: browserCookie(consent, "CONSENT"), "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ transaction }) });
    expect(start.status).toBe(302);
    const googleUrl = new URL(start.headers.get("location")!);
    expect(googleUrl.origin).toBe("https://accounts.google.com");
    expect(googleUrl.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/oauth/google/callback`);
    return { state: googleUrl.searchParams.get("state")!, cookie: browserCookie(start, "GOOGLE") };
  }

  async function authorize(scope = "jurisprudence:read", registeredClientId?: string): Promise<Authorization> {
    const clientId = registeredClientId ?? await register();
    const pending = await begin(clientId, scope);
    const response = await send(`/oauth/google/callback?code=${GOOGLE_CODE}&state=${pending.state}`,
      { headers: { cookie: pending.cookie } });
    expect(response.status).toBe(302);
    const callback = new URL(response.headers.get("location")!);
    expect(`${callback.origin}${callback.pathname}`).toBe(REDIRECT);
    expect(callback.searchParams.get("state")).toBe("synthetic-client-state");
    expect(callback.searchParams.get("iss")).toBe(ORIGIN);
    const code = callback.searchParams.get("code");
    if (!code) throw new Error("synthetic_authorization_code_missing");
    return { clientId, code, callback, state: pending.state };
  }

  async function exchange(auth: Pick<Authorization, "clientId" | "code">, overrides: Record<string, string> = {}) {
    return send("/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: auth.clientId, code: auth.code,
        code_verifier: VERIFIER, redirect_uri: REDIRECT, resource: RESOURCE, ...overrides }) });
  }

  async function tokens(auth: Pick<Authorization, "clientId" | "code">): Promise<TokenResponse> {
    const response = await exchange(auth);
    expect(response.status).toBe(200);
    return response.json() as Promise<TokenResponse>;
  }

  async function listTools(token: string) {
    return send("/mcp", { method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json",
        accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) });
  }

  return { kv, state, env, send, register, authorizationUrl, begin, authorize, exchange, tokens, listTools };
}

describe("OAuth baseline with the pinned real provider and synthetic storage", () => {
  let googleFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    googleFetch = vi.fn(async (input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input);
      if (request.url === "https://oauth2.googleapis.com/token") {
        const body = new URLSearchParams(await request.text());
        expect(body.get("client_secret")).toBe(GOOGLE_SECRET);
        expect(body.get("redirect_uri")).toBe(`${ORIGIN}/oauth/google/callback`);
        return Response.json({ access_token: GOOGLE_TOKEN });
      }
      if (request.url === "https://openidconnect.googleapis.com/v1/userinfo") {
        expect(request.headers.get("authorization")).toBe(`Bearer ${GOOGLE_TOKEN}`);
        return Response.json({ sub: USER, email: EMAIL, name: "Synthetic user", email_verified: true });
      }
      throw new Error("unexpected_synthetic_network_request");
    });
    vi.stubGlobal("fetch", googleFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("publishes canonical discovery and the protected resource challenge", async () => {
    const f = fixture();
    const authMetadata = await f.send("/.well-known/oauth-authorization-server");
    expect(authMetadata.status).toBe(200);
    expect(await authMetadata.json()).toMatchObject({
      issuer: ORIGIN, authorization_endpoint: `${ORIGIN}/authorize`,
      token_endpoint: `${ORIGIN}/oauth/token`, code_challenge_methods_supported: ["S256"],
    });
    const resourceMetadata = await f.send("/.well-known/oauth-protected-resource/mcp");
    expect(resourceMetadata.status).toBe(200);
    expect(await resourceMetadata.json()).toMatchObject({ resource: RESOURCE, authorization_servers: [ORIGIN] });
    const denied = await f.send("/mcp", { method: "POST" });
    expect(denied.status).toBe(401);
    expect(denied.headers.get("www-authenticate")).toContain(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`);
  });

  it.each(["503", "network", "invalid_grant"])("keeps Google failure %s bounded and secret-free", async mode => {
    const f = fixture();
    const pending = await f.begin(await f.register());
    const sentinel = "synthetic-upstream-error-secret-SENTINEL";
    googleFetch.mockImplementationOnce(async () => {
      if (mode === "network") throw new Error(sentinel);
      return Response.json({ error: mode === "invalid_grant" ? "invalid_grant" : "server_error",
        error_description: sentinel }, { status: mode === "invalid_grant" ? 400 : 503 });
    });
    const response = await f.send(`/oauth/google/callback?code=${GOOGLE_CODE}&state=${pending.state}`,
      { headers: { cookie: pending.cookie } });
    expect(response.status).toBe(mode === "invalid_grant" ? 400 : 503);
    const body = await response.text();
    if (mode !== "invalid_grant") expect(JSON.parse(body)).toMatchObject({ error: "temporarily_unavailable" });
    const logs = [console.log, console.warn, console.error]
      .flatMap(logger => vi.mocked(logger).mock.calls).flat().map(String).join("\n");
    for (const secret of [sentinel, GOOGLE_CODE, GOOGLE_SECRET, EMAIL]) {
      expect((logs + body).includes(secret)).toBe(false);
    }
    expect(googleFetch).toHaveBeenCalledTimes(1);
  });

  it.each(["jurisprudence:read", "jurisprudenciaia:search"])("completes DCR, Google, PKCE and tools/list for %s", async scope => {
    const f = fixture();
    const auth = await f.authorize(scope);
    const token = await f.tokens(auth);
    expect(token).toMatchObject({ scope, resource: RESOURCE, expires_in: 3600 });
    const response = await f.listTools(token.access_token);
    expect(response.status).toBe(200);
    const rpc = await response.json() as { result: { tools: { name: string }[] } };
    expect(rpc.result.tools.some(tool => tool.name === "consultar_jurisprudenciaia")).toBe(true);
    expect(googleFetch).toHaveBeenCalledTimes(2);
    const logs = [console.log, console.warn, console.error]
      .flatMap(logger => vi.mocked(logger).mock.calls).flat().map(String).join("\n");
    for (const sentinel of [GOOGLE_TOKEN, GOOGLE_SECRET, GOOGLE_CODE, token.access_token, token.refresh_token, EMAIL, auth.code]) {
      expect(logs.includes(sentinel)).toBe(false);
    }
  });

  it("rejects wrong resource, client, PKCE and unregistered redirect without consuming the valid grant", async () => {
    const f = fixture();
    const auth = await f.authorize();
    const anotherClient = await f.register();
    const invalidOverrides: Record<string, string>[] = [
      { resource: "https://other.example/mcp" },
      { client_id: anotherClient },
      { code_verifier: "incorrect-synthetic-verifier" },
      { redirect_uri: "https://unregistered.example/callback" },
    ];
    for (const overrides of invalidOverrides) {
      const response = await f.exchange(auth, overrides);
      expect(response.status).toBe(400);
      expect((await response.json() as { error: string }).error).toMatch(/^invalid_(target|grant)$/);
    }
    expect((await f.listTools((await f.tokens(auth)).access_token)).status).toBe(200);
  });

  it.each(["json", "multipart"])("token request parser rejects %s without consuming the code", async format => {
    const f = fixture();
    const secondRedirect = "https://claude.com/api/mcp/auth_callback";
    const clientId = await f.register([REDIRECT, secondRedirect]);
    const auth = await f.authorize("jurisprudence:read", clientId);
    const fields = { grant_type: "authorization_code", client_id: clientId, code: auth.code,
      code_verifier: VERIFIER, resource: RESOURCE, redirect_uri: secondRedirect };
    let response: Response;
    if (format === "json") {
      response = await f.send("/oauth/token", { method: "POST",
        headers: { "content-type": "application/json" }, body: JSON.stringify(fields) });
    } else {
      const body = new FormData();
      for (const [key, value] of Object.entries(fields)) body.append(key, value);
      response = await f.send("/oauth/token", { method: "POST", body });
    }
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
    expect((await f.tokens(auth)).access_token).toBeTruthy();
  });

  it.each(["authorized-first", "other-first"])("token request parser rejects duplicate redirect_uri (%s)", async order => {
    const f = fixture();
    const secondRedirect = "https://claude.com/api/mcp/auth_callback";
    const clientId = await f.register([REDIRECT, secondRedirect]);
    const auth = await f.authorize("jurisprudence:read", clientId);
    const body = new URLSearchParams({ grant_type: "authorization_code", client_id: clientId,
      code: auth.code, code_verifier: VERIFIER, resource: RESOURCE });
    const redirects = order === "authorized-first" ? [REDIRECT, secondRedirect] : [secondRedirect, REDIRECT];
    for (const redirect of redirects) body.append("redirect_uri", redirect);
    const response = await f.send("/oauth/token", { method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" }, body });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
    expect((await f.tokens(auth)).access_token).toBeTruthy();
  });

  it.each(["code-first", "refresh-first"])("token request parser rejects duplicate grant_type (%s)", async order => {
    const f = fixture();
    const secondRedirect = "https://claude.com/api/mcp/auth_callback";
    const clientId = await f.register([REDIRECT, secondRedirect]);
    const auth = await f.authorize("jurisprudence:read", clientId);
    const body = new URLSearchParams({ client_id: clientId, code: auth.code,
      code_verifier: VERIFIER, resource: RESOURCE, redirect_uri: secondRedirect });
    const grants = order === "code-first"
      ? ["authorization_code", "refresh_token"] : ["refresh_token", "authorization_code"];
    for (const grant of grants) body.append("grant_type", grant);
    const response = await f.send("/oauth/token", { method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" }, body });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
    expect((await f.tokens(auth)).access_token).toBeTruthy();
  });

  it("binds a new grant to the exact registered redirect selected at authorization", async () => {
    const f = fixture();
    const secondRedirect = "https://claude.com/api/mcp/auth_callback";
    const clientId = await f.register([REDIRECT, secondRedirect]);
    const auth = await f.authorize("jurisprudence:read", clientId);
    const wrongRedirect = await f.exchange(auth, { redirect_uri: secondRedirect });
    expect(wrongRedirect.status).toBe(400);
    expect(await wrongRedirect.json()).toMatchObject({ error: "invalid_grant" });
    // Rejecting the other registered redirect must not consume the valid code.
    const token = await f.tokens(auth);
    expect((await f.listTools(token.access_token)).status).toBe(200);
  });

  it("preserves omission of redirect_uri for a new grant using valid PKCE", async () => {
    const f = fixture();
    const auth = await f.authorize();
    const response = await f.send("/oauth/token", { method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: auth.clientId,
        code: auth.code, code_verifier: VERIFIER, resource: RESOURCE }) });
    expect(response.status).toBe(200);
    const token = await response.json() as TokenResponse;
    expect((await f.listTools(token.access_token)).status).toBe(200);
  });

  it("preserves the pinned provider's registered-redirect behavior for legacy grants without the new binding", async () => {
    const f = fixture();
    const secondRedirect = "https://claude.com/api/mcp/auth_callback";
    const clientId = await f.register([REDIRECT, secondRedirect]);
    await f.authorize("jurisprudence:read", clientId);
    const request = await f.env.OAUTH_PROVIDER.parseAuthRequest(new Request(await f.authorizationUrl(clientId)));
    const legacy = await f.env.OAUTH_PROVIDER.completeAuthorization({
      request, userId: USER, metadata: {}, scope: ["jurisprudence:read"], revokeExistingGrants: false,
      // Intentionally lacks mcpRedirectUri, as grants issued before the patch did.
      props: { tenantId: "jurisia", userId: USER, email: EMAIL, name: "Synthetic user",
        scopes: ["jurisprudence:read"] },
    });
    const code = new URL(legacy.redirectTo).searchParams.get("code")!;
    const response = await f.exchange({ clientId, code }, { redirect_uri: secondRedirect });
    expect(response.status).toBe(200);
    const token = await response.json() as TokenResponse;
    expect((await f.listTools(token.access_token)).status).toBe(200);
  });

  it("rejects an unexpected authorization resource before legacy registration or state allocation", async () => {
    const f = fixture();
    const url = await f.authorizationUrl("jurisprudenciaia-mcp-client");
    url.searchParams.set("redirect_uri", "https://chatgpt.com/connector/oauth/Synthetic123");
    url.searchParams.set("resource", "https://other.example/mcp");
    const response = await f.send(url);
    expect(response.status).toBe(400);
    expect(f.kv.values.size).toBe(0);
    expect(f.state.writes).toBe(0);
    expect(googleFetch).not.toHaveBeenCalled();
  });

  it("rejects unsupported scopes before allocating browser state", async () => {
    const f = fixture();
    const response = await f.send(await f.authorizationUrl(await f.register(), "admin:all"));
    expect(response.status).toBe(400);
    expect(f.state.writes).toBe(0);
    expect(googleFetch).not.toHaveBeenCalled();
  });

  it.each(["missing", "plain"])("requires S256 for a public client (%s)", async mode => {
    const f = fixture();
    const url = await f.authorizationUrl(await f.register());
    if (mode === "missing") {
      url.searchParams.delete("code_challenge");
      url.searchParams.delete("code_challenge_method");
    } else url.searchParams.set("code_challenge_method", "plain");
    const response = await f.send(url);
    expect(response.status).toBe(400);
    expect(f.state.writes).toBe(0);
    expect(googleFetch).not.toHaveBeenCalled();
  });

  it("rejects a Google callback in another browser before contacting Google", async () => {
    const f = fixture();
    const pending = await f.begin(await f.register());
    const response = await f.send(`/oauth/google/callback?code=${GOOGLE_CODE}&state=${pending.state}`);
    expect(response.status).toBe(400);
    expect(googleFetch).not.toHaveBeenCalled();
    expect(f.state.values.size).toBe(1);
  });

  it("enforces actual empty token scope after refresh downscoping, not original props.scopes", async () => {
    const f = fixture();
    const auth = await f.authorize();
    const token = await f.tokens(auth);
    const refreshed = await f.send("/oauth/token", { method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: auth.clientId,
        refresh_token: token.refresh_token, resource: RESOURCE, scope: "not-granted" }) });
    expect(refreshed.status).toBe(200);
    const reduced = await refreshed.json() as TokenResponse;
    expect(reduced.scope).toBe("");
    expect((await f.listTools(reduced.access_token)).status).toBe(403);
    expect((await f.listTools(token.access_token)).status).toBe(200);
  });

  it("rechecks the current allowlist for a previously issued token", async () => {
    const f = fixture();
    const token = await f.tokens(await f.authorize());
    expect((await f.listTools(token.access_token)).status).toBe(200);
    f.env.MCP_ALLOWED_EMAILS = "another-synthetic-user@example.com";
    expect((await f.listTools(token.access_token)).status).toBe(403);
  });

  it.each([
    { tenantId: "another-tenant", userId: USER },
    { tenantId: "jurisia", userId: "another-user" },
  ])("rejects a provider-issued synthetic identity mismatch: %j", async identity => {
    const f = fixture();
    const { clientId } = await f.authorize();
    // Initialize the real OAuth helper, then mint an intentionally inconsistent
    // server-side fixture. This is not a claim that callers can alter encrypted props.
    const authRequest = await f.env.OAUTH_PROVIDER.parseAuthRequest(new Request(await f.authorizationUrl(clientId)));
    const completed = await f.env.OAUTH_PROVIDER.completeAuthorization({
      request: authRequest as AuthRequest, userId: USER, metadata: {},
      scope: ["jurisprudence:read"], revokeExistingGrants: false,
      props: { ...identity, email: EMAIL, name: "Synthetic user", scopes: ["jurisprudence:read"] },
    });
    const code = new URL(completed.redirectTo).searchParams.get("code")!;
    const token = await f.tokens({ clientId, code });
    expect((await f.listTools(token.access_token)).status).toBe(403);
  });

  it.each([
    { audience: "https://other.example/mcp" },
    { expiresAt: 1 },
  ])("rejects a synthetic stored token with invalid audience or expiry: %j", async patch => {
    const f = fixture();
    const token = await f.tokens(await f.authorize());
    f.kv.mutateToken(token.access_token, patch);
    expect((await f.listTools(token.access_token)).status).toBe(401);
  });
});
