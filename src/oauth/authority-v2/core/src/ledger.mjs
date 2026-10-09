/* Local, disabled OAuth v2 candidate. No network, environment or credential reads. */
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const ERROR_STATUS = Object.freeze({invalid_request:400, invalid_grant:400, invalid_scope:400,
  invalid_target:400, unsupported_grant_type:400, invalid_token:401, insufficient_scope:403,
  temporarily_unavailable:503, principal_suspended:403, invalid_configuration:500});
export class LedgerError extends Error {
  constructor(code) { super(code in ERROR_STATUS ? code : 'temporarily_unavailable'); this.name = 'LedgerError'; this.code = this.message; this.status = ERROR_STATUS[this.code]; }
}
const fail = code => { throw new LedgerError(code); };
const isText = (value, max=2048) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unb64 = str => Uint8Array.from(atob(str.replaceAll('-','+').replaceAll('_','/')), c=>c.charCodeAt(0));
const digest = async value => b64(new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(value))));
const randomToken = (kind,partition) => `mcp2.${kind}.${partition}.${b64(crypto.getRandomValues(new Uint8Array(32)))}`;
const randomId = () => b64(crypto.getRandomValues(new Uint8Array(24)));
const credential = (value, kind) => typeof value === 'string' && new RegExp(`^mcp2\\.${kind}\\.[A-Za-z0-9_-]{43}\\.[A-Za-z0-9_-]{43}$`).test(value);
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
};
const json = value => JSON.stringify(canonical(value));
const copy = value => JSON.parse(json(value));
export async function authorityPartition(context) {
  if(!context || ['issuer','resource','tenantId','subject'].some(k=>!isText(context[k]))) fail('invalid_configuration');
  return digest(json(context));
}
export function parseTokenHint(token) {
  if(typeof token!=='string') return null;
  const match=/^mcp2\.([car])\.([A-Za-z0-9_-]{43})\.[A-Za-z0-9_-]{43}$/.exec(token);
  return match ? {kind:match[1],partitionId:match[2]} : null;
}
/** Read-only lookup for an existing authority; never creates tables or identity. */
export function readLedgerContext(storage) {
  try {
    const exists=storage.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='metadata'").toArray()[0];
    if(!exists) fail('invalid_token');
    const meta=storage.sql.exec('SELECT context FROM metadata WHERE id=1').toArray()[0];
    if(!meta) fail('invalid_token');
    return JSON.parse(meta.context);
  } catch(error) { if(error instanceof LedgerError) throw error; fail('temporarily_unavailable'); }
}
function scopeList(value, error='invalid_scope') {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64 || value.some(v=>typeof v !== 'string' || v.length>128 || !/^[\x21\x23-\x5b\x5d-\x7e]+$/.test(v))) fail(error);
  return [...new Set(value)].sort();
}
const subset = (requested, available) => requested.every(s=>available.includes(s));
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS metadata (id INTEGER PRIMARY KEY CHECK(id=1), context TEXT NOT NULL, policy TEXT NOT NULL, schema_version INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS principal (id INTEGER PRIMARY KEY CHECK(id=1), epoch INTEGER NOT NULL, status TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS grants (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, scopes TEXT NOT NULL, props TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, epoch INTEGER NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS codes (hash TEXT PRIMARY KEY, family_id TEXT NOT NULL, challenge TEXT NOT NULL, expires_at INTEGER NOT NULL, consumed INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS refresh_tokens (hash TEXT PRIMARY KEY, family_id TEXT NOT NULL, generation INTEGER NOT NULL, predecessor TEXT, scopes TEXT NOT NULL, expires_at INTEGER NOT NULL, consumed INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS access_tokens (hash TEXT PRIMARY KEY, family_id TEXT NOT NULL, scopes TEXT NOT NULL, expires_at INTEGER NOT NULL, epoch INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, digest TEXT NOT NULL, family_id TEXT NOT NULL, payload TEXT NOT NULL, expires_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS access_family ON access_tokens(family_id)',
  'CREATE INDEX IF NOT EXISTS refresh_family ON refresh_tokens(family_id)',
];

/** DO SQLite-compatible storage and explicit policy; no production defaults. */
export function createLedger({storage, clock, context, policy, receiptKey, faultInjector} = {}) {
  if (!storage?.sql?.exec || !storage?.transactionSync || typeof clock !== 'function') fail('invalid_configuration');
  if (!context || ['issuer','resource','tenantId','subject'].some(k=>!isText(context[k]))) fail('invalid_configuration');
  if (!policy || ['codeTtlMs','accessTtlMs','receiptTtlMs'].some(k=>!Number.isSafeInteger(policy[k]) || policy[k]<=0)) fail('invalid_configuration');
  if (policy.refresh !== null && (!policy.refresh || ['tokenTtlMs','absoluteTtlMs','idleTtlMs'].some(k=>!Number.isSafeInteger(policy.refresh[k]) || policy.refresh[k]<=0))) fail('invalid_configuration');
  if (!(receiptKey instanceof Uint8Array) || receiptKey.byteLength !== 32) fail('invalid_configuration');
  if (faultInjector !== undefined && typeof faultInjector !== 'function') fail('invalid_configuration');
  const ctx = copy(context), cfg = copy(policy), keyBytes = new Uint8Array(receiptKey);
  cfg.allowedScopes = scopeList(policy.allowedScopes, 'invalid_configuration');
  const contextJson = json(ctx), policyJson = json(cfg);
  const partitionPromise = authorityPartition(ctx);
  const rows = (query,...args) => storage.sql.exec(query,...args).toArray();
  const one = (query,...args) => rows(query,...args)[0];
  const write = (query,...args) => { storage.sql.exec(query,...args).toArray(); };
  const safe = operation => { try { return operation(); } catch (error) { if (error instanceof LedgerError) throw error; fail('temporarily_unavailable'); } };
  const safeAsync = operation => async (...args) => { try { return await operation(...args); } catch(error) { if(error instanceof LedgerError) throw error; fail('temporarily_unavailable'); } };
  const now = () => { const t=clock(); if(!Number.isSafeInteger(t)||t<0) fail('invalid_configuration'); return t; };
  const tx = operation => safe(()=>storage.transactionSync(operation));
  safe(()=>storage.transactionSync(()=>{
    for(const statement of SCHEMA) write(statement);
    const meta=one('SELECT * FROM metadata WHERE id=1');
    if(meta && (meta.context!==contextJson || meta.policy!==policyJson || meta.schema_version!==2)) fail('invalid_configuration');
    if(!meta) { write('INSERT INTO metadata VALUES(1,?,?,2)',contextJson,policyJson); write("INSERT INTO principal VALUES(1,0,'active')"); }
  }));
  const keyPromise = crypto.subtle.importKey('raw',keyBytes,'AES-GCM',false,['encrypt','decrypt']);
  const aad = (id, fingerprint) => textEncoder.encode(json({context:ctx, id, fingerprint, schema:2}));
  const encrypt = async (id, fingerprint, result) => {
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(id,fingerprint)},await keyPromise,textEncoder.encode(JSON.stringify(result)));
    return `${b64(iv)}.${b64(new Uint8Array(encrypted))}`;
  };
  const decrypt = async receipt => {
    const [iv,payload]=receipt.payload.split('.');
    return JSON.parse(textDecoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:aad(receipt.id,receipt.digest)},await keyPromise,unb64(payload))));
  };
  const principal = () => one('SELECT * FROM principal WHERE id=1');
  const grant = id => one('SELECT * FROM grants WHERE id=?',id);
  const alive = (g,p,t,allowPending=false) => !!g && p.status==='active' && g.epoch===p.epoch && g.expires_at>t && (g.status==='active' || (allowPending&&g.status==='pending'));
  const revoke = id => { write("UPDATE grants SET status='revoked',version=version+1 WHERE id=? AND status<>'revoked'",id); };
  const validBindings = (input,g,available) => {
    if(input.clientId!==g.client_id) fail('invalid_grant');
    if(input.resource!==undefined && input.resource!==ctx.resource) fail('invalid_target');
    const selected=input.scopes===undefined ? available : scopeList(input.scopes);
    if(!subset(selected,available) || !subset(selected,cfg.allowedScopes)) fail('invalid_scope');
    return selected;
  };
  const prepareCredential = async (kind,input) => {
    const isCode=kind==='code', presented=input?.[isCode?'code':'refreshToken'];
    if(!input || !credential(presented,isCode?'c':'r') || !isText(input.clientId)) fail('invalid_grant');
    if(isCode && (!isText(input.redirectUri) || typeof input.codeVerifier!=='string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(input.codeVerifier))) fail('invalid_grant');
    return {tokenHash:await digest(presented),challenge:isCode?await digest(input.codeVerifier):null};
  };
  // Shared by read-only inspection and both transactional exchange reads. A
  // routing hint never contributes identity: all props come from this full hash.
  const readAuthenticatedCredential = (kind,input,tokenHash,challenge,t) => {
    const isCode=kind==='code', table=isCode?'codes':'refresh_tokens';
    const row=one(`SELECT * FROM ${table} WHERE hash=?`,tokenHash); if(!row) fail('invalid_grant');
    const g=grant(row.family_id), p=principal();
    const selected=validBindings(input,g,isCode?JSON.parse(g.scopes):JSON.parse(row.scopes));
    if(isCode && (input.redirectUri!==g.redirect_uri || challenge!==row.challenge)) fail('invalid_grant');
    if(!alive(g,p,t,true)) fail('invalid_grant');
    return {row,g,p,selected,t};
  };
  const validateAttempt = value => { if(value!==undefined && (!isText(value,128)||value.length<16||!/^[A-Za-z0-9_.:-]+$/.test(value))) fail('invalid_request'); return value??randomId(); };
  const receiptResult = async receipt => {
    const value=await decrypt(receipt);
    // Decryption yields: check current authority again before releasing bearer bytes.
    tx(()=>{ if(receipt.expires_at<=now() || value.expiresAt<=now() || !alive(grant(receipt.family_id),principal(),now())) fail('invalid_grant'); });
    return value;
  };
  const methods = {
    issueAuthorization: safeAsync(async input => {
      if(!input || !isText(input.clientId) || !isText(input.redirectUri) || !/^[A-Za-z0-9_-]{43}$/.test(input.codeChallenge??'')) fail('invalid_request');
      const scopes=scopeList(input.scopes); if(!subset(scopes,cfg.allowedScopes)) fail('invalid_scope');
      const props=json(input.props??{}); if(!props || textEncoder.encode(props).length>16384) fail('invalid_request');
      const code=randomToken('c',await partitionPromise), hash=await digest(code), familyId=randomId();
      const result=tx(()=>{
        const p=principal(), t=now(); if(p.status!=='active') fail('principal_suspended');
        const expiresAt=t+cfg.codeTtlMs;
        const familyExpiry=cfg.refresh ? t+cfg.refresh.absoluteTtlMs : expiresAt+cfg.accessTtlMs;
        if(!Number.isSafeInteger(familyExpiry)) fail('invalid_configuration');
        write('INSERT INTO grants VALUES(?,?,?,?,?,?,?,?,?,0)',familyId,input.clientId,input.redirectUri,JSON.stringify(scopes),props,t,familyExpiry,p.epoch,'pending');
        write('INSERT INTO codes VALUES(?,?,?,?,0)',hash,familyId,input.codeChallenge,expiresAt);
        faultInjector?.('beforeCommit');
        return {code,familyId,expiresAt};
      });
      faultInjector?.('afterCommit'); return result;
    }),
    exchangeCode: safeAsync(async input => exchange('code',input)),
    refresh: safeAsync(async input => { if(cfg.refresh===null) fail('unsupported_grant_type'); return exchange('refresh',input); }),
    inspectCredential: safeAsync(async input => {
      const kind=input?.grantType==='authorization_code'?'code':input?.grantType==='refresh_token'?'refresh':null;
      if(!kind || (kind==='refresh' && cfg.refresh===null)) fail('unsupported_grant_type');
      const {tokenHash,challenge}=await prepareCredential(kind,input);
      return tx(()=>{
        const {row,g,p,selected,t}=readAuthenticatedCredential(kind,input,tokenHash,challenge,now());
        // A consumed, authenticated credential is never usable for admission or
        // minting. The serializable marker lets the caller finish the existing
        // exchange's replay revocation, even after the individual token expired.
        // No identity/props or custom Error fields cross RPC for this branch.
        if(row.consumed) return {kind:'authenticated_replay'};
        if(row.expires_at<=t) fail('invalid_grant');
        return {kind:'credential',...copy(ctx),clientId:g.client_id,familyId:g.id,scopes:selected,props:JSON.parse(g.props),epoch:p.epoch,expiresAt:row.expires_at,consumed:false};
      });
    }),
    authorize: safeAsync(async input => {
      if(!input || !credential(input.accessToken,'a')) fail('invalid_token');
      const hash=await digest(input.accessToken);
      return tx(()=>{
        const token=one('SELECT * FROM access_tokens WHERE hash=?',hash), p=principal(), t=now();
        const g=token&&grant(token.family_id);
        if(!token || token.expires_at<=t || token.epoch!==p.epoch || !alive(g,p,t)) fail('invalid_token');
        const scopes=JSON.parse(token.scopes);
        const required=input.requiredScopes===undefined||input.requiredScopes.length===0 ? [] : scopeList(input.requiredScopes);
        if(!subset(required,scopes)) fail('insufficient_scope');
        return {...copy(ctx),clientId:g.client_id,familyId:g.id,scopes,props:JSON.parse(g.props),epoch:p.epoch,expiresAt:token.expires_at};
      });
    }),
    revokeFamily: safeAsync(async input => { if(!input || !isText(input.familyId,128)) fail('invalid_request'); return tx(()=>{revoke(input.familyId); return {ok:true};}); }),
    revokeToken: safeAsync(async input => {
      if(!input || !isText(input.clientId)) fail('invalid_request');
      const hint=parseTokenHint(input.token);
      // RFC-style idempotent response: an unrecognized token never mutates a
      // principal or a family. Codes and route/family prefixes are not credentials.
      if(!hint || !['a','r'].includes(hint.kind)) return {ok:true};
      const hash=await digest(input.token), table=hint.kind==='a'?'access_tokens':'refresh_tokens';
      return tx(()=>{
        const token=one(`SELECT family_id FROM ${table} WHERE hash=?`,hash);
        const g=token&&grant(token.family_id);
        if(g && g.client_id===input.clientId) revoke(g.id);
        return {ok:true};
      });
    }),
    revokeAll: safeAsync(async ()=>tx(()=>{write('UPDATE principal SET epoch=epoch+1 WHERE id=1');return {ok:true};})),
    suspend: safeAsync(async ()=>tx(()=>{write("UPDATE principal SET status='suspended',epoch=epoch+1 WHERE id=1");return {ok:true};})),
    resume: safeAsync(async ()=>tx(()=>{write("UPDATE principal SET status='active' WHERE id=1");return {ok:true};})),
    cleanupExpired: safeAsync(async ()=>tx(()=>{
      const t=now();
      let removedReceipts=one('SELECT count(*) AS n FROM receipts WHERE expires_at<=?',t).n;
      write('DELETE FROM receipts WHERE expires_at<=?',t);
      // Retain every authentic generation while its family remains live. A
      // defensive descendant check also avoids deleting inconsistent future rows.
      const expired=rows('SELECT id FROM grants WHERE expires_at<=? AND NOT EXISTS (SELECT 1 FROM access_tokens WHERE family_id=grants.id AND expires_at>?) AND NOT EXISTS (SELECT 1 FROM refresh_tokens WHERE family_id=grants.id AND expires_at>?)',t,t,t);
      for(const g of expired){
        removedReceipts+=one('SELECT count(*) AS n FROM receipts WHERE family_id=?',g.id).n;
        for(const table of ['receipts','access_tokens','refresh_tokens','codes']) write(`DELETE FROM ${table} WHERE family_id=?`,g.id);
        write('DELETE FROM grants WHERE id=?',g.id);
      }
      return {removedReceipts,removedFamilies:expired.length};
    })),
  };
  async function exchange(kind,input) {
    const isCode=kind==='code', table=isCode?'codes':'refresh_tokens';
    const {tokenHash,challenge}=await prepareCredential(kind,input);
    const operationId=validateAttempt(input.attemptId);
    const fingerprint=await digest(json({kind,tokenHash,clientId:input.clientId,redirectUri:input.redirectUri??null,challenge,resource:input.resource??ctx.resource,scopes:input.scopes===undefined?null:scopeList(input.scopes)}));
    const snapshot=tx(()=>{
      const {row,g,p,selected,t}=readAuthenticatedCredential(kind,input,tokenHash,challenge,now());
      const receipt=one('SELECT * FROM receipts WHERE id=?',operationId);
      if(receipt) { if(receipt.digest!==fingerprint || receipt.family_id!==g.id || receipt.expires_at<=t) fail('invalid_grant'); return {receipt}; }
      if(row.consumed) { revoke(g.id); return {replay:true}; }
      if(row.expires_at<=t) fail('invalid_grant');
      return {row,g,p,selected,t};
    });
    if(snapshot.replay) fail('invalid_grant');
    if(snapshot.receipt) return receiptResult(snapshot.receipt);
    const {row,g,p,selected,t}=snapshot;
    const partition=await partitionPromise;
    const accessToken=randomToken('a',partition), accessHash=await digest(accessToken);
    const refreshToken=cfg.refresh?randomToken('r',partition):null, refreshHash=refreshToken?await digest(refreshToken):null;
    const expiresAt=Math.min(t+cfg.accessTtlMs,g.expires_at);
    const refreshExpiresAt=cfg.refresh?Math.min(t+cfg.refresh.tokenTtlMs,t+cfg.refresh.idleTtlMs,g.expires_at):null;
    const result={tokenType:'Bearer',accessToken,expiresAt,expiresIn:Math.floor((expiresAt-t)/1000),scopes:selected,scope:selected.join(' '),issuer:ctx.issuer,resource:ctx.resource,familyId:g.id};
    if(refreshToken) Object.assign(result,{refreshToken,refreshExpiresAt});
    const payload=await encrypt(operationId,fingerprint,result);
    const committed=tx(()=>{
      const {row:current,g:currentGrant,p:currentPrincipal,t:commitTime}=readAuthenticatedCredential(kind,input,tokenHash,challenge,now());
      const prior=one('SELECT * FROM receipts WHERE id=?',operationId);
      if(prior) { if(prior.digest!==fingerprint || prior.family_id!==g.id || prior.expires_at<=commitTime) fail('invalid_grant'); return {receipt:prior}; }
      if(current.consumed) {revoke(g.id);return {replay:true};}
      if(current.expires_at<=commitTime || expiresAt<=commitTime || (refreshExpiresAt!==null&&refreshExpiresAt<=commitTime)) fail('invalid_grant');
      if(currentGrant.version!==g.version || currentPrincipal.epoch!==p.epoch) fail('invalid_grant');
      write(`UPDATE ${table} SET consumed=1 WHERE hash=?`,tokenHash);
      write("UPDATE grants SET status='active',version=version+1 WHERE id=?",g.id);
      write('INSERT INTO access_tokens VALUES(?,?,?,?,?)',accessHash,g.id,JSON.stringify(selected),expiresAt,p.epoch);
      if(refreshHash) write('INSERT INTO refresh_tokens VALUES(?,?,?,?,?,?,0)',refreshHash,g.id,isCode?0:row.generation+1,isCode?null:tokenHash,JSON.stringify(selected),refreshExpiresAt);
      write('INSERT INTO receipts VALUES(?,?,?,?,?)',operationId,fingerprint,g.id,payload,Math.min(t+cfg.receiptTtlMs,expiresAt));
      faultInjector?.('beforeCommit');
      return {result};
    });
    if(committed.replay) fail('invalid_grant');
    if(committed.receipt) return receiptResult(committed.receipt);
    faultInjector?.('afterCommit');
    return committed.result;
  }
  return Object.freeze(methods);
}
