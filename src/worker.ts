import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";
import { createJurisprudenciaIaMcpServer } from "./mcp/create-server.js";
import { HttpApiJurisprudenciaIaRunner } from "./jurisprudenciaia/http-api-runner.js";
import type { JurisprudenciaIaRunner } from "./jurisprudenciaia/types.js";
import { classifyOAuthRedirectUri } from "./oauth/client-policy.js";
import { handleGoogleAuth } from "./oauth/google-auth.js";
import { validateMcpClientRegistration } from "./oauth/client-registration.js";
import { OAuthStateStore } from "./oauth/state-store.js";
import { FixedWindowRateLimiter } from "./infra/rate-limit.js";

import type { Env } from "./types.js";

export { OAuthStateStore };
export { classifyOAuthRedirectUri };
export { validateMcpClientRegistration } from "./oauth/client-registration.js";

const MCP_PATH = "/mcp";
const OAUTH_AUTHORIZE_PATH = "/authorize";
const OAUTH_AUTHORIZE_COMPAT_PATH = "/oauth/authorize";
const LEGACY_CHATGPT_CLIENT_ID = "jurisprudenciaia-mcp-client";
const MAX_BODY_BYTES = 1_048_576;
const MAX_JSON_RPC_BATCH_SIZE = 20;
const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block"
} as const;
const LANDING_CSS = ":root{color-scheme:dark}html,body{height:100%}body{margin:0;display:flex;align-items:center;justify-content:center;padding:2rem;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:radial-gradient(120% 120% at 50% 0%,#0b211e 0%,#071614 60%,#040d0c 100%);color:#e9e2cf}main{text-align:center}img{width:64px;height:64px}h1{margin:.9rem 0 .35rem;font-size:1.3rem;letter-spacing:.2px}p{margin:0;color:#8aa79c;font-size:.9rem}";
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="Balança da justiça"><title>Balança da justiça</title><rect width="96" height="96" rx="20" fill="#0a1224"/><rect x="5" y="5" width="86" height="86" rx="17" fill="none" stroke="#34415f" stroke-width="2"/><path d="M48 22v55M18 36h60M27 38 14 62M27 38l13 24M69 38 56 62M69 38l13 24M10 62h34l-7 11H17zM52 62h34l-7 11H59zM35 82h26" fill="none" stroke="#c8a862" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const mcpApiHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleMcp(request, env);
  }
} satisfies ExportedHandler<Env>;

const FAVICON_PNG_BASE64 = "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";
const FAVICON_ICO_BASE64 = "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";

function decodeBase64Bytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

const applicationWorker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/healthz" && request.method === "GET") {
      return json({ ok: true, service: "jurisprudenciaia-mcp" });
    }
    if (url.pathname === "/landing.css" && request.method === "GET") {
      return new Response(LANDING_CSS, { headers: {
        "Content-Type": "text/css; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
        ...SECURITY_HEADERS
      }});
    }
        if (url.pathname === "/favicon.png" && request.method === "GET") {
      return new Response(decodeBase64Bytes(FAVICON_PNG_BASE64).buffer as ArrayBuffer, { headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, immutable",
        ...SECURITY_HEADERS
      }});
    }
    if (url.pathname === "/favicon.ico" && request.method === "GET") {
      return new Response(decodeBase64Bytes(FAVICON_ICO_BASE64).buffer as ArrayBuffer, { headers: {
        "Content-Type": "image/x-icon",
        "Cache-Control": "public, max-age=86400, immutable",
        ...SECURITY_HEADERS
      }});
    }
    if (url.pathname === "/favicon.svg" && request.method === "GET") {
      return new Response(FAVICON_SVG, { headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=86400, immutable",
        ...SECURITY_HEADERS
      }});
    }
    if (url.pathname === "/" && request.method === "GET") {
      return landingPage();
    }
    return json({ error: "not_found" }, 404);
  }
} satisfies ExportedHandler<Env>;

const googleAuthHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleGoogleAuth(request, env, () => applicationWorker.fetch(request, env));
    } catch (error) {
      console.error(JSON.stringify({ operation: "oauth_google", code: safeErrorCode(error) }));
      return json({ ok: false, erro: "autorização inválida" }, 400);
    }
  }
} satisfies ExportedHandler<Env>;

const SUPPORTED_SCOPES = ["jurisprudence:read", "jurisprudenciaia:search"] as const;

const oauthProviders = new Map<string, OAuthProvider<Env>>();

function publicOrigin(request: Request, env: Env): string {
  const configured = env.MCP_PUBLIC_ORIGIN?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Falls back to the request origin when MCP_PUBLIC_ORIGIN is malformed.
    }
  }
  return new URL(request.url).origin;
}

function getOAuthProvider(origin: string): OAuthProvider<Env> {
  const cached = oauthProviders.get(origin);
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
    scopesSupported: [...SUPPORTED_SCOPES],
    allowPlainPKCE: false,
    allowImplicitFlow: false,
    allowTokenExchangeGrant: false,
    resourceMetadata: {
      resource: new URL(MCP_PATH, origin).href,
      authorization_servers: [origin],
      scopes_supported: [...SUPPORTED_SCOPES],
      bearer_methods_supported: ["header"],
    }
  });

  oauthProviders.set(origin, provider);
  return provider;
}

