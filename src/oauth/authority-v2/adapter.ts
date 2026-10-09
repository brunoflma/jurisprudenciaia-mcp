import type { CredentialInspectionInput } from "./core/index.mjs";
import type { AuthRequest, ClientInfo, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { authorizeMcpProps, canonicalOAuthOrigin, MCP_SCOPES } from "../access-policy.js";
import { classifyOAuthRedirectUri } from "../client-policy.js";

/** Integrated only behind the explicit v2 flag; legacy remains the default. */
export const PROVIDER_VERSION = "0.10.3";
export const PRIVATE_DEPLOYMENT = false;
export type AuthorityContext = { issuer: string; resource: string; tenantId: string; subject: string };
export type Principal = AuthorityContext & { clientId: string; familyId: string; scopes: string[]; props: unknown; epoch: number; expiresAt: number };
export type TokenResult = { tokenType: string; accessToken: string; expiresIn: number; scope: string; resource: string; refreshToken?: string };
export interface AuthorityLedger {
  issueAuthorization(input: { clientId: string; redirectUri: string; scopes: string[]; codeChallenge: string; props: unknown }): Promise<{ code: string }>;
  exchangeCode(input: { code: string; clientId: string; redirectUri: string; codeVerifier: string; resource?: string; scopes?: string[] }): Promise<TokenResult>;
  refresh(input: { refreshToken: string; clientId: string; resource?: string; scopes?: string[] }): Promise<TokenResult>;
  authorize(input: { accessToken: string; requiredScopes?: string[] }): Promise<Principal>;
  revokeToken(input: { token: string; clientId: string }): Promise<{ ok: true }>;
}
export type TrustedGoogleIdentity = { sub: string; email: string; email_verified: true };
type AdapterOptions = {
  context: AuthorityContext;
  ledger: AuthorityLedger;
  provider: Pick<OAuthHelpers, "parseAuthRequest" | "lookupClient">;
  allowedEmails: () => string | undefined | Promise<string | undefined>;
  /** Only the authenticated userinfo/state completion layer may supply this value. */
  currentIdentity?: TrustedGoogleIdentity;
  credentialAdmission?: (input: CredentialInspectionInput) => Promise<void>;
  /** Confidential clients require an explicit, server-side secret verifier. Never default-accept. */
  authenticateConfidentialClient?: (client: ClientInfo, secret: string) => Promise<boolean>;
};

class CandidateError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); }
}
const KNOWN_ERRORS = new Set(["invalid_request", "invalid_client", "invalid_grant", "unauthorized_client", "unsupported_grant_type", "invalid_scope", "invalid_token", "insufficient_scope", "invalid_target", "access_denied", "temporarily_unavailable"]);
export function oauthFailure(error: unknown): Response {
  let code = "temporarily_unavailable", status = 503;
  if (error && typeof error === "object" && "code" in error && error.code === "principal_suspended") error = { code: "access_denied" };
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string" && KNOWN_ERRORS.has(error.code)) {
    code = error.code;
    status = code === "temporarily_unavailable" ? 503 : code === "invalid_client" || code === "invalid_token" ? 401 : code === "access_denied" || code === "insufficient_scope" ? 403 : 400;
  }
  return Response.json({ error: code }, { status, headers: { "cache-control": "no-store", pragma: "no-cache" } });
}

/** Consumes the original source once; exact bounded bytes are available for version dispatch. */
export async function readTokenForm(request: Request): Promise<{ form: URLSearchParams; bytes: Uint8Array<ArrayBuffer> }> {
  if (request.method !== "POST" || (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase() !== "application/x-www-form-urlencoded") throw new CandidateError("invalid_request");
  if (!request.body) throw new CandidateError("invalid_request");
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 8192) {
        // Abort the source, but do not wait for its cancellation callback to settle the HTTP response.
        // In particular, never await cancellation of one branch of a cloned/teed request.
        void reader.cancel().catch(() => {});
        throw new CandidateError("invalid_request");
      }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const form = new URLSearchParams(new TextDecoder().decode(bytes));
  for (const key of form.keys()) if (form.getAll(key).length !== 1) throw new CandidateError("invalid_request");
  return { form, bytes };
}

export async function tokenForm(request: Request): Promise<URLSearchParams> {
  return (await readTokenForm(request)).form;
}

