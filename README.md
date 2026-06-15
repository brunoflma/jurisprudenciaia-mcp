# jurisprudenciaia-mcp

Conector MCP auto-hospedado para consultar o JurisprudenciaIA pelo Claude.ai, ChatGPT ou Codex.

O projeto usa Cloudflare Workers Free e chamadas HTTP diretas para os endpoints usados pelo site. Ele não exige navegador remoto, senha ou login no JurisprudenciaIA.

Este repositório contém apenas o código-fonte e as instruções de instalação. Cada usuário deve criar sua própria instância do Cloudflare Worker, seus próprios secrets OAuth e seu próprio conector no Claude.ai.

## Pré-requisitos obrigatórios

Para usar a solução de ponta a ponta, você precisa ter:

- Node.js 22 ou superior e npm disponíveis no terminal.
- Conta Cloudflare com Workers habilitado.
- Cloudflare Account ID da conta onde o Worker será publicado.
- Cloudflare API Token com permissão para editar Workers, preferencialmente pelo modelo `Edit Cloudflare Workers` ou por token customizado equivalente.
- Repositório GitHub com acesso para configurar Actions e Repository Secrets, caso use a publicação automática.
- Conta Claude.ai com acesso à configuração de conectores MCP remotos e aos campos avançados de OAuth, caso use Claude.
- ChatGPT com modo desenvolvedor de aplicativos habilitado, caso use ChatGPT.
- Codex CLI ou extensão/IDE com suporte a MCP, caso use Codex.
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
- Workers Secrets: armazenamento dos valores `MCP_OAUTH_CLIENT_ID`, `MCP_OAUTH_CLIENT_SECRET`, `MCP_ACCESS_TOKEN_SECRET` e, se usar Codex por Bearer, `MCP_BEARER_TOKEN`.
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
npx wrangler secret put MCP_BEARER_TOKEN # opcional, recomendado para Codex HTTP
npm run deploy:worker
```

A URL cadastrada no Claude.ai não contém segredo:

```text
https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp
```

No Claude.ai, use `Advanced settings` para informar o OAuth Client ID e o OAuth Client Secret configurados no Worker.

No ChatGPT, crie um app em modo desenvolvedor com a mesma URL `/mcp`, selecione autenticação OAuth, use `Cliente OAuth definido pelo usuário`, informe o mesmo `MCP_OAUTH_CLIENT_ID` e `MCP_OAUTH_CLIENT_SECRET`, e mantenha o método de token como `client_secret_post`. Avisos de DCR/CIMD indisponível são esperados nesta configuração: o Worker não oferece registro dinâmico aberto porque isso enfraqueceria a proteção da instância privada.

O Worker expõe `/favicon.png`, `/favicon.svg`, `/favicon.ico`, `logo_uri` nos metadados OAuth e `serverInfo.icons` no `initialize` do MCP. O PNG é anunciado em `96x96` como ícone principal porque alguns clientes de conector ignoram SVG ou priorizam recursos raster/cacheáveis.

Se quiser hospedar o ícone em Cloudflare Pages, GitHub Pages ou outro host estático HTTPS, defina `MCP_ICON_URL` com a URL absoluta do PNG. Essa variável altera o `logo_uri` e o ícone principal anunciado no `initialize`. URLs sem HTTPS são ignoradas. O valor pode ser configurado como variável de ambiente do Worker ou como Cloudflare Secret, já que não contém dado sensível.

Observação sobre o Claude.ai: quando a URL usa `workers.dev`, o Claude pode resolver o ícone via Google Favicon (`t1.gstatic.com/faviconV2`) usando apenas o domínio base, como `http://<seu-subdominio>.workers.dev`, e não o hostname completo `https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev`. Nesse cenário, o favicon do Worker está correto, mas a lista de conectores pode continuar sem exibir o ícone. Para exibição confiável, publique o Worker em um domínio customizado seu, por exemplo `https://mcp.<seu-dominio>/mcp`, e cadastre essa URL no Claude.ai.

## Uso no Codex

O caminho recomendado no Codex é usar o Worker por `HTTP com streaming` e preencher o campo `Variável de ambiente de token do portador` com `MCP_BEARER_TOKEN`. O valor real desse token deve existir como secret no Worker e como variável de ambiente local do Codex. Também existe um entrypoint local STDIO para uso em ambiente de desenvolvimento.

Se você publicar pelo workflow atual do GitHub Actions, configure `MCP_BEARER_TOKEN` diretamente como Cloudflare Worker Secret depois do primeiro deploy. O workflow público sincroniza os secrets OAuth, mas não sincroniza esse token opcional sem uma alteração adicional no arquivo de workflow.

O passo a passo está em `docs/codex.md`.

## Ferramentas disponíveis

O conector publica cinco ferramentas para clientes MCP:

- `consultar_jurisprudenciaia`: consulta livre, com opção de debug.
- `pesquisar_jurisprudencia`: pesquisa direta e limpa por jurisprudência.
- `buscar_precedentes`: busca precedentes por tema, com tribunais preferenciais.
- `analisar_tese_juridica`: confronta uma tese com a jurisprudência.
- `comparar_teses_juridicas`: compara duas teses para a mesma questão jurídica.

As respostas estruturadas preservam a ementa, o link e o inteiro teor/transcrição integral quando a fonte disponibiliza esses campos. Quando o inteiro teor não vem no retorno da fonte, o Markdown informa a ausência explicitamente para evitar confundir ementa ou excerto com acórdão completo.

## Publicação pelo GitHub Actions

Configure estes secrets no repositório GitHub antes de publicar automaticamente:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
MCP_OAUTH_CLIENT_ID
MCP_OAUTH_CLIENT_SECRET
MCP_ACCESS_TOKEN_SECRET
```

O workflow atual sincroniza os secrets OAuth no Worker. Para ativar Codex por HTTP, grave o Bearer token diretamente no Worker depois do primeiro deploy:

```powershell
npx wrangler secret put MCP_BEARER_TOKEN
```

Enquanto os secrets obrigatórios não existirem, o workflow valida o projeto, mas pula a publicação do Worker. Se `MCP_BEARER_TOKEN` não existir no Worker, Claude.ai e ChatGPT continuam funcionando por OAuth, mas o acesso por Bearer no Codex fica desativado.

Em repositórios públicos e forks, o CI consegue rodar sem acesso a secrets. O workflow `Deploy Worker` só publica quando os cinco secrets foram configurados no repositório que executa o workflow.

O passo a passo completo está em `docs/deployment.md`. A versão visual está em `docs/deploy-guide.html`.
