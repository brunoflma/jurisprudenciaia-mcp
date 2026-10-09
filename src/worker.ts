import { bufferAuthorityRequest, createWorkerAuthority, withAuthorityCors } from "./oauth/authority-v2/worker-integration.js";
import { isAuthorityV2Enabled } from "./oauth/authority-v2/worker-config.mjs";
import { AUTHORITY_BACKCHANNEL_PATH } from "./oauth/authority-v2/backchannel.js";
import { oauthFailure, PRIVATE_DEPLOYMENT } from "./oauth/authority-v2/adapter.js";
export { McpOAuthV2Ledger } from "./oauth/authority-v2/durable-object.js";
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { redirectUriExchangePolicy, type TokenExchangePolicy } from "./oauth/token-policy.js";
import { authorizeMcpToken, canonicalOAuthOrigin, hasInvalidAuthorizeResource, logOAuthProviderError, MCP_SCOPES, safeOAuthErrorCode } from "./oauth/access-policy.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createJurisprudenciaIaMcpServer } from "./mcp/create-server.js";
import { HttpApiJurisprudenciaIaRunner } from "./jurisprudenciaia/http-api-runner.js";
import type { JurisprudenciaIaRunner } from "./jurisprudenciaia/types.js";
import { classifyOAuthRedirectUri } from "./oauth/client-policy.js";
import { handleGoogleAuth } from "./oauth/google-auth.js";
import { validateMcpClientRegistration } from "./oauth/client-registration.js";
import { OAuthStateStore } from "./oauth/state-store.js";
import { FixedWindowRateLimiter } from "./infra/rate-limit.js";
import { GOOGLE_CALLBACK_PATH } from "./oauth/state.js";
import type { Env } from "./types.js";
import { SERVICE_PAGE_CSS, renderProductIcon, renderServicePage } from "./service-page.js";

export { OAuthStateStore };
export { classifyOAuthRedirectUri };
export { validateMcpClientRegistration } from "./oauth/client-registration.js";

const MCP_PATH = "/mcp";
const OAUTH_AUTHORIZE_PATH = "/authorize";
const OAUTH_AUTHORIZE_COMPAT_PATH = "/oauth/authorize";
const LEGACY_CHATGPT_CLIENT_ID = "jurisprudenciaia-mcp-client";
const DISCOVERY_SCOPES = Object.freeze(["jurisprudence:read"]);
const oauthProviders = new Map<string, OAuthProvider<Env>>();
const MAX_BODY_BYTES = 1_048_576;
const MAX_JSON_RPC_BATCH_SIZE = 20;
const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block"
} as const;
const FAVICON_SVG = renderProductIcon("jurisprudenciaia");

const mcpApiHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    // The provider validates the bearer/audience before entering this handler.
    // Its ctx.props may still contain grant scopes after a downscope, so read the token summary.
    let denied: "access_denied" | "insufficient_scope" | undefined;
    try {
      denied = await authorizeMcpToken(request, env.OAUTH_PROVIDER, env.MCP_ALLOWED_EMAILS);
    } catch {
      console.error(JSON.stringify({ operation: "oauth_access", code: "temporarily_unavailable" }));
      return json({ error: "temporarily_unavailable" }, 503);
    }
    if (denied) return json({ error: denied }, 403, denied === "insufficient_scope"
      ? { "WWW-Authenticate": 'Bearer error="insufficient_scope", scope="jurisprudence:read"' }
      : undefined);
    return handleMcp(request, env);
  }
} satisfies ExportedHandler<Env>;

const FAVICON_PNG_BASE64 = "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";
const FAVICON_ICO_BASE64 = "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";

function decodeBase64Bytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

// ⚡ Bolt: Cache decoded base64 favicon buffers at the module level
// to prevent redundant base64 string decoding and ArrayBuffer allocations
// on every favicon request, reducing GC overhead.
const FAVICON_PNG_BUFFER = decodeBase64Bytes(FAVICON_PNG_BASE64).buffer as ArrayBuffer;
const FAVICON_ICO_BUFFER = decodeBase64Bytes(FAVICON_ICO_BASE64).buffer as ArrayBuffer;

