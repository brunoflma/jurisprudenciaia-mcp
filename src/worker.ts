import { isOperationalError } from "./errors.js";
import { FixedWindowRateLimiter } from "./infra/rate-limit.js";
import { HttpApiJurisprudenciaIaRunner } from "./jurisprudenciaia/http-api-runner.js";
import type { JurisprudenciaIaRunner } from "./jurisprudenciaia/types.js";
import { MCP_SERVER_INSTRUCTIONS } from "./mcp/instructions.js";
import {
  findToolDefinition,
  TOOL_DEFINITIONS
} from "./mcp/tool-definition.js";

type WorkerEnv = {
  MCP_OAUTH_CLIENT_ID?: string;
  MCP_OAUTH_CLIENT_SECRET?: string;
  MCP_ACCESS_TOKEN_SECRET?: string;
  MCP_ACCESS_TOKEN_TTL_SECONDS?: string;
  JURISPRUDENCIAIA_URL?: string;
  REQUEST_TIMEOUT_MS?: string;
  RATE_LIMIT_WINDOW_MS?: string;
  RATE_LIMIT_MAX_REQUESTS?: string;
  MCP_ICON_URL?: string;
};

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
};

type WorkerHandler = {
  fetch(request: Request, env: WorkerEnv): Promise<Response>;
};

type OAuthSettings = {
  clientId: string;
  clientSecret: string;
  signingSecret: string;
};

type SignedTokenPayload = {
  typ: "authorization_code" | "access_token";
  client_id: string;
  exp: number;
  iat: number;
  aud?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  nonce?: string;
  scope?: string;
};

const MCP_PATH = "/mcp";
const AUTHORIZE_PATH = "/oauth/authorize";
const TOKEN_PATH = "/oauth/token";
const PROTECTED_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";
const AUTHORIZATION_SERVER_METADATA_PATH = "/.well-known/oauth-authorization-server";
const FAVICON_SVG_PATH = "/favicon.svg";
const FAVICON_PNG_PATH = "/favicon.png";
const FAVICON_PNG_BASE64 =
  "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";
