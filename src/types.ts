import type { LedgerNamespace } from "./oauth/authority-v2/runtime.mjs";
import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

export type CacheLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete?(key: string): Promise<void>;
};

export type OAuthStateNamespace = Pick<DurableObjectNamespace, "idFromName" | "get">;

type SecretEnv = {
  MCP_OAUTH_V2_ENABLED?: string;
  MCP_OAUTH_V2_ISSUANCE_PAUSED?: string;
  MCP_OAUTH_V2_POLICY?: string;
  MCP_OAUTH_V2_RECEIPT_KEY?: string;
  MCP_OAUTH_V2_BACKCHANNEL_KEY?: string;
  MCP_OAUTH_V2_LEDGER?: LedgerNamespace;
  MCP_GOOGLE_CLIENT_ID?: string;
  MCP_GOOGLE_CLIENT_SECRET?: string;
  MCP_PUBLIC_ORIGIN?: string;
  MCP_GOOGLE_CALLBACK_ORIGIN?: string;
  MCP_ALLOWED_EMAILS?: string;
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

export type Env = Omit<Cloudflare.Env, keyof SecretEnv> & SecretEnv;
