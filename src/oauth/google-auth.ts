import type { AuthRequest, CompleteAuthorizationOptions } from "@cloudflare/workers-oauth-provider";
import { classifyOAuthRedirectUri, requireLoopbackPkce } from "./client-policy.js";
import type { OAuthStateNamespace } from "./state.js";
import {
  clearOAuthCookie,
  consumeOAuthTransaction,
  createOAuthTransaction,
  GOOGLE_CALLBACK_PATH,
  googleAuthorizationUrl
} from "./state.js";

const SCOPES = Object.freeze(["jurisprudence:read", "jurisprudenciaia:search"]);
const MAX_FORM_BYTES = 8_192;
const MAX_GOOGLE_BYTES = 32_768;
const GOOGLE_TOKEN_ERRORS = new Set(["invalid_client", "invalid_grant", "invalid_request", "unauthorized_client", "unsupported_grant_type"]);

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type GoogleOAuthEnv = {
  MCP_GOOGLE_CLIENT_ID?: string;
  MCP_GOOGLE_CLIENT_SECRET?: string;
  MCP_PUBLIC_ORIGIN?: string;
  MCP_GOOGLE_CALLBACK_ORIGIN?: string;
  MCP_ALLOWED_EMAILS?: string;
  OAUTH_PROVIDER: {
    parseAuthRequest(request: Request): Promise<AuthRequest>;
    lookupClient(clientId: string): Promise<{ clientName?: string } | null>;
    completeAuthorization(options: CompleteAuthorizationOptions): Promise<{ redirectTo: string }>;
  };
  OAUTH_STATE: OAuthStateNamespace;
};

const CONSENT_STYLES = `
:root{color-scheme:dark;--navy-deep:#0a1224;--navy-dark:#0e1a33;--gold-metallic:#c8a862;--gold-soft:#d9c08a;--cream:#f4f1e9;--body-blue:#b7c0d8;--steel-blue:#8e9aba;--hairline:rgba(244,241,233,.16);--frame:clamp(14px,2.1vw,40px)}
*{box-sizing:border-box}html{min-height:100%;background:var(--navy-deep)}body{min-height:100vh;margin:0;color:var(--cream);background:var(--navy-deep);font-family:"Libre Caslon Text",Georgia,serif;-webkit-font-smoothing:antialiased}body::before{content:"";position:fixed;inset:var(--frame);z-index:4;border:1px solid var(--hairline);pointer-events:none}
.shell{position:relative;min-height:100vh;overflow:hidden;padding:clamp(34px,4.8vw,78px) clamp(34px,7.2vw,132px);display:grid;grid-template-rows:auto 1fr auto}.shell::after{content:"AMF";position:absolute;right:-.04em;bottom:-.24em;color:rgba(244,241,233,.035);font:400 clamp(180px,33vw,620px)/.8 "Libre Caslon Text",Georgia,serif;letter-spacing:-.08em;pointer-events:none}
.masthead,.footer{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:24px;font-family:"IBM Plex Mono","Courier New",monospace;text-transform:uppercase;letter-spacing:.2em}.masthead{padding-bottom:18px;border-bottom:1px solid var(--hairline);font-size:11px}.brand{display:flex;align-items:center;gap:15px;font-weight:600;letter-spacing:.42em}.diamond{width:7px;height:7px;background:var(--gold-metallic);transform:rotate(45deg)}.context{color:var(--steel-blue);letter-spacing:.16em}
.content{position:relative;z-index:2;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(380px,.78fr);align-items:center;gap:clamp(50px,8vw,150px);padding:clamp(52px,8vh,112px) 0}.hero{max-width:760px;animation:reveal 620ms cubic-bezier(.2,.7,.2,1) both}.eyebrow,.request-label,.permission-code,.trust-label{color:var(--gold-metallic);font-family:"IBM Plex Mono","Courier New",monospace;font-size:11px;font-weight:500;letter-spacing:.24em;text-transform:uppercase}.section-number{margin:0 0 24px;color:var(--gold-metallic);font-size:clamp(58px,7.5vw,112px);line-height:.82}h1{max-width:720px;margin:0;font-size:clamp(48px,6.1vw,92px);font-weight:400;line-height:.94;letter-spacing:-.035em}.hero-copy{max-width:610px;margin:32px 0 0;color:var(--body-blue);font-size:clamp(18px,1.45vw,24px);line-height:1.55}.hero-copy em{color:var(--gold-soft)}
.consent{animation:reveal 620ms 110ms cubic-bezier(.2,.7,.2,1) both;border-top:1px solid var(--gold-metallic);border-bottom:1px solid var(--hairline);background:var(--navy-dark)}.request-head{padding:26px 30px 24px;border-bottom:1px solid var(--hairline)}.request-label{display:flex;justify-content:space-between;gap:18px}.request-label span:last-child{color:var(--steel-blue)}.client-name{margin:18px 0 0;overflow-wrap:anywhere;font-size:clamp(28px,3vw,43px);font-weight:400;line-height:1.08}.permissions{margin:0;padding:0 30px;list-style:none}.permission{display:grid;grid-template-columns:30px 1fr;gap:17px;padding:22px 0;border-bottom:1px solid var(--hairline)}.permission:last-child{border-bottom:0}.permission-mark{width:22px;height:22px;margin-top:2px;border:1px solid var(--gold-metallic);display:grid;place-items:center;color:var(--gold-metallic);font:500 12px/1 "IBM Plex Mono",monospace}.permission-title{display:block;margin:5px 0 6px;color:var(--cream);font-size:19px;font-weight:400}.permission-copy{margin:0;color:var(--steel-blue);font-size:15px;line-height:1.45}
.action{padding:26px 30px 30px;border-top:1px solid var(--hairline)}.trust{display:grid;grid-template-columns:7px 1fr;gap:14px;margin-bottom:22px;color:var(--body-blue);font-size:14px;line-height:1.45}.trust .diamond{margin-top:6px}button{width:100%;min-height:58px;border:1px solid var(--gold-metallic);border-radius:0;padding:15px 20px;color:var(--navy-deep);background:var(--gold-metallic);cursor:pointer;font-family:"IBM Plex Mono","Courier New",monospace;font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;transition:background-color 160ms ease,color 160ms ease,border-color 160ms ease}button:hover{border-color:var(--cream);background:var(--cream)}button:focus-visible{outline:2px solid var(--cream);outline-offset:5px}.arrow{display:inline-block;margin-left:14px;font-size:16px;transition:transform 160ms ease}button:hover .arrow{transform:translateX(4px)}.footer{padding-top:18px;border-top:1px solid var(--hairline);color:var(--steel-blue);font-size:9px}.footer strong{color:var(--cream);font-weight:500}
@keyframes reveal{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}@media(max-width:900px){.shell{padding:32px 34px}.content{grid-template-columns:1fr;gap:48px;padding:62px 0}.hero{max-width:660px}.consent{max-width:640px}.context{display:none}}@media(max-width:520px){:root{--frame:10px}.shell{padding:27px 24px}.masthead{font-size:9px}.brand{gap:10px}.content{padding:48px 0}.section-number{margin-bottom:18px}h1{font-size:clamp(42px,13vw,58px)}.hero-copy{margin-top:24px}.request-head,.action{padding-left:22px;padding-right:22px}.permissions{padding:0 22px}.footer{align-items:flex-start;flex-direction:column;line-height:1.5}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
`;