const FAVICON_ICO_BASE64 =
  "AAABAAEAYGAAAAEAIABNBgAAFgAAAIlQTkcNChoKAAAADUlIRFIAAABgAAAAYAgGAAAA4ph3OAAABhRJREFUeJztXU2IHEUU7un0RUMIHhJnYfcwGNFhEHOQOcwpe8g1iMlVyJ4VwYu3REJuXgKi5xW8rkFyzSF7CrK5RGTZiJEFd2EbcxCR3FqUnlBDb0911Xuv3quq7ukvLJnprql69X3vp7amOhm89uaF/5IewZCGG7pHL0AE6CMgMLKkRdi9+/YGtO2VW78dJS3AQKIIb7z/Lks/39/4F0y4DR/vnGER5OjnZ0mUAsRIehvEcBZARzzWsF1EauEGNlVxzJdFgLohVCN2A5LvWi84OCAJUB24zcRLCIHlA70M7Sr5LnZVecDWQlQEqM67RrxENEA5SltGfoH4CRoN0EhIW0B+QSTVWQwfIqTS63viJAouT3btzzVybfyBUxDF+wnGF4yks41BEQHKl7EIu6QeIvlgjCejk/q1g/3DtURwL4xSmG0ciuyGSpI/noxOdOTb7rmOK7WKS6UKr0Q6GAPJJYgglvZsBZk9AhBeUmD6RZKKbg+1hzsK0jaQ34Rzb324+GGCdxHSAOkHTf5Y48110nUiEKIgkUhHpjTEFgFC2wyFjpAmj2+4LpLjueabRpx6CqI53sbmEMHnl/IhyY/JhiACsE78n99/RF2XtCW4AMy5v9BdPNg/vGAjW0e+7nOmcULM38exFOhkC2zHQI83jZcxtmv1wazC1sDgzS7tveR5E5yUZfySBUzqeDJ6Ub7e/u7x0v2tm7NFuwSOgoMH6jdo0hEg4mHbGvJN1xlQdDUFFdgP2EgmihAsFbEXl/FkJHYmc7tG7md3v1q8/vrWF4vXPz05eaHSkQQO9g9l94Ko+V+S/Dqq5OveS0I3T2o9zJKB4e6AZhTj7mQN8PQiZYNa+pbzXYoECF+1NiLrW8f1eWdsaEMRJqOa83Xv2wK2CCjDUboGbN2cnSrETaRLFmDuQpz6MIrzW6stC7mc5DfZzbkKYq8BFePma+vptc8X30qVk9l7cG/NZe09nozmS0zG34S1fDTYna30M2I6spWHtqXoei3CyotK71GeX/WsWOHT7taugrqC1IcXqWs1b8qSuJAB7D6KRoArt9vxHK4vUPkQiQDlKVUvUoi5Fkw13q+w9+DehkQUhK4BWRIHgtmRCnr/RtPEYoyCqcH71TwkoiCVyHvKUBMqE82SsFiM30C+dW4u9ZA1AiieMQ27Ijq18sGAKwrSQbL8R0F3r6ltLfVU0UjuXthlaeOyU9euinoqwvBUv+4cAZu3n3OuCjLGvryM4zp/lhRk8H5sFPgQYWnDDeP9CmquL59+25plKIbYrMM28AqgPACy8kEuSzNX20xjQ5adNpy9/EniGgVsEcBcC6pEZBH0ITZfJwGU8soTgKD8cpYhiTS25/B+rihIA3lF6F++nOzijPaU2/tdRNjzsEVh8H4y+S5RYB3U1mnDfWcPmWpEgGwVmD6Pud+El9cSNB+mFB16N3TlYY2AUr37n1IPGfDhjYvnUf8QRxktf/35d/Dd1o++mT/OQBMg/+HqqfePHz1NfGO2eVm9BJO5eEB7Et7ufPPV+w/u/KFt16egwEiJ3ugFM6bxYrbbKMDw+kOnzl0w04wDPRKoaxfSbh2P4CJcfrheC6qDcObXmYEk7HlM3WHhEHabyAc/oDG88TDJd66CBsdMbAb0SuphWNOJbR92l7wt8Ut9QMMkAsU4KA4cTyJDj81z2z0nH4B+FRQYYAEg3i+BseNDHz4fHKTw1UdAYLDXAG4MX+XSuRc/unMJXA82v1S7ls9D2s27L+9bhOHyeEfQtJPvjEz9REE+6YsRTOeuyJlIK/vxaTcG0daAHEh++WgS5PGkUIsIkgDHv/w6/3v9vXd829NJKB4Vr62IgFVBL0CsAvRpSD79RHE8JPdYHJvGCrlCMqYg6SjII1mZSNlh835UDeAWIRbypeyB8mUVwKReDzts/IEioC/I/KkHnYK4RYhta2DIZA+G/BKD19cuov4zz6oAHOkpj6AWcJBP5QUtgMtgXcW6Ax8kAeqDUgbuAtYZOCAL0GQE1ZC2gHu+zgIorOLO6TGDo7EJsCpiHDNHt4gAPeDot6MDoxcgMHoBkrD4H2j0H9lU4F5KAAAAAElFTkSuQmCC";
const OAUTH_SCOPE = "jurisprudenciaia:search";
const MCP_SERVER_NAME = "jurisprudenciaia-mcp";
const MCP_SERVER_TITLE = "JurisprudenciaIA MCP";
const MCP_SERVER_DESCRIPTION =
  "Conector MCP auto-hospedado para consultar jurisprudencia via JurisprudenciaIA.";
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

let limiter: FixedWindowRateLimiter | undefined;
let limiterConfigKey = "";

export default {
  async fetch(request, env) {
    return handleWorkerRequest(request, env);
  }
} satisfies WorkerHandler;

