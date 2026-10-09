function esc(value: unknown) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}

// An open reference book, with a highlighted passage on its right-hand page.
// The mark remains legible at favicon size and uses the page's ink/paper palette.
export function renderProductIcon(_service: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-labelledby="brand-title"><title id="brand-title">JurisprudênciaIA — livro aberto e passagem em destaque</title><rect width="64" height="64" rx="13" fill="#17343b"/><path d="M11 18c7-2 14-1 21 3 7-4 14-5 21-3v29c-7-2-14-1-21 3-7-4-14-5-21-3Z" fill="none" stroke="#f8f4eb" stroke-width="3.4" stroke-linejoin="round"/><path d="M32 21v29M17 26l9 2M17 33l9 2M17 40l9 2" stroke="#f8f4eb" stroke-width="2.8" stroke-linecap="round"/><path d="M39 26l8-2M39 33l8-2M39 40l8-2" stroke="#e9ac88" stroke-width="3.6" stroke-linecap="round"/></svg>`;
}

export const SERVICE_PAGE_CSS = `
@font-face{font-family:Caslon;src:url('/fonts/libre-caslon-text-400.woff2') format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:Caslon;src:url('/fonts/libre-caslon-text-italic-400.woff2') format('woff2');font-weight:400;font-style:italic;font-display:swap}
@font-face{font-family:Outfit;src:url('/fonts/outfit-400.woff2') format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:Outfit;src:url('/fonts/outfit-500.woff2') format('woff2');font-weight:500;font-display:swap}
@font-face{font-family:Outfit;src:url('/fonts/outfit-700.woff2') format('woff2');font-weight:700;font-display:swap}
:root{--paper:#f5f2ea;--white:#fffcf6;--ink:#17343b;--muted:#536569;--accent:#a65334;--line:#cecfc3;--soft:#e9e9df;--display:Caslon,Georgia,serif;--body:Outfit,sans-serif}
*{box-sizing:border-box}html{scroll-padding-top:32px}body{margin:0;background:var(--paper);color:var(--ink);font:400 16px/1.6 var(--body);-webkit-font-smoothing:antialiased}::selection{background:#dfb59a;color:var(--ink)}a{color:inherit;text-decoration:none}button,input{font:inherit}img{display:block;max-width:100%}h1,h2,h3,p{margin:0}h1,h2{font-family:var(--display);font-weight:400}em{font-weight:400}a:focus-visible,code:focus-visible{outline:3px solid var(--accent);outline-offset:6px}.wrap{width:min(1180px,calc(100% - 96px));margin-inline:auto}.skip{position:fixed;top:12px;left:12px;z-index:10;padding:10px 18px;background:var(--ink);color:var(--white);transform:translateY(-160%)}.skip:focus{transform:none}
.topbar{display:flex;justify-content:space-between;align-items:center;gap:28px;padding:30px 0;border-bottom:1px solid var(--line)}.brand{display:flex;align-items:center;gap:13px}.brand img{width:43px;height:43px}.wordmark{font-size:23px;font-weight:500;letter-spacing:-.65px;line-height:1.2}.wordmark span{color:var(--accent);font-weight:400}.brand-note{display:block;font-size:10px;letter-spacing:1.7px;text-transform:uppercase;color:var(--muted);margin-top:5px}.topnav{display:flex;align-items:center;gap:30px;font-size:13px}.topnav a{padding:6px 0}.topnav a:hover{color:var(--accent)}.nav-connect{border-bottom:1px solid var(--ink)}.arrow{margin-left:9px;font-family:var(--body)}
.hero{display:grid;grid-template-columns:1.15fr .85fr;align-items:center;gap:84px;padding:76px 0 68px}.eyebrow{display:flex;align-items:center;gap:10px;font-size:10px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:var(--muted)}.eyebrow:before{content:'';width:25px;height:1px;background:var(--accent)}h1{font-size:clamp(42px,4.9vw,67px);line-height:1.13;letter-spacing:-2.1px;margin-top:28px}h1 em{display:block;color:var(--accent);margin-top:9px}.lead{max-width:440px;color:var(--muted);font-size:17px;line-height:1.7;margin-top:28px}.hero-actions{display:flex;align-items:center;gap:25px;flex-wrap:wrap;margin-top:32px}.button{display:inline-flex;justify-content:space-between;align-items:center;gap:30px;padding:13px 20px;background:var(--ink);color:var(--white);font-size:13px;transition:background .18s,transform .18s}.button:hover{background:#284d52;transform:translateY(-2px)}.text-link{font-size:12px;border-bottom:1px solid var(--line);padding:5px 0}.text-link:hover{border-color:var(--accent);color:var(--accent)}.hero-note{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--muted);margin-top:22px}.hero-note:before{content:'';width:5px;height:5px;border-radius:50%;background:var(--accent)}
.query{position:relative;background:var(--white);border:1px solid #d9d8cc;padding:29px 31px 0;margin:0 9px 9px 0;box-shadow:9px 9px 0 -1px var(--paper),9px 9px 0 0 #d9d8cc}.query-top{display:flex;justify-content:space-between;align-items:center;padding-bottom:17px;border-bottom:1px solid var(--line);font-size:9px;letter-spacing:1.6px;text-transform:uppercase;color:var(--muted)}.query-top span:last-child{color:var(--accent)}.quote-sign{font:82px/.85 var(--display);height:62px;margin-top:27px;color:var(--accent)}.query blockquote{margin:0;font:400 26px/1.43 var(--display);letter-spacing:-.45px;max-width:330px}.query-caption{font-size:11px;color:var(--muted);margin-top:19px;padding-bottom:25px}.query-tags{display:flex;gap:7px;flex-wrap:wrap;border-top:1px solid var(--line);padding:17px 0 22px}.query-tags span{font-size:10px;padding:4px 10px;border:1px solid var(--line);color:var(--muted);border-radius:2px}.query-footer{display:flex;justify-content:space-between;align-items:center;padding:18px 0;border-top:1px solid var(--line);font-size:9px;letter-spacing:1.5px;text-transform:uppercase}.query-footer b{font-size:20px;font-weight:400;color:var(--accent)}
.capabilities{display:grid;grid-template-columns:1fr 1.15fr;gap:84px;padding:48px 0 65px;border-top:1px solid var(--line)}.chapter-label{font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:var(--accent)}.capabilities h2{font-size:35px;line-height:1.3;letter-spacing:-1px;max-width:360px;margin-top:18px}.section-intro{font-size:14px;color:var(--muted);max-width:345px;margin-top:20px}.feature{display:grid;grid-template-columns:36px 1fr;gap:18px;padding:21px 0;border-bottom:1px solid var(--line)}.feature:first-child{padding-top:3px}.feature:last-child{border-bottom:0;padding-bottom:0}.feature-no{font:italic 18px/1.5 var(--display);color:var(--accent)}.feature h3{font:500 16px/1.4 var(--body)}.feature p{font-size:13px;color:var(--muted);margin-top:7px;max-width:425px}.feature small{display:block;font-size:10px;letter-spacing:.7px;margin-top:9px;color:var(--muted)}
.connection{position:relative;background:var(--ink);color:var(--white);padding:42px 46px 38px;display:grid;grid-template-columns:.9fr 1.1fr;gap:50px}.connection .chapter-label{color:#e9ac88}.connection h2{font-size:38px;line-height:1.25;letter-spacing:-1px;margin-top:16px}.connection p{font-size:13px;line-height:1.7;color:#c0ced0;max-width:340px;margin-top:17px}.endpoint{align-self:center;min-width:0}.endpoint-label{display:flex;justify-content:space-between;gap:15px;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#c0ced0;margin-bottom:11px}.endpoint-label span:last-child{color:#e9ac88}.endpoint code{display:block;font:400 14px/1.7 var(--body);background:#102a30;border:1px solid #557076;padding:20px 18px;color:var(--white);overflow-wrap:anywhere;user-select:all;cursor:text;min-width:0}.endpoint-hint{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:10px;color:#c0ced0;margin-top:11px}.endpoint-hint span:last-child{color:#e9ac88}.connection a:focus-visible,.connection code:focus-visible{outline-color:#e9ac88}
.guide{padding:66px 0 52px}.guide-heading{display:flex;justify-content:space-between;align-items:end;gap:30px;padding-bottom:29px;border-bottom:1px solid var(--line)}.guide h2{font-size:37px;line-height:1.3;letter-spacing:-1px;margin-top:16px}.guide-heading p{font-size:12px;color:var(--muted);max-width:250px}.steps{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:40px}.step{padding-top:27px}.step-number{display:flex;align-items:center;gap:12px;font:italic 21px/1 var(--display);color:var(--accent)}.step-number:after{content:'';height:1px;background:var(--line);flex:1}.step h3{font-size:15px;font-weight:500;margin-top:21px}.step p{font-size:13px;color:var(--muted);margin-top:9px}.research-note{margin-top:35px;padding:16px 20px;border-left:2px solid var(--accent);background:var(--soft);font-size:12px;color:var(--muted)}.research-note strong{color:var(--ink);font-weight:500}.footer{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:25px 0 31px;border-top:1px solid var(--line);font-size:10px;color:var(--muted)}.footer-brand{font-size:13px;font-weight:500;color:var(--ink)}.footer a{border-bottom:1px solid var(--line)}
@media(min-width:1500px){.hero{padding-block:89px 77px}h1{font-size:72px}}
@media(max-width:1000px){.wrap{width:calc(100% - 64px)}.hero{gap:42px;grid-template-columns:1.1fr .9fr}h1{font-size:52px}.query{padding:24px 24px 0}.query blockquote{font-size:23px}.capabilities{gap:45px}.connection{padding:35px;gap:35px}.connection h2{font-size:33px}.endpoint code{font-size:13px}.steps{gap:25px}}
@media(max-width:720px){.wrap{width:calc(100% - 40px)}.topbar{padding:23px 0;flex-wrap:wrap;gap:20px}.brand img{width:37px;height:37px}.wordmark{font-size:21px}.brand-note{font-size:8px;letter-spacing:1.4px}.topnav{font-size:11px;gap:24px;margin-left:50px}.hero{grid-template-columns:1fr;gap:38px;padding:43px 0 44px}h1{font-size:clamp(39px,8.6vw,57px);letter-spacing:-1.25px;line-height:1.16;margin-top:23px}h1 em{margin-top:7px}.lead{font-size:15px;line-height:1.7;margin-top:23px;max-width:460px}.hero-actions{gap:19px;margin-top:25px}.button{padding:12px 17px;font-size:12px;gap:23px}.hero-note{margin-top:17px}.query{padding:25px 26px 0}.query blockquote{font-size:25px;max-width:490px}.quote-sign{font-size:70px;height:54px;margin-top:23px}.query-caption{padding-bottom:23px}.query-tags{padding-block:14px 17px}.capabilities{grid-template-columns:1fr;gap:30px;padding:33px 0 41px}.capabilities h2{font-size:30px;max-width:390px;margin-top:13px}.section-intro{max-width:440px;margin-top:15px;font-size:13px}.feature{padding:20px 0}.connection{grid-template-columns:1fr;padding:29px 24px;gap:27px}.connection h2{font-size:32px;max-width:390px}.connection p{max-width:420px}.endpoint code{font-size:13px;padding:17px 15px}.endpoint-label{font-size:8px;letter-spacing:1.2px}.guide{padding:42px 0 35px}.guide-heading{display:block;padding-bottom:23px}.guide h2{font-size:30px;margin-top:12px}.guide-heading p{max-width:360px;margin-top:17px}.steps{grid-template-columns:1fr;gap:0}.step{display:grid;grid-template-columns:30px 1fr;gap:0 16px;padding:24px 0;border-bottom:1px solid var(--line)}.step:last-child{border-bottom:0}.step-number{grid-row:1/3;align-self:start;margin-top:4px}.step-number:after{display:none}.step h3{margin-top:0}.step p{grid-column:2}.research-note{margin-top:20px;padding:15px 16px}.footer{align-items:start;flex-wrap:wrap;gap:11px;padding-block:22px}.footer span:last-child{width:100%}}
@media(max-width:360px){.wrap{width:calc(100% - 32px)}h1{font-size:36px}.hero-actions{align-items:start;gap:13px;flex-direction:column}.query{padding-inline:21px}.query blockquote{font-size:23px}.connection{padding-inline:20px}.connection h2{font-size:29px}.endpoint-label{gap:9px;letter-spacing:.8px}.brand-note{font-size:7px}.topnav{margin-left:50px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.button{transition:none}.button:hover{transform:none}}
`;

export function renderServicePage(origin: string, _service: string, nonce = '', externalStylesheet = false) {
  const endpoint = esc(new URL('/mcp', new URL(origin).origin).href);
  const style = externalStylesheet
    ? '<link rel="stylesheet" href="/landing.css?v=20261009-editorial3">'
    : `<style${nonce ? ` nonce="${esc(nonce)}"` : ''}>${SERVICE_PAGE_CSS}</style>`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>JurisprudênciaIA · conexão MCP</title>
<meta name="description" content="Conecte pesquisa de jurisprudência ao seu assistente. Endereço MCP, acesso autorizado e guia de conexão do JurisprudênciaIA.">
<meta name="theme-color" content="#17343b">
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=20261009-editorial3">
<link rel="icon" type="image/png" href="/favicon.png?v=20261009-editorial3">
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=20261009-editorial3">
<link rel="preload" href="/fonts/libre-caslon-text-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/outfit-400.woff2" as="font" type="font/woff2" crossorigin>
${style}
</head>
<body data-service="jurisprudenciaia" data-design="legal-editorial">
<a class="skip" href="#conteudo">Ir para o conteúdo</a>
<div class="wrap">
<header class="topbar">
  <a class="brand" href="/" aria-label="JurisprudênciaIA, início">
    <img src="/favicon.svg?v=20261009-editorial3" width="43" height="43" alt="">
    <div><span class="wordmark">Jurisprudência<span>IA</span></span><span class="brand-note">Pesquisa jurídica em diálogo</span></div>
  </a>
  <nav class="topnav" aria-label="Navegação principal"><a href="#sobre">O serviço</a><a class="nav-connect" href="#conectar">Como conectar<span class="arrow" aria-hidden="true">↗</span></a></nav>
</header>
<main id="conteudo">
<section class="hero" aria-labelledby="hero-title">
  <div>
    <p class="eyebrow">Jurisprudência · pesquisa assistida</p>
    <h1 id="hero-title">Pesquisa jurídica. <em>No fio da conversa.</em></h1>
    <p class="lead">Conecte o JurisprudênciaIA ao seu assistente. Formule consultas, explore precedentes e desenvolva a análise no mesmo lugar em que você já trabalha.</p>
    <div class="hero-actions"><a class="button" href="#conectar">Conectar ao assistente<span aria-hidden="true">↗</span></a><a class="text-link" href="#servidor">Ver endereço MCP</a></div>
    <p class="hero-note">Uma conexão. As ferramentas de pesquisa na sua conversa.</p>
  </div>
  <figure class="query" aria-label="Exemplo de pergunta para iniciar uma pesquisa, sem resultado jurídico simulado">
    <div class="query-top"><span>Caderno de pesquisa</span><span>Exemplo de consulta</span></div>
    <div class="quote-sign" aria-hidden="true">“</div>
    <blockquote>Quais critérios orientam a responsabilidade civil em casos semelhantes ao meu?</blockquote>
    <figcaption class="query-caption">Uma pergunta com contexto é o começo de uma boa pesquisa.</figcaption>
    <div class="query-tags" aria-label="Elementos da pergunta"><span>Tema</span><span>Contexto</span><span>Objetivo</span></div>
    <div class="query-footer"><span>Da pergunta à investigação</span><b aria-hidden="true">↗</b></div>
  </figure>
</section>
<section class="capabilities" id="sobre" aria-labelledby="capabilities-title">
  <div><p class="chapter-label">01 / O serviço</p><h2 id="capabilities-title">Sua pergunta, com mais caminhos de pesquisa.</h2><p class="section-intro">O conector leva as ferramentas do serviço JurisprudênciaIA para um aplicativo compatível com MCP. A pesquisa acompanha o contexto da sua conversa.</p></div>
  <div>
    <article class="feature"><span class="feature-no" aria-hidden="true">01</span><div><h3>Explore precedentes</h3><p>Formule consultas de jurisprudência, precedentes e informativos de acordo com a questão que você precisa investigar.</p></div></article>
    <article class="feature"><span class="feature-no" aria-hidden="true">02</span><div><h3>Desenvolva o raciocínio</h3><p>Peça análise e comparação de teses, contexto normativo e outros recortes disponíveis no serviço.</p></div></article>
    <article class="feature"><span class="feature-no" aria-hidden="true">03</span><div><h3>Continue no seu assistente</h3><p>Retome a pesquisa na mesma conversa. O acesso às ferramentas respeita a autorização e as permissões da sua conta.</p></div></article>
  </div>
</section>
<section class="connection" id="servidor" aria-labelledby="server-title">
  <div><p class="chapter-label">02 / A conexão</p><h2 id="server-title">O próximo passo<br>é conectar.</h2><p>Este é o endereço do JurisprudênciaIA. Use-o para adicionar o servidor ao seu aplicativo compatível com MCP.</p></div>
  <div class="endpoint"><div class="endpoint-label"><span>Endereço do servidor</span><span>MCP remoto</span></div><code tabindex="0" aria-label="URL do servidor MCP">${endpoint}</code><div class="endpoint-hint"><span>Selecione o endereço para copiar</span><span>Autorização com Google</span></div></div>
</section>
<section class="guide" id="conectar" aria-labelledby="guide-title">
  <div class="guide-heading"><div><p class="chapter-label">03 / Primeiros passos</p><h2 id="guide-title">Da conexão à primeira pergunta.</h2></div><p>Configure uma vez. Depois, peça a pesquisa dentro da conversa.</p></div>
  <ol class="steps">
    <li class="step"><span class="step-number" aria-hidden="true">01</span><h3>Adicione o servidor</h3><p>No seu aplicativo compatível com MCP, adicione um servidor remoto e informe o endereço acima.</p></li>
    <li class="step"><span class="step-number" aria-hidden="true">02</span><h3>Autorize sua conta</h3><p>Conclua o fluxo de acesso com sua conta Google. A conta precisa estar autorizada para usar o serviço.</p></li>
    <li class="step"><span class="step-number" aria-hidden="true">03</span><h3>Comece pela sua questão</h3><p>Descreva o tema e o objetivo. Peça ao assistente para usar o JurisprudênciaIA e apresentar as referências encontradas.</p></li>
  </ol>
  <p class="research-note"><strong>A leitura continua com você.</strong> Confira os resultados e o contexto na fonte antes de utilizá-los no trabalho jurídico.</p>
</section>
</main>
<footer class="footer"><span class="footer-brand">JurisprudênciaIA</span><a href="#conectar">Guia de conexão<span class="arrow" aria-hidden="true">↑</span></a><span>Pesquisa assistida. Leitura criteriosa.</span></footer>
</div>
</body></html>`;
}
