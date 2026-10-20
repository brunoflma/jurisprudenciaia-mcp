import { canonicalOAuthOrigin, MCP_SCOPES, requireSupportedScopes } from "./access-policy.js";
import type { AuthRequest, CompleteAuthorizationOptions } from "@cloudflare/workers-oauth-provider";
import { classifyOAuthRedirectUri, requireLoopbackPkce } from "./client-policy.js";
import type { TrustedGoogleIdentity } from "./authority-v2/adapter.js";
import type { OAuthTransaction } from "./state.js";
import type { OAuthStateNamespace } from "./state.js";
import {
  clearOAuthCookie,
  consumeOAuthTransaction,
  createOAuthTransaction,
  createGooglePkce,
  GOOGLE_CALLBACK_PATH,
  googleAuthorizationUrl
} from "./state.js";

const SECURITY_HEADERS = {
  "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "x-xss-protection": "1; mode=block"
} as const;
const SCOPES = MCP_SCOPES;
const MAX_FORM_BYTES = 8_192;
const MAX_GOOGLE_BYTES = 32_768;
const GOOGLE_TOKEN_ERRORS = new Set(["invalid_client", "invalid_grant", "invalid_request", "unauthorized_client", "unsupported_grant_type"]);

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type GoogleOAuthEnv = {
  MCP_GOOGLE_CLIENT_ID?: string;
  MCP_GOOGLE_CLIENT_SECRET?: string;
  MCP_PUBLIC_ORIGIN?: string;
  MCP_GOOGLE_CALLBACK_ORIGIN?: string;
  MCP_ALLOWED_EMAILS?: string;
  OAUTH_PROVIDER: {
    parseAuthRequest(request: Request): Promise<AuthRequest>;
    lookupClient(clientId: string): Promise<{ clientName?: string } | null>;
    completeAuthorization(options: CompleteAuthorizationOptions): Promise<{ redirectTo: string }>;
  };
  OAUTH_STATE: OAuthStateNamespace;
};

import { consentPage as renderConsentView } from "./consent-view.js";

export function consentPage(clientName: string, token: string, nonce: string, localClient = false): string {
  return renderConsentView(clientName, token, nonce, localClient);
}

export type AuthorityGoogleHooks = {
  parseAuthorization(request: Request): Promise<OAuthTransaction>;
  completeAuthorization(auth: AuthRequest, identity: TrustedGoogleIdentity): Promise<{ redirectTo: string }>;
  legacyAuthorizationAllowed(): boolean;
};

export async function handleGoogleAuth(request: Request, env: GoogleOAuthEnv, fallback: () => Promise<Response>, googleFetch: FetchLike = fetch, authority?: AuthorityGoogleHooks): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path !== "/authorize" && path !== GOOGLE_CALLBACK_PATH) return fallback();
  requireConfiguration(env);
  if (path === "/authorize" && request.method === "GET") return showConsent(request, env, authority);
  if (path === "/authorize" && request.method === "POST") return startGoogle(request, env);
  if (path === GOOGLE_CALLBACK_PATH && request.method === "GET") return finishGoogle(request, env, googleFetch, authority);
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, POST", ...SECURITY_HEADERS } });
}

async function showConsent(request: Request, env: GoogleOAuthEnv, authority?: AuthorityGoogleHooks): Promise<Response> {
  const authRequest = authority ? await authority.parseAuthorization(request) : await env.OAUTH_PROVIDER.parseAuthRequest(request);
  requireSupportedScopes(authRequest.scope);
  // Keep RFC 9207 issuer stable through both one-shot state transitions.
  authRequest.issuer = canonicalOAuthOrigin(env.MCP_PUBLIC_ORIGIN!);
  requireLoopbackPkce(authRequest);
  const client = await env.OAUTH_PROVIDER.lookupClient(authRequest.clientId);
  if (!client) throw new Error("oauth_unknown_client");
  const transaction = await createOAuthTransaction(env.OAUTH_STATE, "consent", authRequest);
  const nonce = crypto.randomUUID();
  const localClient = classifyOAuthRedirectUri(authRequest.redirectUri) === "loopback";
  return new Response(consentPage(client.clientName ?? "Claude", transaction.token, nonce, localClient), { headers: {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": `default-src 'none'; style-src 'nonce-${nonce}'; form-action 'self' https://accounts.google.com; base-uri 'none'; frame-ancestors 'none'`,
    "set-cookie": transaction.setCookie,
    "cache-control": "no-store",
    "pragma": "no-cache",
    "referrer-policy": "no-referrer",
    ...SECURITY_HEADERS
  }});
}

