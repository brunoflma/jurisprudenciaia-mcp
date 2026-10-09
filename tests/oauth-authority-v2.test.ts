import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import OAuthProvider, { type OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { createAuthorityAdapter, PRIVATE_DEPLOYMENT, PROVIDER_VERSION } from "../src/oauth/authority-v2/adapter.js";
import { createResourceMiddleware, createVersionRouter } from "../src/oauth/authority-v2/router.js";
import { createLedger } from "../src/oauth/authority-v2/core/index.mjs";

const ORIGIN = "https://candidate.invalid", RESOURCE = `${ORIGIN}/mcp`;
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const VERIFIER = "synthetic-pkce-verifier-abcdefghijklmnopqrstuvwxyz0123456789";
const IDENTITY = { sub: "synthetic-subject", email: "synthetic@example.invalid", email_verified: true as const };
const POLICY = { allowedScopes: ["jurisprudence:read", "jurisprudenciaia:search"], codeTtlMs: 60000, accessTtlMs: 120000,
  receiptTtlMs: 30000, refresh: { tokenTtlMs: 240000, absoluteTtlMs: 600000, idleTtlMs: 240000 } };
const INVALID_AUTHORIZATION: Record<string, string>[] = [
  { client_id: "unregistered" }, { redirect_uri: "https://attacker.invalid/callback" },
  { response_type: "token" }, { scope: "admin" }, { resource: "https://other.invalid/mcp" },
  { code_challenge_method: "plain" }, { code_challenge: "" },
];
const databases: DatabaseSync[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); vi.restoreAllMocks(); });