const applicationWorker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/healthz" && request.method === "GET") {
      return json({ ok: true, service: "jurisprudenciaia-mcp" });
    }
    if (url.pathname === "/landing.css" && request.method === "GET") {
      return new Response(SERVICE_PAGE_CSS, { headers: {
        "Content-Type": "text/css; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
        ...SECURITY_HEADERS
      }});
    }
        if (url.pathname === "/favicon.png" && request.method === "GET") {
      return new Response(FAVICON_PNG_BUFFER, { headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, immutable",
        ...SECURITY_HEADERS
      }});
    }
    if (url.pathname === "/favicon.ico" && request.method === "GET") {
      return new Response(FAVICON_ICO_BUFFER, { headers: {
        "Content-Type": "image/x-icon",
        "Cache-Control": "public, max-age=86400, immutable",
        ...SECURITY_HEADERS
      }});
    }
    if ((url.pathname === "/favicon.svg" || url.pathname === "/icon.svg") && request.method === "GET") {
      return new Response(FAVICON_SVG, { headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=86400, immutable",
        ...SECURITY_HEADERS
      }});
    }
    if (url.pathname === "/" && request.method === "GET") {
      url.pathname = MCP_PATH;
      return new Response(null, { status: 302, headers: {
        "Location": url.toString(), "Cache-Control": "no-store"
      }});
    }
    return json({ error: "not_found" }, 404);
  }
} satisfies ExportedHandler<Env>;

const googleAuthHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    let authority;
    if (isAuthorityV2Enabled(env)) {
      try { authority = createWorkerAuthority(env, env.OAUTH_PROVIDER, publicOrigin(request, env)).googleHooks; }
      catch { return json({ error: "temporarily_unavailable" }, 503); }
    }
    try {
      return await handleGoogleAuth(request, env, () => applicationWorker.fetch(request, env), fetch, authority);
    } catch (error) {
      if (isAuthorityV2Enabled(env) && error && typeof error === "object" && "code" in error) return oauthFailure(error);
      const code = safeErrorCode(error);
      console.error(JSON.stringify({ operation: "oauth_google", code }));
      if (code === "oauth_invalid_scope") return json({ error: "invalid_scope" }, 400);
      if (code === "oauth_google_temporarily_unavailable") return json({ error: "temporarily_unavailable" }, 503);
      return json({ ok: false, erro: "autorização inválida" }, 400);
    }
  }
} satisfies ExportedHandler<Env>;

function publicOrigin(request: Request, env: Env): string {
  return canonicalOAuthOrigin(env.MCP_PUBLIC_ORIGIN?.trim() || new URL(request.url).origin);
}

function getOAuthProvider(origin: string, tokenExchangeCallback?: TokenExchangePolicy): OAuthProvider<Env> {
  const cached = tokenExchangeCallback ? undefined : oauthProviders.get(origin);
  if (cached) return cached;

  const provider = new OAuthProvider<Env>({
    apiRoute: MCP_PATH,
    apiHandler: mcpApiHandler,
    defaultHandler: googleAuthHandler,
    authorizeEndpoint: OAUTH_AUTHORIZE_PATH,
    tokenEndpoint: "/oauth/token",
    clientRegistrationEndpoint: "/oauth/register",
    clientRegistrationCallback: validateMcpClientRegistration,
    clientRegistrationTTL: 30 * 24 * 60 * 60,
    accessTokenTTL: 60 * 60,
    refreshTokenTTL: 30 * 24 * 60 * 60,
    scopesSupported: [...MCP_SCOPES],
    onError: logOAuthProviderError,
    tokenExchangeCallback,
    allowPlainPKCE: false,
    allowImplicitFlow: false,
    allowTokenExchangeGrant: false,
    resourceMetadata: {
      resource: new URL(MCP_PATH, origin).href,
      authorization_servers: [origin],
      scopes_supported: [...DISCOVERY_SCOPES],
      bearer_methods_supported: ["header"],
    }
  });

  if (!tokenExchangeCallback) oauthProviders.set(origin, provider);
  return provider;
}

let globalRateLimiter: FixedWindowRateLimiter | undefined;
let registrationRateLimiter: FixedWindowRateLimiter | undefined;

function getRateLimiter(env: Env): FixedWindowRateLimiter {
  if (!globalRateLimiter) {
    const windowMs = positiveInteger(env.RATE_LIMIT_WINDOW_MS, 60000);
    const maxReqs = positiveInteger(env.RATE_LIMIT_MAX_REQUESTS, 30);
    globalRateLimiter = new FixedWindowRateLimiter(windowMs, maxReqs);
  }
  return globalRateLimiter;
}

