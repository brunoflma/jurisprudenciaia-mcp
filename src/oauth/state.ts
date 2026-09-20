import type { AuthRequest } from "@cloudflare/workers-oauth-provider";

const TTL_SECONDS = 600;
export const GOOGLE_CALLBACK_PATH = "/oauth/google/callback";

export type OAuthStateNamespace = Pick<DurableObjectNamespace, "idFromName" | "get">;

function safePrefix(type: string): string {
  const value = type.toLowerCase();
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(value)) throw new Error("oauth_invalid_type");
  return value;
}

function cookieName(type: string): string {
  return `__Host-MCP_${safePrefix(type).toUpperCase().replaceAll("-", "_")}`;
}

// Scan cookie pairs without allocating an array or matching inside another value.
function readCookie(request: Request, name: string): string {
  const cookieStr = request.headers.get("cookie");
  if (!cookieStr) return "";
  const searchStr = name + "=";
  let start = 0;
  while (start < cookieStr.length) {
    const separator = cookieStr.indexOf(";", start);
    const end = separator === -1 ? cookieStr.length : separator;
    while (start < end && (cookieStr.charCodeAt(start) === 32 || cookieStr.charCodeAt(start) === 9)) start++;
    if (cookieStr.startsWith(searchStr, start)) {
      return cookieStr.substring(start + searchStr.length, end).trim();
    }
    start = end + 1;
  }
  return "";
}

const HEX_TABLE = new Array(256);
for (let i = 0; i < 256; i++) {
  HEX_TABLE[i] = (i < 16 ? "0" : "") + i.toString(16);
}

// ⚡ Bolt: Use a precomputed lookup table instead of Array.from and .toString(16)
// to avoid excessive string allocations and improve hex encoding performance.
async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  let hex = "";
  for (let i = 0; i < digest.length; i++) {
    hex += HEX_TABLE[digest[i]];
  }
  return hex;
}

async function equalConstantTime(left: string, right: string): Promise<boolean> {
  if (left.length !== right.length) return false;
  const [aa, bb] = await Promise.all([sha256(left), sha256(right)]);
  let difference = 0;
  for (let index = 0; index < aa.length; index += 1) difference |= aa.charCodeAt(index) ^ bb.charCodeAt(index);
  return difference === 0;
}

export async function createOAuthTransaction(namespace: OAuthStateNamespace, type: string, payload: AuthRequest): Promise<{ token: string; setCookie: string }> {
  const prefix = safePrefix(type);
  const token = crypto.randomUUID();
  const binding = await sha256(token);
  const key = `mcp:oauth:${prefix}:${token}`;
  const stub = namespace.get(namespace.idFromName(key));
  const response = await stub.fetch(new Request("https://oauth-state.internal/", {
    method: "PUT",
    body: JSON.stringify({ payload, binding, expiresAt: Date.now() + TTL_SECONDS * 1_000 })
  }));
  if (!response.ok) throw new Error("oauth_state_write_failed");
  return {
    token,
    setCookie: `${cookieName(prefix)}=${binding}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${TTL_SECONDS}`
  };
}

export async function consumeOAuthTransaction(namespace: OAuthStateNamespace, type: string, token: string, request: Request): Promise<AuthRequest> {
  const prefix = safePrefix(type);
  const expected = await sha256(token);
  const received = readCookie(request, cookieName(prefix));
  if (!(await equalConstantTime(received, expected))) throw new Error("oauth_state_not_bound");
  const key = `mcp:oauth:${prefix}:${token}`;
  const stub = namespace.get(namespace.idFromName(key));
  const response = await stub.fetch(new Request("https://oauth-state.internal/consume", {
    method: "POST",
    headers: { "x-mcp-oauth-binding": received }
  }));
  if (response.status === 403) throw new Error("oauth_state_not_bound");
  if (!response.ok) throw new Error("oauth_state_invalid");
  const value: unknown = await response.json();
  if (!isRecord(value)) throw new Error("oauth_state_invalid");
  return parseAuthRequest(value.payload);
}

export function clearOAuthCookie(type: string): string {
  return `${cookieName(type)}=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0`;
}

export function googleAuthorizationUrl(options: { clientId: string; publicOrigin: string; state: string }): string {
  const origin = new URL(options.publicOrigin);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash) throw new Error("oauth_public_origin_invalid");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", new URL(GOOGLE_CALLBACK_PATH, origin.origin).href);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", options.state);
  url.searchParams.set("prompt", "select_account");
  return url.href;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseAuthRequest(value: unknown): AuthRequest {
  if (!isRecord(value) || typeof value.responseType !== "string" || typeof value.clientId !== "string" ||
      typeof value.redirectUri !== "string" || typeof value.state !== "string" ||
      !Array.isArray(value.scope) || !value.scope.every((item) => typeof item === "string")) {
    throw new Error("oauth_state_invalid");
  }
  const result: AuthRequest = {
    responseType: value.responseType,
    clientId: value.clientId,
    redirectUri: value.redirectUri,
    state: value.state,
    scope: value.scope
  };
  if (typeof value.codeChallenge === "string") result.codeChallenge = value.codeChallenge;
  if (typeof value.codeChallengeMethod === "string") result.codeChallengeMethod = value.codeChallengeMethod;
  if (typeof value.resource === "string" || Array.isArray(value.resource) && value.resource.every((item) => typeof item === "string")) result.resource = value.resource;
  return result;
}
