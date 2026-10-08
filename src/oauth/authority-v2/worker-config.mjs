import { LedgerError } from './core/index.mjs';

const fail = () => { throw new LedgerError('temporarily_unavailable'); };
const positive = value => Number.isSafeInteger(value) && value > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, names) => object(value) && Object.keys(value).every(key => names.includes(key));

/** Absent, boolean true, and all other spellings are disabled. Reads only this flag. */
export function isAuthorityV2Enabled(env) {
  return env?.MCP_OAUTH_V2_ENABLED === 'true';
}

/** Recovery can stop minting while retaining the v2 reader and revocation state. */
export function isAuthorityV2IssuancePaused(env) {
  return isAuthorityV2Enabled(env) && env.MCP_OAUTH_V2_ISSUANCE_PAUSED === 'true';
}

function readConfiguration(env) {
  const raw = env?.MCP_OAUTH_V2_POLICY;
  if (typeof raw !== 'string' || raw.length < 2 || raw.length > 8192) fail();
  let value;
  try { value = JSON.parse(raw); } catch { fail(); }
  if (!exactKeys(value, ['allowedScopes', 'codeTtlMs', 'accessTtlMs', 'receiptTtlMs', 'refresh', 'legacyCutoff'])) fail();
  if (!['codeTtlMs', 'accessTtlMs', 'receiptTtlMs'].every(key => positive(value[key]))) fail();
  if (!Array.isArray(value.allowedScopes) || value.allowedScopes.length < 1 || value.allowedScopes.length > 64
      || value.allowedScopes.some(scope => typeof scope !== 'string' || scope.length > 128
        || !/^[\x21\x23-\x5b\x5d-\x7e]+$/.test(scope))) fail();
  if (value.refresh !== null && (!exactKeys(value.refresh, ['tokenTtlMs', 'absoluteTtlMs', 'idleTtlMs'])
      || !['tokenTtlMs', 'absoluteTtlMs', 'idleTtlMs'].every(key => positive(value.refresh[key])))) fail();
  if (value.legacyCutoff !== undefined && (!Number.isSafeInteger(value.legacyCutoff) || value.legacyCutoff < 0)) fail();
  return value;
}

/** Durations have no defaults. Cutoff is dispatch policy, not immutable ledger policy. */
export function readAuthorityPolicy(env) {
  const { allowedScopes, codeTtlMs, accessTtlMs, receiptTtlMs, refresh } = readConfiguration(env);
  return { allowedScopes: [...new Set(allowedScopes)].sort(), codeTtlMs, accessTtlMs, receiptTtlMs,
    refresh: refresh === null ? null : { ...refresh } };
}

/** Optional explicit Unix timestamp in milliseconds; absence never selects a date. */
export function readLegacyCutoff(env) {
  return readConfiguration(env).legacyCutoff;
}

/** Cloudflare secret string: canonical base64url, exactly 32 bytes, no padding. */
export function readAuthorityReceiptKey(env) {
  const raw = env?.MCP_OAUTH_V2_RECEIPT_KEY;
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(raw)) fail();
  let bytes;
  try { bytes = Uint8Array.from(atob(raw.replaceAll('-', '+').replaceAll('_', '/')), ch => ch.charCodeAt(0)); }
  catch { fail(); }
  if (bytes.byteLength !== 32) fail();
  const encoded = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  if (encoded !== raw) fail();
  return bytes;
}