function checkResources(value: string | string[] | undefined, expected: string): void {
  if (value !== undefined && (Array.isArray(value) || value !== expected)) throw new CandidateError("invalid_target");
}
function checkScopes(scopes: string[]): void {
  if (!scopes.length || scopes.some(scope => !MCP_SCOPES.includes(scope))) throw new CandidateError("invalid_scope");
}
function checkRedirect(value: string): void {
  if (!classifyOAuthRedirectUri(value) || (PRIVATE_DEPLOYMENT && new URL(value).hostname === "chatgpt.com")) throw new CandidateError("unauthorized_client");
}

export async function authenticateV2Client(request: Request, form: URLSearchParams, provider: Pick<OAuthHelpers, "lookupClient">, validateSecret: AdapterOptions["authenticateConfidentialClient"], grantType?: string): Promise<string> {
    let basicId: string | undefined, basicSecret: string | undefined;
    const authorization = request.headers.get("authorization");
    if (authorization) {
      const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(authorization);
      if (!match) throw new CandidateError("invalid_client");
      try {
        const decoded = atob(match[1]!), colon = decoded.indexOf(":");
        if (colon < 0) throw new Error();
        basicId = decodeURIComponent(decoded.slice(0, colon).replaceAll("+", " "));
        basicSecret = decodeURIComponent(decoded.slice(colon + 1).replaceAll("+", " "));
      } catch { throw new CandidateError("invalid_client"); }
    }
    const clientId = basicId ?? form.get("client_id") ?? "";
    if (!clientId || (basicId && form.has("client_id") && form.get("client_id") !== basicId)) throw new CandidateError("invalid_client");
    const client = await provider.lookupClient(clientId);
    if (!client || client.clientId !== clientId) throw new CandidateError("invalid_client");
    if (grantType && !(client.grantTypes ?? ["authorization_code"]).includes(grantType)) throw new CandidateError("unauthorized_client");
    const method = client.tokenEndpointAuthMethod;
    if (method === "none") {
      if (authorization || form.has("client_secret")) throw new CandidateError("invalid_client");
    } else {
      if (method !== "client_secret_basic" && method !== "client_secret_post") throw new CandidateError("invalid_client");
      if ((method === "client_secret_basic" && (!authorization || form.has("client_secret"))) || (method === "client_secret_post" && authorization)) throw new CandidateError("invalid_client");
      const secret = method === "client_secret_basic" ? basicSecret : form.get("client_secret");
      if (!secret || !validateSecret || (await validateSecret(client, secret)) !== true) throw new CandidateError("invalid_client");
    }
    return clientId;
  }

export async function validateV2Authorization(auth: AuthRequest, provider: Pick<OAuthHelpers, "lookupClient">, issuer: string): Promise<AuthRequest> {
    const context = { issuer: canonicalOAuthOrigin(issuer), resource: `${issuer}/mcp` };
    if (auth.responseType !== "code" || (auth.issuer !== undefined && auth.issuer !== context.issuer)) throw new CandidateError("invalid_request");
    checkResources(auth.resource, context.resource);
    checkRedirect(auth.redirectUri);
    const client = await provider.lookupClient(auth.clientId);
    if (!client || client.clientId !== auth.clientId || !(client.grantTypes ?? ["authorization_code"]).includes("authorization_code")) throw new CandidateError("invalid_client");
    if (!client.redirectUris.includes(auth.redirectUri) || !(client.responseTypes ?? ["code"]).includes("code")) throw new CandidateError("invalid_request");
    if (auth.codeChallengeMethod !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(auth.codeChallenge ?? "")) throw new CandidateError("invalid_request");
    const scopes = auth.scope.length ? [...auth.scope] : [...MCP_SCOPES];
    checkScopes(scopes);
    return { ...auth, scope: scopes, issuer: context.issuer, resource: context.resource };
  }

