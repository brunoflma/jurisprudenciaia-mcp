import type { Ledger, LedgerContext, LedgerPolicy } from './core/index.mjs';
export interface RuntimeLedger extends Ledger { readonly context: Readonly<LedgerContext>; }
export interface LedgerNamespace { getByName(name:string): any; }
export interface LedgerDirectory {
  getOrCreate(context:LedgerContext):Promise<RuntimeLedger>;
  resolveToken(token:string,expected?:Partial<LedgerContext>):Promise<RuntimeLedger|null>;
}
export function createLedgerDurableObjectClass(Base:new(...args:any[])=>any,options:{
  readPolicy(env:any,context:LedgerContext):LedgerPolicy;
  readReceiptKey(env:any,context:LedgerContext):Uint8Array;
  clock():number;
  /** Synthetic fault injection only. Omit in product integrations. */
  testFaultInjector?:(stage:'beforeCommit'|'afterCommit',context:LedgerContext)=>void;
}):new(...args:any[])=>Ledger&{initialize(context:LedgerContext):Promise<LedgerContext>;getContext():Promise<LedgerContext>};
export function createLedgerDirectory(namespace:LedgerNamespace,service:Pick<LedgerContext,'issuer'|'resource'>&Partial<Pick<LedgerContext,'tenantId'|'subject'>>,options?:{retryTransientOnce?:boolean}):LedgerDirectory;
