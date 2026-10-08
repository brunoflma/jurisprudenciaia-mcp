import { DatabaseSync } from "node:sqlite";
import { createNodeAuthority } from "../src/http/authority-backchannel.js";
import { McpOAuthV2Ledger } from "../src/worker.js";
import { PRIVATE_DEPLOYMENT } from "../src/oauth/authority-v2/adapter.js";
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

const sqlConnections: DatabaseSync[] = [];
class SyntheticLedgerNamespace {
  env!: Env;
  readonly objects = new Map<string, InstanceType<typeof McpOAuthV2Ledger>>();
  getByName(name: string) {
    if (!this.objects.has(name)) {
      const database = new DatabaseSync(":memory:"); sqlConnections.push(database);
      const storage = { sql: { exec(query: string, ...bindings: (string | number | null)[]) {
        return { toArray: () => database.prepare(query).all(...bindings) };
      } }, transactionSync<T>(action: () => T): T {
        database.exec("BEGIN IMMEDIATE");
        try { const result = action(); database.exec("COMMIT"); return result; }
        catch (error) { database.exec("ROLLBACK"); throw error; }
      } };
      this.objects.set(name, new McpOAuthV2Ledger({ storage }, this.env));
    }
    return this.objects.get(name)!;
  }
}
const POLICY = { allowedScopes: ["jurisprudence:read", "jurisprudenciaia:search"], codeTtlMs: 60000, accessTtlMs: 120000,
  receiptTtlMs: 30000, refresh: { tokenTtlMs: 240000, absoluteTtlMs: 600000, idleTtlMs: 240000 } };
let currentProfile = { sub: USER, email: EMAIL };
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
  const ledgerNamespace = new SyntheticLedgerNamespace();
  const env = {
    MCP_OAUTH_V2_ENABLED: "true", MCP_OAUTH_V2_LEDGER: ledgerNamespace,
    MCP_OAUTH_V2_POLICY: JSON.stringify(POLICY), MCP_OAUTH_V2_RECEIPT_KEY: Buffer.from(new Uint8Array(32).fill(42)).toString("base64url"),
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

  ledgerNamespace.env = env;

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

  return { ledgerNamespace, kv, state, env, send, register, authorizationUrl, begin, authorize, exchange, tokens, listTools };
}

