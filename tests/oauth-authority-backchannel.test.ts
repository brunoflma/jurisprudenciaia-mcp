import { describe, expect, it, vi } from "vitest";
import { createNodeAuthority, configuredNodeAuthority } from "../src/http/authority-backchannel.js";
import { AUTHORITY_BACKCHANNEL_PATH, readBackchannelBytes, signAuthorityRequest, verifyAuthorityRequest } from "../src/oauth/authority-v2/backchannel.js";
import { handleAuthorityBackchannel } from "../src/oauth/authority-v2/worker-backchannel.js";

const ISSUER = "https://authority.example.com";
const KEY = Buffer.from(new Uint8Array(32).fill(17)).toString("base64url");
const OTHER_KEY = Buffer.from(new Uint8Array(32).fill(18)).toString("base64url");
const TOKEN = "mcp2.a.synthetic-credential";
const EMAIL = "allowed@example.com";
function principal() {
  return { issuer: ISSUER, resource: ISSUER + "/mcp", tenantId: "jurisia", subject: "synthetic-sub",
    clientId: "synthetic-client", familyId: "synthetic-family", epoch: 1, expiresAt: Date.now() + 60000,
    scopes: ["jurisprudence:read"], props: { userId: "synthetic-sub", tenantId: "jurisia", email: EMAIL } };
}
async function signed(key = KEY, issuer = ISSUER, now = Date.now(), body = JSON.stringify({ access_token: TOKEN })) {
  const bytes = new TextEncoder().encode(body);
  return new Request(ISSUER + AUTHORITY_BACKCHANNEL_PATH, { method: "POST",
    headers: { "content-type": "application/json", authorization: await signAuthorityRequest(key, issuer, bytes, now) }, body: bytes });
}
describe("authenticated authority backchannel", () => {
  it("binds proof to authority and exact bytes and rejects stale or foreign proofs", async () => {
    const valid = await signed();
    await expect(verifyAuthorityRequest(valid, KEY, ISSUER, await readBackchannelBytes(valid.clone()))).resolves.toBeUndefined();
    for (const request of [await signed(OTHER_KEY), await signed(KEY, "https://foreign.example.com"), await signed(KEY, ISSUER, Date.now() - 31000)]) {
      await expect(verifyAuthorityRequest(request, KEY, ISSUER, await readBackchannelBytes(request.clone()))).rejects.toMatchObject({ code: "access_denied" });
    }
    await expect(verifyAuthorityRequest(valid, KEY, ISSUER, new TextEncoder().encode("{}"))).rejects.toMatchObject({ code: "access_denied" });
  });
  it("does not resolve credentials without a transport proof, and never publishes raw failures", async () => {
    const authorize = vi.fn().mockResolvedValue(principal());
    const response = await handleAuthorityBackchannel(new Request(ISSUER + AUTHORITY_BACKCHANNEL_PATH, { method: "POST", body: "{}" }), KEY, ISSUER, authorize);
    expect(response.status).toBe(403); expect(authorize).not.toHaveBeenCalled();
    const unavailable = await handleAuthorityBackchannel(await signed(), undefined, ISSUER, authorize);
    expect(unavailable.status).toBe(503); expect(unavailable.headers.get("retry-after")).toBe("5");
    const failed = await handleAuthorityBackchannel(await signed(), KEY, ISSUER, async () => { throw new Error("synthetic-private-error-SENTINEL"); });
    expect(failed.status).toBe(503); expect(await failed.text()).not.toContain("SENTINEL");
  });
  it("bounds streamed requests without trusting a content-length header", async () => {
    const authorize = vi.fn();
    const request = new Request(ISSUER + AUTHORITY_BACKCHANNEL_PATH, { method: "POST", body: "x".repeat(16385) });
    expect((await handleAuthorityBackchannel(request, KEY, ISSUER, authorize)).status).toBe(400);
    expect(authorize).not.toHaveBeenCalled();
  });
  it("rejects unexpected methods and fields before any credential query", async () => {
    const authorize = vi.fn();
    expect((await handleAuthorityBackchannel(new Request(ISSUER + AUTHORITY_BACKCHANNEL_PATH), KEY, ISSUER, authorize)).status).toBe(405);
    expect((await handleAuthorityBackchannel(await signed(KEY, ISSUER, Date.now(), JSON.stringify({ access_token: TOKEN, subject: "forged" })), KEY, ISSUER, authorize)).status).toBe(401);
    expect(authorize).not.toHaveBeenCalled();
  });
  it("authenticates each Node call and returns only minimal principal properties", async () => {
    const value = principal();
    value.props = { ...value.props, providerSecret: "synthetic-private-SENTINEL" } as typeof value.props;
    const authorize = vi.fn().mockResolvedValue(value);
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe("error"); expect(init?.cache).toBe("no-store");
      expect(String(input)).toBe(ISSUER + AUTHORITY_BACKCHANNEL_PATH);
      return handleAuthorityBackchannel(new Request(input, init), KEY, ISSUER, authorize);
    });
    const node = createNodeAuthority({ issuer: ISSUER, key: KEY, allowedEmails: () => EMAIL, fetcher });
    const first = await node.authorize(TOKEN); await node.authorize(TOKEN);
    expect(authorize).toHaveBeenCalledTimes(2); expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(first)).not.toContain("SENTINEL");
  });
  it.each([401, 403, 429, 500, 503])("preserves invalid-credential versus backend-failure semantics for %s", async status => {
    const node = createNodeAuthority({ issuer: ISSUER, key: KEY, allowedEmails: () => EMAIL, fetcher: vi.fn(async () => Response.json({}, { status })) });
    await expect(node.authorize(TOKEN)).rejects.toMatchObject({ code: status === 401 ? "invalid_token" : status === 403 ? "access_denied" : "temporarily_unavailable" });
  });
  it.each(["issuer", "resource", "tenantId", "subject", "scopes", "expiresAt"])("rejects an invalid %s returned by the remote authority", async field => {
    const value: Record<string, unknown> = principal();
    value[field] = field === "expiresAt" ? Date.now() - 1 : field === "scopes" ? ["unrelated:scope"] : "foreign";
    const node = createNodeAuthority({ issuer: ISSUER, key: KEY, allowedEmails: () => EMAIL, fetcher: vi.fn(async () => Response.json(value)) });
    await expect(node.authorize(TOKEN)).rejects.toMatchObject({ code: field === "scopes" ? "insufficient_scope" : "access_denied" });
  });
  it("rejects transport failures, malformed responses and streamed responses over the limit", async () => {
    for (const fetcher of [vi.fn(async () => { throw new Error("synthetic-network-SENTINEL"); }),
      vi.fn(async () => new Response("{", { headers: { "content-type": "application/json" } })),
      vi.fn(async () => new Response("x".repeat(16385), { headers: { "content-type": "application/json" } }))]) {
      const node = createNodeAuthority({ issuer: ISSUER, key: KEY, allowedEmails: () => EMAIL, fetcher });
      await expect(node.authorize(TOKEN)).rejects.toMatchObject({ code: "temporarily_unavailable" });
    }
  });
  it("allows only explicitly configured public HTTPS authority origins", () => {
    for (const issuer of ["http://example.com", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://example.com:8443", "https://example.com/other", "https://example.com?destination=foreign"]) {
      expect(() => createNodeAuthority({ issuer, key: KEY, allowedEmails: () => EMAIL })).toThrow();
    }
    expect(configuredNodeAuthority({ MCP_OAUTH_V2_ENABLED: "true" })).toBeUndefined();
    expect(configuredNodeAuthority({ MCP_OAUTH_V2_ENABLED: "false", MCP_PUBLIC_ORIGIN: ISSUER, MCP_OAUTH_V2_BACKCHANNEL_KEY: KEY })).toBeUndefined();
  });
});
