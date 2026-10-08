import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/http/app.js";
import { createLedger, parseTokenHint, type Ledger } from "../src/oauth/authority-v2/core/index.mjs";
import type { TrustedNodeAuthority } from "../src/http/authority-v2.js";

const ORIGIN = "https://node-authority.invalid";
const databases: DatabaseSync[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); vi.restoreAllMocks(); });
const runner = { search: async () => ({ markdown: "Synthetic result" }) };
function app(enabled?: string, authority?: TrustedNodeAuthority) {
  return createApp({ connectorPath: "/mcp", rateLimitWindowMs: 60000, rateLimitMaxRequests: 100, runner, oauthV2: { enabled, authority } });
}
const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "synthetic-node", version: "1" } } };
const headers = { accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25" };
async function fixtures() {
  const authorities = new Map<string, Ledger>();
  let admitted = "first@example.invalid,second@example.invalid";
  async function issue(subject: string, email: string) {
    const database = new DatabaseSync(":memory:"); databases.push(database);
    const storage = { sql: { exec(query: string, ...bindings: (string | number | null)[]) { return { toArray: () => database.prepare(query).all(...bindings) }; } },
      transactionSync<T>(action: () => T): T { database.exec("BEGIN IMMEDIATE"); try { const result = action(); database.exec("COMMIT"); return result; } catch (error) { database.exec("ROLLBACK"); throw error; } } };
    const ledger = createLedger({ storage, clock: Date.now, context: { issuer: ORIGIN, resource: `${ORIGIN}/mcp`, tenantId: "jurisia", subject },
      receiptKey: new Uint8Array(32).fill(42), policy: { allowedScopes: ["jurisprudence:read"], codeTtlMs: 60000, accessTtlMs: 60000, receiptTtlMs: 30000, refresh: null } });
    const verifier = "synthetic-node-verifier-abcdefghijklmnopqrstuvwxyz0123456789";
    const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
    const grant = await ledger.issueAuthorization({ clientId: "synthetic-client", redirectUri: "https://claude.ai/api/mcp/auth_callback", scopes: ["jurisprudence:read"], codeChallenge: challenge,
      props: { tenantId: "jurisia", userId: subject, email } });
    const tokens = await ledger.exchangeCode({ clientId: "synthetic-client", code: grant.code, redirectUri: "https://claude.ai/api/mcp/auth_callback", codeVerifier: verifier });
    authorities.set(parseTokenHint(tokens.accessToken)!.partitionId, ledger);
    return { ledger, token: tokens.accessToken };
  }
  const first = await issue("first-sub", "first@example.invalid"), second = await issue("second-sub", "second@example.invalid");
  const authorize = vi.fn(async (token: string) => {
    const partition = parseTokenHint(token)?.partitionId, ledger = partition && authorities.get(partition);
    if (!ledger) throw { code: "invalid_token" };
    return ledger.authorize({ accessToken: token });
  });
  const authority: TrustedNodeAuthority = { issuer: ORIGIN, authorize, allowedEmails: () => admitted };
  return { first, second, authority, authorize, setAdmission(value: string) { admitted = value; } };
}

describe("Node HTTP real app with constructor-injected trusted authority", () => {
  it.each([undefined, "false", "TRUE", "true "])("preserves the existing app with flag %s", async enabled => {
    const options = { connectorPath: "/mcp", rateLimitWindowMs: 60000, rateLimitMaxRequests: 30, runner,
      oauthV2: { enabled, get authority(): never { throw new Error("disabled_dependency_read"); } } };
    expect((await request(createApp(options)).post("/mcp").set(headers).send(initialize)).status).toBe(200);
  });
  it("fails closed when the trusted backchannel is absent, including spoofed identity headers", async () => {
    const response = await request(app("true")).post("/mcp").set(headers).set("x-user-id", "synthetic").set("x-tenant-id", "jurisia").set("authorization", "Bearer mcp2.a.invented").send(initialize);
    expect(response.status).toBe(503); expect(response.body).toEqual({ error: "temporarily_unavailable" });
  });
  it("runs initialize/list for two principals and reads revocation and admission on each call", async () => {
    const f = await fixtures(), server = app("true", f.authority);
    const invoke = (token: string, body = initialize) => request(server).post("/mcp").set(headers).set("authorization", `Bearer ${token}`).send(body);
    expect((await invoke(f.first.token)).status).toBe(200);
    expect((await request(server).post("/mcp").set(headers).set("authorization", `Bearer ${f.second.token}`).send({ jsonrpc: "2.0", id: 2, method: "tools/list" })).status).toBe(200);
    await f.first.ledger.revokeAll();
    expect((await invoke(f.first.token)).status).toBe(401); expect((await invoke(f.second.token)).status).toBe(200);
    f.setAdmission("first@example.invalid");
    expect((await request(server).post("/mcp").set(headers).set("authorization", `Bearer ${f.second.token}`).set("x-user-email", "first@example.invalid").send(initialize)).status).toBe(403);
    expect(f.authorize).toHaveBeenCalledTimes(5);
  });
  it("rejects a mismatched issuer and unavailable authenticated backchannel safely", async () => {
    const f = await fixtures();
    const mismatched = app("true", { ...f.authority, issuer: "https://other.invalid" });
    expect((await request(mismatched).post("/mcp").set(headers).set("authorization", `Bearer ${f.first.token}`).send(initialize)).status).toBe(403);
    const failed = app("true", { ...f.authority, authorize: async () => { throw new Error("synthetic-backchannel-SENTINEL"); } });
    const response = await request(failed).post("/mcp").set(headers).set("authorization", `Bearer ${f.first.token}`).send(initialize);
    expect(response.status).toBe(503); expect(response.text).not.toContain("SENTINEL");
  });
});