describe("real Worker entrypoint authority v2 integration", () => {
  it("bounds public registration before any provider record is allocated", async () => {
    const f = fixture(), before = f.kv.values.size;
    const response = await f.send("/oauth/register", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "x".repeat(16385) }) });
    expect(response.status).toBe(413);
    expect(f.kv.values.size).toBe(before);
  });
  it("checks real SQLite authority over the authenticated Node backchannel without caching admission or revocation", async () => {
    const f = fixture();
    const auth = await f.authorize(), tokens = await f.tokens(auth);
    const key = Buffer.from(new Uint8Array(32).fill(17)).toString("base64url");
    f.env.MCP_OAUTH_V2_BACKCHANNEL_KEY = key;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => f.send(String(input), init));
    const node = createNodeAuthority({ issuer: ORIGIN, key, allowedEmails: () => EMAIL, fetcher });
    expect((await node.authorize(tokens.access_token)).subject).toBe(USER);
    expect((await node.authorize(tokens.access_token)).resource).toBe(RESOURCE);
    expect(fetcher).toHaveBeenCalledTimes(2);
    f.env.MCP_ALLOWED_EMAILS = "another@example.com";
    await expect(node.authorize(tokens.access_token)).rejects.toMatchObject({ code: "access_denied" });
    f.env.MCP_ALLOWED_EMAILS = EMAIL;
    f.env.MCP_OAUTH_V2_ISSUANCE_PAUSED = "true";
    expect((await node.authorize(tokens.access_token)).subject).toBe(USER);
    await revoke(f, auth.clientId, tokens.access_token);
    await expect(node.authorize(tokens.access_token)).rejects.toMatchObject({ code: "invalid_token" });
    f.env.MCP_OAUTH_V2_ENABLED = "false";
    expect((await f.send("/_internal/oauth-v2/authorize", { method: "POST", body: "{}" })).status).toBe(404);
  });
  beforeEach(() => {
    currentProfile = { sub: USER, email: EMAIL };
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input);
      if (request.url === "https://oauth2.googleapis.com/token") {
        const body = new URLSearchParams(await request.text());
        expect(body.get("client_secret")).toBe(GOOGLE_SECRET);
        expect(body.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{43}$/);
        return Response.json({ access_token: GOOGLE_TOKEN });
      }
      if (request.url === "https://openidconnect.googleapis.com/v1/userinfo") return Response.json({ ...currentProfile, name: "Synthetic user", email_verified: true });
      throw new Error("unexpected_synthetic_network_request");
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); for (const db of sqlConnections.splice(0)) db.close(); });
  function refresh(f: ReturnType<typeof fixture>, clientId: string, token: string) {
    return f.send("/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, refresh_token: token, resource: RESOURCE }) });
  }
  function revoke(f: ReturnType<typeof fixture>, clientId: string, token: string) {
    return f.send("/oauth/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, token }) });
  }
  it("runs Google callback to MCP initialize/list, refresh, revoke and denied access", async () => {
    const f = fixture(), auth = await f.authorize(), tokens = await f.tokens(auth);
    expect(tokens.access_token).toMatch(/^mcp2\.a\./);
    expect(f.ledgerNamespace.objects.size).toBe(1);
    const initialize = await f.send("/mcp", { method: "POST", headers: { authorization: `Bearer ${tokens.access_token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "synthetic", version: "1" } } }) });
    expect(initialize.status).toBe(200); expect((await initialize.json() as { result: unknown }).result).toBeDefined();
    expect((await f.listTools(tokens.access_token)).status).toBe(200);
    const rotatedResponse = await refresh(f, auth.clientId, tokens.refresh_token); expect(rotatedResponse.status).toBe(200);
    const rotated = await rotatedResponse.json() as TokenResponse;
    expect((await f.listTools(rotated.access_token)).status).toBe(200);
    expect((await revoke(f, auth.clientId, tokens.refresh_token)).status).toBe(200);
    expect((await f.listTools(rotated.access_token)).status).toBe(401);
    const discovery = await f.send("/.well-known/oauth-authorization-server");
    expect(await discovery.json()).toMatchObject({ revocation_endpoint: `${ORIGIN}/oauth/revoke`, code_challenge_methods_supported: ["S256"], response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"] });
    expect([...f.kv.values.keys()].some(key => /^(grant|token):/.test(key))).toBe(false);
  });
  it("isolates two authenticated Google subjects and checks current admission on every call", async () => {
    const f = fixture(); f.env.MCP_ALLOWED_EMAILS = `${EMAIL},second@example.com`;
    const firstAuth = await f.authorize(), first = await f.tokens(firstAuth);
    currentProfile = { sub: "synthetic-second-sub", email: "second@example.com" };
    const secondAuth = await f.authorize("jurisprudence:read", firstAuth.clientId), second = await f.tokens(secondAuth);
    expect(f.ledgerNamespace.objects.size).toBe(2);
    expect((await revoke(f, firstAuth.clientId, first.access_token)).status).toBe(200);
    expect((await f.listTools(first.access_token)).status).toBe(401);
    expect((await f.listTools(second.access_token)).status).toBe(200);
    f.env.MCP_ALLOWED_EMAILS = EMAIL;
    expect((await f.listTools(second.access_token)).status).toBe(403);
    expect((await refresh(f, secondAuth.clientId, second.refresh_token)).status).toBe(403);
  });
  it("still revokes authenticated refresh replay after the identity is removed", async () => {
    const f = fixture(), auth = await f.authorize(), first = await f.tokens(auth);
    const rotated = await (await refresh(f, auth.clientId, first.refresh_token)).json() as TokenResponse;
    f.env.MCP_ALLOWED_EMAILS = "";
    expect((await refresh(f, auth.clientId, first.refresh_token)).status).toBe(400);
    f.env.MCP_ALLOWED_EMAILS = EMAIL;
    expect((await f.listTools(rotated.access_token)).status).toBe(401);
  });
  it.each([undefined, "false", "TRUE", "true "])("preserves legacy issuance when flag is %s", async flag => {
    const f = fixture(); f.env.MCP_OAUTH_V2_ENABLED = flag; f.env.MCP_OAUTH_V2_ISSUANCE_PAUSED = "true";
    delete f.env.MCP_OAUTH_V2_LEDGER; delete f.env.MCP_OAUTH_V2_POLICY; delete f.env.MCP_OAUTH_V2_RECEIPT_KEY;
    const tokens = await f.tokens(await f.authorize());
    expect(tokens.access_token.startsWith("mcp2.")).toBe(false);
    expect((await f.listTools(tokens.access_token)).status).toBe(200); expect(f.ledgerNamespace.objects.size).toBe(0);
  });
  it.each(["MCP_OAUTH_V2_LEDGER", "MCP_OAUTH_V2_POLICY", "MCP_OAUTH_V2_RECEIPT_KEY"] as const)("fails 503 with missing %s without fallback", async field => {
    const f = fixture(); delete f.env[field];
    expect((await f.send("/.well-known/oauth-authorization-server")).status).toBe(503);
    expect((await f.send("/mcp", { method: "POST" })).status).toBe(503);
    expect(f.ledgerNamespace.objects.size).toBe(0);
  });
  it("does not downgrade invalid v2, or in-flight v2 Google state after flag rollback", async () => {
    const f = fixture(), client = await f.register();
    expect((await f.exchange({ clientId: client, code: "mcp2.c.invalid" })).status).toBe(400);
    const pending = await f.begin(client); f.env.MCP_OAUTH_V2_ENABLED = "false";
    const response = await f.send(`/oauth/google/callback?code=${GOOGLE_CODE}&state=${pending.state}`, { headers: { cookie: pending.cookie } });
    expect(response.status).toBe(503);
    expect([...f.kv.values.keys()].some(key => key.startsWith("grant:"))).toBe(false);
  });
  it("validates a real DCR confidential client using the stored provider hash", async () => {
    const f = fixture();
    const registered = await f.send("/oauth/register", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_post", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }) });
    expect(registered.status).toBe(201);
    const client = await registered.json() as { client_id: string; client_secret: string };
    const auth = await f.authorize("jurisprudence:read", client.client_id);
    expect((await f.exchange(auth, { client_secret: "wrong-synthetic-secret" })).status).toBe(401);
    const token = await f.exchange(auth, { client_secret: client.client_secret }); expect(token.status).toBe(200);
    expect((await f.listTools((await token.json() as TokenResponse).access_token)).status).toBe(200);
  });
  it("preserves the private ChatGPT restriction without creating its legacy client", async () => {
    if (!PRIVATE_DEPLOYMENT) return;
    const f = fixture(), url = await f.authorizationUrl("jurisprudenciaia-mcp-client");
    url.searchParams.set("redirect_uri", "https://chatgpt.com/connector/oauth/syntheticcallback");
    expect((await f.send(url)).status).toBe(400);
    expect(f.kv.values.has("client:jurisprudenciaia-mcp-client")).toBe(false);
  });
  it.each([["/mcp", 1_048_577, "application/json", 413], ["/oauth/token", 9_000, "application/x-www-form-urlencoded", 400]] as const)("bounds the original stream through the default Worker: %s", async (path, bytes, contentType, status) => {
    const f = fixture(); let cancelled = 0;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(bytes).fill(120)); },
      cancel() { cancelled++; return new Promise<void>(() => {}); },
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        f.send(path, { method: "POST", headers: { "content-type": contentType }, body, duplex: "half" } as RequestInit),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("synthetic_body_deadline")), 500); }),
      ]);
      expect(response.status).toBe(status); expect(cancelled).toBe(1);
      expect(f.ledgerNamespace.objects.size).toBe(0);
    } finally { clearTimeout(timer); }
  });
  it("protects canonical/root resource aliases and rejects provider prefix suffixes before and after cutoff", async () => {
    const f = fixture(); f.env.MCP_OAUTH_V2_ENABLED = "false";
    const auth = await f.authorize(), legacy = await f.tokens(auth);
    const rpc = (path: string, token: string) => f.send(path, { method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) });
    // The disabled path retains the SDK's existing prefix routing.
    expect((await rpc("/mcp/foo", legacy.access_token)).status).toBe(200);
    f.env.MCP_OAUTH_V2_ENABLED = "true";
    const v2 = await f.tokens(await f.authorize("jurisprudence:read", auth.clientId));
    for (const cutoff of [undefined, Date.now() - 1]) {
      f.env.MCP_OAUTH_V2_POLICY = JSON.stringify({ ...POLICY, legacyCutoff: cutoff });
      for (const path of ["/mcp/", "/mcp/foo", "/mcpsuffix"]) {
        expect((await rpc(path, legacy.access_token)).status).toBe(404);
        expect((await rpc(path, v2.access_token)).status).toBe(404);
      }
      for (const path of ["/", "/mcp"]) {
        expect((await rpc(path, legacy.access_token)).status).toBe(cutoff === undefined ? 200 : 401);
        expect((await rpc(path, v2.access_token)).status).toBe(200);
        expect((await rpc(path, "mcp2.a.invalid")).status).toBe(401);
      }
    }
  });
  it("pauses issuance before consuming code or Google state while access and revoke continue", async () => {
    const f = fixture(), activeAuth = await f.authorize(), active = await f.tokens(activeAuth);
    const unused = await f.authorize("jurisprudence:read", activeAuth.clientId);
    const pending = await f.begin(activeAuth.clientId);
    const storedStates = f.state.values.size;
    f.env.MCP_OAUTH_V2_ISSUANCE_PAUSED = "true";
    expect((await f.send(await f.authorizationUrl(activeAuth.clientId))).status).toBe(503);
    const callback = `/oauth/google/callback?code=${GOOGLE_CODE}&state=${pending.state}`;
    expect((await f.send(callback, { headers: { cookie: pending.cookie } })).status).toBe(503);
    expect(f.state.values.size).toBe(storedStates);
    expect((await f.exchange(unused)).status).toBe(503);
    expect((await refresh(f, activeAuth.clientId, active.refresh_token)).status).toBe(503);
    expect((await f.listTools(active.access_token)).status).toBe(200);
    expect((await revoke(f, activeAuth.clientId, active.access_token)).status).toBe(200);
    expect((await f.listTools(active.access_token)).status).toBe(401);
    f.env.MCP_OAUTH_V2_ISSUANCE_PAUSED = "false";
    expect((await f.exchange(unused)).status).toBe(200);
    const completed = await f.send(callback, { headers: { cookie: pending.cookie } });
    expect(completed.status).toBe(302);
    expect((await f.exchange({ clientId: activeAuth.clientId, code: new URL(completed.headers.get("location")!).searchParams.get("code")! })).status).toBe(200);
  });

  it("retains provider CORS and preflight semantics on token, revoke and MCP", async () => {
    const f = fixture(), origin = "https://client.example";
    f.env.MCP_OAUTH_V2_ENABLED = "false";
    const old = await f.send("/oauth/token", { method: "OPTIONS", headers: { origin } });
    expect(old.status).toBe(204);
    f.env.MCP_OAUTH_V2_ENABLED = "true";
    for (const path of ["/oauth/token", "/oauth/revoke", "/mcp", "/"]) {
      const response = await f.send(path, { method: "OPTIONS", headers: { origin } });
      expect(response.status).toBe(204);
      for (const name of ["Access-Control-Allow-Origin", "Access-Control-Allow-Methods", "Access-Control-Allow-Headers", "Access-Control-Expose-Headers", "Access-Control-Max-Age"]) expect(response.headers.get(name)).toBe(old.headers.get(name));
    }
    const denied = await f.send("/mcp", { method: "POST", headers: { origin, authorization: "Bearer mcp2.a.invalid" } });
    expect(denied.status).toBe(401);
    expect(denied.headers.get("access-control-allow-origin")).toBe(origin);
    expect(denied.headers.get("access-control-expose-headers")).toContain("WWW-Authenticate");
    expect(denied.headers.get("www-authenticate")).toContain(ORIGIN);
  });

});
