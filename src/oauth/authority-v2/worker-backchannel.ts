import { AUTHORITY_BACKCHANNEL_PATH, decodeBackchannelJson, readBackchannelBytes, verifyAuthorityRequest } from "./backchannel.js";
import type { Principal } from "./adapter.js";

export async function handleAuthorityBackchannel(request: Request, key: string | undefined, issuer: string, authorize: (request: Request) => Promise<Principal>): Promise<Response> {
  const headers = { "cache-control": "no-store", pragma: "no-cache" };
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405, headers: { ...headers, allow: "POST" } });
  try {
    const bytes = await readBackchannelBytes(request);
    await verifyAuthorityRequest(request, key, issuer, bytes);
    if (new URL(request.url).pathname !== AUTHORITY_BACKCHANNEL_PATH || request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") throw { code: "invalid_request" };
    const body = decodeBackchannelJson(bytes);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !("access_token" in body)
        || typeof body.access_token !== "string" || !/^mcp2\.a\.[^\s]{1,12000}$/.test(body.access_token)) throw { code: "invalid_token" };
    const principal = await authorize(new Request(issuer + "/mcp", { method: "POST", headers: { authorization: "Bearer " + body.access_token } }));
    const props = principal.props as Record<string, unknown>;
    // Provider credentials and unrelated props never cross the backchannel.
    return Response.json({ issuer: principal.issuer, resource: principal.resource, tenantId: principal.tenantId, subject: principal.subject,
      clientId: principal.clientId, familyId: principal.familyId, scopes: principal.scopes, epoch: principal.epoch, expiresAt: principal.expiresAt,
      props: { userId: props.userId, tenantId: props.tenantId, email: props.email } }, { headers });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    const status = code === "invalid_token" ? 401 : code === "access_denied" || code === "insufficient_scope" ? 403 : code === "invalid_request" ? 400 : 503;
    return Response.json({ error: status === 503 ? "temporarily_unavailable" : status === 401 ? "invalid_token" : status === 403 ? "access_denied" : "invalid_request" },
      { status, headers: status === 503 ? { ...headers, "retry-after": "5" } : headers });
  }
}