export function consentPage(clientName: string, token: string, nonce: string, localClient = false): string {
  const clientContext = localClient
    ? "O retorno desta autorização será entregue a um aplicativo local neste computador. Confirme que você iniciou esta conexão."
    : "Sua senha Google nunca é compartilhada com a AMF.";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0a1224"><title>Autorizar acesso · JurisprudênciaIA MCP</title><style nonce="${nonce}">${CONSENT_STYLES}</style></head><body>
<main class="shell" aria-labelledby="page-title"><header class="masthead"><div class="brand"><span>A M F</span><span class="diamond" aria-hidden="true"></span><span>JURIS</span></div><div class="context">Inteligência Jurídica Aplicada · OAuth 2.1</div></header>
<div class="content"><section class="hero" aria-describedby="hero-copy"><p class="eyebrow">Autorização segura</p><p class="section-number" aria-hidden="true">01</p><h1 id="page-title">Fontes oficiais.<br>Controle preciso.</h1><p class="hero-copy" id="hero-copy">Conecte sua identidade Google ao ambiente privado do <em>JurisprudênciaIA MCP</em>. Este conector complementa JurisprudênciaIA, IAJus, JusRatio e Perplexity com pesquisa e confirmação em fontes oficiais.</p></section>
<section class="consent" aria-label="Detalhes da solicitação de acesso"><div class="request-head"><div class="request-label"><span>Solicitação de acesso</span><span>Ref. 01/03</span></div><h2 class="client-name">${escapeHtml(clientName)}</h2></div><ul class="permissions" aria-label="Permissões solicitadas">
<li class="permission"><span class="permission-mark" aria-hidden="true">01</span><div><span class="permission-code">Pesquisa</span><strong class="permission-title">Fontes oficiais em tempo real</strong><p class="permission-copy">Pesquisar STJ, TCU, DataJud e LexML, com cache temporário e procedência explícita.</p></div></li>
<li class="permission"><span class="permission-mark" aria-hidden="true">02</span><div><span class="permission-code">Confirmação</span><strong class="permission-title">Documentos oficiais</strong><p class="permission-copy">Conferir referência, relator e trecho literal antes de liberar um precedente.</p></div></li>
<li class="permission"><span class="permission-mark" aria-hidden="true">03</span><div><span class="permission-code">Identidade</span><strong class="permission-title">Conta Google verificada</strong><p class="permission-copy">Confirmar que sua conta pertence à lista privada de usuários autorizados.</p></div></li></ul>
<form class="action" method="post" action="/authorize"><input type="hidden" name="transaction" value="${escapeHtml(token)}"><div class="trust"><span class="diamond" aria-hidden="true"></span><span><span class="trust-label">${localClient ? "Aplicativo local" : "Ambiente privado"}</span><br>${clientContext}</span></div><button type="submit">Continuar com Google <span class="arrow" aria-hidden="true">→</span></button></form></section></div>
<footer class="footer"><span><strong>AMF</strong> · Inteligência Jurídica Aplicada</span><span>Conexão protegida · Acesso revogável</span></footer></main></body></html>`;
}

export async function handleGoogleAuth(request: Request, env: GoogleOAuthEnv, fallback: () => Promise<Response>, googleFetch: FetchLike = fetch): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path !== "/authorize" && path !== GOOGLE_CALLBACK_PATH) return fallback();
  requireConfiguration(env);
  if (path === "/authorize" && request.method === "GET") return showConsent(request, env);
  if (path === "/authorize" && request.method === "POST") return startGoogle(request, env);
  if (path === GOOGLE_CALLBACK_PATH && request.method === "GET") return finishGoogle(request, env, googleFetch);
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, POST" } });
}

async function showConsent(request: Request, env: GoogleOAuthEnv): Promise<Response> {
  const authRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  requireLoopbackPkce(authRequest);
  const client = await env.OAUTH_PROVIDER.lookupClient(authRequest.clientId);
  if (!client) throw new Error("oauth_unknown_client");
  const transaction = await createOAuthTransaction(env.OAUTH_STATE, "consent", authRequest);
  const nonce = crypto.randomUUID();
  const localClient = classifyOAuthRedirectUri(authRequest.redirectUri) === "loopback";
  return new Response(consentPage(client.clientName ?? "Claude", transaction.token, nonce, localClient), { headers: {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": `default-src 'none'; style-src 'nonce-${nonce}'; form-action 'self' https://accounts.google.com; base-uri 'none'; frame-ancestors 'none'`,
    "set-cookie": transaction.setCookie,
    "cache-control": "no-store",
    "pragma": "no-cache",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff"
  }});
}

