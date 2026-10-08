import type { AuthRequest, ClientInfo, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { Env } from "../../types.js";
import { authorizeMcpProps, MCP_SCOPES } from "../access-policy.js";
import { authenticateV2Client, createAuthorityAdapter, oauthFailure, PRIVATE_DEPLOYMENT, readTokenForm, validateV2Authorization, type TrustedGoogleIdentity } from "./adapter.js";
import { createLedgerDirectory, type RuntimeLedger } from "./runtime.mjs";
import { isAuthorityV2IssuancePaused, readAuthorityPolicy, readAuthorityReceiptKey, readLegacyCutoff } from "./worker-config.mjs";
import { createResourceMiddleware, createVersionRouter } from "./router.js";
import type { OAuthTransaction } from "../state.js";
import { AUTHORITY_BACKCHANNEL_PATH } from "./backchannel.js";
import { handleAuthorityBackchannel } from "./worker-backchannel.js";


/** Read the original stream once; preserve bytes/headers without a tee or unbounded buffering. */
export async function bufferAuthorityRequest(request: Request, limit: number): Promise<Request | undefined> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declared) || declared < 0 || declared > limit) {
    void request.body?.cancel().catch(() => {});
    return undefined;
  }
  const reader = request.body?.getReader();
  if (!reader) return request;
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { void reader.cancel().catch(() => {}); return undefined; }
      chunks.push(value);
    }
  } catch {
    void reader.cancel().catch(() => {});
    return undefined;
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new Request(request, { body: bytes });
}


/** Preserve the installed provider's CORS contract on its existing resource/token routes. */
export function withAuthorityCors(request: Request, response: Response): Response {
  const origin = request.headers.get("origin");
  if (!origin || !["/mcp", "/", "/oauth/token", "/oauth/revoke"].includes(new URL(request.url).pathname)) return response;
  const result = new Response(response.body, response);
  result.headers.set("Access-Control-Allow-Origin", origin);
  result.headers.set("Access-Control-Allow-Methods", "*");
  result.headers.set("Access-Control-Allow-Headers", "Authorization, *");
  const exposed = (result.headers.get("Access-Control-Expose-Headers") ?? "").split(",").map(value => value.trim()).filter(Boolean);
  for (const name of ["WWW-Authenticate", "Retry-After"]) if (!exposed.some(value => value.toLowerCase() === name.toLowerCase())) exposed.push(name);
  result.headers.set("Access-Control-Expose-Headers", exposed.join(", "));
  result.headers.set("Access-Control-Max-Age", "86400");
  return result;
}

/** Exact SHA-256 hex format used by the installed provider 0.10.3 client store. */
export async function verifyRegisteredClientSecret(client: ClientInfo, secret: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(client.clientSecret ?? "")) return false;
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)));
  const digest = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
  let difference = 0;
  for (let index = 0; index < digest.length; index++) difference |= digest.charCodeAt(index) ^ client.clientSecret!.charCodeAt(index);
  return difference === 0;
}

