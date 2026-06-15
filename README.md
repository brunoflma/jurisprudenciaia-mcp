# jurisprudenciaia-mcp

Conector MCP auto-hospedado para consultar o JurisprudenciaIA pelo Claude.ai.

O projeto usa Cloudflare Workers Free e chamadas HTTP diretas para os endpoints usados pelo site. Ele não exige navegador remoto, senha ou login no JurisprudenciaIA.

Este repositório contém apenas o código-fonte e as instruções de instalação. Cada usuário deve criar sua própria instância do Cloudflare Worker, seus próprios secrets OAuth e seu próprio conector no Claude.ai.

## Pré-requisitos obrigatórios

Para usar a solução de ponta a ponta, você precisa ter:

- Node.js 22 ou superior e npm disponíveis no terminal.
- Conta Cloudflare com Workers habilitado.
- Cloudflare Account ID da conta onde o Worker será publicado.
- Cloudflare API Token com permissão para editar Workers, preferencialmente pelo modelo `Edit Cloudflare Workers` ou por token customizado equivalente.
- Repositório GitHub com acesso para configurar Actions e Repository Secrets, caso use a publicação automática.
- Conta Claude.ai com acesso à configuração de conectores MCP remotos e aos campos avançados de OAuth.
- Acesso de rede ao site `https://www.jurisprudenciaia.com.br/`, pois o Worker consulta essa fonte em tempo de execução.

Os secrets reais não devem ser salvos no repositório. Use apenas GitHub Secrets, Cloudflare Secrets ou variáveis de ambiente locais não versionadas. Também não publique resultados reais de consultas, peças, nomes de partes, CPFs, e-mails ou outros dados pessoais em issues, logs ou arquivos de exemplo.

## Publicação pública segura

Este projeto pode ser aberto no GitHub como código auto-hospedado, mas a sua instância do Worker deve continuar privada:

- Não publique URLs operacionais da sua instância real do Worker. Use placeholders como `https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp`.
- Não inclua `.env`, `.dev.vars`, dumps de testes do Claude, screenshots temporários, logs ou respostas reais do JurisprudenciaIA.
- Mantenha `package.json` com `private: true`; isso evita publicação acidental no npm e não impede o repositório GitHub público.
- Antes de tornar qualquer histórico público, rode uma varredura de secrets no conteúdo atual e no histórico Git. Se houver dúvida sobre o histórico, crie um repositório público novo com um primeiro commit sanitizado.

## Uso do Cloudflare Free Tier

A solução foi mantida compatível com o plano gratuito da Cloudflare:

- Workers: execução serverless do endpoint MCP, OAuth e consultas HTTP ao JurisprudenciaIA.
- Workers Secrets: armazenamento dos valores `MCP_OAUTH_CLIENT_ID`, `MCP_OAUTH_CLIENT_SECRET` e `MCP_ACCESS_TOKEN_SECRET`.
- Workers Logs e Analytics: úteis para acompanhar erros, volume de chamadas e latência sem registrar secrets no código.
- `workers.dev`, SSL/TLS automático e proteção DDoS: suficientes para publicar o conector auto-hospedado com HTTPS.
- Favicon, landing page mínima e metadados OAuth: servidos diretamente pelo Worker com cache público curto.

Não foram ativados KV, D1, R2, Vectorize, Workers AI ou AI Gateway por padrão. O MCP é stateless e consulta a fonte ao vivo; persistir consultas jurídicas ou respostas em storage exigiria uma decisão explícita de privacidade, retenção e expurgo. Turnstile, Access e regras WAF também ficam como recursos opcionais de borda, porque o fluxo principal já usa OAuth do próprio conector e bearer tokens assinados.

## Verificação local

```powershell
npm install
npm run typecheck
npm test
npm run build
npx wrangler deploy --dry-run
```

Por segurança, o servidor Node local usado por `npm run dev` ou `npm start` escuta em `127.0.0.1` por padrão. Para expor manualmente em outra interface, defina `HOST`, por exemplo `HOST=0.0.0.0`, apenas em ambiente controlado.

## Publicação manual na Cloudflare

```powershell
npx wrangler login
npx wrangler secret put MCP_OAUTH_CLIENT_ID
npx wrangler secret put MCP_OAUTH_CLIENT_SECRET
npx wrangler secret put MCP_ACCESS_TOKEN_SECRET
npm run deploy:worker
```

A URL cadastrada no Claude.ai não contém segredo:

```text
https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp
```

No Claude.ai, use `Advanced settings` para informar o OAuth Client ID e o OAuth Client Secret configurados no Worker.

O Worker expõe `/favicon.png`, `/favicon.svg`, `/favicon.ico`, `logo_uri` nos metadados OAuth e `serverInfo.icons` no `initialize` do MCP. O PNG é anunciado em `96x96` como ícone principal porque alguns clientes de conector ignoram SVG ou priorizam recursos raster/cacheáveis.

Observação sobre o Claude.ai: quando a URL usa `workers.dev`, o Claude pode resolver o ícone via Google Favicon (`t1.gstatic.com/faviconV2`) usando apenas o domínio base, como `http://<seu-subdominio>.workers.dev`, e não o hostname completo `https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev`. Nesse cenário, o favicon do Worker está correto, mas a lista de conectores pode continuar sem exibir o ícone. Para exibição confiável, publique o Worker em um domínio customizado seu, por exemplo `https://mcp.<seu-dominio>/mcp`, e cadastre essa URL no Claude.ai.

## Ferramentas disponíveis

O conector publica cinco ferramentas para o Claude:

- `consultar_jurisprudenciaia`: consulta livre, com opção de debug.
- `pesquisar_jurisprudencia`: pesquisa direta e limpa por jurisprudência.
- `buscar_precedentes`: busca precedentes por tema, com tribunais preferenciais.
- `analisar_tese_juridica`: confronta uma tese com a jurisprudência.
- `comparar_teses_juridicas`: compara duas teses para a mesma questão jurídica.

## Publicação pelo GitHub Actions

Configure estes secrets no repositório GitHub antes de publicar automaticamente:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
MCP_OAUTH_CLIENT_ID
MCP_OAUTH_CLIENT_SECRET
MCP_ACCESS_TOKEN_SECRET
```

Enquanto esses secrets não existirem, o workflow valida o projeto, mas pula a publicação do Worker.

Em repositórios públicos e forks, o CI consegue rodar sem acesso a secrets. O workflow `Deploy Worker` só publica quando os cinco secrets foram configurados no repositório que executa o workflow.

O passo a passo completo está em `docs/deployment.md`. A versão visual está em `docs/deploy-guide.html`.
