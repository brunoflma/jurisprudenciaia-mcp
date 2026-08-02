import type {
  ClientRegistrationCallbackOptions,
  ClientRegistrationCallbackResult
} from "@cloudflare/workers-oauth-provider";
import { validateDynamicClientMetadata } from "./client-policy.js";

const CLAUDE_CALLBACKS = new Set([
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback"
]);
const CODEX_CALLBACK_PATH = /^\/callback\/[A-Za-z0-9_-]{8,128}$/;
const CODEX_GRANT_TYPES = new Set(["authorization_code", "refresh_token"]);

export function validateMcpClientRegistration(
  { clientMetadata }: ClientRegistrationCallbackOptions
): ClientRegistrationCallbackResult | undefined {
  const redirects = stringArray(clientMetadata.redirect_uris);
  if (redirects.length === 0) return invalidClientMetadata();

  if (redirects.every((redirect) => CLAUDE_CALLBACKS.has(redirect) || classifyChatGptRedirect(redirect))) {
    return undefined;
  }

  if (validateDynamicClientMetadata(clientMetadata)) {
    return undefined;
  }

  if (isCodexRegistration(clientMetadata, redirects)) {
    return undefined;
  }

  return invalidClientMetadata();
}

function classifyChatGptRedirect(value: string): boolean {
  try {
    const redirect = new URL(value);
    return redirect.protocol === "https:"
      && redirect.hostname === "chatgpt.com"
      && redirect.username === ""
      && redirect.password === ""
      && redirect.search === ""
      && redirect.hash === ""
      && /^\/connector\/oauth\/[A-Za-z0-9_-]{8,128}$/.test(redirect.pathname);
  } catch {
    return false;
  }
}

function isCodexRegistration(metadata: Record<string, unknown>, redirects: string[]): boolean {
  if (metadata.client_name !== "Codex" || redirects.length !== 1) return false;
  if (metadata.token_endpoint_auth_method !== "none") return false;

  const grants = stringArray(metadata.grant_types);
  if (!grants.includes("authorization_code") || grants.some((grant) => !CODEX_GRANT_TYPES.has(grant))) {
    return false;
  }

  const responseTypes = stringArray(metadata.response_types);
  if (responseTypes.length !== 1 || responseTypes[0] !== "code") return false;

  return isCodexLoopbackRedirect(redirects[0]);
}

function isCodexLoopbackRedirect(value: string): boolean {
  let redirect: URL;
  try {
    redirect = new URL(value);
  } catch {
    return false;
  }

  const loopbackHost = redirect.hostname === "127.0.0.1" || redirect.hostname === "[::1]";
  const port = Number(redirect.port);
  return redirect.protocol === "http:"
    && loopbackHost
    && Number.isInteger(port)
    && port >= 1
    && port <= 65_535
    && redirect.username === ""
    && redirect.password === ""
    && redirect.search === ""
    && redirect.hash === ""
    && CODEX_CALLBACK_PATH.test(redirect.pathname);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

function invalidClientMetadata(): ClientRegistrationCallbackResult {
  return {
    code: "invalid_client_metadata",
    description: "Use um cliente MCP autorizado com redirect seguro.",
    status: 400
  };
}