export async function handleWorkerRequest(
  request: Request,
  env: WorkerEnv,
  runner?: JurisprudenciaIaRunner
): Promise<Response> {
  const url = new URL(request.url);
  const origin = url.origin;

  if (request.method === "GET" && url.pathname === "/healthz") {
    return json({ ok: true, service: MCP_SERVER_NAME, runtime: "cloudflare-workers" });
  }

  if (request.method === "GET" && url.pathname === "/") {
    return html(landingPage(origin));
  }

  if (request.method === "GET" && url.pathname === FAVICON_SVG_PATH) {
    return svg(faviconSvg());
  }

  if (request.method === "GET" && url.pathname === FAVICON_PNG_PATH) {
    return png(faviconPngBytes());
  }

  if (request.method === "GET" && url.pathname === "/favicon.ico") {
    return ico(faviconIcoBytes());
  }

  if (
    request.method === "GET" &&
    (url.pathname === PROTECTED_RESOURCE_METADATA_PATH ||
      url.pathname === `${PROTECTED_RESOURCE_METADATA_PATH}${MCP_PATH}`)
  ) {
    return json(protectedResourceMetadata(origin, env));
  }

  if (request.method === "GET" && url.pathname === AUTHORIZATION_SERVER_METADATA_PATH) {
    return json(authorizationServerMetadata(origin, env));
  }

  if (request.method === "GET" && url.pathname === AUTHORIZE_PATH) {
    return handleAuthorize(request, env, origin);
  }

  if (request.method === "POST" && url.pathname === TOKEN_PATH) {
    return handleToken(request, env, origin);
  }

  if (request.method !== "POST" || url.pathname !== MCP_PATH) {
    return json({ error: "not_found" }, 404);
  }

  const unauthorized = await authorizeMcpRequest(request, env, origin);
  if (unauthorized) {
    return unauthorized;
  }

  const decision = getLimiter(env).allow(clientKey(request));
  if (!decision.allowed) {
    return json(
      { error: "rate_limited" },
      429,
      { "Retry-After": Math.ceil(decision.retryAfterMs / 1000).toString() }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json(jsonRpcError(null, -32700, "Parse error"), 400);
  }

  const activeRunner = runner ?? createRunner(env);
  const responses = Array.isArray(payload)
    ? await Promise.all(payload.map((item) => handleJsonRpc(item, activeRunner, origin, env)))
    : [await handleJsonRpc(payload, activeRunner, origin, env)];
  const visibleResponses = responses.filter((item): item is JsonRpcResponse => item !== null);

  if (visibleResponses.length === 0) {
    return new Response(null, { status: 202 });
  }

  return json(Array.isArray(payload) ? visibleResponses : visibleResponses[0]);
}

function createRunner(env: WorkerEnv): JurisprudenciaIaRunner {
  return new HttpApiJurisprudenciaIaRunner({
    sourceUrl: env.JURISPRUDENCIAIA_URL?.trim() || "https://www.jurisprudenciaia.com.br/",
    requestTimeoutMs: positiveInteger(env.REQUEST_TIMEOUT_MS, 120000)
  });
}

async function handleJsonRpc(
  payload: unknown,
  runner: JurisprudenciaIaRunner,
  origin: string,
  env: WorkerEnv
): Promise<JsonRpcResponse | null> {
  if (!isJsonRpcRequest(payload)) {
    return jsonRpcError(null, -32600, "Invalid Request");
  }

  const id = payload.id ?? null;
  if (payload.id === undefined) {
    return null;
  }

  switch (payload.method) {
    case "initialize": {
      const pngIconUri = logoUri(origin, env);
      const svgIconUri = `${origin}${FAVICON_SVG_PATH}`;
      const icoIconUri = `${origin}/favicon.ico`;

      return jsonRpcResult(id, {
        protocolVersion: "2025-11-25",
        capabilities: {
          tools: {}
        },
        instructions: MCP_SERVER_INSTRUCTIONS,
        serverInfo: {
          name: MCP_SERVER_NAME,
          title: MCP_SERVER_TITLE,
          version: "0.1.0",
          description: MCP_SERVER_DESCRIPTION,
          icons: [
            {
              src: pngIconUri,
              mimeType: "image/png",
              sizes: ["96x96"]
            },
            {
              src: icoIconUri,
              mimeType: "image/x-icon",
              sizes: ["16x16"]
            },
            {
              src: svgIconUri,
              mimeType: "image/svg+xml",
              sizes: ["any"]
            }
          ],
          websiteUrl: `${origin}/`
        },
        _meta: {
          "jurisprudenciaia-mcp/logo_uri": pngIconUri,
          "jurisprudenciaia-mcp/icon_uri": pngIconUri,
          "jurisprudenciaia-mcp/favicon_uri": icoIconUri
        }
      });
    }

    case "tools/list":
      return jsonRpcResult(id, {
        tools: TOOL_DEFINITIONS.map((definition) => ({
          name: definition.name,
          title: definition.title,
          description: definition.description,
          inputSchema: definition.jsonInputSchema
        }))
      });

    case "tools/call":
      return callTool(id, payload.params, runner);

    default:
      return jsonRpcError(id, -32601, "Method not found");
  }
}

async function callTool(
  id: string | number | null,
  params: Record<string, unknown> | undefined,
  runner: JurisprudenciaIaRunner
): Promise<JsonRpcResponse> {
  const definition = findToolDefinition(params?.name);

  if (!definition) {
    return jsonRpcError(id, -32602, "Unknown tool");
  }

  try {
    const input = definition.normalizeInput(params?.arguments);
    const result = await runner.search(input);
    const text = input.includeDebug && result.rawText
      ? `${result.markdown}\n\n## Debug\n\n\`\`\`text\n${result.rawText}\n\`\`\``
      : result.markdown;

    return jsonRpcResult(id, {
      content: [{ type: "text", text }]
    });
  } catch (error) {
    const text = isOperationalError(error)
      ? `Falha ao consultar JurisprudenciaIA (${error.code}): ${error.message}`
      : "Falha inesperada ao consultar JurisprudenciaIA. Tente novamente mais tarde.";

    return jsonRpcResult(id, {
      isError: true,
      content: [{ type: "text", text }]
    });
  }
}

async function handleAuthorize(request: Request, env: WorkerEnv, origin: string): Promise<Response> {
  const settings = oauthSettings(env);
  const url = new URL(request.url);
  const redirectUri = url.searchParams.get("redirect_uri") ?? "";
  const state = url.searchParams.get("state") ?? undefined;

  const fail = (error: string, description: string) =>
    oauthRedirectError(redirectUri, state, error, description);

  if (url.searchParams.get("response_type") !== "code") {
    return fail("unsupported_response_type", "Only authorization code flow is supported.");
  }

  if (url.searchParams.get("client_id") !== settings.clientId) {
    return fail("invalid_client", "Unknown OAuth client.");
  }

  if (!isHttpUrl(redirectUri)) {
    return json({ error: "invalid_request", error_description: "Invalid redirect_uri." }, 400);
  }

  const resource = url.searchParams.get("resource") ?? mcpResource(origin);
  if (resource !== mcpResource(origin)) {
    return fail("invalid_target", "Invalid resource.");
  }

  const codeChallenge = url.searchParams.get("code_challenge");
  if (!codeChallenge || url.searchParams.get("code_challenge_method") !== "S256") {
    return fail("invalid_request", "PKCE S256 is required.");
  }

  const now = epochSeconds();
  const code = await signToken(
    {
      typ: "authorization_code",
      client_id: settings.clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      aud: resource,
      iat: now,
      exp: now + 300,
      nonce: randomId()
    },
    settings.signingSecret
  );

  const target = new URL(redirectUri);
  target.searchParams.set("code", code);
  if (state) {
    target.searchParams.set("state", state);
  }

  return Response.redirect(target.toString(), 302);
}

async function handleToken(request: Request, env: WorkerEnv, origin: string): Promise<Response> {
  const settings = oauthSettings(env);
  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return oauthTokenError("invalid_request", "Expected form encoded body.");
  }

  const client = oauthClientCredentials(request, form);
  if (client.id !== settings.clientId || client.secret !== settings.clientSecret) {
    return oauthTokenError("invalid_client", "Invalid client credentials.", 401);
  }

  if (formValue(form, "grant_type") !== "authorization_code") {
    return oauthTokenError("unsupported_grant_type", "Only authorization_code is supported.");
  }

  const code = formValue(form, "code");
  const redirectUri = formValue(form, "redirect_uri");
  const codeVerifier = formValue(form, "code_verifier");
  if (!code || !redirectUri || !codeVerifier) {
    return oauthTokenError("invalid_request", "Missing authorization code, redirect_uri, or code_verifier.");
  }

  const payload = await verifyToken<SignedTokenPayload>(code, settings.signingSecret);
  if (
    !payload ||
    payload.typ !== "authorization_code" ||
    payload.client_id !== settings.clientId ||
    payload.redirect_uri !== redirectUri ||
    payload.aud !== mcpResource(origin)
  ) {
    return oauthTokenError("invalid_grant", "Invalid authorization code.");
  }

  const expectedChallenge = await pkceChallenge(codeVerifier);
  if (payload.code_challenge !== expectedChallenge) {
    return oauthTokenError("invalid_grant", "Invalid PKCE verifier.");
  }

  const ttl = positiveInteger(env.MCP_ACCESS_TOKEN_TTL_SECONDS, DEFAULT_ACCESS_TOKEN_TTL_SECONDS);
  const now = epochSeconds();
  const accessToken = await signToken(
    {
      typ: "access_token",
      client_id: settings.clientId,
      aud: mcpResource(origin),
      scope: OAUTH_SCOPE,
      iat: now,
      exp: now + ttl
    },
    settings.signingSecret
  );

  return json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ttl,
    scope: OAUTH_SCOPE
  });
}

