import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

export const MCP_SCOPES = Object.freeze(["jurisprudence:read", "jurisprudenciaia:search"]);

export function canonicalOAuthOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("oauth_public_origin_invalid");
  }
  return url.origin;
}

/** Omitted resource remains compatible: the provider binds it to its fixed resource. */
export function hasInvalidAuthorizeResource(request: Request, origin: string): boolean {
  const url = new URL(request.url);
  if (request.method !== "GET" || !["/authorize", "/oauth/authorize"].includes(url.pathname)) return false;
  const resources = url.searchParams.getAll("resource");
  return resources.some(resource => resource !== `${origin}/mcp`);
}

export function requireSupportedScopes(scopes: string[]): void {
  if (scopes.some(scope => !MCP_SCOPES.includes(scope))) throw new Error("oauth_invalid_scope");
}

/** Runs only after the provider has verified the token and decrypted its props. */
export function authorizeMcpProps(props: unknown, scopes: string[], userId: string, allowedEmails: string | undefined): "access_denied" | "insufficient_scope" | undefined {
  if (!props || typeof props !== "object" || Array.isArray(props)) return "access_denied";
  const value = props as Record<string, unknown>;
  if (value.tenantId !== "jurisia" || typeof value.userId !== "string" || !value.userId.trim() || value.userId !== userId || typeof value.email !== "string") return "access_denied";
  const allowed = (allowedEmails ?? "").split(",").map(email => email.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(value.email.trim().toLowerCase())) return "access_denied";
  if (!scopes.some(scope => MCP_SCOPES.includes(scope))) return "insufficient_scope";
  return undefined;
}

/** Read effective token scopes, including older tokens whose props still carry the grant ceiling. */
export async function authorizeMcpToken(request: Request, provider: Pick<OAuthHelpers, "unwrapToken">, allowedEmails: string | undefined): Promise<"access_denied" | "insufficient_scope" | undefined> {
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer ([^\s]+)$/i);
  if (!bearer) return "access_denied";
  const token = await provider.unwrapToken<unknown>(bearer[1]!);
  if (!token) return "access_denied";
  return authorizeMcpProps(token.grant.props, token.scope, token.userId, allowedEmails);
}

const ERROR_CODES = new Set([
  "invalid_request", "invalid_client", "invalid_grant", "unauthorized_client", "unsupported_grant_type",
  "invalid_scope", "invalid_token", "insufficient_scope", "invalid_target", "server_error", "temporarily_unavailable",
  "invalid_client_metadata", "access_denied", "unsupported_response_type",
]);

/** Descriptions, exceptions and request fields can contain credentials; log only closed codes. */
export function logOAuthProviderError(error: { code: string; status: number; headers?: Record<string, string> }): Response {
  const code = ERROR_CODES.has(error.code) ? error.code : "server_error";
  console.warn(JSON.stringify({ operation: "oauth_provider", status: error.status, code }));
  const headers = new Headers(error.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("pragma", "no-cache");
  return Response.json({ error: code }, { status: error.status, headers });
}

const APP_ERROR_CODES = new Set([
  "oauth_unknown_client", "oauth_pkce_s256_required", "oauth_invalid_scope", "oauth_invalid_form", "oauth_invalid_transaction",
  "oauth_invalid_google_callback", "oauth_google_token_invalid", "oauth_google_temporarily_unavailable", "oauth_google_userinfo_failed", "oauth_google_identity_invalid",
  "oauth_allowlist_missing", "oauth_user_not_allowed", "oauth_binding_missing", "oauth_body_too_large", "oauth_invalid_json",
  "oauth_public_origin_invalid", "oauth_invalid_type", "oauth_state_write_failed", "oauth_state_not_bound", "oauth_state_invalid",
  "oauth_configuration_missing:client_id", "oauth_configuration_missing:client_secret", "oauth_configuration_missing:public_origin",
  ...["invalid_client", "invalid_grant", "invalid_request", "unauthorized_client", "unsupported_grant_type", "unknown"].map(code => `oauth_google_token_failed:${code}`),
]);

export function safeOAuthErrorCode(error: unknown): string {
  return error instanceof Error && APP_ERROR_CODES.has(error.message) ? error.message : "internal_error";
}
