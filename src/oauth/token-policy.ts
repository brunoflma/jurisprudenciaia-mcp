import { OAuthError, type TokenExchangeCallbackOptions } from "@cloudflare/workers-oauth-provider";

export type TokenExchangePolicy = (options: TokenExchangeCallbackOptions) => void;

/** The Worker calls this only after its existing body limit and rate limit. */
export async function redirectUriExchangePolicy(request: Request): Promise<TokenExchangePolicy | undefined> {
  if (request.method !== "POST" || new URL(request.url).pathname !== "/oauth/token") return undefined;
  // Match provider 0.10.3: other media types return invalid_request before exchange.
  if ((request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase() !== "application/x-www-form-urlencoded") return undefined;
  let form: FormData;
  try { form = await request.clone().formData(); }
  catch { return undefined; } // The provider returns its own invalid_request response.
  if (form.get("grant_type") !== "authorization_code") return undefined;
  // The provider rejects repeated non-resource fields before this callback executes.
  const redirectUri = form.get("redirect_uri");
  // Capture only this request's redirect, never its code, client secret or verifier.
  return (options) => {
    if (options.grantType !== "authorization_code") return;
    const props: unknown = options.props;
    if (!props || typeof props !== "object" || !("mcpRedirectUri" in props)) return;
    const expected = props.mcpRedirectUri;
    let valid = typeof expected === "string" && expected.length > 0;
    if (valid) {
      try { new URL(expected as string); }
      catch { valid = false; }
    }
    // Legacy grants have no field. Omission with PKCE remains the provider's contract.
    if (!valid || (redirectUri !== null && redirectUri !== expected)) {
      throw new OAuthError("invalid_grant", { description: "Redirect URI does not match authorization grant" });
    }
  };
}
