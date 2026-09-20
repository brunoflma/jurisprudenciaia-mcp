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

const SECURITY_HEADERS = {
  "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "x-xss-protection": "1; mode=block"
} as const;
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
:root{
  color-scheme:dark;
  --ink:#0b1014;
  --panel:#10171c;
  --panel-2:#131d23;
  --line:rgba(226,232,240,.12);
  --copper:#d98a4a;
  --copper-soft:#e6b183;
  --cream:#f0eee7;
  --muted:#a8b4bd;
  --steel:#8d9aa3;
}
*{box-sizing:border-box}
html{min-height:100%;background:var(--ink)}
body{min-height:100vh;margin:0;color:var(--cream);background:radial-gradient(120% 120% at 14% 10%, #142029 0%, #0b1014 52%, #07090c 100%);font-family:Georgia,"Times New Roman",serif;-webkit-font-smoothing:antialiased}
.frame{position:relative;min-height:100vh;padding:clamp(22px,4.4vw,72px) clamp(22px,5.6vw,120px)}
.frame::before{content:"";position:fixed;inset:clamp(12px,1.8vw,28px);border:1px solid rgba(217,138,74,.32);pointer-events:none}
.masthead,.foot{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:20px;font-family:ui-monospace,"Cascadia Code","Courier New",monospace;text-transform:uppercase;letter-spacing:.22em}
.masthead{padding-bottom:16px;border-bottom:1px solid var(--line);font-size:11px;color:var(--steel)}
.brand{display:flex;align-items:center;gap:12px;color:var(--cream);letter-spacing:.34em;font-weight:500}
.brand .dot{width:9px;height:9px;border:1px solid var(--copper);transform:rotate(45deg)}
.context{color:var(--steel)}
.content{position:relative;z-index:2;display:grid;grid-template-columns:minmax(0,1.08fr) minmax(360px,.82fr);gap:clamp(48px,7.2vw,140px);align-items:center;padding:clamp(44px,7vh,104px) 0}
.hero{max-width:760px;animation:rise 580ms cubic-bezier(.2,.7,.2,1) both}
.eyebrow,.label,.code{color:var(--copper);font-family:ui-monospace,"Cascadia Code","Courier New",monospace;font-size:11px;font-weight:500;letter-spacing:.24em;text-transform:uppercase}
.kicker{margin:20px 0 14px;color:var(--steel);font:500 12px/1.6 ui-monospace,"Cascadia Code","Courier New",monospace}
h1{max-width:680px;margin:0;font-size:clamp(46px,5.8vw,86px);line-height:.95;font-weight:400;letter-spacing:-.03em}
.lead{max-width:600px;margin:26px 0 0;color:var(--muted);font-size:clamp(17px,1.35vw,21px);line-height:1.62}
.lead em{color:var(--copper-soft);font-style:normal}
.hero-list{display:flex;flex-wrap:wrap;gap:10px 22px;margin-top:18px}
.hero-list span{display:inline-flex;align-items:center;gap:8px;color:var(--muted);font-size:12.5px}
.hero-list span::before{content:"";width:6px;height:6px;border:1px solid var(--copper);transform:rotate(45deg);display:inline-block}
.consent{animation:rise 620ms 90ms cubic-bezier(.2,.7,.2,1) both;border:1px solid var(--line);background:linear-gradient(180deg, rgba(255,255,255,.02), rgba(255,255,255,0)) ,var(--panel);box-shadow:0 24px 60px rgba(0,0,0,.4)}
.request-head{padding:24px 28px 22px;border-bottom:1px solid var(--line);background:var(--panel-2)}
.label{display:flex;justify-content:space-between;gap:16px}
.label span:last-child{color:var(--steel)}
.client-name{margin:14px 0 0;overflow-wrap:anywhere;font-size:clamp(26px,2.6vw,38px);font-weight:400;line-height:1.08}
.permissions{margin:0;padding:0 28px;list-style:none}
.permission{display:grid;grid-template-columns:26px 1fr;gap:16px;padding:18px 0;border-bottom:1px solid var(--line)}
.permission:last-child{border-bottom:0}
.mark{width:20px;height:20px;margin-top:1px;border:1px solid var(--copper);display:grid;place-items:center;color:var(--copper);font:600 11px/1 ui-monospace,"Cascadia Code",monospace}
.title{display:block;margin:4px 0 6px;color:var(--cream);font-size:17.5px;font-weight:500}
.copy{margin:0;color:var(--muted);font-size:14.5px;line-height:1.5}
.action{padding:24px 28px 28px;border-top:1px solid var(--line)}
.trust{display:grid;grid-template-columns:9px 1fr;gap:14px;margin-bottom:20px;color:var(--muted);font-size:13.5px;line-height:1.5}
.trust .bar{width:9px;height:100%;background:linear-gradient(180deg, var(--copper), rgba(217,138,74,.18))}
button{width:100%;min-height:56px;border:1px solid var(--copper);padding:14px 20px;color:var(--ink);background:var(--copper);cursor:pointer;font:600 12px/1 ui-monospace,"Cascadia Code","Courier New",monospace;letter-spacing:.18em;text-transform:uppercase;transition:background-color .16s ease,border-color .16s ease,color .16s ease}
button:hover{border-color:var(--cream);background:var(--cream);color:var(--ink)}
button:focus-visible{outline:2px solid var(--cream);outline-offset:4px}
.foot{padding-top:16px;border-top:1px solid var(--line);color:var(--steel);font-size:10px}
.foot strong{color:var(--cream);font-weight:500}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@media(max-width:900px){.frame{padding:24px 26px}.content{grid-template-columns:1fr;gap:44px;padding:56px 0}.consent{max-width:640px}.context{display:none}}
@media(max-width:520px){.frame{padding:22px 20px}.content{padding:44px 0}h1{font-size:clamp(40px,12vw,54px)}.lead{margin-top:20px}.request-head,.action{padding-left:20px;padding-right:20px}.permissions{padding:0 20px}.foot{flex-direction:column;align-items:flex-start;line-height:1.5}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
`;

export function consentPage(clientName: string, token: string, nonce: string, localClient = false): string {
  const clientContext = localClient
    ? "Esta autorização volta para um aplicativo local neste computador. Confirme que você iniciou a conexão agora."
    : "Credenciais Google nunca são compartilhadas com este servidor.";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b1014"><title>Autorizar acesso · JurisprudênciaIA MCP</title><style nonce="${nonce}">${CONSENT_STYLES}</style></head><body>
<main class="frame" aria-labelledby="page-title"><header class="masthead"><div class="brand"><span class="dot" aria-hidden="true"></span><span>JurisprudênciaIA</span></div><div class="context">OAuth 2.1</div></header>
<div class="content"><section class="hero" aria-describedby="hero-copy"><p class="eyebrow">Autorização de acesso</p><p class="kicker">Servidor MCP privado · somente contas autorizadas</p><h1 id="page-title">Pesquisa jurídica com controle.</h1><p class="lead" id="hero-copy">Conecte sua conta Google para liberar as ferramentas jurídicas desta instância. A autorização é de uso único e pode ser revogada a qualquer momento.</p><div class="hero-list"><span>Sem Client ID ou Secret no cliente</span><span>Identidade verificada por allowlist</span><span>Auditoria por request ID</span></div></section>
<section class="consent" aria-label="Detalhes da solicitação de acesso"><div class="request-head"><div class="label"><span>Solicitação de acesso</span><span>Ref. 01/03</span></div><h2 class="client-name">${escapeHtml(clientName)}</h2></div><ul class="permissions" aria-label="Permissões solicitadas">
<li class="permission"><span class="mark" aria-hidden="true">01</span><div><span class="code">Pesquisa</span><strong class="title">Consulta às fontes integradas</strong><p class="copy">Pesquisar jurisprudência e legislação pelos provedores configurados, com procedência explícita por request ID.</p></div></li>
<li class="permission"><span class="mark" aria-hidden="true">02</span><div><span class="code">Ferramentas</span><strong class="title">Uso limitado ao conector</strong><p class="copy">Executar apenas as ferramentas publicadas pelo servidor MCP; nenhuma escrita em sistemas externos.</p></div></li>
<li class="permission"><span class="mark" aria-hidden="true">03</span><div><span class="code">Identidade</span><strong class="title">Conta Google verificada</strong><p class="copy">Confirmar que seu e-mail está na allowlist de quem pode usar esta instância.</p></div></li></ul>
<form class="action" method="post" action="/authorize"><input type="hidden" name="transaction" value="${escapeHtml(token)}"><div class="trust"><span class="bar" aria-hidden="true"></span><span><span class="code">${localClient ? "Retorno local" : "Contexto"}</span><br>${clientContext}</span></div><button type="submit">Continuar com Google&nbsp;<span aria-hidden="true">→</span></button></form></section></div>
<footer class="foot"><span><strong>JurisprudênciaIA</strong> · servidor MCP auto-hospedado</span><span>Conexão protegida · acesso revogável</span></footer></main></body></html>`;
}

export async function handleGoogleAuth(request: Request, env: GoogleOAuthEnv, fallback: () => Promise<Response>, googleFetch: FetchLike = fetch): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path !== "/authorize" && path !== GOOGLE_CALLBACK_PATH) return fallback();
  requireConfiguration(env);
  if (path === "/authorize" && request.method === "GET") return showConsent(request, env);
  if (path === "/authorize" && request.method === "POST") return startGoogle(request, env);
  if (path === GOOGLE_CALLBACK_PATH && request.method === "GET") return finishGoogle(request, env, googleFetch);
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, POST", ...SECURITY_HEADERS } });
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
    ...SECURITY_HEADERS
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
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: authRequest,
    userId: profile.sub,
    metadata: { email: identity.email },
    scope: scopes,
    props,
    // Evita que o callback dependa da cota diaria de OAUTH_KV.list().
    revokeExistingGrants:false
  });
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

// ⚡ Bolt: Cache parsed allowed emails to prevent repeated array allocations
// (.split, .map, .filter) and reduce GC overhead on OAuth callbacks.
let cachedAllowedEmailsStr: string | undefined;
let cachedAllowedEmails: string[] = [];

function allowedIdentity(profile: { email: string; name: string }, env: GoogleOAuthEnv): { email: string; name: string } {
  if (cachedAllowedEmailsStr !== env.MCP_ALLOWED_EMAILS) {
    cachedAllowedEmailsStr = env.MCP_ALLOWED_EMAILS;
    cachedAllowedEmails = (env.MCP_ALLOWED_EMAILS ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  }
  if (cachedAllowedEmails.length === 0) throw new Error("oauth_allowlist_missing");
  const email = profile.email.trim().toLowerCase();
  if (!cachedAllowedEmails.includes(email)) throw new Error("oauth_user_not_allowed");
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
  const headers = new Headers({ Location: location, "Cache-Control": "no-store", "Pragma": "no-cache", ...SECURITY_HEADERS });
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
