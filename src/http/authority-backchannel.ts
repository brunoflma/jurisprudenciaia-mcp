import { authorizeMcpProps, canonicalOAuthOrigin } from "../oauth/access-policy.js";
import type { Principal } from "../oauth/authority-v2/adapter.js";
import { AUTHORITY_BACKCHANNEL_PATH, decodeBackchannelJson, readBackchannelBytes, signAuthorityRequest } from "../oauth/authority-v2/backchannel.js";
import type { TrustedNodeAuthority } from "./authority-v2.js";

type Options = {
  issuer: string;
  key: string;
  allowedEmails: () => string | undefined | Promise<string | undefined>;
  fetcher?: typeof fetch;
};

/** Only operator configuration chooses the authority; client headers never choose a destination. */
export function createNodeAuthority(options: Options): TrustedNodeAuthority {
  const issuer = canonicalOAuthOrigin(options.issuer);
  const url = new URL(issuer);
  if (url.port || url.hostname === "localhost" || url.hostname.endsWith(".localhost") || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(":")) throw new Error("authority_backchannel_origin_invalid");
  const destination = issuer + AUTHORITY_BACKCHANNEL_PATH;
  const fetcher = options.fetcher ?? fetch;
  return {
    issuer,
    allowedEmails: options.allowedEmails,
    async authorize(accessToken: string): Promise<Principal> {
      if (!/^mcp2\.a\.[^\s]{1,12000}$/.test(accessToken)) throw { code: "invalid_token" };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const body = new TextEncoder().encode(JSON.stringify({ access_token: accessToken }));
        const proof = await signAuthorityRequest(options.key, issuer, body);
        const response = await fetcher(destination, {
          method: "POST", redirect: "error", cache: "no-store", signal: controller.signal,
          headers: { authorization: proof, "content-type": "application/json", accept: "application/json" }, body,
        });
        if (response.status === 401) { void response.body?.cancel().catch(() => {}); throw { code: "invalid_token" }; }
        if (response.status === 403) { void response.body?.cancel().catch(() => {}); throw { code: "access_denied" }; }
        if (response.status !== 200 || !response.headers.get("content-type")?.startsWith("application/json")) { void response.body?.cancel().catch(() => {}); throw { code: "temporarily_unavailable" }; }
        const value = decodeBackchannelJson(await readBackchannelBytes(response));
        if (!value || typeof value !== "object" || Array.isArray(value)) throw { code: "temporarily_unavailable" };
        const principal = value as Principal;
        if (principal.issuer !== issuer || principal.resource !== issuer + "/mcp" || principal.tenantId !== "jurisia"
            || typeof principal.subject !== "string" || !principal.subject || typeof principal.clientId !== "string" || !principal.clientId
            || typeof principal.familyId !== "string" || !principal.familyId || !Number.isSafeInteger(principal.epoch)
            || !Number.isSafeInteger(principal.expiresAt) || principal.expiresAt <= Date.now()
            || !Array.isArray(principal.scopes) || !principal.scopes.length || !principal.scopes.every(scope => typeof scope === "string")) throw { code: "access_denied" };
        const denied = authorizeMcpProps(principal.props, principal.scopes, principal.subject, await options.allowedEmails());
        if (denied) throw { code: denied };
        return principal;
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
        if (["invalid_token", "access_denied", "insufficient_scope"].includes(String(code))) throw { code };
        throw { code: "temporarily_unavailable" };
      } finally { clearTimeout(timeout); }
    },
  };
}

export function configuredNodeAuthority(env: Record<string, string | undefined>): TrustedNodeAuthority | undefined {
  if (env.MCP_OAUTH_V2_ENABLED !== "true") return undefined;
  try {
    if (!env.MCP_PUBLIC_ORIGIN || !env.MCP_OAUTH_V2_BACKCHANNEL_KEY) return undefined;
    return createNodeAuthority({ issuer: env.MCP_PUBLIC_ORIGIN, key: env.MCP_OAUTH_V2_BACKCHANNEL_KEY, allowedEmails: () => env.MCP_ALLOWED_EMAILS });
  } catch { return undefined; }
}
