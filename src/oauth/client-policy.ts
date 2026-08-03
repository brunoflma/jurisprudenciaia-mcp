import type { AuthRequest } from "@cloudflare/workers-oauth-provider";

const HOSTED_CALLBACKS = new Set([
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback"
]);
const CHATGPT_CALLBACK_PATH = /^\/connector\/oauth\/[A-Za-z0-9_-]{8,128}$/;

export type OAuthRedirectProfile = "hosted" | "loopback";

export function classifyOAuthRedirectUri(value: string): OAuthRedirectProfile | undefined {
  try {
    const url = new URL(value);
    if (HOSTED_CALLBACKS.has(url.href)) return "hosted";
    if (url.protocol === "https:" && url.hostname === "chatgpt.com" &&
        !url.username && !url.password && !url.search && !url.hash &&
        CHATGPT_CALLBACK_PATH.test(url.pathname)) return "hosted";

    const loopbackHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    const port = Number(url.port);
    const validPort = url.port !== "" && Number.isInteger(port) && port >= 1 && port <= 65_535;
    const cleanUrl = url.protocol === "http:" && !url.username && !url.password && !url.search && !url.hash;
    if (loopbackHost && validPort && cleanUrl && url.pathname === "/oauth/callback") return "loopback";
  } catch {
    // Invalid redirect URIs are rejected by returning no profile.
  }
  return undefined;
}

export function validateDynamicClientMetadata(clientMetadata: Record<string, unknown>): boolean {
  const redirects = stringArray(clientMetadata.redirect_uris);
  if (!redirects || redirects.length === 0) return false;

  const profiles = redirects.map(classifyOAuthRedirectUri);
  if (profiles.some((profile) => profile === undefined) || new Set(profiles).size !== 1) return false;
  if (profiles[0] === "hosted") return true;

  const authMethod = clientMetadata.token_endpoint_auth_method ?? "client_secret_basic";
  if (authMethod !== "none") return false;

  const grantTypes = clientMetadata.grant_types === undefined
    ? ["authorization_code"]
    : stringArray(clientMetadata.grant_types);
  if (!grantTypes || !grantTypes.includes("authorization_code") ||
      grantTypes.some((grant) => grant !== "authorization_code" && grant !== "refresh_token")) return false;

  const responseTypes = clientMetadata.response_types === undefined
    ? ["code"]
    : stringArray(clientMetadata.response_types);
  return Boolean(responseTypes && responseTypes.length === 1 && responseTypes[0] === "code");
}

export function requireLoopbackPkce(authRequest: AuthRequest): void {
  if (classifyOAuthRedirectUri(authRequest.redirectUri) !== "loopback") return;
  if (!authRequest.codeChallenge || authRequest.codeChallengeMethod !== "S256") {
    throw new Error("oauth_pkce_s256_required");
  }
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}