let globalRateLimiter: FixedWindowRateLimiter | undefined;

function getRateLimiter(env: Env): FixedWindowRateLimiter {
  if (!globalRateLimiter) {
    const windowMs = positiveInteger(env.RATE_LIMIT_WINDOW_MS, 60000);
    const maxReqs = positiveInteger(env.RATE_LIMIT_MAX_REQUESTS, 30);
    globalRateLimiter = new FixedWindowRateLimiter(windowMs, maxReqs);
  }
  return globalRateLimiter;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === OAUTH_AUTHORIZE_PATH || url.pathname === OAUTH_AUTHORIZE_COMPAT_PATH || url.pathname === "/oauth/token") {
      const limiter = getRateLimiter(env);
      const ip = request.headers.get("cf-connecting-ip") || "unknown";
      const decision = limiter.allow(ip);
      if (!decision.allowed) {
        return json({ error: "rate_limited" }, 429, { "Retry-After": Math.ceil(decision.retryAfterMs / 1000).toString() });
      }
    }

    const acceptsHtml = (request.headers.get("accept") ?? "").split(",")
      .some((value) => value.trim().split(";", 1)[0]?.toLowerCase() === "text/html");
    if (request.method === "GET" && url.pathname === MCP_PATH && acceptsHtml) {
      return json({ error: "not_found" }, 404);
    }
    const oauthRequest = url.pathname === OAUTH_AUTHORIZE_COMPAT_PATH
      ? withPathname(request, OAUTH_AUTHORIZE_PATH)
      : request;
    await ensureLegacyChatGptClient(oauthRequest, env);
    const mcpRequest = oauthRequest.method === "POST" && new URL(oauthRequest.url).pathname === "/"
      ? withPathname(request, MCP_PATH)
      : oauthRequest;
    if (new URL(mcpRequest.url).pathname === MCP_PATH && await staticBearerAuthenticated(mcpRequest, env)) {
      return handleMcp(mcpRequest, env);
    }
    return getOAuthProvider(publicOrigin(request, env)).fetch(mcpRequest, env, ctx);
  }
} satisfies ExportedHandler<Env>;

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

  const server = createJurisprudenciaIaMcpServer(customRunner ?? new HttpApiJurisprudenciaIaRunner({ sourceUrl: env.JURISPRUDENCIAIA_URL?.trim() || "https://www.jurisprudenciaia.com.br/", requestTimeoutMs: positiveInteger(env.REQUEST_TIMEOUT_MS, 120000) }));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (error) {
    console.error(JSON.stringify({ operation: "mcp_request", code: safeErrorCode(error) }));
    return json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null }, 500);
  } finally {
    await server.close().catch(() => undefined);
  }
}

async function staticBearerAuthenticated(request: Request, env: Env): Promise<boolean> {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  const candidate = match?.[1]?.trim() ?? "";
  if (!candidate) return false;
  if (env.MCP_BEARER_TOKEN_SHA256) return constantTimeEqual(await sha256(candidate), env.MCP_BEARER_TOKEN_SHA256.toLowerCase());
  if (env.MCP_BEARER_TOKEN) return constantTimeEqual(candidate, env.MCP_BEARER_TOKEN);
  return false;
}

function validOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const normalized = new URL(origin).origin;
    const allowed = (env.MCP_ALLOWED_ORIGINS ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    return normalized === new URL(request.url).origin || allowed.includes(normalized);
  } catch { return false; }
}

async function withinBodyLimit(request: Request): Promise<boolean> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declared) || declared > MAX_BODY_BYTES) return false;
  const reader = request.clone().body?.getReader();
  if (!reader) return true;
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) return true;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) { await reader.cancel(); return false; }
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

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  if (left.length !== right.length) return false;
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right))
  ]);
  const runtimeSubtle = crypto.subtle as SubtleCrypto & { timingSafeEqual?: (left: ArrayBuffer, right: ArrayBuffer) => boolean };
  return typeof runtimeSubtle.timingSafeEqual === "function"
    ? runtimeSubtle.timingSafeEqual(leftHash, rightHash)
    : nodeTimingSafeEqual(Buffer.from(leftHash), Buffer.from(rightHash));
}

async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function safeErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  return /^oauth_[a-z0-9_:.-]{1,96}$/.test(error.message) ? error.message : error.name;
}
function json(value: unknown, status = 200, headers?: Record<string, string>): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", "Pragma": "no-cache", ...SECURITY_HEADERS, ...headers } });
}

function landingPage(): Response {
  const body = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#0a1224"><title>JurisprudênciaIA MCP</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/landing.css"></head><body><main><img src="/favicon.svg" width="64" height="64" alt=""><h1>JurisprudênciaIA MCP</h1><p>Conector MCP auto-hospedado · acesso restrito.</p></main></body></html>`;
  return new Response(body, { headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=300",
    "Content-Security-Policy": "default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    ...SECURITY_HEADERS
  }});
}