async function startGoogle(request: Request, env: GoogleOAuthEnv): Promise<Response> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/x-www-form-urlencoded")) throw new Error("oauth_invalid_form");
  const form = new URLSearchParams(new TextDecoder().decode(await readLimited(request, MAX_FORM_BYTES)));
  const token = form.get("transaction") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(token)) throw new Error("oauth_invalid_transaction");
  const authRequest = await consumeOAuthTransaction(env.OAUTH_STATE, "consent", token, request);
  const state = await createOAuthTransaction(env.OAUTH_STATE, "google", authRequest);
  const callbackOrigin = env.MCP_GOOGLE_CALLBACK_ORIGIN || env.MCP_PUBLIC_ORIGIN!;
  return redirect(googleAuthorizationUrl({ clientId: env.MCP_GOOGLE_CLIENT_ID!, publicOrigin: callbackOrigin, state: state.token }), [clearOAuthCookie("consent"), state.setCookie]);
}

async function finishGoogle(request: Request, env: GoogleOAuthEnv, googleFetch: FetchLike): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!code || !state) throw new Error("oauth_invalid_google_callback");
  console.log(JSON.stringify({ operation: "oauth_google_callback", stage: "received" }));
  const authRequest = await consumeOAuthTransaction(env.OAUTH_STATE, "google", state, request);
  console.log(JSON.stringify({ operation: "oauth_google_callback", stage: "state_verified" }));
  const accessToken = await exchangeGoogleCode(code, env, googleFetch);
  console.log(JSON.stringify({ operation: "oauth_google_callback", stage: "code_exchanged" }));
  const profile = await googleProfile(accessToken, googleFetch);
  console.log(JSON.stringify({ operation: "oauth_google_callback", stage: "profile_verified" }));
  const identity = allowedIdentity(profile, env);
  const scopes = authRequest.scope.length > 0 ? SCOPES.filter((scope) => authRequest.scope.includes(scope)) : [...SCOPES];
  const props = { tenantId: "jurisia", userId: profile.sub, email: identity.email, name: identity.name, scopes };
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({ request: authRequest, userId: profile.sub, metadata: { email: identity.email }, scope: scopes, props });
  console.log(JSON.stringify({ operation: "oauth_google_callback", stage: "authorization_completed" }));
  return redirect(redirectTo, [clearOAuthCookie("google")]);
}

