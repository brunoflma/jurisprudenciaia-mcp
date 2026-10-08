import type { RequestHandler } from "express";
import { authorizeMcpProps, canonicalOAuthOrigin } from "../oauth/access-policy.js";
import type { Principal } from "../oauth/authority-v2/adapter.js";

/** Constructor-only trusted backchannel. The implementation must authenticate its transport and read fresh authority state. */
export type TrustedNodeAuthority = {
  issuer: string;
  authorize(accessToken: string): Promise<Principal>;
  allowedEmails(): string | undefined | Promise<string | undefined>;
};

export function nodeAuthorityMiddleware(authority?: TrustedNodeAuthority): RequestHandler {
  return async (request, response, next) => {
    if (!authority) { response.setHeader("retry-after", "5"); response.status(503).json({ error: "temporarily_unavailable" }); return; }
    let challenge: string | undefined;
    try {
      const issuer = canonicalOAuthOrigin(authority.issuer);
      const match = /^Bearer ([^\s]+)$/i.exec(request.get("authorization") ?? "");
      challenge = `Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource/mcp"`;
      if (!match || !match[1]!.startsWith("mcp2.a.")) { response.setHeader("www-authenticate", challenge); response.status(401).json({ error: "invalid_token" }); return; }
      const principal = await authority.authorize(match[1]!);
      const denied = authorizeMcpProps(principal.props, principal.scopes, principal.subject, await authority.allowedEmails());
      if (denied || principal.issuer !== issuer || principal.resource !== `${issuer}/mcp` || principal.tenantId !== "jurisia") {
        response.setHeader("www-authenticate", challenge); response.status(403).json({ error: denied ?? "access_denied" }); return;
      }
      // No subject, tenant or scopes are taken from Host, Forwarded or identity headers.
      next();
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      const status = code === "invalid_token" ? 401 : code === "insufficient_scope" || code === "access_denied" || code === "principal_suspended" ? 403 : 503;
      if (status === 503) response.setHeader("retry-after", "5");
      if ((status === 401 || status === 403) && challenge) response.setHeader("www-authenticate", challenge);
      response.status(status).json({ error: status === 401 ? "invalid_token" : status === 403 ? "access_denied" : "temporarily_unavailable" });
    }
  };
}
