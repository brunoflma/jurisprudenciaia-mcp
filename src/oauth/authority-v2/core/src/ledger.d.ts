export interface SqlStorage { sql: { exec(query:string,...bindings:(string|number|null)[]): { toArray(): Record<string,any>[] } }; transactionSync<T>(fn:()=>T):T; }
export interface LedgerContext { issuer:string; resource:string; tenantId:string; subject:string; }
export interface LedgerPolicy { allowedScopes:string[]; codeTtlMs:number; accessTtlMs:number; receiptTtlMs:number; refresh:null|{tokenTtlMs:number;absoluteTtlMs:number;idleTtlMs:number}; }
export interface AuthorizationInput {clientId:string;redirectUri:string;scopes:string[];codeChallenge:string;props?:unknown;}
export interface ExchangeInput {code:string;clientId:string;redirectUri:string;codeVerifier:string;resource?:string;scopes?:string[];attemptId?:string;}
export interface RefreshInput {refreshToken:string;clientId:string;resource?:string;scopes?:string[];attemptId?:string;}
export interface TokenResult {tokenType:'Bearer';accessToken:string;expiresAt:number;expiresIn:number;scopes:string[];scope:string;issuer:string;resource:string;familyId:string;refreshToken?:string;refreshExpiresAt?:number;}
export interface AuthorizedContext extends LedgerContext {clientId:string;familyId:string;scopes:string[];props:unknown;epoch:number;expiresAt:number;}
export type CredentialInspectionInput=({grantType:'authorization_code'}&ExchangeInput)|({grantType:'refresh_token'}&RefreshInput);
export type CredentialInspection=({kind:'credential';consumed:false}&AuthorizedContext)|{kind:'authenticated_replay'};
export interface Ledger {issueAuthorization(input:AuthorizationInput):Promise<{code:string;familyId:string;expiresAt:number}>;exchangeCode(input:ExchangeInput):Promise<TokenResult>;refresh(input:RefreshInput):Promise<TokenResult>;inspectCredential(input:CredentialInspectionInput):Promise<CredentialInspection>;authorize(input:{accessToken:string;requiredScopes?:string[]}):Promise<AuthorizedContext>;revokeFamily(input:{familyId:string}):Promise<{ok:true}>;revokeToken(input:{token:string;clientId:string}):Promise<{ok:true}>;revokeAll():Promise<{ok:true}>;suspend():Promise<{ok:true}>;resume():Promise<{ok:true}>;cleanupExpired():Promise<{removedReceipts:number;removedFamilies:number}>;}
export class LedgerError extends Error {code:string;status:number;}
export function authorityPartition(context:LedgerContext):Promise<string>;
export function parseTokenHint(token:unknown):{kind:'c'|'a'|'r';partitionId:string}|null;
export function readLedgerContext(storage:SqlStorage):LedgerContext;
export function createLedger(options:{storage:SqlStorage;clock:()=>number;context:LedgerContext;policy:LedgerPolicy;receiptKey:Uint8Array;faultInjector?:(stage:'beforeCommit'|'afterCommit')=>void}):Ledger;