class ClientKv {
  values = new Map<string, string>();
  async get(key: string, options?: string | { type?: string }) {
    const value = this.values.get(key);
    if (!value) return null;
    return (typeof options === "string" ? options : options?.type) === "json" ? JSON.parse(value) : value;
  }
  async put(key: string, value: string) { this.values.set(key, value); }
  async delete(key: string) { this.values.delete(key); }
  async list() { throw new Error("synthetic_list_forbidden"); }
}
function storage() {
  const database = new DatabaseSync(":memory:"); databases.push(database);
  return {
    sql: { exec(query: string, ...bindings: (string | number | null)[]) {
      const statement = database.prepare(query);
      const rows = statement.all(...bindings);
      return { toArray: () => rows };
    } },
    transactionSync<T>(callback: () => T): T {
      database.exec("BEGIN IMMEDIATE");
      try { const result = callback(); database.exec("COMMIT"); return result; }
      catch (error) { database.exec("ROLLBACK"); throw error; }
    },
  };
}
async function fixture(options: { subject?: string; tenantId?: string; clientMethod?: string; confidentialVerifier?: boolean } = {}) {
  const kv = new ClientKv();
  let helpers: OAuthHelpers | undefined;
  const provider = new OAuthProvider<{ OAUTH_KV: ClientKv; OAUTH_PROVIDER?: OAuthHelpers }>({
    apiRoute: "/mcp", apiHandler: { fetch: () => Response.json({ synthetic: true }) },
    defaultHandler: { fetch: (_request: Request, env) => { helpers = env.OAUTH_PROVIDER; return new Response("ready"); } },
    authorizeEndpoint: "/authorize", tokenEndpoint: "/oauth/token", clientRegistrationEndpoint: "/oauth/register",
    scopesSupported: POLICY.allowedScopes,
  });
  await provider.fetch(new Request(`${ORIGIN}/fixture`), { OAUTH_KV: kv }, {} as ExecutionContext);
  if (!helpers) throw new Error("synthetic_provider_helpers_missing");
  const actualHelpers = helpers;
  const client = await actualHelpers.createClient({ redirectUris: [REDIRECT, "https://claude.com/api/mcp/auth_callback"],
    tokenEndpointAuthMethod: options.clientMethod ?? "none", grantTypes: ["authorization_code", "refresh_token"], responseTypes: ["code"] });
  const identity = { ...IDENTITY, sub: options.subject ?? IDENTITY.sub };
  const context = { issuer: ORIGIN, resource: RESOURCE, tenantId: options.tenantId ?? "jurisia", subject: identity.sub };
  const sql = storage();
  const ledgerOptions = { storage: sql, context, policy: POLICY, receiptKey: new Uint8Array(32).fill(42), clock: () => 1000000 };
  const ledger = createLedger(ledgerOptions);
  let allowedEmails = IDENTITY.email;
  const confidential = vi.fn(async (_client: unknown, secret: string) => secret === "synthetic-client-secret");
  const adapterOptions = { context, ledger, provider: actualHelpers, currentIdentity: identity, allowedEmails: () => allowedEmails,
    ...(options.confidentialVerifier ? { authenticateConfidentialClient: confidential } : {}) };
  const adapter = createAuthorityAdapter(adapterOptions);
  const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(VERIFIER))).toString("base64url");
  function authorizationRequest(patch: Record<string, string> = {}) {
    return new Request(`${ORIGIN}/authorize?${new URLSearchParams({ client_id: client.clientId, response_type: "code", redirect_uri: REDIRECT,
      scope: "jurisprudence:read", state: "synthetic-client-state", resource: RESOURCE, code_challenge: challenge, code_challenge_method: "S256", ...patch })}`);
  }
  async function code(patch: Record<string, string> = {}) {
    const auth = await adapter.parseAuthorization(authorizationRequest(patch));
    const response = await adapter.completeTrustedGoogle(auth, identity);
    const url = new URL(response.headers.get("location")!);
    expect(url.searchParams.get("iss")).toBe(ORIGIN);
    expect(url.searchParams.get("state")).toBe("synthetic-client-state");
    return url.searchParams.get("code")!;
  }
  function tokenRequest(code: string, patch: Record<string, string> = {}, headers: HeadersInit = {}) {
    return new Request(`${ORIGIN}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: client.clientId, code, code_verifier: VERIFIER, redirect_uri: REDIRECT, resource: RESOURCE, ...patch }) });
  }
  const refreshRequest = (token: string, patch: Record<string, string> = {}) => new Request(`${ORIGIN}/oauth/token`, { method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", client_id: client.clientId, refresh_token: token, resource: RESOURCE, ...patch }) });
  const resourceRequest = (token: string) => new Request(`${ORIGIN}/mcp`, { headers: { authorization: `Bearer ${token}` } });
  return { adapter, adapterOptions, context, identity, helpers: actualHelpers, kv, client, code, authorizationRequest, tokenRequest, refreshRequest, resourceRequest,
    ledger, ledgerOptions, confidential, setAllowed(value: string) { allowedEmails = value; } };
}

describe("disabled v2 candidate with the installed provider and real SQLite", () => {
  it("qualifies the installed pinned provider", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../node_modules/@cloudflare/workers-oauth-provider/package.json", import.meta.url), "utf8"));
    expect(packageJson.version).toBe(PROVIDER_VERSION);
  });
  it("returns the exact legacy handler by default, without evaluating candidate dependencies", async () => {
    const legacy = vi.fn(() => new Response("unchanged"));
    const options = { legacy, get candidate(): never { throw new Error("must_not_read"); } };
    expect(createVersionRouter(options)).toBe(legacy);
    expect(createResourceMiddleware({ legacy, get resolve(): never { throw new Error("must_not_read"); } })).toBe(legacy);
    expect(await (await createVersionRouter(options)(new Request(`${ORIGIN}/oauth/token`))).text()).toBe("unchanged");
  });
  it("issues and exchanges through the ledger while the provider only parses and looks up clients", async () => {
    const f = await fixture();
    const complete = vi.spyOn(f.helpers, "completeAuthorization");
    const response = await f.adapter.token(f.tokenRequest(await f.code()));
    expect(response.status).toBe(200);
    const tokens = await response.json() as { access_token: string; refresh_token: string };
    expect(tokens.access_token).toMatch(/^mcp2\.a\./);
    expect(tokens.refresh_token).toMatch(/^mcp2\.r\./);
    expect(complete).not.toHaveBeenCalled();
    expect([...f.kv.values.keys()].some(key => /^(token|grant):/.test(key))).toBe(false);
    expect((await f.adapter.authorize(f.resourceRequest(tokens.access_token))).subject).toBe(IDENTITY.sub);
  });
  it.each(INVALID_AUTHORIZATION)("rejects authorization bindings before issuance: %j", async patch => {
    const f = await fixture(); const issue = vi.fn(f.ledger.issueAuthorization);
    const adapter = createAuthorityAdapter({ ...f.adapterOptions, ledger: { ...f.ledger, issueAuthorization: issue } });
    await expect(adapter.parseAuthorization(f.authorizationRequest(patch))).rejects.toThrow();
    expect(issue).not.toHaveBeenCalled();
  });
  it("rechecks Google identity, one current allowlist and exact subject at the trusted completion seam", async () => {
    const f = await fixture(), auth = await f.adapter.parseAuthorization(f.authorizationRequest());
    await expect(f.adapter.completeTrustedGoogle(auth, { ...f.identity, sub: "other-sub" })).rejects.toMatchObject({ code: "access_denied" });
    f.setAllowed("");
    await expect(f.adapter.completeTrustedGoogle(auth, f.identity)).rejects.toMatchObject({ code: "access_denied" });
  });
  it("preserves the private client restriction without enabling ChatGPT", async () => {
    const f = await fixture();
    const chat = "https://chatgpt.com/connector/oauth/syntheticcallback";
    const client = await f.helpers.createClient({ redirectUris: [chat], tokenEndpointAuthMethod: "none", grantTypes: ["authorization_code"], responseTypes: ["code"] });
    const action = f.adapter.parseAuthorization(f.authorizationRequest({ client_id: client.clientId, redirect_uri: chat }));
    if (PRIVATE_DEPLOYMENT) await expect(action).rejects.toMatchObject({ code: "unauthorized_client" });
    else expect((await action).redirectUri).toBe(chat);
  });
  it("requires registered client authentication before consuming the code", async () => {
    const f = await fixture({ clientMethod: "client_secret_post" }); const code = await f.code();
    expect((await f.adapter.token(f.tokenRequest(code, { client_secret: "synthetic-client-secret" }))).status).toBe(401);
    const adapter = createAuthorityAdapter({ ...f.adapterOptions, authenticateConfidentialClient: f.confidential });
    expect((await adapter.token(f.tokenRequest(code, { client_secret: "wrong" }))).status).toBe(401);
    expect((await adapter.token(f.tokenRequest(code, { client_secret: "synthetic-client-secret" }))).status).toBe(200);
  });
  it("supports registered basic authentication without accepting a second method", async () => {
    const f = await fixture({ clientMethod: "client_secret_basic", confidentialVerifier: true }); const code = await f.code();
    const authorization = `Basic ${btoa(`${encodeURIComponent(f.client.clientId)}:synthetic-client-secret`)}`;
    expect((await f.adapter.token(f.tokenRequest(code, { client_secret: "synthetic-client-secret" }, { authorization }))).status).toBe(401);
    expect((await f.adapter.token(f.tokenRequest(code, {}, { authorization }))).status).toBe(200);
  });
  it("accepts only literal true from confidential authentication", async () => {
    const f = await fixture({ clientMethod: "client_secret_post" }), code = await f.code();
    const adapter = createAuthorityAdapter({ ...f.adapterOptions, authenticateConfidentialClient: async () => "truthy" as unknown as boolean });
    expect((await adapter.token(f.tokenRequest(code, { client_secret: "synthetic-client-secret" }))).status).toBe(401);
    expect((await createAuthorityAdapter({ ...f.adapterOptions, authenticateConfidentialClient: f.confidential }).token(f.tokenRequest(code, { client_secret: "synthetic-client-secret" }))).status).toBe(200);
  });
  it("decodes Basic credentials using form-encoded plus and percent escapes", async () => {
    const f = await fixture({ clientMethod: "client_secret_basic" }), code = await f.code();
    const authenticate = vi.fn(async (_client: unknown, secret: string) => secret === "synthetic client+secret");
    const adapter = createAuthorityAdapter({ ...f.adapterOptions, authenticateConfidentialClient: authenticate });
    const authorization = `Basic ${btoa(`${encodeURIComponent(f.client.clientId)}:synthetic+client%2Bsecret`)}`;
    expect((await adapter.token(f.tokenRequest(code, {}, { authorization }))).status).toBe(200);
    expect(authenticate).toHaveBeenCalledOnce();
  });
  it("wrong registered redirect, resource and PKCE do not consume or revoke a valid code", async () => {
    const f = await fixture(), code = await f.code();
    const wrongBindings: Record<string, string>[] = [{ redirect_uri: "https://claude.com/api/mcp/auth_callback" }, { code_verifier: "wrong" }, { resource: "https://wrong.invalid/mcp" }];
    for (const patch of wrongBindings) {
      expect((await f.adapter.token(f.tokenRequest(code, patch))).status).toBe(400);
    }
    expect((await f.adapter.token(f.tokenRequest(code))).status).toBe(200);
  });
  it("32 concurrent exchanges yield exactly one successful commit; authentic replay revokes that family", async () => {
    const f = await fixture(), code = await f.code();
    const results = await Promise.all(Array.from({ length: 32 }, () => f.adapter.token(f.tokenRequest(code))));
    expect(results.filter(result => result.status === 200)).toHaveLength(1);
    const tokens = await results.find(result => result.status === 200)!.json() as { access_token: string };
    await expect(f.adapter.authorize(f.resourceRequest(tokens.access_token))).rejects.toMatchObject({ code: "invalid_token" });
  });
  it("invented refresh cannot revoke; authentic old refresh revokes after restart", async () => {
    const f = await fixture();
    const first = await (await f.adapter.token(f.tokenRequest(await f.code()))).json() as { access_token: string; refresh_token: string };
    const rotated = await (await f.adapter.token(f.refreshRequest(first.refresh_token))).json() as { access_token: string };
    const fabricated = first.refresh_token.slice(0, -8) + "AAAAAAAA";
    expect((await f.adapter.token(f.refreshRequest(fabricated))).status).toBe(400);
    expect((await f.adapter.authorize(f.resourceRequest(rotated.access_token))).subject).toBe(IDENTITY.sub);
    const restarted = createAuthorityAdapter({ ...f.adapterOptions, ledger: createLedger(f.ledgerOptions) });
    expect((await restarted.token(f.refreshRequest(first.refresh_token))).status).toBe(400);
    await expect(restarted.authorize(f.resourceRequest(rotated.access_token))).rejects.toMatchObject({ code: "invalid_token" });
  });
  it("rolls back a pre-commit failure and exchanges the same code after a reconstructed adapter", async () => {
    const f = await fixture(), code = await f.code();
    const crashing = createLedger({ ...f.ledgerOptions, faultInjector(stage) { if (stage === "beforeCommit") throw new Error("synthetic-storage-SENTINEL"); } });
    const response = await createAuthorityAdapter({ ...f.adapterOptions, ledger: crashing }).token(f.tokenRequest(code));
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("SENTINEL");
    const restarted = createAuthorityAdapter({ ...f.adapterOptions, ledger: createLedger(f.ledgerOptions) });
    expect((await restarted.token(f.tokenRequest(code))).status).toBe(200);
  });
  it("keeps post-commit consumption after restart and never turns public attempt IDs into RPC receipts", async () => {
    const f = await fixture(), code = await f.code();
    const crashing = createLedger({ ...f.ledgerOptions, faultInjector(stage) { if (stage === "afterCommit") throw new Error("synthetic-response-loss"); } });
    const first = await createAuthorityAdapter({ ...f.adapterOptions, ledger: crashing }).token(f.tokenRequest(code, { attemptId: "public-id" }));
    expect(first.status).toBe(503);
    const restarted = createAuthorityAdapter({ ...f.adapterOptions, ledger: createLedger(f.ledgerOptions) });
    const retry = await restarted.token(f.tokenRequest(code, { attemptId: "public-id" }));
    expect(retry.status).toBe(400); expect(await retry.json()).toEqual({ error: "invalid_grant" });
    expect(f.ledgerOptions.storage.sql.exec("SELECT status FROM grants").toArray()).toEqual([{ status: "revoked" }]);
  });
  it("rejects another principal's token without changing either authority", async () => {
    const a = await fixture(), b = await fixture({ subject: "synthetic-other-subject" });
    const tokens = await (await a.adapter.token(a.tokenRequest(await a.code()))).json() as { access_token: string };
    await expect(b.adapter.authorize(b.resourceRequest(tokens.access_token))).rejects.toMatchObject({ code: "invalid_token" });
    expect((await a.adapter.authorize(a.resourceRequest(tokens.access_token))).subject).toBe(IDENTITY.sub);
  });
  it("checks revocation and current admission on every Worker/Node middleware call", async () => {
    const f = await fixture();
    const tokens = await (await f.adapter.token(f.tokenRequest(await f.code()))).json() as { access_token: string };
    const authorized = vi.fn(() => new Response("protected")), legacy = vi.fn(() => new Response("legacy"));
    const middleware = createResourceMiddleware({ enabled: true, issuer: ORIGIN, legacy, resolve: async () => f.adapter, authorized, requiredScopes: ["jurisprudence:read"] });
    expect((await middleware(f.resourceRequest(tokens.access_token))).status).toBe(200);
    f.setAllowed(""); expect((await middleware(f.resourceRequest(tokens.access_token))).status).toBe(403);
    f.setAllowed(IDENTITY.email); await f.ledger.revokeAll();
    const revoked = await middleware(f.resourceRequest(tokens.access_token));
    expect(revoked.status).toBe(401);
    expect(revoked.headers.get("www-authenticate")).toContain(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`);
    expect(authorized).toHaveBeenCalledTimes(1); expect(legacy).not.toHaveBeenCalled();
  });
  it("rejects a resource resolver returning another issuer even with a valid local identity", async () => {
    const f = await fixture();
    const tokens = await (await f.adapter.token(f.tokenRequest(await f.code()))).json() as { access_token: string };
    const authorized = vi.fn(() => new Response("protected"));
    const middleware = createResourceMiddleware({ enabled: true, issuer: "https://other-service.invalid", legacy: () => new Response("legacy"), resolve: async () => f.adapter, authorized });
    expect((await middleware(f.resourceRequest(tokens.access_token))).status).toBe(403);
    expect(authorized).not.toHaveBeenCalled();
  });
  it("revocation authenticates the registered client and full token, including consumed refresh lineage", async () => {
    const f = await fixture();
    const first = await (await f.adapter.token(f.tokenRequest(await f.code()))).json() as { access_token: string; refresh_token: string };
    const rotated = await (await f.adapter.token(f.refreshRequest(first.refresh_token))).json() as { access_token: string };
    const revoke = (token: string, clientId = f.client.clientId) => f.adapter.revoke(new Request(`${ORIGIN}/oauth/revoke`, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token, client_id: clientId }) }));
    expect((await revoke(first.refresh_token, "unregistered")).status).toBe(401);
    const other = await f.helpers.createClient({ redirectUris: [REDIRECT], tokenEndpointAuthMethod: "none", grantTypes: ["authorization_code"], responseTypes: ["code"] });
    expect((await revoke(first.refresh_token, other.clientId)).status).toBe(200);
    expect((await revoke(first.refresh_token.slice(0, -8) + "AAAAAAAA")).status).toBe(200);
    expect((await f.adapter.authorize(f.resourceRequest(rotated.access_token))).subject).toBe(IDENTITY.sub);
    expect((await revoke(first.refresh_token)).status).toBe(200);
    await expect(f.adapter.authorize(f.resourceRequest(rotated.access_token))).rejects.toMatchObject({ code: "invalid_token" });
  });
  it("enforces cumulative downscope and never trusts scopes in props", async () => {
    const f = await fixture();
    const first = await (await f.adapter.token(f.tokenRequest(await f.code({ scope: POLICY.allowedScopes.join(" ") })))).json() as { refresh_token: string };
    const narrow = await (await f.adapter.token(f.refreshRequest(first.refresh_token, { scope: "jurisprudence:read" }))).json() as { access_token: string; refresh_token: string };
    await expect(f.adapter.authorize(f.resourceRequest(narrow.access_token), ["jurisprudenciaia:search"])).rejects.toMatchObject({ code: "insufficient_scope" });
    expect((await f.adapter.token(f.refreshRequest(narrow.refresh_token, { scope: POLICY.allowedScopes.join(" ") }))).status).toBe(400);
  });
  it("never downgrades malformed or rejected v2, and leaves the legacy cutoff unset by default", async () => {
    const f = await fixture(), legacy = vi.fn(() => new Response("legacy"));
    const candidate = vi.fn(async () => { throw new Error("synthetic-secret-SENTINEL"); });
    const router = createVersionRouter({ enabled: true, legacy, candidate });
    const denied = await router(f.resourceRequest("mcp2.a.malformed"));
    expect(denied.status).toBe(503); expect(await denied.text()).not.toContain("SENTINEL");
    expect((await router(f.tokenRequest("mcp2.c.malformed"))).status).toBe(503);
    expect(legacy).not.toHaveBeenCalled();
    expect(await (await router(f.resourceRequest("legacy-token"))).text()).toBe("legacy");
    const cut = createVersionRouter({ enabled: true, legacy, candidate, legacyCutoff: 123, clock: () => 123 });
    expect((await cut(f.resourceRequest("legacy-token"))).status).toBe(401);
  });
  it("rejects duplicate, JSON and oversized token bodies before ledger calls", async () => {
    const f = await fixture(), exchange = vi.fn(f.ledger.exchangeCode);
    const adapter = createAuthorityAdapter({ ...f.adapterOptions, ledger: { ...f.ledger, exchangeCode: exchange } });
    for (const request of [
      new Request(`${ORIGIN}/oauth/token`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
      new Request(`${ORIGIN}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "grant_type=authorization_code&grant_type=refresh_token" }),
      new Request(`${ORIGIN}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "code=" + "a".repeat(9000) }),
    ]) expect((await adapter.token(request)).status).toBe(400);
    expect(exchange).not.toHaveBeenCalled();
  });
  it("returns promptly for an oversized streaming body through the enabled router", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode("code=mcp2.c." + "a".repeat(9000))); }, cancel,
    });
    const request = new Request(`${ORIGIN}/oauth/token`, { method: "POST", body,
      headers: { "content-type": "application/x-www-form-urlencoded" }, duplex: "half" } as RequestInit);
    const legacy = vi.fn(() => new Response("legacy")), candidate = vi.fn(() => new Response("candidate"));
    const router = createVersionRouter({ enabled: true, legacy, candidate });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let result: Response | "ROUTER_TIMEOUT_SENTINEL";
    try {
      result = await Promise.race([router(request), new Promise<"ROUTER_TIMEOUT_SENTINEL">(resolve => {
        timer = setTimeout(() => resolve("ROUTER_TIMEOUT_SENTINEL"), 250);
      })]);
    } finally {
      clearTimeout(timer);
      // Unblock the old tee implementation after the sentinel so the regression itself does not hang Vitest.
      await request.body?.cancel();
    }
    expect(result).not.toBe("ROUTER_TIMEOUT_SENTINEL");
    expect((result as Response).status).toBe(400);
    expect(cancel).toHaveBeenCalledOnce();
    expect(candidate).not.toHaveBeenCalled(); expect(legacy).not.toHaveBeenCalled();
  });
  it("preserves legacy body bytes and request headers after version routing", async () => {
    const body = "grant_type=authorization_code&code=legacy%2Bcode&client_id=one+two&scope=x%20y&opaque=%2f%2F";
    const request = new Request(`${ORIGIN}/oauth/token?synthetic=1`, { method: "POST", body,
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", "x-synthetic-marker": "unchanged", authorization: "Bearer mock-synthetic-token-v1" } });
    const legacy = vi.fn(async (received: Request) => {
      expect(received.url).toBe(request.url); expect(received.method).toBe(request.method);
      expect([...received.headers.entries()]).toEqual([...request.headers.entries()]);
      expect(await received.text()).toBe(body);
      return new Response("legacy-preserved");
    });
    const candidate = vi.fn(() => new Response("candidate"));
    const response = await createVersionRouter({ enabled: true, legacy, candidate })(request);
    expect(await response.text()).toBe("legacy-preserved");
    expect(legacy).toHaveBeenCalledOnce(); expect(candidate).not.toHaveBeenCalled();
  });
  it("forwards malformed v2 bytes only to the candidate without fallback", async () => {
    const body = "grant_type=authorization_code&code=mcp2.c.invalid%2Bvalue&scope=x+y";
    const legacy = vi.fn(() => new Response("legacy"));
    const candidate = vi.fn(async (received: Request) => {
      expect(await received.text()).toBe(body);
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    });
    const request = new Request(`${ORIGIN}/oauth/token`, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect((await createVersionRouter({ enabled: true, legacy, candidate })(request)).status).toBe(400);
    expect(candidate).toHaveBeenCalledOnce(); expect(legacy).not.toHaveBeenCalled();
  });
});