export function createWorkerAuthority(env: Env, provider: OAuthHelpers, issuer: string) {
  const policy = readAuthorityPolicy(env);
  readAuthorityReceiptKey(env);
  if (!env.MCP_OAUTH_V2_LEDGER || policy.allowedScopes.some(scope => !MCP_SCOPES.includes(scope))) throw new Error("authority_v2_configuration_invalid");
  const directory = createLedgerDirectory(env.MCP_OAUTH_V2_LEDGER, { issuer, resource: `${issuer}/mcp`, tenantId: "jurisia" });
  const legacyCutoff = readLegacyCutoff(env);
  const adapter = (ledger: RuntimeLedger) => createAuthorityAdapter({
    context: ledger.context, ledger, provider, allowedEmails: () => env.MCP_ALLOWED_EMAILS,
    authenticateConfidentialClient: verifyRegisteredClientSecret,
    credentialAdmission: async input => {
      const proof = await ledger.inspectCredential(input);
      // Continue the exchange to revoke authenticated replay; do not invent identity from a hint.
      if (proof.kind === "authenticated_replay") return;
      const denied = authorizeMcpProps(proof.props, proof.scopes, proof.subject, env.MCP_ALLOWED_EMAILS);
      if (denied || proof.issuer !== issuer || proof.tenantId !== "jurisia" || proof.resource !== `${issuer}/mcp`) throw { code: denied ?? "access_denied" };
    },
  });
  async function token(request: Request): Promise<Response> {
    try {
      const { form, bytes } = await readTokenForm(request);
      const replay = new Request(request, { body: bytes });
      const revocation = new URL(request.url).pathname === "/oauth/revoke" || form.has("token");
      const credential = revocation ? form.get("token") : form.get("grant_type") === "refresh_token" ? form.get("refresh_token") : form.get("code");
      if (!credential) return oauthFailure({ code: "invalid_request" });
      const ledger = await directory.resolveToken(credential);
      if (!ledger) {
        if (revocation) {
          await authenticateV2Client(replay, form, provider, verifyRegisteredClientSecret);
          return Response.json({}, { headers: { "cache-control": "no-store" } });
        }
        return oauthFailure({ code: "invalid_grant" });
      }
      return revocation ? adapter(ledger).revoke(replay) : adapter(ledger).token(replay);
    } catch (error) { return oauthFailure(error); }
  }
  const googleHooks = {
    async parseAuthorization(request: Request): Promise<OAuthTransaction> {
      const query = new URL(request.url).searchParams;
      for (const name of query.keys()) if (query.getAll(name).length !== 1) throw { code: "invalid_request" };
      const parsed = await validateV2Authorization(await provider.parseAuthRequest(request), provider, issuer);
      return { ...parsed, authorityVersion: 2 };
    },
    async completeAuthorization(auth: AuthRequest, identity: TrustedGoogleIdentity): Promise<{ redirectTo: string }> {
      if (identity.email_verified !== true || !identity.sub || !identity.email || !(env.MCP_ALLOWED_EMAILS ?? "").split(",").map(value => value.trim().toLowerCase()).includes(identity.email.trim().toLowerCase())) throw { code: "access_denied" };
      const ledger = await directory.getOrCreate({ issuer, resource: `${issuer}/mcp`, tenantId: "jurisia", subject: identity.sub });
      const response = await adapter(ledger).completeTrustedGoogle(auth, identity);
      return { redirectTo: response.headers.get("location")! };
    },
    legacyAuthorizationAllowed: () => legacyCutoff === undefined || Date.now() < legacyCutoff,
  };
  return {
    googleHooks,
    async backchannel(request: Request): Promise<Response> {
      return handleAuthorityBackchannel(request, env.MCP_OAUTH_V2_BACKCHANNEL_KEY, issuer, async incoming => {
        const tokenValue = incoming.headers.get("authorization")!.slice(7);
        const ledger = await directory.resolveToken(tokenValue);
        if (!ledger) throw { code: "invalid_token" };
        return adapter(ledger).authorize(incoming);
      });
    },
    async route(request: Request, legacy: (request: Request) => Promise<Response>, authorized: (request: Request) => Promise<Response>) {
      // Provider 0.10.3 matches apiRoute by prefix. Never let suffixes fall into v1.
      const path = new URL(request.url).pathname;
      if (path === AUTHORITY_BACKCHANNEL_PATH) return this.backchannel(request);
      if (path.startsWith("/mcp") && path !== "/mcp") return Promise.resolve(Response.json({ error: "not_found" }, { status: 404 }));
      if (request.method === "OPTIONS" && ["/mcp", "/", "/oauth/token", "/oauth/revoke"].includes(path)) return new Response(null, { status: 204 });
      if (isAuthorityV2IssuancePaused(env)) {
        if (["/authorize", "/oauth/authorize", "/oauth/google/callback"].includes(path)) return oauthFailure({ code: "temporarily_unavailable" });
        if (path === "/oauth/token") {
          try {
            const { form, bytes } = await readTokenForm(request);
            request = new Request(request, { body: bytes });
            // The old token endpoint also handles revocation. Preserve only that operation.
            if (!form.has("token") || ["grant_type", "code", "refresh_token"].some(name => form.has(name))) return oauthFailure({ code: "temporarily_unavailable" });
          } catch (error) { return oauthFailure(error); }
        }
      }
      const resource = createResourceMiddleware({ enabled: true, issuer, legacy, authorized,
        resolve: async tokenValue => {
          const ledger = await directory.resolveToken(tokenValue);
          if (!ledger) throw { code: "invalid_token" };
          return adapter(ledger);
        } });
      const candidate = async (incoming: Request) => {
        const path = new URL(incoming.url).pathname;
        if (path === "/oauth/token" || path === "/oauth/revoke") return token(incoming);
        if (path === "/mcp" || path === "/") return resource(incoming);
        return legacy(incoming); // Real provider routes consent/callback to the hooked Google handler.
      };
      // The private deployment must not allocate the legacy ChatGPT client when v2 is selected.
      if (PRIVATE_DEPLOYMENT && new URL(request.url).pathname === "/authorize" && new URL(request.url).searchParams.get("redirect_uri")?.startsWith("https://chatgpt.com/")) return Promise.resolve(oauthFailure({ code: "unauthorized_client" }));
      return Promise.resolve(createVersionRouter({ enabled: true, legacy, candidate, legacyCutoff, clock: Date.now })(request));
    },
  };
}
