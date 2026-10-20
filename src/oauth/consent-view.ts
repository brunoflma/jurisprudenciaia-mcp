import { renderProductIcon } from "../service-page.js";
import { renderOAuthPage, escapeOAuthHtml as escapeHtml } from "./presentation.js";
export const OAUTH_BRAND = {
  ...{
    "product": "JurisprudênciaIA MCP",
    "tagline": "Pesquisa jurídica assistida",
    "background": "#17343b",
    "headline": "Pesquisa jurídica.<br><em>No seu assistente.</em>",
    "copy": "Autorize o aplicativo a usar as ferramentas do serviço JurisprudênciaIA com sua conta Google autorizada.",
    "note": "Use o e-mail autorizado nesta conexão. As respostas apoiam sua análise; confira as referências e os documentos na origem.",
    "theme": "--bg:#17343b;--panel:#214751;--panel-2:#2a5660;--gold:#dba88e;--cream:#f5f2ea;--body:#d8e2df;--muted:#b8cdcb;--action:#e0bca6;--action-text:#17343b",
    "brandName": "JurisprudênciaIA",
    "favicon": false
  },
  iconHtml: renderProductIcon("jurisprudenciaia"),
};

export function consentPage(clientName: string, token: string, nonce: string, localClient = false): string {
  const clientContext = localClient
    ? "Esta autorização volta para um aplicativo local neste computador. Confirme que você iniciou a conexão agora."
    : "Credenciais Google nunca são compartilhadas com este servidor.";
  return renderOAuthPage({
    ...OAUTH_BRAND,
    nonce: nonce,
    card: `<div class="request-head"><div class="request-label"><span>Aplicativo solicitante</span><span>Conexão MCP</span></div><h2 class="client-name">${escapeHtml(clientName)}</h2></div><ul class="permissions" aria-label="Permissões solicitadas">
<li class="permission"><span class="permission-mark" aria-hidden="true">01</span><div><span class="permission-code">Pesquisa</span><strong class="permission-title">Consulta às fontes integradas</strong><p class="permission-copy">Pesquisar jurisprudência e legislação pelos provedores configurados, com indicação da origem de cada resultado.</p></div></li>
<li class="permission"><span class="permission-mark" aria-hidden="true">02</span><div><span class="permission-code">Ferramentas</span><strong class="permission-title">Uso limitado ao conector</strong><p class="permission-copy">Executar apenas as ferramentas publicadas pelo servidor MCP; nenhuma escrita em sistemas externos.</p></div></li>
<li class="permission"><span class="permission-mark" aria-hidden="true">03</span><div><span class="permission-code">Identidade</span><strong class="permission-title">Conta Google verificada</strong><p class="permission-copy">Confirmar que seu e-mail está no cadastro de pessoas autorizadas a usar esta instância.</p></div></li></ul>
<form class="action" method="post" action="/authorize"><input type="hidden" name="transaction" value="${escapeHtml(token)}"><div class="trust"><span class="diamond" aria-hidden="true"></span><span><span class="trust-label">${localClient ? "Retorno local" : "Contexto"}</span><br>${clientContext}</span></div><button type="submit">Continuar com Google <span class="arrow" aria-hidden="true">→</span></button></form>`,
  });
}