function getRegistrationRateLimiter(env: Env): FixedWindowRateLimiter {
  if (!registrationRateLimiter) {
    const windowMs = positiveInteger(env.RATE_LIMIT_WINDOW_MS, 60000);
    // Registration endpoints allocate resources and should have stricter limits (e.g., 5 req/min)
    registrationRateLimiter = new FixedWindowRateLimiter(windowMs, 5);
  }
  return registrationRateLimiter;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    let origin: string;
    try { origin = publicOrigin(request, env); }
    catch { return json({ error: "oauth_configuration_invalid" }, 503); }
    if (hasInvalidAuthorizeResource(request, origin)) return json({ error: "invalid_target" }, 400);

    const authorityV2 = isAuthorityV2Enabled(env);
    if (url.pathname === AUTHORITY_BACKCHANNEL_PATH && !authorityV2) return json({ error: "not_found" }, 404);
    if (url.pathname === AUTHORITY_BACKCHANNEL_PATH && request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
    const v2TokenBody = authorityV2 && (["/oauth/token", "/oauth/revoke"].includes(url.pathname) || url.pathname === AUTHORITY_BACKCHANNEL_PATH);
    if (request.method === "POST" || request.method === "PUT") {
      if ((authorityV2 && !v2TokenBody) || url.pathname === "/oauth/register") {
        const buffered = await bufferAuthorityRequest(request, url.pathname === "/oauth/register" ? 16384 : MAX_BODY_BYTES);
        if (!buffered) return json({ error: "payload_too_large" }, 413);
        request = buffered;
      } else if (!authorityV2 && !(await withinBodyLimit(request))) {
        return json({ error: "payload_too_large" }, 413);
      }
    }

    if (url.pathname === OAUTH_AUTHORIZE_PATH || url.pathname === OAUTH_AUTHORIZE_COMPAT_PATH || url.pathname === "/oauth/token" || url.pathname === "/oauth/register" || url.pathname === GOOGLE_CALLBACK_PATH || (isAuthorityV2Enabled(env) && url.pathname === "/oauth/revoke")) {
      const limiter = url.pathname === "/oauth/register" ? getRegistrationRateLimiter(env) : getRateLimiter(env);
      const ip = request.headers.get("cf-connecting-ip") || "unknown";
      const decision = limiter.allow(ip);
      if (!decision.allowed) {
        return json({ error: "rate_limited" }, 429, { "Retry-After": Math.ceil(decision.retryAfterMs / 1000).toString() });
      }
    }

    // ⚡ Bolt: Use .includes() instead of chaining .split() and .some() to prevent
    // intermediate array allocations and reduce GC overhead on every MCP request.
    const acceptsHtml = (request.headers.get("accept") ?? "").toLowerCase().includes("text/html");
    if (request.method === "GET" && url.pathname === MCP_PATH && acceptsHtml) {
      return publicServicePage(url.origin);
    }
    const oauthRequest = url.pathname === OAUTH_AUTHORIZE_COMPAT_PATH
      ? withPathname(request, OAUTH_AUTHORIZE_PATH)
      : request;
    try {
      if (!isAuthorityV2Enabled(env)) await ensureLegacyChatGptClient(oauthRequest, env);
      const mcpRequest = oauthRequest.method === "POST" && new URL(oauthRequest.url).pathname === "/"
        ? withPathname(request, MCP_PATH)
        : oauthRequest;
      if (isAuthorityV2Enabled(env)) {
        // Public provider API supplies registered-client helpers via its default handler.
        // This local bootstrap has no copied user headers/body and performs no network request.
        const helperEnv = { ...env, OAUTH_PROVIDER: undefined, MCP_OAUTH_V2_ENABLED: undefined } as unknown as Env;
        await getOAuthProvider(origin).fetch(new Request(new URL("/__authority_helpers", origin)), helperEnv, ctx);
        const authorityEnv = { ...env, OAUTH_PROVIDER: helperEnv.OAUTH_PROVIDER };
        const authority = createWorkerAuthority(authorityEnv, helperEnv.OAUTH_PROVIDER, origin);
        if (!PRIVATE_DEPLOYMENT) await ensureLegacyChatGptClient(oauthRequest, env);
        const legacy = async (incoming: Request) => getOAuthProvider(origin, await redirectUriExchangePolicy(incoming)).fetch(incoming, authorityEnv, ctx);
        const response = await authority.route(mcpRequest, legacy, incoming => handleMcp(incoming, authorityEnv));
        return normalizeOAuthDiscoveryMetadata(mcpRequest, withAuthorityCors(mcpRequest, response), origin, true);
      }
      const tokenPolicy = await redirectUriExchangePolicy(mcpRequest);
      const oauthResponse = await getOAuthProvider(origin, tokenPolicy).fetch(mcpRequest, env, ctx);
      return normalizeOAuthDiscoveryMetadata(mcpRequest, oauthResponse, origin);
    } catch {
      console.error(JSON.stringify({ operation: "oauth_provider", code: "temporarily_unavailable" }));
      return json({ error: "temporarily_unavailable" }, 503);
    }
  }
} satisfies ExportedHandler<Env>;