/** Per-principal adapter. A trusted resolver must select the matching authority before constructing it. */
export function createAuthorityAdapter(options: AdapterOptions) {
  const { ledger, provider } = options;
  const context = Object.freeze({ ...options.context });
  if (context.issuer !== canonicalOAuthOrigin(context.issuer) || context.resource !== `${context.issuer}/mcp` || context.tenantId !== "jurisia" || !context.subject) throw new CandidateError("invalid_target");

  async function admission(identity = options.currentIdentity): Promise<void> {
    if (!identity || identity.email_verified !== true || identity.sub !== context.subject || typeof identity.email !== "string") throw new CandidateError("access_denied");
    const allowed = (await options.allowedEmails() ?? "").split(",").map(email => email.trim().toLowerCase()).filter(Boolean);
    if (!allowed.includes(identity.email.trim().toLowerCase())) throw new CandidateError("access_denied");
  }
  return {
    async parseAuthorization(request: Request): Promise<AuthRequest> {
      const url = new URL(request.url);
      for (const key of url.searchParams.keys()) if (url.searchParams.getAll(key).length !== 1) throw new CandidateError("invalid_request");
      return validateV2Authorization(await provider.parseAuthRequest(request), provider, context.issuer);
    },
    /** Internal seam after existing cookie-bound state + Google userinfo verification, never a public route. */
    async completeTrustedGoogle(auth: AuthRequest, identity: TrustedGoogleIdentity): Promise<Response> {
      await admission(identity);
      const checked = await validateV2Authorization(auth, provider, context.issuer);
      const result = await ledger.issueAuthorization({ clientId: checked.clientId, redirectUri: checked.redirectUri, scopes: checked.scope,
        codeChallenge: checked.codeChallenge!, props: { tenantId: "jurisia", userId: identity.sub, email: identity.email.trim().toLowerCase() } });
      const redirect = new URL(checked.redirectUri);
      redirect.searchParams.set("code", result.code);
      redirect.searchParams.set("state", checked.state);
      redirect.searchParams.set("iss", context.issuer);
      return new Response(null, { status: 302, headers: { location: redirect.href, "cache-control": "no-store", pragma: "no-cache" } });
    },
    async token(request: Request): Promise<Response> {
      try {
        const form = await tokenForm(request);
        const grantType = form.get("grant_type") ?? "";
        if (grantType !== "authorization_code" && grantType !== "refresh_token") throw new CandidateError("unsupported_grant_type");
        const clientId = await authenticateV2Client(request, form, provider, options.authenticateConfidentialClient, grantType);
        const resource = form.get("resource") ?? undefined;
        checkResources(resource, context.resource);
        const scopes = form.has("scope") ? form.get("scope")!.split(" ").filter(Boolean) : undefined;
        if (scopes) checkScopes(scopes);
        const input: CredentialInspectionInput = grantType === "authorization_code"
          ? { grantType, code: form.get("code") ?? "", clientId, redirectUri: form.get("redirect_uri") ?? "", codeVerifier: form.get("code_verifier") ?? "", resource, scopes }
          : { grantType, refreshToken: form.get("refresh_token") ?? "", clientId, resource, scopes };
        if (options.credentialAdmission) await options.credentialAdmission(input);
        else await admission();
        // No public attempt/idempotency field is forwarded; the ledger generates a fresh operation.
        const result = grantType === "authorization_code"
          ? await ledger.exchangeCode({ code: form.get("code") ?? "", clientId, redirectUri: form.get("redirect_uri") ?? "", codeVerifier: form.get("code_verifier") ?? "", resource, scopes })
          : await ledger.refresh({ refreshToken: form.get("refresh_token") ?? "", clientId, resource, scopes });
        return Response.json({ access_token: result.accessToken, token_type: result.tokenType, expires_in: result.expiresIn,
          scope: result.scope, resource: result.resource, ...(result.refreshToken ? { refresh_token: result.refreshToken } : {}) },
        { headers: { "cache-control": "no-store", pragma: "no-cache" } });
      } catch (error) { return oauthFailure(error); }
    },
    async revoke(request: Request): Promise<Response> {
      try {
        const form = await tokenForm(request);
        const clientId = await authenticateV2Client(request, form, provider, options.authenticateConfidentialClient);
        const token = form.get("token");
        if (!token) throw new CandidateError("invalid_request");
        // The full credential must be found by hash; no caller-supplied subject/family is accepted.
        await ledger.revokeToken({ token, clientId });
        return Response.json({}, { headers: { "cache-control": "no-store", pragma: "no-cache" } });
      } catch (error) { return oauthFailure(error); }
    },
    async authorize(request: Request, requiredScopes: string[] = []): Promise<Principal> {
      const bearer = /^Bearer ([^\s]+)$/i.exec(request.headers.get("authorization") ?? "");
      if (!bearer || !bearer[1]!.startsWith("mcp2.a.")) throw new CandidateError("invalid_token");
      const principal = await ledger.authorize({ accessToken: bearer[1]!, requiredScopes });
      if (principal.issuer !== context.issuer || principal.resource !== context.resource || principal.tenantId !== context.tenantId || principal.subject !== context.subject) throw new CandidateError("access_denied");
      const denied = authorizeMcpProps(principal.props, principal.scopes, principal.subject, await options.allowedEmails());
      if (denied) throw new CandidateError(denied);
      return principal;
    },
  };
}

export type AuthorityAdapter = ReturnType<typeof createAuthorityAdapter>;
