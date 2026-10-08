# OAuth v2 ledger candidate — internal API

Disabled candidate only. No production binding, cutoff, TTL, activation or credentials are selected here. `src/ledger.mjs` exports `createLedger(options)` synchronously; all operation methods are asynchronous and throw `LedgerError` with fixed `code`, `message`, `status` (no raw storage/cause/provider details).

```js
const ledger = createLedger({
  storage, // real storage.sql.exec(query,...bindings).toArray(), storage.transactionSync(fn)
  clock: () => Date.now(), // integer milliseconds
  context: { issuer, resource, tenantId, subject }, // immutable authenticated authority partition
  policy: {
    allowedScopes: ['read'], codeTtlMs, accessTtlMs, receiptTtlMs,
    refresh: null // CNPJA always null
    // or { tokenTtlMs, absoluteTtlMs, idleTtlMs }
  },
  receiptKey: new Uint8Array(32), // injected AES-GCM key; fixtures only, no generated production key
});
```

All TTLs are positive, explicit milliseconds. The context AND policy are persisted and must match on restart; changing them needs a separate migration. A database is one issuer/resource/tenant/subject authority, never a global shared sessions database. Receipt encryption is bound to context, operation ID and request digest. Tokens are `mcp2.{c|a|r}.{partitionId}.{32randomBytesBase64url}`. `partitionId` is SHA-256 of canonical context, with base64url encoding. Export `authorityPartition(context)` computes it; `parseTokenHint(token)` returns `{kind,partitionId}` or null. Hints NEVER authenticate identity or authorize revocation. The server routes within its fixed service namespace, loads an EXISTING authority using `readLedgerContext(storage)` (read-only, rejects unknown authority), and authenticates the entire token hash in the ledger. Only trusted authenticated issuance may create/bootstrap context. Do not initialize an arbitrary identity from a public token hint. No global token-to-subject index is required. `index.mjs` re-exports the public API.

Methods:

* `issueAuthorization({clientId, redirectUri, scopes, codeChallenge, props?})` → `{code, familyId, expiresAt}`. Caller authenticated admission/client/redirect registration before this method; core enforces a nonempty exact redirect string, allowed scopes and mandatory S256 challenge. `props` is trusted bounded JSON metadata, never credentials.
* `exchangeCode({code, clientId, redirectUri, codeVerifier, resource?, scopes?, attemptId?})` → token result.
* `refresh({refreshToken, clientId, resource?, scopes?, attemptId?})` → token result; rejects `unsupported_grant_type` when policy.refresh is null.
* `inspectCredential({grantType:'authorization_code'|'refresh_token', ...sameExchangeOrRefreshInput})` → internal read-only union: `{kind:'credential',...AuthorizedContext,consumed:false}` OR `{kind:'authenticated_replay'}`. It shares full-token-hash, client/resource/scopes, PKCE/redirect, principal/epoch/family and expiry checks with exchange. For a usable credential, `props` is trusted stored metadata and `expiresAt` is that credential's expiry. No credential is consumed, issued or revoked. This is only for an authenticated adapter to run its existing admission gate before minting; never expose this API over public HTTP.

  A consumed full hash with valid owner/bindings and live family returns only the serializable replay marker, including when that consumed credential's individual expiry has passed. This marker provides NO identity/props and is NOT usable credential admission. The adapter MUST route it directly through the corresponding exchange/refresh, before any external admission gate, so replay revocation is not suppressed by admission removal or outage. That exchange revalidates and performs the existing atomic replay semantics. Fresh expired, fabricated, foreign, wrong-binding, revoked and suspended credentials fail normally. A successful inspection is no reservation: exchange revalidates again after admission. No custom Error properties are needed across RPC.
* Token result: `{tokenType:'Bearer', accessToken, expiresAt, expiresIn, scopes, scope, issuer, resource, familyId, refreshToken?, refreshExpiresAt?}`. `expiresIn` is integer seconds, timestamps milliseconds.
* `authorize({accessToken, requiredScopes?})` → `{issuer,resource,tenantId,subject,clientId,familyId,scopes,props,epoch,expiresAt}`. Rechecks authoritative status/epoch/family on EVERY call. Existing allowlist/admission/business ACLs remain mandatory in the adapter.
* `revokeFamily({familyId})`, `revokeAll()`, `suspend()`, `resume()` → `{ok:true}`. These are trusted internal control operations, never public MCP methods or unauthenticated token-prefix controls. Logout-all increments epoch but permits new admitted logins; suspension blocks new grants until resumed.
* `revokeToken({token,clientId})` → idempotent `{ok:true}`. Caller must perform the existing OAuth client authentication first. Core requires possession of the authentic FULL access/refresh token hash AND its client binding before revoking the family; unknown token, wrong client, code, family ID or hint alone do not mutate anything. An authentic expired access or consumed older refresh can revoke its still-retained family. There is no production route activated by this method.
* `cleanupExpired()` → `{removedReceipts,removedFamilies}`. Explicit internal maintenance only; no alarm is registered. Deletes expired receipts and fully expired families/credentials together; keeps all authentic refresh generations of any live family, even if an individual refresh has expired. Never resets principal epoch/status or metadata. No new retention TTL is introduced.

`attemptId` is exclusively an internally generated RPC retry identifier; never accept it from public OAuth requests. An identical internal retry with the same authenticated request can recover an encrypted receipt while the family remains valid. Mismatched request digest fails closed. A NEW public request reusing an authentic consumed code/refresh revokes only its authenticated family. Unknown tokens and wrong client/bindings do not revoke anything. Downscope is cumulative through each refresh; it can never restore an earlier wider scope.

Cryptography is prepared outside the synchronous transaction. The transaction rereads principal, grant and presented credential before consuming it, creating successors and storing the encrypted receipt together. No await/network I/O is inside the transaction. Storage failures become fixed `temporarily_unavailable` 503. A post-commit response failure can be recovered with the same internal attempt ID; a public retry is strict replay and can force login.

Internal receipts can be purged after their explicit TTL. Authenticated lineage remains until the existing family absolute expiry and until no descendant is still valid; explicit `cleanupExpired()` can then purge the whole family. No automatic maintenance schedule is activated. No plaintext bearer/code/verifier is stored. Receipt key rotation, maintenance scheduling, distributed routing and operational recovery remain integration responsibilities.

Testing-only `faultInjector(stage)` option accepts synchronous hooks at `beforeCommit`, `afterCommit` to prove rollback/recovery; production adapters MUST omit it. It is not environment-configured. Integration uses real SQLite, not a Map imitation.
