# Configuracao e publicacao

Este projeto e um conector MCP auto-hospedado para Claude.ai ou Codex. Ele roda em Cloudflare Workers Free e consulta o JurisprudenciaIA por HTTP, sem navegador remoto, login ou senha.

O repositorio publico deve conter apenas codigo, testes e documentacao. Cada usuario cria a propria instancia do Worker, os proprios GitHub Secrets e o proprio conector no Claude.ai.

Se preferir um roteiro visual, abra `docs/deploy-guide.html` no navegador.

O fluxo recomendado e:

1. Criar um token de deploy no Cloudflare.
2. Colocar esse token e os segredos OAuth no GitHub Secrets.
3. Rodar o workflow `Deploy Worker`.
4. Cadastrar a URL final no Claude.ai ou no Codex.

## 1. Gerar os segredos do MCP

Voce precisa de tres valores para o MCP:

```text
MCP_OAUTH_CLIENT_ID
MCP_OAUTH_CLIENT_SECRET
MCP_ACCESS_TOKEN_SECRET
```

Use este Client ID de exemplo:

```text
jurisprudenciaia-mcp-client
```

Gere o Client Secret:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Gere o segredo de assinatura dos access tokens:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Guarde assim:

```text
MCP_OAUTH_CLIENT_ID=jurisprudenciaia-mcp-client
MCP_OAUTH_CLIENT_SECRET=<resultado do primeiro comando>
MCP_ACCESS_TOKEN_SECRET=<resultado do segundo comando>
```

Importante:

- `MCP_OAUTH_CLIENT_SECRET` sera usado no GitHub e no Claude.ai.
- `MCP_ACCESS_TOKEN_SECRET` sera usado somente no GitHub/Cloudflare Worker.
- Nenhum desses valores deve entrar no codigo ou em arquivos do repositorio.
- Nao publique consultas juridicas reais, resultados do JurisprudenciaIA, nomes de partes, CPFs, e-mails ou outros dados pessoais em logs, issues ou exemplos.

## 2. Criar o Cloudflare API Token

Voce esta na tela correta: `Manage account > Account API tokens > Create a token`.

Na tela do Cloudflare:

1. Em `Token name`, use:

```text
jurisprudenciaia-mcp
```

2. Em `Permission policies`, abra o menu `Custom`.
3. Selecione o modelo pronto `Edit Cloudflare Workers`.
4. Em `Account Resources`, escolha:

```text
Include > <sua-conta-cloudflare>
```

Use o nome exato da conta Cloudflare onde o Worker sera publicado.

5. Se aparecer `Zone Resources`, deixe restrito ao menor escopo que a tela permitir. Para uso com `workers.dev`, sem dominio proprio, nao e necessario dar permissao de DNS.
6. Clique em `Continue to summary`.
7. Revise se o token esta limitado a Workers.
8. Clique em `Create Token`.
9. Copie o token gerado imediatamente.

Esse valor sera o GitHub secret:

```text
CLOUDFLARE_API_TOKEN
```

O Cloudflare mostra esse token uma unica vez. Se voce perder, crie outro.

## 3. Encontrar o Cloudflare Account ID

No Cloudflare Dashboard:

1. Abra a conta Cloudflare onde o Worker sera publicado.
2. Entre em `Compute > Workers & Pages`.
3. Procure `Account ID` na visao geral ou na lateral direita da pagina.
4. Copie o valor.

Esse valor sera o GitHub secret:

```text
CLOUDFLARE_ACCOUNT_ID
```

## 4. Configurar GitHub Secrets

No GitHub:

1. Abra o repositorio `<seu-usuario>/jurisprudenciaia-mcp`.
2. Entre em `Settings`.
3. Entre em `Secrets and variables`.
4. Clique em `Actions`.
5. Clique em `New repository secret`.
6. Crie estes cinco secrets:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
MCP_OAUTH_CLIENT_ID
MCP_OAUTH_CLIENT_SECRET
MCP_ACCESS_TOKEN_SECRET
```

Valores:

```text
CLOUDFLARE_ACCOUNT_ID=<Account ID copiado do Cloudflare>
CLOUDFLARE_API_TOKEN=<API token criado no Cloudflare>
MCP_OAUTH_CLIENT_ID=jurisprudenciaia-mcp-client
MCP_OAUTH_CLIENT_SECRET=<Client Secret gerado no passo 1>
MCP_ACCESS_TOKEN_SECRET=<segredo de assinatura gerado no passo 1>
```

## 5. Publicar o Worker pelo GitHub Actions

No GitHub:

1. Abra a aba `Actions`.
2. Clique no workflow `Deploy Worker`.
3. Clique em `Run workflow`.
4. Confirme em `Run workflow`.
5. Aguarde a execucao terminar.

Quando os cinco secrets estiverem configurados, o workflow vai:

1. Instalar dependencias.
2. Rodar typecheck.
3. Rodar testes.
4. Gerar build.
5. Publicar o Worker com `wrangler deploy`.
6. Sincronizar os secrets OAuth no Worker.

Se algum secret estiver faltando, o workflow fica verde, mas mostra aviso dizendo que pulou o deploy.

## 6. Descobrir a URL final do Worker

Depois do deploy, a URL deve ficar parecida com:

```text
https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev
```

O endpoint MCP que vai para o Claude.ai e:

```text
https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp
```

Nao coloque token na URL.

### Opcional recomendado: dominio customizado para icone no Claude.ai

A URL `workers.dev` funciona para o MCP. Porem o Claude.ai pode carregar o icone pelo Google Favicon (`t1.gstatic.com/faviconV2`) usando apenas `http://<seu-subdominio>.workers.dev`, sem o nome do Worker. Como esse endereco nao e o mesmo host de `jurisprudenciaia-mcp.<seu-subdominio>.workers.dev`, o icone pode continuar ausente na lista de conectores mesmo quando `/favicon.png`, `/favicon.svg` e `/favicon.ico` respondem corretamente.

