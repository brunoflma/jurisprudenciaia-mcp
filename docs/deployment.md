# Operação e publicação do Worker

Este documento é a referência de operação para quem administra a implantação. Para começar, siga o [guia de instalação completo](deploy-guide.html#instalar). Quem já recebeu um endereço e teve sua conta autorizada pode ir direto a [conectar no Claude ou Codex](deploy-guide.html#conectar).

Nos exemplos, substitua `mcp.seu-dominio.com` pela origem pública do seu Worker.

## Arquitetura de autenticação

O fluxo implementado é OAuth 2.1 com Authorization Code e PKCE S256:

1. O Claude ou o Codex descobre os metadados OAuth do Worker.
2. O cliente registra dinamicamente um callback permitido: HTTPS oficial no Claude ou loopback efêmero no Codex.
3. O Worker cria uma transação de autorização vinculada ao navegador.
4. O usuário confirma o acesso e segue para o Google.
5. O Google retorna ao callback do Worker.
6. O Worker verifica identidade, e-mail confirmado e allowlist.
7. O Worker conclui a autorização e entrega o resultado ao callback do cliente MCP.
8. O cliente troca o código por access token e usa `POST /mcp`.

O endpoint raiz também aceita `POST /` como alias protegido para compatibilidade com clientes que persistiram a URL sem `/mcp`.

## Recursos Cloudflare

[`wrangler.jsonc`](../wrangler.jsonc) é a fonte declarativa da implantação e contém apenas dados públicos ou identificadores de recursos:

- Worker `jurisprudenciaia-mcp`;
- endereço `workers.dev`, com opção de configurar um domínio customizado;
- KV `JURIS_CACHE`;
- KV `OAUTH_KV` para clientes, grants e tokens;
- Durable Object `OAUTH_STATE` para transações de uso único;
- logs e traces de produção;
- origem pública e Google Client ID.

Segredos não pertencem ao arquivo de configuração nem ao repositório.

## Criar o OAuth Client no Google

No projeto Google Cloud que controla a implantação:

1. Configure a tela de consentimento OAuth com as informações institucionais.
2. Crie um cliente do tipo **Aplicativo da Web**.
3. Use um nome operacional que identifique o Worker, sem dados pessoais.
4. Cadastre exatamente este URI de redirecionamento:

   ```text
   https://mcp.seu-dominio.com/oauth/google/callback
   ```

5. Copie o Client ID para `MCP_GOOGLE_CLIENT_ID` em `wrangler.jsonc`.
6. Grave o Client Secret somente no Worker como `MCP_GOOGLE_CLIENT_SECRET`.

Não coloque o Client Secret em README, issue, commit, print, log, GitHub Actions ou mensagem de suporte.

## Configurar os segredos do Worker

```powershell
npx wrangler secret put MCP_GOOGLE_CLIENT_SECRET
npx wrangler secret put MCP_ALLOWED_EMAILS
```

`MCP_ALLOWED_EMAILS` recebe e-mails completos separados por vírgula. Trate essa lista como dado pessoal e não a versione.

Exemplo de formato, somente para ilustrar:

```text
usuario.autorizado@example.com,segunda.conta@example.com
```

Esses são os únicos segredos do Worker. Não existe Bearer estático nem token administrativo: todo acesso ao endpoint MCP passa pelo OAuth 2.1 com Google.

## Variáveis públicas

| Nome | Função |
| --- | --- |
| `MCP_PUBLIC_ORIGIN` | Origem canônica HTTPS do servidor OAuth |
| `MCP_GOOGLE_CALLBACK_ORIGIN` | Origem usada para construir o callback Google |
| `MCP_GOOGLE_CLIENT_ID` | Identificador público do OAuth Client Google |
| `JURISPRUDENCIAIA_URL` | Serviço de pesquisa consultado pelo runner |
| `REQUEST_TIMEOUT_MS` | Limite de tempo da consulta |
| `RATE_LIMIT_WINDOW_MS` | Janela do rate limit |
| `RATE_LIMIT_MAX_REQUESTS` | Requisições permitidas por janela |

`MCP_ALLOWED_ORIGINS` e `MCP_ICON_URL` são opcionais. Não use uma origem curinga.

## Build e publicação

O build gera os tipos Cloudflare antes do TypeScript, por isso funciona também em checkout limpo:

```powershell
npm install
npm run verify
npm run deploy:worker
```

Se preferir publicar por build automático conectado ao repositório, use:

```text
Build command: npm run build
Deploy command: npx wrangler deploy
Production branch: main
```

Mantenha um único controlador de deploy: se o build automático publica, a integração contínua deve apenas validar, sem publicar uma segunda versão em paralelo.

## Verificação

Saúde:

```text
GET https://mcp.seu-dominio.com/healthz
```

Resposta esperada:

```json
{"ok":true,"service":"jurisprudenciaia-mcp"}
```

Metadados protegidos:

```text
GET /.well-known/oauth-protected-resource
GET /.well-known/oauth-authorization-server
```

Diagnóstico automatizado da descoberta e do fluxo Claude:

```powershell
npm run check:claude-oauth -- https://mcp.seu-dominio.com/mcp
```

O diagnóstico deve confirmar descoberta, registro dinâmico, PKCE S256 e redirecionamento para autorização. O Codex deve ser validado com `codex mcp login jurisprudenciaia`. Nenhum diagnóstico deve imprimir Client Secret, token ou identidade.

## Conectar um usuário no Claude

O administrador entrega somente a URL pública do MCP:

```text
https://mcp.seu-dominio.com/mcp
```

Client ID e Client Secret avançados ficam vazios. O usuário clica em **Continuar com Google** e seleciona uma conta que já esteja em `MCP_ALLOWED_EMAILS`.

Não envie a allowlist ao usuário e não peça print da tela real de seleção de contas.

## Conectar um usuário no Codex

Cadastre a mesma URL como servidor Streamable HTTP e use **Autenticar** ou:

```powershell
codex mcp login jurisprudenciaia
```

O Worker aceita somente callbacks loopback estritos do Codex e clientes públicos com Authorization Code. O Google continua usando exclusivamente o callback HTTPS do Worker; não cadastre portas locais no OAuth Client do Google.

## Revogação

Para remover uma pessoa, retire seu e-mail de `MCP_ALLOWED_EMAILS` e revogue as autorizações/tokens persistidos conforme o procedimento operacional da conta Cloudflare.

Para suspeita de vazamento:

1. Gire `MCP_GOOGLE_CLIENT_SECRET` no Google e no Worker.
2. Revogue clientes, grants ou tokens OAuth afetados no armazenamento do Worker.
3. Inspecione logs somente por códigos e request IDs, sem divulgar dados pessoais.

## Política de capturas

As imagens em `docs/assets/oauth-guide/` são mockups reproduzíveis. Elas podem mostrar a URL pública e nomes genéricos, mas não contêm:

- conta ou e-mail real;
- avatar ou nome do usuário;
- Google Client ID ou Client Secret;
- IDs de conta/projeto Cloudflare;
- tokens, códigos OAuth ou cookies;
- referência de erro ou atendimento.

Ao atualizar o guia, regenere os mockups. Não substitua essas imagens por screenshots da sessão real.
