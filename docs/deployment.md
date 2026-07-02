# Publicar o Worker

Este guia e generico para quem quer hospedar uma copia propria do conector. Nao coloque tokens, account IDs, client secrets, bearer tokens ou URLs privadas em arquivos versionados.

## Pre-requisitos

- Node.js 22 ou superior.
- Conta Cloudflare com Workers habilitado.
- Wrangler autenticado localmente com `npx wrangler login`.

## Preparar o projeto

```powershell
npm install
npm run verify
```

## Configurar secrets do Worker

Configure os valores diretamente no Cloudflare Worker. Os nomes usados pelo codigo sao:

```text
MCP_OAUTH_CLIENT_ID
MCP_OAUTH_CLIENT_SECRET
MCP_ACCESS_TOKEN_SECRET
MCP_OAUTH_REDIRECT_URIS
MCP_BEARER_TOKEN
```

`MCP_BEARER_TOKEN` e necessario somente se voce for conectar o Codex por HTTP com streaming.

Use Wrangler para gravar cada valor fora do repositorio:

```powershell
npx wrangler secret put MCP_OAUTH_CLIENT_ID
npx wrangler secret put MCP_OAUTH_CLIENT_SECRET
npx wrangler secret put MCP_ACCESS_TOKEN_SECRET
npx wrangler secret put MCP_OAUTH_REDIRECT_URIS
npx wrangler secret put MCP_BEARER_TOKEN
```

## Publicar

O `wrangler.toml` deste repositorio mantem defaults genericos. Se quiser usar dominio customizado, configure a rota na sua propria conta Cloudflare ou em um arquivo local que nao sera commitado.

```powershell
npx wrangler deploy
```

Ao final, use a URL do seu Worker no formato:

```text
https://<sua-url-do-worker>/mcp
```

## Conectar clientes

- Claude.ai e ChatGPT usam OAuth.
- Codex pode usar HTTP com streaming e `MCP_BEARER_TOKEN`; veja `docs/codex.md`.

## Verificar

```powershell
npm run check:chatgpt-oauth -- https://<sua-url-do-worker>/mcp
npm run check:codex-http -- https://<sua-url-do-worker>/mcp
```

Os comandos devem listar as ferramentas MCP publicadas pelo Worker.

## Checklist antes de publicar alteracoes

- Nenhum valor real de secret em `.env`, README, docs, issue, print ou arquivo de configuracao.
- Nenhum dominio pessoal ou endpoint de producao hardcoded.
- Nenhum arquivo de planejamento interno, automacao de agente ou workflow privado.
- `npm run verify` passando localmente.