async function startGoogle(request: Request, env: GoogleOAuthEnv): Promise<Response> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/x-www-form-urlencoded")) throw new Error("oauth_invalid_form");
  const form = new URLSearchParams(new TextDecoder().decode(await readLimited(request, MAX_FORM_BYTES)));
  const token = form.get("transaction") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(token)) throw new Error("oauth_invalid_transaction");
  const authRequest = await consumeOAuthTransaction(env.OAUTH_STATE, "consent", token, request);
  const pkce = await createGooglePkce();
  const state = await createOAuthTransaction(env.OAUTH_STATE, "google", { ...authRequest, googleCodeVerifier: pkce.verifier });
  const callbackOrigin = env.MCP_GOOGLE_CALLBACK_ORIGIN || env.MCP_PUBLIC_ORIGIN!;
  return redirect(googleAuthorizationUrl({ clientId: env.MCP_GOOGLE_CLIENT_ID!, publicOrigin: callbackOrigin, state: state.token, codeChallenge: pkce.challenge }), [clearOAuthCookie("consent"), state.setCookie]);
}

async function finishGoogle(request: Request, env: GoogleOAuthEnv, googleFetch: FetchLike, authority?: AuthorityGoogleHooks): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!code || !state) throw new Error("oauth_invalid_google_callback");
  console.log(JSON.stringify({ operation: "oauth_google_callback", stage: "received" }));
  const { googleCodeVerifier, ...authRequest } = await consumeOAuthTransaction(env.OAUTH_STATE, "google", state, request);
  console.log(JSON.stringify({ operation: "oauth_google_callback", stage: "state_verified" }));
  if (authRequest.authorityVersion === 2 && !authority) throw new Error("oauth_google_temporarily_unavailable");
  const accessToken = await exchangeGoogleCode(code, env, googleFetch, googleCodeVerifier);
  console.log(JSON.stringify({ operation: "oauth_google_callback", stage: "code_exchanged" }));
  const profile = await googleProfile(accessToken, googleFetch);
  console.log(JSON.stringify({ operation: "oauth_google_callback", stage: "profile_verified" }));
  const identity = allowedIdentity(profile, env);
  const scopes = authRequest.scope.length > 0 ? SCOPES.filter((scope) => authRequest.scope.includes(scope)) : [...SCOPES];
  const props = { tenantId: "jurisia", userId: profile.sub, email: identity.email, name: identity.name, scopes, mcpRedirectUri: authRequest.redirectUri };
  if (authRequest.authorityVersion === 2) {
    if (!authority) throw new Error("oauth_google_temporarily_unavailable");
    const { redirectTo } = await authority.completeAuthorization(authRequest, { sub: profile.sub, email: identity.email, email_verified: true });
    return redirect(redirectTo, [clearOAuthCookie("google")]);
  }
  if (authority && !authority.legacyAuthorizationAllowed()) throw new Error("oauth_invalid_transaction");
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: authRequest,
    userId: profile.sub,
    metadata: { email: identity.email },
    scope: scopes,
    props,
    // Evita que o callback dependa da cota diaria de OAUTH_KV.list().
    revokeExistingGrants:false
  });
  console.log(JSON.stringify({ operation: "oauth_google_callback", stage: "authorization_completed" }));
  return redirect(redirectTo, [clearOAuthCookie("google")]);
}

async function exchangeGoogleCode(code: string, env: GoogleOAuthEnv, googleFetch: FetchLike, googleCodeVerifier?: string): Promise<string> {
  const callbackOrigin = env.MCP_GOOGLE_CALLBACK_ORIGIN || env.MCP_PUBLIC_ORIGIN!;
  const body = new URLSearchParams({ code, client_id: env.MCP_GOOGLE_CLIENT_ID!, client_secret: env.MCP_GOOGLE_CLIENT_SECRET!, redirect_uri: new URL(GOOGLE_CALLBACK_PATH, callbackOrigin).href, grant_type: "authorization_code" });
  if (googleCodeVerifier) body.set("code_verifier", googleCodeVerifier);
  const { response, payload } = await fetchJsonBounded(googleFetch, new Request("https://oauth2.googleapis.com/token", { method: "POST", body }), 15_000, MAX_GOOGLE_BYTES);
  if (!response.ok) {
    const record = parseRecord(payload);
    const candidate = typeof record.error === "string" && GOOGLE_TOKEN_ERRORS.has(record.error) ? record.error : "unknown";
    console.error(JSON.stringify({ operation: "oauth_google_token", status: response.status, code: candidate }));
    throw new Error(`oauth_google_token_failed:${candidate}`);
  }
  const record = parseRecord(payload);
  if (typeof record.access_token !== "string" || !record.access_token) throw new Error("oauth_google_token_invalid");
  return record.access_token;
}