async function normalizeOAuthDiscoveryMetadata(request: Request, response: Response, origin: string, authorityV2 = false): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "GET"
      || url.pathname !== "/.well-known/oauth-authorization-server"
      || !response.ok) {
    return response;
  }

  let payload: Record<string, unknown>;
  try {
    const parsed = await response.clone().json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return response;
    payload = parsed as Record<string, unknown>;
  } catch {
    return response;
  }

  payload.issuer = origin;
  payload.authorization_endpoint = new URL(OAUTH_AUTHORIZE_PATH, origin).href;
  payload.token_endpoint = new URL("/oauth/token", origin).href;
  payload.registration_endpoint = new URL("/oauth/register", origin).href;
  payload.revocation_endpoint = new URL(authorityV2 ? "/oauth/revoke" : "/oauth/token", origin).href;
  payload.scopes_supported = [...DISCOVERY_SCOPES];
  if (authorityV2) {
    payload.code_challenge_methods_supported = ["S256"];
    payload.response_types_supported = ["code"];
    payload.grant_types_supported = ["authorization_code", "refresh_token"];
    payload.token_endpoint_auth_methods_supported = ["none", "client_secret_basic", "client_secret_post"];
  }
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function ensureLegacyChatGptClient(request: Request, env: Pick<Env, "OAUTH_KV">): Promise<void> {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname !== OAUTH_AUTHORIZE_PATH ||
      url.searchParams.get("client_id") !== LEGACY_CHATGPT_CLIENT_ID ||
      classifyOAuthRedirectUri(url.searchParams.get("redirect_uri") ?? "") !== "hosted") return;

  const redirectUri = url.searchParams.get("redirect_uri")!;
  if (!isChatGptRedirectUri(redirectUri)) return;

  const key = `client:${LEGACY_CHATGPT_CLIENT_ID}`;
  if (await env.OAUTH_KV.get(key)) return;
  await env.OAUTH_KV.put(key, JSON.stringify({
    clientId: LEGACY_CHATGPT_CLIENT_ID,
    redirectUris: [redirectUri],
    clientName: "ChatGPT",
    grantTypes: ["authorization_code", "refresh_token"],
    responseTypes: ["code"],
    tokenEndpointAuthMethod: "none",
    registrationDate: Math.floor(Date.now() / 1000)
  }));
}

function isChatGptRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "chatgpt.com" &&
      !url.username && !url.password && !url.search && !url.hash &&
      /^\/connector\/oauth\/[A-Za-z0-9_-]{8,128}$/.test(url.pathname);
  } catch {
    return false;
  }
}

export async function handleWorkerRequest(request: Request, env: Env, runner?: JurisprudenciaIaRunner): Promise<Response> {
  return handleMcp(request, env, runner);
}

