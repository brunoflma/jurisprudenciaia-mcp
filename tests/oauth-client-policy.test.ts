import { describe, expect, it } from "vitest";
import { classifyOAuthRedirectUri, validateDynamicClientMetadata } from "../src/oauth/client-policy.js";

describe("OAuth client policy", () => {
  it.each([
    ["http://127.0.0.1:3334/oauth/callback", "loopback"],
    ["http://localhost:49152/oauth/callback", "loopback"],
    ["https://claude.ai/api/mcp/auth_callback", "hosted"],
    ["https://claude.com/api/mcp/auth_callback", "hosted"],
    ["https://chatgpt.com/connector_platform_oauth_redirect", "hosted"],
    ["https://chatgpt.com/connector/oauth/AxMS-ux405ET", "hosted"]
  ] as const)("classifies the allowed redirect %s", (redirectUri, expected) => {
    expect(classifyOAuthRedirectUri(redirectUri)).toBe(expected);
  });

  it.each([
    "http://chatgpt.com/connector_platform_oauth_redirect",
    "https://chatgpt.com.evil.test/connector_platform_oauth_redirect",
    "https://chatgpt.com:443/connector_platform_oauth_redirect",
    "https://chatgpt.com:8443/connector_platform_oauth_redirect",
    ["https://user", "chatgpt.com/connector_platform_oauth_redirect"].join("@"),
    "https://chatgpt.com/connector_platform_oauth_redirect?next=evil",
    "https://chatgpt.com/connector_platform_oauth_redirect#fragment",
    "https://chatgpt.com/connector_platform_oauth_redirect/",
    "https://chatgpt.com/%63onnector_platform_oauth_redirect",
    "https://chatgpt.com/other/../connector_platform_oauth_redirect",
    " https://chatgpt.com/connector_platform_oauth_redirect"
  ])("rejects altered stable ChatGPT callback %s", (redirectUri) => {
    expect(classifyOAuthRedirectUri(redirectUri)).toBeUndefined();
  });

  it("accepts stable ChatGPT metadata and rejects mixed or altered redirects", () => {
    const callback = "https://chatgpt.com/connector_platform_oauth_redirect";
    const metadata = { redirect_uris: [callback], token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] };
    expect(validateDynamicClientMetadata(metadata)).toBe(true);
    expect(validateDynamicClientMetadata({ ...metadata,
      redirect_uris: [callback, "http://127.0.0.1:3334/oauth/callback"] })).toBe(false);
    expect(validateDynamicClientMetadata({ ...metadata, redirect_uris: [callback, `${callback}?next=evil`] })).toBe(false);
  });

  it.each([
    "http://127.0.0.1/oauth/callback",
    "http://127.0.0.2:3334/oauth/callback",
    "http://localhost.evil.test:3334/oauth/callback",
    "https://localhost:3334/oauth/callback",
    "http://user@localhost:3334/oauth/callback",
    "https://chatgpt.com/connector/oauth/x?next=evil",
    "https://chatgpt.com.evil.test/connector/oauth/AxMS-ux405ET",
    "not-a-url"
  ])("rejects the unsafe redirect %s", (redirectUri) => {
    expect(classifyOAuthRedirectUri(redirectUri)).toBeUndefined();
  });

  it("accepts a public loopback client using authorization code flow", () => {
    expect(validateDynamicClientMetadata({
      redirect_uris: ["http://127.0.0.1:3334/oauth/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"]
    })).toBe(true);
  });

  it.each([
    {
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback", "http://127.0.0.1:3334/oauth/callback"],
      token_endpoint_auth_method: "none"
    },
    {
      redirect_uris: ["http://127.0.0.1:3334/oauth/callback"],
      token_endpoint_auth_method: "client_secret_basic"
    },
    {
      redirect_uris: ["http://127.0.0.1:3334/oauth/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["implicit"],
      response_types: ["token"]
    }
  ])("rejects unsafe loopback metadata", (clientMetadata) => {
    expect(validateDynamicClientMetadata(clientMetadata)).toBe(false);
  });
});