async function googleProfile(accessToken: string, googleFetch: FetchLike): Promise<{ sub: string; email: string; name: string }> {
  const { response, payload } = await fetchJsonBounded(googleFetch, new Request("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } }), 15_000, MAX_GOOGLE_BYTES);
  if (!response.ok) throw new Error("oauth_google_userinfo_failed");
  const record = parseRecord(payload);
  if (record.email_verified !== true || typeof record.sub !== "string" || typeof record.email !== "string") throw new Error("oauth_google_identity_invalid");
  return { sub: record.sub, email: record.email, name: typeof record.name === "string" ? record.name : record.email };
}

// ⚡ Bolt: Cache parsed allowed emails to prevent repeated array allocations
// (.split, .map, .filter) and reduce GC overhead on OAuth callbacks.
let cachedAllowedEmailsStr: string | undefined;
let cachedAllowedEmails: string[] = [];

function allowedIdentity(profile: { email: string; name: string }, env: GoogleOAuthEnv): { email: string; name: string } {
  if (cachedAllowedEmailsStr !== env.MCP_ALLOWED_EMAILS) {
    cachedAllowedEmailsStr = env.MCP_ALLOWED_EMAILS;
    cachedAllowedEmails = (env.MCP_ALLOWED_EMAILS ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  }
  if (cachedAllowedEmails.length === 0) throw new Error("oauth_allowlist_missing");
  const email = profile.email.trim().toLowerCase();
  if (!cachedAllowedEmails.includes(email)) throw new Error("oauth_user_not_allowed");
  return { email, name: profile.name.trim() || email };
}

function requireConfiguration(env: GoogleOAuthEnv): void {
  const required = {
    client_id: env.MCP_GOOGLE_CLIENT_ID,
    client_secret: env.MCP_GOOGLE_CLIENT_SECRET,
    public_origin: env.MCP_PUBLIC_ORIGIN
  };
  for (const [name, value] of Object.entries(required)) {
    if (!value?.trim()) throw new Error(`oauth_configuration_missing:${name}`);
  }
  if (!env.OAUTH_STATE || !env.OAUTH_PROVIDER) throw new Error("oauth_binding_missing");
}

async function fetchJsonBounded(fetcher: FetchLike, request: Request, timeoutMs: number, maxBytes: number): Promise<{ response: Response; payload: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try { response = await fetcher(new Request(request, { signal: controller.signal })); }
    catch { throw new Error("oauth_google_temporarily_unavailable"); }
    if (response.status === 429 || response.status >= 500) {
      controller.abort();
      throw new Error("oauth_google_temporarily_unavailable");
    }
    const payload = await readJsonLimited(response, maxBytes);
    return { response, payload };
  }
  catch (error) {
    if (controller.signal.aborted) throw new Error("oauth_google_temporarily_unavailable");
    throw error;
  }
  finally { clearTimeout(timer); }
}

async function readLimited(request: Request, limit: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declared) || declared > limit) throw new Error("oauth_body_too_large");
  return readStreamLimited(request.body, limit);
}

async function readStreamLimited(body: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array> {
  const reader = body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) { await reader.cancel(); throw new Error("oauth_body_too_large"); }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

async function readJsonLimited(response: Response, limit: number): Promise<unknown> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declared) || declared > limit) throw new Error("oauth_body_too_large");
  return JSON.parse(new TextDecoder().decode(await readStreamLimited(response.body, limit))) as unknown;
}

function redirect(location: string, cookies: string[]): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store", "Pragma": "no-cache", ...SECURITY_HEADERS });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("oauth_invalid_json");
  return value as Record<string, unknown>;
}
