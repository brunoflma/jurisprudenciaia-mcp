import { describe, expect, it } from "vitest";
import worker, { ensureLegacyChatGptClient, validateMcpClientRegistration, handleWorkerRequest } from "../src/worker.js";
import type { Env } from "../src/types.js";
import type { JurisprudenciaIaRunner } from "../src/jurisprudenciaia/types.js";

const env = {
  JURISPRUDENCIAIA_URL: "https://www.jurisprudenciaia.com.br/"
} as unknown as Env;

const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {}
} as unknown as ExecutionContext;

function fakeRunner(markdown: string): JurisprudenciaIaRunner {
  return {
    async search() {
      return { markdown };
    }
  };
}

describe("Cloudflare Worker", () => {
  it("bootstraps the fixed legacy ChatGPT client only for an official callback", async () => {
    const stored = new Map<string, string>();
    const kv = {
      get: async (key: string) => stored.get(key) ?? null,
      put: async (key: string, value: string) => { stored.set(key, value); }
    } as unknown as KVNamespace;
    const request = new Request("https://mcp.test/authorize?client_id=jurisprudenciaia-mcp-client&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fconnector%2Foauth%2FAxMS-ux405ET");

    await ensureLegacyChatGptClient(request, { OAUTH_KV: kv });

    expect(JSON.parse(stored.get("client:jurisprudenciaia-mcp-client")!)).toMatchObject({
      clientId: "jurisprudenciaia-mcp-client",
      redirectUris: ["https://chatgpt.com/connector/oauth/AxMS-ux405ET"],
      tokenEndpointAuthMethod: "none"
    });
  });

  it("publishes health and OAuth metadata", async () => {
    const health = await worker.fetch(new Request("https://mcp.test/healthz"), env, ctx);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true, service: "jurisprudenciaia-mcp" });
    expect(health.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains; preload");

    const metadata = await worker.fetch(new Request("https://mcp.test/.well-known/oauth-protected-resource"), env, ctx);
    expect(await metadata.json()).toMatchObject({
      resource: "https://mcp.test/mcp",
      scopes_supported: ["jurisprudence:read"]
    });

    const serverMetadata = await worker.fetch(
      new Request("https://mcp.test/.well-known/oauth-authorization-server"),
      env,
      ctx
    );
    expect(await serverMetadata.json()).toMatchObject({
      scopes_supported: ["jurisprudence:read"]
    });
  });

  it("advertises the configured public origin in OAuth metadata", async () => {
    const configuredEnv = { ...env, MCP_PUBLIC_ORIGIN: "https://mcp.example.com" } as unknown as Env;

    const metadata = await worker.fetch(
      new Request("https://mcp.test/.well-known/oauth-protected-resource"),
      configuredEnv,
      ctx
    );

    expect(await metadata.json()).toMatchObject({
      resource: "https://mcp.example.com/mcp",
      authorization_servers: ["https://mcp.example.com"]
    });
  });

  it("serves a minimal landing page and hides MCP details from browsers", async () => {
    const landing = await worker.fetch(new Request("https://mcp.test/", { headers: { accept: "text/html" } }), env, ctx);
    expect(landing.status).toBe(200);
    const html = await landing.text();
    expect(html).toContain("Conector MCP auto-hospedado · acesso restrito.");
    expect(html).toContain("JurisprudênciaIA MCP");
    expect(html).toContain('rel="stylesheet" href="/landing.css"');
    expect(html).not.toContain("<style>");
    expect(landing.headers.get("content-security-policy")).toContain("style-src 'self'");

    const stylesheet = await worker.fetch(new Request("https://mcp.test/landing.css"), env, ctx);
    expect(stylesheet.status).toBe(200);
    expect(stylesheet.headers.get("content-type")).toContain("text/css");

    const mcp = await worker.fetch(new Request("https://mcp.test/mcp", { headers: { accept: "text/html" } }), env, ctx);
    expect(mcp.status).toBe(404);
    expect(await mcp.json()).toEqual({ error: "not_found" });
  });

  it("serves SVG, PNG, and ICO favicons", async () => {
    const svg = await worker.fetch(new Request("https://mcp.test/favicon.svg"), env, ctx);
    expect(svg.status).toBe(200);
    expect(svg.headers.get("content-type")).toContain("image/svg+xml");

    const png = await worker.fetch(new Request("https://mcp.test/favicon.png"), env, ctx);
    expect(png.status).toBe(200);
    expect(png.headers.get("content-type")).toContain("image/png");

    const ico = await worker.fetch(new Request("https://mcp.test/favicon.ico"), env, ctx);
    expect(ico.status).toBe(200);
    expect(ico.headers.get("content-type")).toContain("image/x-icon");
  });

  it("rejects unauthenticated MCP requests", async () => {
    const response = await worker.fetch(new Request("https://mcp.test/mcp", { method: "POST", body: "{}" }), env, ctx);
    expect(response.status).toBe(401);

    const rootAlias = await worker.fetch(new Request("https://mcp.test/", { method: "POST", body: "{}" }), env, ctx);
    expect(rootAlias.status).toBe(401);
    expect(rootAlias.headers.get("www-authenticate")).toContain("resource_metadata");
  });

  it("rejects any static bearer token, including a previously configured one", async () => {
    for (const token of ["wrong-token", "test-token"]) {
      const response = await worker.fetch(new Request("https://mcp.test/mcp", {
        method: "POST", headers: { authorization: `Bearer ${token}` }, body: "{}"
      }), env, ctx);
      expect(response.status).toBe(401);
    }
  });

  it("serves MCP tools through handleWorkerRequest once OAuth authorized the request", async () => {
    const response = await handleWorkerRequest(new Request("https://mcp.test/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream"
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
    }), env, fakeRunner("markdown result"));

    expect(response.status).toBe(200);
    const payload = await response.json() as { result: { tools: Array<{ name: string }> } };
    expect(payload.result.tools.length).toBeGreaterThan(0);
    expect(payload.result.tools.map(t => t.name)).toContain("consultar_jurisprudenciaia");
  });

  it("rejects oversized JSON-RPC batches before creating the MCP transport", async () => {
    const batch = Array.from({ length: 21 }, (_, index) => ({
      jsonrpc: "2.0",
      id: index + 1,
      method: "ping"
    }));
    const response = await handleWorkerRequest(new Request("https://mcp.test/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(batch)
    }), env, fakeRunner("unused"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: -32600, message: "Batch size exceeds maximum of 20" },
      id: null
    });
  });

  it("routes the root compatibility alias through OAuth instead of a static token", async () => {
    const response = await worker.fetch(new Request("https://mcp.test/", {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
        accept: "application/json, text/event-stream"
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
    }), env, ctx);

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("resource_metadata");
  });

  it("allows hosted Claude dynamic registrations without relying on a mutable client name", () => {
    expect(validateMcpClientRegistration({
      clientMetadata: { client_name: "Claude Custom Connector", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] },
      request: new Request("https://mcp.test/oauth/register")
    })).toBeUndefined();
    expect(validateMcpClientRegistration({
      clientMetadata: { client_name: "Claude", redirect_uris: ["https://claude.com/api/mcp/auth_callback"] },
      request: new Request("https://mcp.test/oauth/register")
    })).toBeUndefined();
    expect(validateMcpClientRegistration({
      clientMetadata: { client_name: "Claude", redirect_uris: ["https://claude.ai.evil.test/api/mcp/auth_callback"] },
      request: new Request("https://mcp.test/oauth/register")
    })).toMatchObject({ code: "invalid_client_metadata" });
    expect(validateMcpClientRegistration({
      clientMetadata: {
        client_name: "Claude",
        redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
        token_endpoint_auth_method: "client_secret_basic"
      },
      request: new Request("https://mcp.test/oauth/register")
    })).toBeUndefined();
    expect(validateMcpClientRegistration({
      clientMetadata: { client_name: "Claude Web", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] },
      request: new Request("https://mcp.test/oauth/register")
    })).toBeUndefined();
    expect(validateMcpClientRegistration({
      clientMetadata: {
        client_name: "ChatGPT",
        redirect_uris: ["https://chatgpt.com/connector/oauth/AxMS-ux405ET"],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code"],
        response_types: ["code"]
      },
      request: new Request("https://mcp.test/oauth/register")
    })).toBeUndefined();
  });

  it("allows Codex public clients on randomized IPv4 loopback callbacks", () => {
    expect(validateMcpClientRegistration({
      clientMetadata: {
        client_name: "Codex",
        redirect_uris: ["http://127.0.0.1:48703/callback/gSuWNlcOrmWI"],
        grant_types: ["authorization_code", "refresh_token"],
        token_endpoint_auth_method: "none",
        response_types: ["code"],
        scope: "jurisprudence:read"
      },
      request: new Request("https://mcp.test/oauth/register")
    })).toBeUndefined();
  });

  it("allows Codex public clients on IPv6 loopback callbacks", () => {
    expect(validateMcpClientRegistration({
      clientMetadata: {
        client_name: "Codex",
        redirect_uris: ["http://[::1]:48703/callback/gSuWNlcOrmWI"],
        grant_types: ["authorization_code", "refresh_token"],
        token_endpoint_auth_method: "none",
        response_types: ["code"]
      },
      request: new Request("https://mcp.test/oauth/register")
    })).toBeUndefined();
  });

  it.each([
    "http://localhost:48703/callback/gSuWNlcOrmWI",
    "http://localhost.evil.test:48703/callback/gSuWNlcOrmWI",
    "http://127.0.0.2:48703/callback/gSuWNlcOrmWI",
    "http://192.168.1.10:48703/callback/gSuWNlcOrmWI",
    "https://127.0.0.1:48703/callback/gSuWNlcOrmWI",
    "http://user@127.0.0.1:48703/callback/gSuWNlcOrmWI",
    "http://127.0.0.1:48703/callback/gSuWNlcOrmWI?next=evil",
    "http://127.0.0.1:48703/callback/gSuWNlcOrmWI#fragment",
    "http://127.0.0.1/callback/gSuWNlcOrmWI",
    "http://127.0.0.1:0/callback/gSuWNlcOrmWI",
    "http://127.0.0.1:48703/other/gSuWNlcOrmWI",
    "http://127.0.0.1:48703/callback/../../evil"
  ])("rejects unsafe Codex callback %s", (redirectUri) => {
    expect(validateMcpClientRegistration({
      clientMetadata: {
        client_name: "Codex",
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        token_endpoint_auth_method: "none",
        response_types: ["code"]
      },
      request: new Request("https://mcp.test/oauth/register")
    })).toMatchObject({ code: "invalid_client_metadata" });
  });

  it("rejects confidential or misidentified clients using a Codex loopback callback", () => {
    for (const clientMetadata of [
      {
        client_name: "Other Client",
        redirect_uris: ["http://127.0.0.1:48703/callback/gSuWNlcOrmWI"],
        grant_types: ["authorization_code", "refresh_token"],
        token_endpoint_auth_method: "none",
        response_types: ["code"]
      },
      {
        client_name: "Codex",
        redirect_uris: ["http://127.0.0.1:48703/callback/gSuWNlcOrmWI"],
        grant_types: ["authorization_code", "refresh_token"],
        token_endpoint_auth_method: "client_secret_basic",
        response_types: ["code"]
      },
      {
        client_name: "Codex",
        redirect_uris: ["http://127.0.0.1:48703/callback/gSuWNlcOrmWI"],
        grant_types: ["implicit"],
        token_endpoint_auth_method: "none",
        response_types: ["token"]
      }
    ]) {
      expect(validateMcpClientRegistration({
        clientMetadata,
        request: new Request("https://mcp.test/oauth/register")
      })).toMatchObject({ code: "invalid_client_metadata" });
    }
  });
});