async function handleMcp(request: Request, env: Env, customRunner?: JurisprudenciaIaRunner): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { Allow: "POST" });
  if (!validOrigin(request, env)) return json({ error: "invalid_origin" }, 403);
  if (!(await withinBodyLimit(request))) return json({ error: "payload_too_large" }, 413);
  if (await exceedsJsonRpcBatchLimit(request)) {
    return json({
      jsonrpc: "2.0",
      error: { code: -32600, message: `Batch size exceeds maximum of ${MAX_JSON_RPC_BATCH_SIZE}` },
      id: null
    }, 400);
  }

  const rpcMethod = await safeRpcMethod(request);
  const startedAt = Date.now();
  const requestedVersion = request.headers.get("mcp-protocol-version");
  const protocolVersion = requestedVersion && /^\d{4}-\d{2}-\d{2}$/.test(requestedVersion)
    ? requestedVersion : null;
  const server = createJurisprudenciaIaMcpServer(customRunner ?? new HttpApiJurisprudenciaIaRunner({ sourceUrl: env.JURISPRUDENCIAIA_URL?.trim() || "https://www.jurisprudenciaia.com.br/", requestTimeoutMs: positiveInteger(env.REQUEST_TIMEOUT_MS, 120000) }));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    console.log(JSON.stringify({
      operation: "mcp_exchange",
      method: rpcMethod,
      status: response.status,
      rpc_error_code: await safeRpcErrorCode(response, rpcMethod),
      content_type: response.headers.get("content-type"),
      protocol_version: protocolVersion,
      duration_ms: Date.now() - startedAt
    }));
    return response;
  } catch (error) {
    console.error(JSON.stringify({
      operation: "mcp_request",
      method: rpcMethod,
      protocol_version: protocolVersion,
      code: safeErrorCode(error)
    }));
    return json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null }, 500);
  } finally {
    await server.close().catch(() => undefined);
  }
}

async function safeRpcErrorCode(response: Response, method: string): Promise<number | null> {
  // Inspect only protocol discovery, never tool results, arguments or credentials.
  if (!["initialize", "server/discover", "tools/list", "resources/list", "resources/templates/list", "prompts/list"].includes(method)
      || !response.headers.get("content-type")?.includes("application/json")) return null;
  try {
    const body = await response.clone().json() as { error?: { code?: unknown } };
    return typeof body?.error?.code === "number" ? body.error.code : null;
  } catch {
    return null;
  }
}

const DIAGNOSTIC_METHODS = new Set([
  "initialize", "server/discover", "notifications/initialized", "notifications/cancelled",
  "tools/list", "tools/call", "resources/list", "resources/templates/list", "resources/read",
  "prompts/list", "prompts/get", "ping",
]);

async function safeRpcMethod(request: Request): Promise<string> {
  try {
    const payload = await request.clone().json();
    if (Array.isArray(payload)) return "batch";
    if (payload && typeof payload === "object" && typeof (payload as { method?: unknown }).method === "string") {
      const method = (payload as { method: string }).method;
      return DIAGNOSTIC_METHODS.has(method) ? method : "unknown";
    }
  } catch {
    // Invalid JSON will be reported by the MCP transport itself.
  }
  return "unknown";
}

// ⚡ Bolt: Cache parsed allowed origins to prevent repeated array allocations
// (.split, .map, .filter) and reduce GC overhead on every MCP request.
let cachedAllowedOriginsStr: string | undefined;
let cachedAllowedOrigins: string[] = [];

function validOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const normalized = new URL(origin).origin;
    if (normalized === new URL(request.url).origin) return true;

    if (cachedAllowedOriginsStr !== env.MCP_ALLOWED_ORIGINS) {
      cachedAllowedOriginsStr = env.MCP_ALLOWED_ORIGINS;
      cachedAllowedOrigins = (env.MCP_ALLOWED_ORIGINS ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    }
    return cachedAllowedOrigins.includes(normalized);
  } catch { return false; }
}

async function withinBodyLimit(request: Request): Promise<boolean> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declared) || declared > MAX_BODY_BYTES) return false;
  const reader = request.clone().body?.getReader();
  if (!reader) return true;
  let total = 0;
  const cancel = () => {
    // A cloned body is a tee: awaiting only one branch can wait indefinitely.
    void reader.cancel().catch(() => {});
    void request.body?.cancel().catch(() => {});
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return true;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) { cancel(); return false; }
    }
  } catch {
    cancel();
    return false;
  } finally {
    reader.releaseLock();
  }
}

async function exceedsJsonRpcBatchLimit(request: Request): Promise<boolean> {
  try {
    const payload = await request.clone().json();
    return Array.isArray(payload) && payload.length > MAX_JSON_RPC_BATCH_SIZE;
  } catch {
    return false;
  }
}

function withPathname(request: Request, pathname: string): Request {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function safeErrorCode(error: unknown): string {
  return safeOAuthErrorCode(error);
}
function json(value: unknown, status = 200, headers?: Record<string, string>): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", "Pragma": "no-cache", ...SECURITY_HEADERS, ...headers } });
}

function publicServicePage(origin: string): Response {
  const body = renderServicePage(origin, "jurisprudenciaia", "", true);
  return new Response(body, { headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=300",
    "Content-Security-Policy": "default-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    ...SECURITY_HEADERS
  }});
}
