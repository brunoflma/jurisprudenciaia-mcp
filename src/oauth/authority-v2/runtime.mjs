/* Disabled integration candidate: no Cloudflare import, binding, env read or HTTP handler. */
import { createLedger, LedgerError, authorityPartition, parseTokenHint, readLedgerContext } from './core/index.mjs';

const codes=new Set(['invalid_request','invalid_grant','invalid_scope','invalid_target','unsupported_grant_type','invalid_token','insufficient_scope','temporarily_unavailable','principal_suspended','invalid_configuration']);
const sanitized=error=>error instanceof LedgerError?error:new LedgerError(codes.has(error?.message)?error.message:'temporarily_unavailable');
const safe=async operation=>{try{return await operation();}catch(error){throw sanitized(error);}};
const contextMatches=(context,expected)=>['issuer','resource','tenantId','subject'].every(key=>expected[key]===undefined||context[key]===expected[key]);
const validService=service=>service&&typeof service.issuer==='string'&&service.issuer.length>0&&typeof service.resource==='string'&&service.resource.length>0;
const forwarded=['issueAuthorization','inspectCredential','exchangeCode','refresh','authorize','revokeFamily','revokeToken','revokeAll','suspend','resume','cleanupExpired'];
const transient=error=>error?.code==='temporarily_unavailable'||error?.message==='temporarily_unavailable'||error?.retryable===true;

/**
 * Build an INTERNAL RPC class for one authority per issuer/resource/tenant/subject.
 * Base is injected (e.g. DurableObject from cloudflare:workers in a separate file).
 * Policy, receipt key and clock are mandatory injections; no defaults or env names.
 * initialize() is restricted by deployment topology to trusted issuance callers.
 * Never expose the binding or lifecycle methods through a public HTTP/MCP route.
 * testFaultInjector is an optional synchronous fixture hook; omit in any product.
 */
export function createLedgerDurableObjectClass(Base,{readPolicy,readReceiptKey,clock,testFaultInjector}={}) {
  if(typeof Base!=='function'||typeof readPolicy!=='function'||typeof readReceiptKey!=='function'||typeof clock!=='function'||(testFaultInjector!==undefined&&typeof testFaultInjector!=='function')) throw new LedgerError('invalid_configuration');
  return class LedgerAuthority extends Base {
    constructor(ctx,env) {super(ctx,env);this.ledgerState=ctx;this.ledgerEnv=env;}
    #ledgerFrom(context) {
      return createLedger({storage:this.ledgerState.storage,context,policy:readPolicy(this.ledgerEnv,context),receiptKey:readReceiptKey(this.ledgerEnv,context),clock,
        ...(testFaultInjector?{faultInjector:stage=>testFaultInjector(stage,context)}:{})});
    }
    initialize(context) {return safe(()=>{this.#ledgerFrom(context);return readLedgerContext(this.ledgerState.storage);});}
    getContext() {return safe(()=>readLedgerContext(this.ledgerState.storage));}
    // Loading by token never bootstraps: metadata must already exist.
    #invoke(method,input) {return safe(()=>{const context=readLedgerContext(this.ledgerState.storage);return this.#ledgerFrom(context)[method](input);});}
    issueAuthorization(input) {return this.#invoke('issueAuthorization',input);}
    inspectCredential(input) {return this.#invoke('inspectCredential',input);}
    exchangeCode(input) {return this.#invoke('exchangeCode',input);}
    refresh(input) {return this.#invoke('refresh',input);}
    authorize(input) {return this.#invoke('authorize',input);}
    revokeFamily(input) {return this.#invoke('revokeFamily',input);}
    revokeToken(input) {return this.#invoke('revokeToken',input);}
    revokeAll() {return this.#invoke('revokeAll');}
    suspend() {return this.#invoke('suspend');}
    resume() {return this.#invoke('resume');}
    cleanupExpired() {return this.#invoke('cleanupExpired');}
  };
}

/** Safe namespace lookup; a syntactically valid token hint is never identity proof. */
export function createLedgerDirectory(namespace,service,{retryTransientOnce=false}={}) {
  if(typeof namespace?.getByName!=='function'||!validService(service)||typeof retryTransientOnce!=='boolean') throw new LedgerError('invalid_configuration');
  const fixed={...service};
  const checked=async(context,partitionId,expected={})=>{
    if(!contextMatches(context,fixed)||!contextMatches(context,expected)||await authorityPartition(context)!==partitionId) throw new LedgerError('invalid_token');
    return context;
  };
  const forward=async(stub,method,input)=>{
    const eligible=retryTransientOnce&&['exchangeCode','refresh'].includes(method);
    // The caller is the internal adapter, which must discard any client-supplied
    // attemptId. No public-request or HTTP retry is performed by this module.
    const payload=eligible?{...input,attemptId:input?.attemptId??crypto.randomUUID()}:input;
    try{return await stub[method](payload);}catch(error){
      if(!eligible||!transient(error))throw sanitized(error);
      try{return await stub[method](payload);}catch(second){throw sanitized(second);}
    }
  };
  const facade=(stub,context)=>Object.freeze({context:Object.freeze({...context}),...Object.fromEntries(forwarded.map(method=>[method,input=>forward(stub,method,input)]))});
  return Object.freeze({
    /** Trusted admitted issuance only. Never call this from a token hint. */
    async getOrCreate(context) {
      if(!contextMatches(context,fixed)) throw new LedgerError('invalid_token');
      const partitionId=await authorityPartition(context);const stub=namespace.getByName(partitionId);
      const persisted=await safe(()=>stub.initialize(context));await checked(persisted,partitionId,context);
      return facade(stub,persisted);
    },
    /** Read-only lookup until the adapter invokes a full credential operation. */
    async resolveToken(token,expected={}) {
      const hint=parseTokenHint(token);if(!hint)return null;
      const stub=namespace.getByName(hint.partitionId);
      try {
        const context=await safe(()=>stub.getContext());await checked(context,hint.partitionId,expected);
        return facade(stub,context);
      } catch(error) {const failure=sanitized(error);if(failure.code==='invalid_token')return null;throw failure;}
    }
  });
}
