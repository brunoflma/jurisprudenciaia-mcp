import { oauthFailure, readTokenForm, type AuthorityAdapter, type Principal } from "./adapter.js";
import { canonicalOAuthOrigin } from "../access-policy.js";
type Handler = (request: Request) => Response | Promise<Response>;

/** No activation env var is read. The default returns the exact legacy function without touching dependencies. */
export function createVersionRouter(options: {
  enabled?: boolean; legacy: Handler; candidate?: Handler; legacyCutoff?: number; clock?: () => number;
}): Handler {
  if (options.enabled !== true) return options.legacy;
  if (!options.candidate) throw new Error("authority_v2_candidate_required");
  const { candidate, legacy } = options;
  if (options.legacyCutoff !== undefined && (!Number.isSafeInteger(options.legacyCutoff) || !options.clock)) throw new Error("authority_v2_explicit_clock_required");
  return async request => {
    const path = new URL(request.url).pathname;
    let routedRequest = request;
    let v2 = path === "/authorize" || path === "/oauth/authorize";
    if (path === "/oauth/token" || path === "/oauth/revoke") {
      try {
        const { form, bytes } = await readTokenForm(request);
        // The original stream has been consumed, without a tee. Reuse its exact bounded bytes.
        routedRequest = new Request(request, { body: bytes });
        v2 = [form.get("code"), form.get("refresh_token"), form.get("token")].some(value => value?.startsWith("mcp2."));
      } catch (error) { return oauthFailure(error); }
    } else if (path === "/mcp" || path === "/") {
      // Match even malformed/incorrect token kinds as v2; never downgrade on rejection.
      const header = request.headers.get("authorization") ?? "";
      v2 = /^Bearer\s+mcp2\./i.test(header);
    } else if (!v2) return legacy(request);
    if (v2) {
      try { return await candidate(routedRequest); }
      catch (error) { return oauthFailure(error); }
    }
    if (options.legacyCutoff !== undefined && options.clock!() >= options.legacyCutoff) return oauthFailure({ code: "invalid_token" });
    return legacy(routedRequest);
  };
}

/** Request-based middleware usable by a future Node adapter and Worker; no listener or proxy trust is changed. */
export function createResourceMiddleware(options: {
  enabled?: boolean; legacy: Handler; resolve?: (token: string) => Promise<AuthorityAdapter>;
  issuer?: string;
  authorized?: (request: Request, principal: Principal) => Response | Promise<Response>;
  requiredScopes?: string[];
}): Handler {
  if (options.enabled !== true) return options.legacy;
  if (!options.resolve || !options.authorized || !options.issuer) throw new Error("authority_v2_resource_dependencies_required");
  const issuer = canonicalOAuthOrigin(options.issuer);
  function denied(error: unknown): Response {
    const response = oauthFailure(error);
    if (response.status === 401 || response.status === 403) response.headers.set("www-authenticate", `Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource/mcp"`);
    return response;
  }
  return async request => {
    try {
      const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get("authorization") ?? "");
      if (!match || !match[1]!.startsWith("mcp2.a.")) return denied({ code: "invalid_token" });
      // Resolver is an injected trusted backchannel. Token/hint alone never authenticates a subject.
      const adapter = await options.resolve!(match[1]!);
      const principal = await adapter.authorize(request, options.requiredScopes);
      if (principal.issuer !== issuer || principal.resource !== `${issuer}/mcp` || principal.tenantId !== "jurisia") return denied({ code: "access_denied" });
      return await options.authorized!(request, principal);
    } catch (error) { return denied(error); }
  };
}
