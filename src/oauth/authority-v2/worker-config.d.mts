import type { LedgerContext, LedgerPolicy } from './core/index.mjs';
export interface AuthorityConfigurationEnv {
  MCP_OAUTH_V2_ENABLED?: string;
  MCP_OAUTH_V2_ISSUANCE_PAUSED?: string;
  MCP_OAUTH_V2_POLICY?: string;
  MCP_OAUTH_V2_RECEIPT_KEY?: string;
}
export function isAuthorityV2Enabled(env: AuthorityConfigurationEnv): boolean;
export function isAuthorityV2IssuancePaused(env: AuthorityConfigurationEnv): boolean;
export function readAuthorityPolicy(env: AuthorityConfigurationEnv, context?: LedgerContext): LedgerPolicy;
export function readLegacyCutoff(env: AuthorityConfigurationEnv): number | undefined;
export function readAuthorityReceiptKey(env: AuthorityConfigurationEnv, context?: LedgerContext): Uint8Array;
