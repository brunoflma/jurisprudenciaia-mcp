import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

export type CacheLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete?(key: string): Promise<void>;
};

export type OAuthStateNamespace = Pick<DurableObjectNamespace, "idFromName" | "get">;

type SecretEnv = {
  MCP_GOOGLE_CLIENT_ID?: string;
  MCP_GOOGLE_CLIENT_SECRET?: string;
  MCP_PUBLIC_ORIGIN?: string;
  MCP_GOOGLE_CALLBACK_ORIGIN?: string;
  MCP_ALLOWED_EMAILS?: string;
  MCP_BEARER_TOKEN?: string;
  MCP_BEARER_TOKEN_SHA256?: string;
  MCP_ALLOWED_ORIGINS?: string;
  JURISPRUDENCIAIA_URL?: string;
  REQUEST_TIMEOUT_MS?: string;
  RATE_LIMIT_WINDOW_MS?: string;
  RATE_LIMIT_MAX_REQUESTS?: string;
  MCP_ICON_URL?: string;
  OAUTH_PROVIDER: OAuthHelpers;
  OAUTH_STATE: DurableObjectNamespace;
  OAUTH_KV: KVNamespace;
  JURIS_CACHE: KVNamespace;
};

export type Env = Cloudflare.Env & SecretEnv;