async function authorizeMcpRequest(
  request: Request,
  env: WorkerEnv,
  origin: string
): Promise<Response | null> {
  const settings = oauthSettings(env);
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) {
    return unauthorized(origin);
  }

  const payload = await verifyToken<SignedTokenPayload>(match[1], settings.signingSecret);
  if (
    !payload ||
    payload.typ !== "access_token" ||
    payload.client_id !== settings.clientId ||
    payload.aud !== mcpResource(origin)
  ) {
    return unauthorized(origin);
  }

  return null;
}

function protectedResourceMetadata(origin: string, env: WorkerEnv): Record<string, unknown> {
  return {
    resource: mcpResource(origin),
    resource_name: MCP_SERVER_TITLE,
    logo_uri: logoUri(origin, env),
    resource_documentation: `${origin}/`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: [OAUTH_SCOPE]
  };
}

function authorizationServerMetadata(origin: string, env: WorkerEnv): Record<string, unknown> {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}${AUTHORIZE_PATH}`,
    token_endpoint: `${origin}${TOKEN_PATH}`,
    service_documentation: `${origin}/`,
    logo_uri: logoUri(origin, env),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [OAUTH_SCOPE]
  };
}

function oauthSettings(env: WorkerEnv): OAuthSettings {
  const clientId = required(env.MCP_OAUTH_CLIENT_ID, "MCP_OAUTH_CLIENT_ID");
  const clientSecret = required(env.MCP_OAUTH_CLIENT_SECRET, "MCP_OAUTH_CLIENT_SECRET");
  const signingSecret = required(env.MCP_ACCESS_TOKEN_SECRET, "MCP_ACCESS_TOKEN_SECRET");

  if (clientId.length < 8) {
    throw new Error("MCP_OAUTH_CLIENT_ID must have at least 8 characters");
  }

  if (clientSecret.length < 24) {
    throw new Error("MCP_OAUTH_CLIENT_SECRET must have at least 24 characters");
  }

  if (signingSecret.length < 32) {
    throw new Error("MCP_ACCESS_TOKEN_SECRET must have at least 32 characters");
  }

  return { clientId, clientSecret, signingSecret };
}

function oauthClientCredentials(request: Request, form: FormData): { id?: string; secret?: string } {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Basic\s+(.+)$/i.exec(authorization);

  if (match) {
    try {
      const decoded = atob(match[1]);
      const separator = decoded.indexOf(":");
      if (separator !== -1) {
        return {
          id: safeDecode(decoded.slice(0, separator)),
          secret: safeDecode(decoded.slice(separator + 1))
        };
      }
    } catch {
      return {};
    }
  }

  return {
    id: formValue(form, "client_id"),
    secret: formValue(form, "client_secret")
  };
}

function oauthRedirectError(
  redirectUri: string,
  state: string | undefined,
  error: string,
  description: string
): Response {
  if (!isHttpUrl(redirectUri)) {
    return json({ error, error_description: description }, 400);
  }

  const target = new URL(redirectUri);
  target.searchParams.set("error", error);
  target.searchParams.set("error_description", description);
  if (state) {
    target.searchParams.set("state", state);
  }

  return Response.redirect(target.toString(), 302);
}

function oauthTokenError(error: string, description: string, status = 400): Response {
  return json({ error, error_description: description }, status);
}

function unauthorized(origin: string): Response {
  return json(
    { error: "unauthorized" },
    401,
    { "WWW-Authenticate": `Bearer resource_metadata="${origin}${PROTECTED_RESOURCE_METADATA_PATH}"` }
  );
}

async function signToken(payload: SignedTokenPayload, secret: string): Promise<string> {
  const encodedPayload = base64UrlEncodeBytes(
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const signature = await hmacSign(encodedPayload, secret);
  return `${encodedPayload}.${base64UrlEncodeBytes(signature)}`;
}

async function verifyToken<T extends SignedTokenPayload>(
  token: string,
  secret: string
): Promise<T | null> {
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra !== undefined) {
    return null;
  }

  const valid = await hmacVerify(
    encodedPayload,
    base64UrlDecodeBytes(encodedSignature),
    secret
  );
  if (!valid) {
    return null;
  }

  let payload: T;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecodeBytes(encodedPayload))) as T;
  } catch {
    return null;
  }

  if (!Number.isFinite(payload.exp) || payload.exp < epochSeconds()) {
    return null;
  }

  return payload;
}

async function hmacSign(data: string, secret: string): Promise<Uint8Array> {
  const key = await hmacKey(secret, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(signature);
}

async function hmacVerify(data: string, signature: Uint8Array, secret: string): Promise<boolean> {
  const key = await hmacKey(secret, ["verify"]);
  const signatureBuffer = new Uint8Array(signature).buffer as ArrayBuffer;
  return crypto.subtle.verify("HMAC", key, signatureBuffer, new TextEncoder().encode(data));
}

async function hmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages
  );
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncodeBytes(new Uint8Array(digest));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function base64UrlDecodeBytes(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function formValue(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function mcpResource(origin: string): string {
  return `${origin}${MCP_PATH}`;
}

function logoUri(origin: string, env: WorkerEnv): string {
  return externalIconUri(env) ?? `${origin}${FAVICON_PNG_PATH}`;
}

function externalIconUri(env: WorkerEnv): string | undefined {
  const raw = env.MCP_ICON_URL?.trim();
  if (!raw) {
    return undefined;
  }

  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64UrlEncodeBytes(bytes);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${name} is required`);
  }

  return trimmed;
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  return !!value && typeof value === "object" && (value as JsonRpcRequest).jsonrpc === "2.0";
}