async function exchangeGoogleCode(code: string, env: GoogleOAuthEnv, googleFetch: FetchLike): Promise<string> {
  const callbackOrigin = env.MCP_GOOGLE_CALLBACK_ORIGIN || env.MCP_PUBLIC_ORIGIN!;
  const body = new URLSearchParams({ code, client_id: env.MCP_GOOGLE_CLIENT_ID!, client_secret: env.MCP_GOOGLE_CLIENT_SECRET!, redirect_uri: new URL(GOOGLE_CALLBACK_PATH, callbackOrigin).href, grant_type: "authorization_code" });
  const { response, payload } = await fetchJsonBounded(googleFetch, new Request("https://oauth2.googleapis.com/token", { method: "POST", body }), 15_000, MAX_GOOGLE_BYTES);
  if (!response.ok) {
    const record = parseRecord(payload);
    const candidate = typeof record.error === "string" && GOOGLE_TOKEN_ERRORS.has(record.error) ? record.error : "unknown";
    console.error(JSON.stringify({ operation: "oauth_google_token", status: response.status, code: candidate }));
    throw new Error(`oauth_google_token_failed:${candidate}`);
  }
  const record = parseRecord(payload);
  if (typeof record.access_token !== "string" || !record.access_token) throw new Error("oauth_google_token_invalid");
  return record.access_token;
}

async function googleProfile(accessToken: string, googleFetch: FetchLike): Promise<{ sub: string; email: string; name: string }> {
  const { response, payload } = await fetchJsonBounded(googleFetch, new Request("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } }), 15_000, MAX_GOOGLE_BYTES);
  if (!response.ok) throw new Error("oauth_google_userinfo_failed");
  const record = parseRecord(payload);
  if (record.email_verified !== true || typeof record.sub !== "string" || typeof record.email !== "string") throw new Error("oauth_google_identity_invalid");
  return { sub: record.sub, email: record.email, name: typeof record.name === "string" ? record.name : record.email };
}

function allowedIdentity(profile: { email: string; name: string }, env: GoogleOAuthEnv): { email: string; name: string } {
  const allowed = (env.MCP_ALLOWED_EMAILS ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (allowed.length === 0) throw new Error("oauth_allowlist_missing");
  const email = profile.email.trim().toLowerCase();
  if (!allowed.includes(email)) throw new Error("oauth_user_not_allowed");
  return { email, name: profile.name.trim() || email };
}

function requireConfiguration(env: GoogleOAuthEnv): void {
  const required = {
    client_id: env.MCP_GOOGLE_CLIENT_ID,
    client_secret: env.MCP_GOOGLE_CLIENT_SECRET,
    public_origin: env.MCP_PUBLIC_ORIGIN
  };
  for (const [name, value] of Object.entries(required)) {
    if (!value?.trim()) throw new Error(`oauth_configuration_missing:${name}`);
  }
  if (!env.OAUTH_STATE || !env.OAUTH_PROVIDER) throw new Error("oauth_binding_missing");
}

async function fetchJsonBounded(fetcher: FetchLike, request: Request, timeoutMs: number, maxBytes: number): Promise<{ response: Response; payload: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(new Request(request, { signal: controller.signal }));
    const payload = await readJsonLimited(response, maxBytes);
    return { response, payload };
  }
  finally { clearTimeout(timer); }
}

async function readLimited(request: Request, limit: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declared) || declared > limit) throw new Error("oauth_body_too_large");
  return readStreamLimited(request.body, limit);
}

async function readStreamLimited(body: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array> {
  const reader = body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) { await reader.cancel(); throw new Error("oauth_body_too_large"); }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

async function readJsonLimited(response: Response, limit: number): Promise<unknown> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declared) || declared > limit) throw new Error("oauth_body_too_large");
  return JSON.parse(new TextDecoder().decode(await readStreamLimited(response.body, limit))) as unknown;
}

function redirect(location: string, cookies: string[]): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store", "Pragma": "no-cache" });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("oauth_invalid_json");
  return value as Record<string, unknown>;
}
