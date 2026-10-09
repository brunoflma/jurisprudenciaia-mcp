// Apresentação pública dos conectores; não participa do transporte ou do OAuth.
// Referência visual: Fons MCP. As fontes são servidas na própria origem.
const products = {
  cnpja: {
    name: "CNPJa", descriptor: "Cadastro empresarial", number: "001",
    title: "Consulte empresas", emphasis: "no seu assistente.",
    introduction: "Dados cadastrais de empresas, estabelecimentos e inscrições, na conversa em que você já trabalha.",
    description: "Conecte o CNPJa ao seu aplicativo compatível para consultar informações e solicitar comprovantes disponíveis na fonte.",
    folio: "Um endereço.<br>Dados na origem.",
    capabilities: ["Consulta cadastral", "Estabelecimentos", "Comprovantes oficiais"],
    note: "Dados cadastrais e comprovantes têm finalidades distintas. Confira a origem, a data e a disponibilidade de cada informação.",
    tagline: "Conheça a empresa. Consulte a fonte.",
    icon: '<path d="M89 35C77 25 57 24 42 36C24 51 24 78 42 94C56 106 77 105 90 94"/><path d="M61 52h27v27H61zM70 61h9M70 70h9" stroke-width="4"/><path d="M30 106h32" stroke="#c8a862" stroke-width="2"/><circle cx="90" cy="94" r="6" fill="#c8a862" stroke="none"/>'
  },
  juris: {
    name: "AMF Jurisprudência", descriptor: "Pesquisa jurídica", number: "002",
    title: "Pesquise precedentes", emphasis: "com a fonte à vista.",
    introduction: "Encontre precedentes, localize documentos e organize evidências no seu assistente.",
    description: "A pesquisa mantém a distinção entre descobrir um resultado, identificar o processo e conferir o teor na fonte oficial.",
    folio: "Uma conexão.<br>Fontes conferíveis.",
    capabilities: ["Precedentes", "Fontes oficiais", "Verificação de teor"],
    note: "Um resultado encontrado ainda precisa de conferência. Identificação do processo e domínio oficial, isoladamente, não confirmam o teor do precedente.",
    tagline: "Da descoberta à conferência da fonte.",
    icon: '<path d="M38 31h50M73 31v53c0 18-11 25-27 20c-8-3-12-8-12-15"/><path d="M37 55h26M50 48v29M37 55l-8 19h16zM63 55l-8 19h16z" stroke-width="3"/><path d="M29 110h38" stroke="#c8a862" stroke-width="2"/><circle cx="34" cy="89" r="6" fill="#c8a862" stroke="none"/>'
  },
  jurisprudenciaia: {
    name: "JurisprudênciaIA", descriptor: "Pesquisa assistida", number: "003",
    title: "Explore a jurisprudência", emphasis: "no seu assistente.",
    introduction: "Integre a pesquisa jurídica assistida por IA à conversa em que você desenvolve sua análise.",
    description: "O conector entrega ferramentas de pesquisa ao aplicativo compatível, com acesso autenticado e as permissões da sua conta.",
    folio: "Um endereço.<br>Pesquisa em contexto.",
    capabilities: ["Pesquisa jurídica", "Análise assistida", "Acesso autenticado"],
    note: "A análise assistida é apoio à pesquisa. Confira citações, documentos e conclusões na fonte original antes do uso profissional.",
    tagline: "Pesquise. Confronte. Desenvolva sua análise.",
    icon: '<path d="M31 32h27M45 32v54c0 13-7 19-18 16M68 99l16-66l19 66M74 77h23"/><path d="M31 110h64" stroke="#c8a862" stroke-width="2"/><circle cx="84" cy="33" r="6" fill="#c8a862" stroke="none"/>'
  },
  personal: {
    name: "JurisprudênciaIA", descriptor: "Conexão pessoal", number: "004",
    title: "Sua pesquisa jurídica.", emphasis: "No seu assistente.",
    introduction: "Consulte as ferramentas de pesquisa jurídica assistida por IA na sua conexão pessoal autorizada.",
    description: "Adicione o endereço ao aplicativo compatível e conclua a autorização com a conta que possui acesso a este conector.",
    folio: "Sua conexão.<br>Pesquisa em contexto.",
    capabilities: ["Pesquisa jurídica", "Análise assistida", "Conexão pessoal"],
    note: "As permissões desta conexão são próprias do serviço. A análise assistida não substitui a conferência do documento original.",
    tagline: "Uma conexão pessoal para sua pesquisa.",
    icon: '<path d="M31 32h27M45 32v54c0 13-7 19-18 16M68 99l16-66l19 66M74 77h23"/><path d="M31 110h64" stroke="#c8a862" stroke-width="2"/><circle cx="106" cy="23" r="5" fill="#c8a862" stroke="none"/>'
  },
  ocr: {
    name: "AMF OCR", descriptor: "Leitura documental", number: "005",
    title: "Do documento original", emphasis: "à leitura estruturada.",
    introduction: "Conecte o processamento de documentos jurídicos ao seu assistente, preservando a fonte que sustenta a leitura.",
    description: "O serviço organiza extração, OCR e Markdown de documentos autorizados, com artefatos rastreáveis e revisão conforme o fluxo do processo.",
    folio: "Uma conexão.<br>A fonte preservada.",
    capabilities: ["OCR e Markdown", "Curadoria documental", "Rastreabilidade"],
    note: "O PDF original é a referência de autoridade. A transcrição e os derivados exigem conferência material e não equivalem a uma revisão jurídica concluída.",
    tagline: "A leitura evolui. A fonte permanece.",
    icon: '<path d="M37 27h40l16 16v60H37z" stroke-width="5"/><path d="M77 27v18h16M49 60h31M49 73h31M49 86h22" stroke-width="3"/><path d="M23 41V23h18M87 110h18V92" stroke="#c8a862" stroke-width="3"/><circle cx="71" cy="86" r="4" fill="#c8a862" stroke="none"/>'
  }
};

