import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeMcpProps, authorizeMcpToken, canonicalOAuthOrigin, logOAuthProviderError, safeOAuthErrorCode } from "../src/oauth/access-policy.js";
import worker from "../src/worker.js";
import type { Env } from "../src/types.js";

const context = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
const identity = { tenantId: "jurisia", userId: "synthetic-user-a", email: "user-a@example.invalid", scopes: ["jurisprudence:read"] };

afterEach(() => vi.restoreAllMocks());

describe("OAuth access and discovery policy", () => {
  it("uses effective token scopes, not an older grant scope in props", () => {
    expect(authorizeMcpProps(identity, [], identity.userId, identity.email)).toBe("insufficient_scope");
    expect(authorizeMcpProps(identity, ["jurisprudenciaia:search"], identity.userId, identity.email)).toBeUndefined();
  });

  it.each(["bearer", "BEARER"])("supports scheme casing in the helper while recording the pinned provider limit (%s)", async scheme => {
    const request = new Request("https://mcp.example.invalid/mcp", {
      method: "POST", headers: { authorization: `${scheme} synthetic:grant:token` }, body: "{}",
    });
    const provider = { unwrapToken: vi.fn().mockResolvedValue({
      scope: ["jurisprudence:read"], userId: identity.userId, grant: { props: identity },
    }) };
    await expect(authorizeMcpToken(request, provider, identity.email)).resolves.toBeUndefined();
    // Provider 0.10.3 itself requires the exact "Bearer " scheme before reaching the helper.
    const get = vi.fn();
    const response = await worker.fetch(request, {
      MCP_PUBLIC_ORIGIN: "https://mcp.example.invalid", OAUTH_KV: { get },
    } as unknown as Env, context);
    expect(response.status).toBe(401);
    expect(get).not.toHaveBeenCalled();
  });

  it("checks current admission and durable subject/tenant on every request", () => {
    expect(authorizeMcpProps(identity, ["jurisprudence:read"], identity.userId, " USER-A@example.invalid ")).toBeUndefined();
    expect(authorizeMcpProps(identity, ["jurisprudence:read"], identity.userId, "user-b@example.invalid")).toBe("access_denied");
    expect(authorizeMcpProps(identity, ["jurisprudence:read"], "synthetic-user-b", identity.email)).toBe("access_denied");
    expect(authorizeMcpProps({ ...identity, tenantId: "other-service" }, ["jurisprudence:read"], identity.userId, identity.email)).toBe("access_denied");
    expect(authorizeMcpProps(identity, ["jurisprudence:read"], identity.userId, "")).toBe("access_denied");
  });

  it.each(["http://mcp.example.invalid", ["https://", "synthetic-user:synthetic-password@", "mcp.example.invalid"].join(""), "https://mcp.example.invalid/path", "https://mcp.example.invalid?secret=sentinel", "https://mcp.example.invalid#fragment"])("rejects ambiguous configured origin %s", origin => {
    expect(() => canonicalOAuthOrigin(origin)).toThrow();
  });

  it("publishes the configured issuer and endpoints, independent of forwarded headers", async () => {
    const response = await worker.fetch(new Request("https://untrusted-host.example.invalid/.well-known/oauth-authorization-server", {
      headers: { "x-forwarded-host": "other.example.invalid", "x-forwarded-proto": "http" },
    }), { MCP_PUBLIC_ORIGIN: "https://canonical.example.invalid" } as Env, context);
    expect(await response.json()).toMatchObject({
      issuer: "https://canonical.example.invalid",
      authorization_endpoint: "https://canonical.example.invalid/authorize",
      token_endpoint: "https://canonical.example.invalid/oauth/token",
      registration_endpoint: "https://canonical.example.invalid/oauth/register",
      revocation_endpoint: "https://canonical.example.invalid/oauth/token",
      code_challenge_methods_supported: ["S256"],
    });
  });

  it("fails closed for invalid configured origin", async () => {
    const response = await worker.fetch(new Request("https://mcp.example.invalid/.well-known/oauth-authorization-server"), {
      MCP_PUBLIC_ORIGIN: "https://mcp.example.invalid?secret=sentinel",
    } as Env, context);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("sentinel");
  });

  it("contains unexpected provider/storage exceptions without logging their contents", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const sentinel = "synthetic-storage-secret-SENTINEL";
    const response = await worker.fetch(new Request("https://mcp.example.invalid/mcp", {
      method: "POST", headers: { authorization: "Bearer synthetic-user:synthetic-grant:synthetic-token" }, body: "{}",
    }), {
      MCP_PUBLIC_ORIGIN: "https://mcp.example.invalid",
      OAUTH_KV: { get: async () => { throw new Error(sentinel); } },
    } as unknown as Env, context);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "temporarily_unavailable" });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(sentinel);
  });

  it("redacts provider response descriptions as well as logs and preserves protocol headers", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sentinel = "synthetic-client-method-secret-SENTINEL";
    const response = await worker.fetch(new Request("https://mcp.example.invalid/oauth/register", {
      method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.200" },
      body: JSON.stringify({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], token_endpoint_auth_method: sentinel }),
    }), { MCP_PUBLIC_ORIGIN: "https://mcp.example.invalid" } as unknown as Env, context);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_client_metadata" });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(sentinel);
    const protocolError = logOAuthProviderError({ code: "invalid_client", status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="token"', "Retry-After": "3" } });
    expect(protocolError.status).toBe(401);
    expect(protocolError.headers.get("www-authenticate")).toBe('Basic realm="token"');
    expect(protocolError.headers.get("retry-after")).toBe("3");
    expect(protocolError.headers.get("cache-control")).toBe("no-store");
    expect(await protocolError.json()).toEqual({ error: "invalid_client" });
  });

  it("never logs provider descriptions, raw exception names or lookalike OAuth messages", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sentinel = "synthetic_secret_sentinel";
    logOAuthProviderError({ code: sentinel, status: 400, description: sentinel, request: new Request(`https://mcp.example.invalid?code=${sentinel}`) } as Parameters<typeof logOAuthProviderError>[0]);
    logOAuthProviderError({ code: "invalid_grant", status: 400 });
    const error = new Error(`oauth_${sentinel}`);
    error.name = sentinel;
    expect(safeOAuthErrorCode(error)).toBe("internal_error");
    expect(safeOAuthErrorCode(new Error("oauth_google_token_failed:invalid_grant"))).toBe("oauth_google_token_failed:invalid_grant");
    expect(JSON.stringify(warn.mock.calls)).not.toContain(sentinel);
    expect(warn).toHaveBeenLastCalledWith(JSON.stringify({ operation: "oauth_provider", status: 400, code: "invalid_grant" }));
  });
});