Para exibicao confiavel do icone, configure uma rota ou dominio customizado no Cloudflare Workers, por exemplo:

```text
https://mcp.<seu-dominio>/mcp
```

Depois use esse endpoint no Claude.ai.

Cloudflare Pages ou GitHub Pages podem hospedar um PNG estatico do icone. Para isso, defina a variavel publica `MCP_ICON_URL` com uma URL HTTPS absoluta:

```text
MCP_ICON_URL=https://<host-estatico>/jurisprudenciaia-mcp.png
```

Essa opcao altera `logo_uri` e o icone principal anunciado no `initialize` do MCP. Configure esse valor como variavel de ambiente do Worker ou como Cloudflare Secret. Ela nao garante a exibicao na lista do Claude quando o cliente decide consultar `t1.gstatic.com` pelo dominio base `workers.dev`; nesse caso, o dominio customizado continua sendo a alternativa mais previsivel.

## 7. Testar o Worker

Abra no navegador:

```text
https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/healthz
```

Resposta esperada:

```json
{"ok":true,"service":"jurisprudenciaia-mcp","runtime":"cloudflare-workers"}
```

Se essa resposta aparecer, o Worker esta online.

## 8. Configurar no Claude.ai

No Claude.ai:

1. Abra `Settings`.
2. Entre em `Connectors`.
3. Clique para adicionar um conector personalizado.
4. Em URL, informe:

```text
https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp
```

5. Abra `Advanced settings`.
6. Informe:

```text
OAuth Client ID: jurisprudenciaia-mcp-client
OAuth Client Secret: <mesmo valor de MCP_OAUTH_CLIENT_SECRET>
```

7. Salve/conecte o conector.

O Claude deve executar o fluxo OAuth, receber um Bearer token e listar estas ferramentas:

- `consultar_jurisprudenciaia`
- `pesquisar_jurisprudencia`
- `buscar_precedentes`
- `analisar_tese_juridica`
- `comparar_teses_juridicas`

## 9. Configurar no Codex

O Codex pode usar o Worker por `HTTP com streaming` ou rodar o servidor local por `STDIO`.

Use o guia especifico:

```text
docs/codex.md
```

Se o Claude continuar mostrando apenas uma ferramenta depois de um deploy novo, desconecte e conecte o MCP novamente para forcar a atualizacao do schema.

## 9. Teste no Claude.ai

Depois de conectar, envie uma mensagem como:

```text
Use consultar_jurisprudenciaia para pesquisar responsabilidade civil por negativacao indevida dano moral.
```

O resultado esperado deve comecar com:

```md
# Resultado JurisprudenciaIA

## Resposta do JurisprudenciaIA

## Tese principal identificada

## Precedentes citados
```

## Seguranca

- A URL do MCP nao contem segredo.
- O Worker exige `Authorization: Bearer <access-token>` para `POST /mcp`.
- O access token e emitido pelo fluxo OAuth Authorization Code com PKCE.
- O Claude.ai recebe apenas `MCP_OAUTH_CLIENT_ID` e `MCP_OAUTH_CLIENT_SECRET`.
- `MCP_ACCESS_TOKEN_SECRET` fica somente no Worker/GitHub.
- Para revogar o acesso, troque `MCP_OAUTH_CLIENT_SECRET` e `MCP_ACCESS_TOKEN_SECRET` no GitHub Secrets e rode o workflow novamente.
- O repositorio nao deve conter chaves Cloudflare, GitHub, Browserless ou tokens reais.
- O repositorio tambem nao deve conter URL operacional privada do seu Worker, dumps de testes do Claude ou respostas reais de consultas juridicas.
- Em repositorios publicos e forks, o CI pode validar o projeto sem secrets. O workflow `Deploy Worker` so publica quando os cinco secrets existem no repositorio que executa o workflow.
- GitHub Pages nao serve para este caso porque e hospedagem estatica.
- GitHub Actions tambem nao e um servidor HTTPS sempre disponivel.
- Cloudflare Workers Free funciona aqui porque o conector atual nao precisa executar navegador.

## Publicacao manual opcional

O fluxo recomendado e pelo GitHub Actions. Se quiser publicar manualmente:

```powershell
npm install
npm run typecheck
npm test
npm run build
npx wrangler login
npx wrangler secret put MCP_OAUTH_CLIENT_ID
npx wrangler secret put MCP_OAUTH_CLIENT_SECRET
npx wrangler secret put MCP_ACCESS_TOKEN_SECRET
npm run deploy:worker
```