function esc(value: unknown) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function renderProductIcon(service: keyof typeof products) {
  const product = products[service];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="${esc(product.name + " — " + product.descriptor)}"><rect width="128" height="128" fill="#0a1224"/><rect x="5" y="5" width="118" height="118" fill="none" stroke="#c8a862" stroke-width="2"/><g fill="none" stroke="#f4f1e9" stroke-width="7" stroke-linecap="square" stroke-linejoin="miter">${product.icon}</g></svg>`;
}

export const SERVICE_PAGE_CSS = `
@font-face{font-family:'Libre Caslon Text';src:url('/fonts/libre-caslon-text-400.woff2') format('woff2');font-style:normal;font-weight:400;font-display:swap}
@font-face{font-family:'Libre Caslon Text';src:url('/fonts/libre-caslon-text-700.woff2') format('woff2');font-style:normal;font-weight:700;font-display:swap}
@font-face{font-family:'Libre Caslon Text';src:url('/fonts/libre-caslon-text-italic-400.woff2') format('woff2');font-style:italic;font-weight:400;font-display:swap}
@font-face{font-family:'IBM Plex Mono';src:url('/fonts/ibm-plex-mono-400.woff2') format('woff2');font-style:normal;font-weight:400;font-display:swap}
@font-face{font-family:'IBM Plex Mono';src:url('/fonts/ibm-plex-mono-600.woff2') format('woff2');font-style:normal;font-weight:600;font-display:swap}
:root{color-scheme:dark;--bg:#0a1224;--panel:#0e1a33;--cream:#f4f1e9;--body:#b7c0d8;--muted:#8e9aba;--gold:#c8a862;--gold-light:#e4cc94;--line:rgba(244,241,233,.16)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--cream);font-family:'Libre Caslon Text',Georgia,'Times New Roman',serif}a{color:inherit}::selection{background:var(--gold);color:var(--bg)}:focus-visible{outline:2px solid var(--gold-light);outline-offset:4px}.mono{font-family:'IBM Plex Mono','Courier New',monospace;font-weight:600;text-transform:uppercase;letter-spacing:.15em}.shell{width:min(1240px,calc(100% - 72px));margin-inline:auto}.topline{height:3px;background:linear-gradient(90deg,var(--gold),#f0deb0 40%,var(--gold))}
.site-header{position:sticky;top:0;z-index:20;border-bottom:1px solid var(--line);background:rgba(10,18,36,.96);backdrop-filter:blur(14px)}.nav{min-height:82px;display:flex;align-items:center;justify-content:space-between;gap:24px}.wordmark{text-decoration:none;display:flex;align-items:center;gap:14px;min-width:0}.wordmark img{width:40px;height:40px;display:block;flex:none}.wordmark strong{font-size:clamp(22px,2.2vw,32px);font-weight:400;letter-spacing:-.045em;min-width:0;overflow-wrap:anywhere}.wordmark span{font-size:10px;line-height:1.4;color:var(--gold);letter-spacing:.18em;max-width:150px}.nav-links{display:flex;align-items:center;gap:24px;flex:none}.nav-links a{text-decoration:none;font:600 12px/1.4 'IBM Plex Mono','Courier New',monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--gold-light)}.nav-links .nav-cta{padding:13px 18px;border:1px solid var(--gold)}.nav-links a:hover{color:var(--cream)}.nav-links .nav-cta:hover{background:var(--gold);color:var(--bg)}
.hero{position:relative;overflow:hidden;border-bottom:1px solid var(--line);background:radial-gradient(ellipse at 83% 19%,rgba(34,62,103,.36),transparent 43%),linear-gradient(180deg,#0a1224,#0a1428)}.hero:before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.35;background-image:linear-gradient(90deg,transparent calc(100% - 1px),rgba(244,241,233,.08) 0);background-size:calc(100% / 12) 100%}.hero-grid{position:relative;display:grid;grid-template-columns:minmax(0,1.2fr) minmax(350px,.9fr);gap:5vw;align-items:center;min-height:610px;padding-block:74px 95px}.eyebrow{display:inline-flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid rgba(200,168,98,.46);background:var(--panel);margin:0 0 27px;font-size:9px;line-height:1.5;letter-spacing:.15em;max-width:100%}.eyebrow-label{display:flex;align-items:center;gap:9px;min-width:0}.spark{color:var(--gold);font-size:13px;flex:none}.access-pill{padding:8px 12px;background:var(--gold);color:var(--bg);font-size:11px;line-height:1.3;letter-spacing:.12em;white-space:nowrap}
h1{font-size:clamp(46px,4.5vw,66px);font-weight:400;line-height:1.1;letter-spacing:-.04em;margin:0;max-width:740px}h1 em{display:block;font-style:italic;color:#f2d79f;text-shadow:0 0 10px rgba(236,190,101,.16)}.hero-copy{display:grid;gap:6px;max-width:620px;margin:27px 0 29px;color:var(--body);font-size:clamp(17px,1.5vw,20px);line-height:1.55}.hero-copy p{margin:0}.actions{display:flex;gap:12px;flex-wrap:wrap}.button{display:inline-flex;align-items:center;justify-content:center;gap:28px;min-height:55px;padding:16px 21px;text-decoration:none;border:1px solid var(--gold);font:600 12px/1.4 'IBM Plex Mono','Courier New',monospace;letter-spacing:.08em;text-transform:uppercase;transition:background .2s,color .2s,transform .2s}.button:hover{transform:translateY(-2px)}.button.primary{background:var(--gold);color:var(--bg)}.button.primary:hover{background:var(--gold-light)}.button.secondary{color:var(--gold-light)}.button.secondary:hover{background:rgba(200,168,98,.12)}
section,aside{scroll-margin-top:105px}.card{min-width:0;padding:32px}.site-folio{position:relative;background:linear-gradient(140deg,#172944,#0d1a30 65%);border:1px solid rgba(244,241,233,.22);box-shadow:0 28px 70px rgba(0,0,0,.35);transform:rotate(1.5deg)}.site-folio:before{content:"";position:absolute;left:14px;top:0;bottom:0;width:1px;background:rgba(200,168,98,.24);pointer-events:none}.site-folio>*{position:relative}.card-top{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-bottom:24px;border-bottom:1px solid var(--line);color:var(--gold);font-size:9px}.card-top img{width:34px;height:34px}.card h2{font-size:clamp(26px,2.2vw,32px);line-height:1.12;font-weight:400;letter-spacing:-.02em;margin:38px 0 17px}.card p{color:var(--body);font-size:18px;line-height:1.55;margin:0 0 28px}.endpoint{display:block;padding:18px;border:1px solid var(--gold);background:var(--bg);color:var(--cream);font:13px/1.6 'IBM Plex Mono','Courier New',monospace;overflow-wrap:anywhere;user-select:all}.card small{display:block;margin-top:15px;color:var(--muted);font:12px/1.7 'IBM Plex Mono','Courier New',monospace}.capabilities{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px;padding-top:22px;border-top:1px solid var(--line)}.capabilities span{padding:7px 9px;border:1px solid var(--line);color:var(--body);font:10px/1.6 'IBM Plex Mono','Courier New',monospace}
.section-pad{padding-block:82px}.path{background:#101d34}.section-label{display:flex;align-items:center;gap:13px;margin-bottom:14px;color:var(--gold);font-size:13px;line-height:1.7}.section-label:before{content:"";width:9px;height:9px;flex:none;background:var(--gold);transform:rotate(45deg)}h2{margin:0;font-size:clamp(30px,2.5vw,38px);font-weight:400;line-height:1.18;letter-spacing:-.025em}h2 em{font-style:italic;color:#f2d79f}.path-list{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-top:42px}.path-step{display:flex;flex-direction:column;min-height:260px;padding:25px;background:var(--panel);border:1px solid var(--line)}.path-step .num{font:700 29px/1 Georgia,serif;color:var(--gold)}.path-step h3{margin:28px 0 11px;font-size:22px;font-weight:700}.path-step p{margin:0;font-size:15px;line-height:1.55;color:var(--body)}.step-foot{margin-top:auto;padding-top:30px;font-size:10px;line-height:1.7;letter-spacing:.08em;color:var(--muted)}.method-note{display:grid;gap:8px;margin-top:29px;padding:19px 23px;border-left:2px solid var(--gold);background:rgba(200,168,98,.06);color:var(--body);font-size:15px;line-height:1.65}.method-note p{margin:0}
.site-footer{border-top:1px solid var(--line);background:var(--bg);padding:46px 0 34px}.footer-top{display:flex;align-items:center;gap:18px;flex-wrap:wrap}.footer-tagline{color:var(--body);font:12px/1.7 'IBM Plex Mono','Courier New',monospace}.footer-bottom{margin-top:30px;padding-top:21px;border-top:1px solid var(--line);color:var(--muted);text-align:center;font:11px/1.7 'IBM Plex Mono','Courier New',monospace;letter-spacing:.06em}
@media(max-width:1080px){.hero-grid{grid-template-columns:1fr;min-height:0;gap:45px}.card{max-width:610px}.nav-links{gap:14px}.wordmark span{display:none}.path-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:680px){.shell{width:calc(100% - 36px)}.nav{min-height:69px;gap:12px}.wordmark{gap:10px}.wordmark img{width:35px;height:35px}.wordmark strong{font-size:22px}.nav-links a:not(.nav-cta){display:none}.nav-links .nav-cta{padding:11px 10px;font-size:10px}.hero-grid{padding-block:55px 65px;gap:35px}.eyebrow{flex-wrap:wrap;gap:8px}.eyebrow-label{overflow-wrap:anywhere}.access-pill{font-size:10px}h1{font-size:clamp(38px,10.5vw,48px)}h1 em{font-size:clamp(34px,9.7vw,45px)}.hero-copy{font-size:17px}.button{width:100%;justify-content:space-between;gap:12px}.card{padding:23px;transform:none}.card h2{font-size:29px}.card p{font-size:16px}.endpoint{font-size:12px}.section-pad{padding-block:62px}.section-label{font-size:11px}h2{font-size:clamp(27px,7.5vw,31px)}.path-list{grid-template-columns:1fr;gap:14px}.path-step{min-height:210px}.footer-tagline{padding-left:45px}.footer-bottom{letter-spacing:.02em}}
@media(max-width:380px){.wordmark strong{font-size:19px}.nav-cta{max-width:112px}.eyebrow{padding:8px}.card{padding:20px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.button{transition:none}.button:hover{transform:none}}
`;

export function renderServicePage(origin: string, service: keyof typeof products, nonce = "", externalStylesheet = false) {
  const product = products[service];
  const endpoint = esc(new URL("/mcp", new URL(origin).origin).href);
  const brand = `<img src="/favicon.svg?v=20261009" width="40" height="40" alt=""><strong>${esc(product.name)}</strong><span class="mono">${esc(product.descriptor)}</span>`;
  const style = externalStylesheet ? '<link rel="stylesheet" href="/landing.css?v=20261009">' : nonce ? `<style nonce="${esc(nonce)}">${SERVICE_PAGE_CSS}</style>` : `<style>${SERVICE_PAGE_CSS}</style>`;
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#0a1224"><meta name="description" content="${esc(product.introduction)}"><title>${esc(product.name)} · conexão MCP${service === "personal" ? " pessoal" : ""}</title><link rel="icon" href="/favicon.svg?v=20261009" type="image/svg+xml">${style}</head>
<body><div class="topline"></div><header class="site-header"><nav class="shell nav" aria-label="Navegação principal"><a class="wordmark" href="/" aria-label="${esc(product.name)}, início">${brand}</a><div class="nav-links"><a href="#conectar">Como conectar</a><a class="nav-cta" href="#servidor">Endereço MCP <span aria-hidden="true">↗</span></a></div></nav></header>
<main><section class="hero" aria-labelledby="hero-title"><div class="shell hero-grid"><div><p class="eyebrow mono"><span class="eyebrow-label"><span class="spark" aria-hidden="true">✦</span><span>${esc(product.name)} / conexão MCP</span></span><span class="access-pill">Acesso autorizado</span></p><h1 id="hero-title">${esc(product.title)} <em>${esc(product.emphasis)}</em></h1><div class="hero-copy"><p>${esc(product.introduction)}</p><p>${esc(product.description)}</p></div><div class="actions"><a class="button primary" href="#conectar">Ver guia de conexão <span aria-hidden="true">↗</span></a><a class="button secondary" href="#servidor">Ver endereço MCP <span aria-hidden="true">↗</span></a></div></div>
<aside id="servidor" class="card site-folio" aria-label="Endereço do servidor"><div class="card-top mono"><span>Caderno de conexão / ${product.number}</span><img src="/favicon.svg?v=20261009" width="34" height="34" alt=""></div><h2>${product.folio}</h2><p>Adicione a URL abaixo como servidor MCP no aplicativo compatível com sua conta.</p><code class="endpoint" aria-label="URL do servidor MCP">${endpoint}</code><small>Conexão protegida. Use a conta autorizada para este serviço.</small><div class="capabilities" aria-label="Capacidades">${product.capabilities.map((item) => `<span>${esc(item)}</span>`).join("")}</div></aside></div></section>
<section id="conectar" class="section-pad path" aria-labelledby="path-title"><div class="shell"><div class="section-label mono">02 / Primeiros passos</div><h2 id="path-title">Da conexão à <em>primeira consulta.</em></h2><div class="path-list">
<div class="path-step"><span class="num">01</span><h3>Confirme seu acesso</h3><p>Verifique se sua conta possui permissão para usar este conector.</p><span class="step-foot mono">Conta autorizada</span></div>
<div class="path-step"><span class="num">02</span><h3>Adicione o endereço</h3><p>Copie a URL do servidor e adicione uma conexão MCP no seu aplicativo.</p><span class="step-foot mono">Um endereço de conexão</span></div>
<div class="path-step"><span class="num">03</span><h3>Autorize a conexão</h3><p>Conclua a autenticação solicitada pelo serviço com sua própria conta.</p><span class="step-foot mono">Permissões do titular</span></div>
<div class="path-step"><span class="num">04</span><h3>Inicie a consulta</h3><p>Use as ferramentas disponíveis na conversa do assistente conectado.</p><span class="step-foot mono">Conforme plano e permissões</span></div></div>
<div class="method-note"><p>Esta página apresenta o endereço de conexão; as consultas são feitas no assistente conectado.</p><p>${esc(product.note)}</p><p>A disponibilidade da conexão segue o plano e as permissões de cada aplicativo.</p></div></div></section></main>
<footer class="site-footer"><div class="shell"><div class="footer-top"><a class="wordmark" href="/" aria-label="${esc(product.name)}, início">${brand}</a><span class="footer-tagline">${esc(product.tagline)}</span></div><div class="footer-bottom">© ${new Date().getUTCFullYear()} BF Ldevlabs · Inteligência jurídica aplicada.</div></div></footer></body></html>`;
}