function jsonRpcResult(id: string | number | null, result: unknown): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    result
  };
}

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message }
  };
}

function getLimiter(env: WorkerEnv): FixedWindowRateLimiter {
  const windowMs = positiveInteger(env.RATE_LIMIT_WINDOW_MS, 60000);
  const maxRequests = positiveInteger(env.RATE_LIMIT_MAX_REQUESTS, 4);
  const key = `${windowMs}:${maxRequests}`;

  if (!limiter || limiterConfigKey !== key) {
    limiter = new FixedWindowRateLimiter(windowMs, maxRequests);
    limiterConfigKey = key;
  }

  return limiter;
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  const value = raw?.trim();
  if (!value) {
    return fallback;
  }

  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error("Expected a positive integer");
  }

  return number;
}

function epochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function clientKey(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "x-content-type-options": "nosniff",
      ...headers
    }
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
      "content-security-policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff"
    }
  });
}

function svg(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=86400, immutable",
      "x-content-type-options": "nosniff"
    }
  });
}

function png(body: Uint8Array, status = 200): Response {
  const buffer = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;

  return new Response(buffer, {
    status,
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400, immutable",
      "x-content-type-options": "nosniff"
    }
  });
}

function ico(body: Uint8Array, status = 200): Response {
  const buffer = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;

  return new Response(buffer, {
    status,
    headers: {
      "content-type": "image/x-icon",
      "cache-control": "public, max-age=86400, immutable",
      "x-content-type-options": "nosniff"
    }
  });
}

function landingPage(origin: string): string {
  return [
    "<!doctype html>",
    '<html lang="pt-BR">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>JurisprudenciaIA MCP</title>",
    `<link rel="icon" href="${FAVICON_PNG_PATH}" type="image/png" sizes="96x96">`,
    `<link rel="icon" href="${FAVICON_SVG_PATH}" type="image/svg+xml">`,
    '<link rel="alternate icon" href="/favicon.ico" type="image/x-icon">',
    "</head>",
    "<body>",
    "<main>",
    "<h1>JurisprudenciaIA MCP</h1>",
    "<p>Servidor MCP auto-hospedado ativo.</p>",
    `<p>Endpoint MCP: <code>${origin}${MCP_PATH}</code></p>`,
    "</main>",
    "</body>",
    "</html>"
  ].join("");
}

function faviconSvg(): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="Balanca da justica">',
    "<title>Balanca da justica</title>",
    "<defs>",
    '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">',
    '<stop stop-color="#0b211e"/>',
    '<stop offset="1" stop-color="#071614"/>',
    "</linearGradient>",
    '<linearGradient id="gold" x1="0" y1="18" x2="0" y2="86">',
    '<stop stop-color="#ffe8ab"/>',
    '<stop offset="0.42" stop-color="#f2c55b"/>',
    '<stop offset="1" stop-color="#b87f2c"/>',
    "</linearGradient>",
    "</defs>",
    '<rect width="96" height="96" rx="20" fill="url(#bg)"/>',
    '<rect x="5" y="5" width="86" height="86" rx="17" fill="none" stroke="#26463d" stroke-width="2"/>',
    '<circle cx="48" cy="26" r="20" fill="#c99a3a" opacity="0.16"/>',
    '<path d="M31 83h34" stroke="url(#gold)" stroke-width="7" stroke-linecap="round"/>',
    '<path d="M39 75h18" stroke="url(#gold)" stroke-width="7" stroke-linecap="round"/>',
    '<path d="M48 29v46" stroke="url(#gold)" stroke-width="8" stroke-linecap="round"/>',
    '<circle cx="48" cy="23" r="7" fill="url(#gold)"/>',
    '<circle cx="48" cy="23" r="2.4" fill="#fff1bf"/>',
    '<path d="M18 35h60" stroke="url(#gold)" stroke-width="6" stroke-linecap="round"/>',
    '<circle cx="48" cy="35" r="5" fill="#8e641f"/>',
    '<circle cx="48" cy="35" r="2" fill="#fff1bf"/>',
    '<path d="M25 38 14 59M25 38l11 21M71 38 60 59M71 38l11 21" stroke="#ffe8ab" stroke-width="2.4" stroke-linecap="round"/>',
    '<path d="M9 59h32l-6 10H15z" fill="#b87f2c"/>',
    '<path d="M55 59h32l-6 10H61z" fill="#b87f2c"/>',
    '<path d="M10 59h30M56 59h30" stroke="#ffe8ab" stroke-width="3" stroke-linecap="round"/>',
    '<path d="M13 70h24M59 70h24" stroke="url(#gold)" stroke-width="5" stroke-linecap="round"/>',
    "</svg>"
  ].join("");
}

function faviconIcoBytes(): Uint8Array {
  return decodeBase64Bytes(FAVICON_ICO_BASE64);
}

function faviconPngBytes(): Uint8Array {
  return decodeBase64Bytes(FAVICON_PNG_BASE64);
}

function decodeBase64Bytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
