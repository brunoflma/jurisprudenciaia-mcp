# Configuracao e publicacao

Este projeto e um conector MCP auto-hospedado para Claude.ai, ChatGPT ou Codex. Ele roda em Cloudflare Workers Free e consulta o JurisprudenciaIA por HTTP, sem navegador remoto, login ou senha.

Se preferir um roteiro visual, abra `docs/deploy-guide.html` no navegador.

O fluxo recomendado e:

1. Gerar os segredos OAuth e Bearer localmente.
2. Gravar os segredos no Cloudflare Worker, sem coloca-los no repositorio publico.
3. Manter GitHub Actions como CI somente.
4. Publicar por um unico controlador de deploy. O estado atual verificado e publicacao controlada por Wrangler; uma integracao de build do provedor so deve ser usada se substituir Wrangler como controlador unico.
5. Cadastrar a URL final no Claude.ai, ChatGPT ou Codex.

## 1. Gerar os segredos do MCP

Voce precisa de tres valores obrigatorios para OAuth:

```text
MCP_OAUTH_CLIENT_ID
MCP_OAUTH_CLIENT_SECRET
MCP_ACCESS_TOKEN_SECRET
```

Use este Client ID:

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

Este guia usa `jurisprudenciaia-mcp-client` como Client ID padrao. Use exatamente esse mesmo valor no GitHub, no Worker, no Claude.ai e no ChatGPT.

Se for usar o Codex por `HTTP com streaming`, gere também um Bearer token estático:

```shell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Guarde como:

```text
MCP_BEARER_TOKEN=<resultado do terceiro comando>
```

Importante:

- `MCP_OAUTH_CLIENT_SECRET` será usado no Cloudflare Worker e no Claude.ai.
- `MCP_ACCESS_TOKEN_SECRET` será usado somente no Cloudflare Worker.
- `MCP_BEARER_TOKEN` será usado no Cloudflare Worker e no ambiente local do Codex, tanto no Windows quanto no macOS.
- Nenhum desses valores deve entrar no código ou em arquivos do repositório.

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

Esse valor sera usado pela integracao de build do provedor ou pela sessao local do Wrangler:

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

Esse valor sera usado pela integracao de build do provedor ou pela sessao local do Wrangler:

```text
CLOUDFLARE_ACCOUNT_ID
```

## 4. Configurar os secrets do Worker

Configure estes nomes no Cloudflare Worker:

```text
MCP_OAUTH_CLIENT_ID
MCP_OAUTH_CLIENT_SECRET
MCP_ACCESS_TOKEN_SECRET
MCP_OAUTH_REDIRECT_URIS
```

Valores esperados:

```text
MCP_OAUTH_CLIENT_ID=jurisprudenciaia-mcp-client
MCP_OAUTH_CLIENT_SECRET=<Client Secret gerado no passo 1>
MCP_ACCESS_TOKEN_SECRET=<segredo de assinatura gerado no passo 1>
MCP_OAUTH_REDIRECT_URIS=<URLs de redirecionamento permitidas separadas por virgula>
```

Obrigatoriamente para o funcionamento do fluxo OAuth, voce deve criar o secret `MCP_OAUTH_REDIRECT_URIS` separando as URLs exatas por virgula.

O ChatGPT recusara a conexao se esse valor nao for exatamente igual ao secret `MCP_OAUTH_CLIENT_ID` do Worker. Se mudar o Client ID no Cloudflare, mude tambem o secret do Worker antes do proximo deploy.

Opcionalmente, crie tambem o secret `MCP_BEARER_TOKEN` se voce for usar Codex por `HTTP com streaming`.

Para configurar manualmente via Wrangler:

```powershell
npx wrangler login
npx wrangler secret put MCP_OAUTH_CLIENT_ID
npx wrangler secret put MCP_OAUTH_CLIENT_SECRET
npx wrangler secret put MCP_ACCESS_TOKEN_SECRET
npx wrangler secret put MCP_OAUTH_REDIRECT_URIS
npx wrangler secret put MCP_BEARER_TOKEN # opcional para Codex
```

## 5. Publicar o Worker

No ambiente de producao deste projeto, Cloudflare Workers e o unico runtime de producao. O controlador de deploy deve ser unico por vez.

O estado atual verificado e publicacao controlada por Wrangler. Se uma integracao de build do provedor for ativada no futuro, ela deve substituir o deploy manual por Wrangler como controlador unico, conectada ao repositorio de origem autorizado e a branch de producao configurada.

A instalacao GitHub App da Cloudflare pode permanecer com acesso aos repositorios definidos pela conta para facilitar novos projetos. A restricao operacional deste projeto e por configuracao efetiva de build/deploy: nao habilite triggers de build aqui enquanto Wrangler for o controlador escolhido.

Configuracao esperada:

```text
Build command: npm run verify
Deploy command: npx wrangler deploy
```

GitHub Actions roda CI e `npx wrangler deploy --dry-run`; ele nao publica producao e nao sincroniza Worker secrets.

Render, Jules, Codex e Cloudflare nao devem observar o mesmo PR como automacoes independentes. A politica operacional esta em `docs/operations/integration-ownership.md`.

### Opcional para Codex: configurar Bearer no Worker

Se voce for usar o Codex por `HTTP com streaming`, configure `MCP_BEARER_TOKEN` diretamente como secret do Worker:

```shell
npx wrangler login
npx wrangler secret put MCP_BEARER_TOKEN
```

Quando o Wrangler pedir o valor, cole o `MCP_BEARER_TOKEN` gerado no passo 1. O mesmo valor deve existir no ambiente local do Codex no Windows ou no macOS.

## 6. Descobrir a URL final do Worker

Depois do deploy, a URL deve ficar parecida com:

```text
https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev
```

O endpoint MCP que vai para o Claude.ai, ChatGPT ou Codex e:

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
{"ok":true,"service":"jurisprudenciaia-mcp"}
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
OAuth Client ID: <mesmo valor de MCP_OAUTH_CLIENT_ID>
OAuth Client Secret: <mesmo valor de MCP_OAUTH_CLIENT_SECRET>
```

7. Salve/conecte o conector.

O Claude deve executar o fluxo OAuth, receber um Bearer token e listar estas ferramentas:

- `consultar_jurisprudenciaia`
- `pesquisar_jurisprudencia`
- `buscar_precedentes`
- `analisar_tese_juridica`
- `comparar_teses_juridicas`
- `buscar_por_cnj`
- `pesquisar_legislacao`
- `buscar_informativos`
- `analisar_jurimetria`
- `linha_do_tempo_precedentes`
- `buscar_citacoes_dispositivo`
- `historico_alteracoes_norma`
- `listar_overruling_tema`
- `buscar_precedentes_qualificados`

## 9. Configurar no Codex

O Codex pode usar o Worker por `HTTP com streaming` ou rodar o servidor local por `STDIO`.

Para `HTTP com streaming`, use:

```text
Nome: jurisprudenciaia-mcp
URL: https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp
Variável de ambiente de token do portador: MCP_BEARER_TOKEN
```

O valor local de `MCP_BEARER_TOKEN` precisa ser exatamente o mesmo secret configurado no Worker. Não coloque esse token em URL, README, issue, print público ou `config.toml`.

No Windows:

```powershell
[Environment]::SetEnvironmentVariable("MCP_BEARER_TOKEN", "<mesmo valor do Worker>", "User")
```

No macOS, para Codex Desktop aberto pelo Dock, Finder ou Spotlight:

```zsh
launchctl setenv MCP_BEARER_TOKEN "<mesmo valor do Worker>"
```

No macOS, para Codex usado pelo Terminal:

```zsh
echo 'export MCP_BEARER_TOKEN="<mesmo valor do Worker>"' >> ~/.zshrc
source ~/.zshrc
```

Depois de criar ou alterar a variável, feche e abra o Codex.

Use o guia especifico:

```text
docs/codex.md
```

## 10. Configurar no ChatGPT

No ChatGPT:

1. Habilite o modo desenvolvedor em `Configuracoes > Aplicativos`.
2. Crie um app novo.
3. Em `Conexao`, escolha `URL do servidor` e informe:

```text
https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp
```

4. Em `Autenticacao`, escolha `OAuth`.
5. Em configuracoes avancadas, escolha `Cliente OAuth definido pelo usuario`.
6. Informe:

```text
Client ID: jurisprudenciaia-mcp-client
Client Secret: <mesmo valor de MCP_OAUTH_CLIENT_SECRET>
Token endpoint auth method: client_secret_post
```

O aviso sobre DCR ou CIMD indica apenas que o Worker nao oferece registro dinamico de cliente. Use o cliente OAuth definido pelo usuario.

Se o ChatGPT abrir campos avancados, confira:

```text
URL de autorizacao: https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/oauth/authorize
Token URL: https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/oauth/token
URL de registro: deixe em branco
Endereco base do servidor de autorizacao: https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev
Recurso: https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp
Escopo, se solicitado: jurisprudenciaia:search
```

Antes de tentar novamente no ChatGPT, voce pode testar o mesmo fluxo OAuth:

```powershell
$env:MCP_OAUTH_CLIENT_ID = Read-Host "Cole o OAuth Client ID do Worker"
$env:MCP_OAUTH_CLIENT_SECRET = Read-Host "Cole o OAuth Client Secret do Worker"
npm run check:chatgpt-oauth -- https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp
```

Se o Claude, ChatGPT ou Codex continuar mostrando apenas uma ferramenta depois de um deploy novo, desconecte e conecte o MCP novamente para forcar a atualizacao do schema.

## 11. Teste no cliente escolhido

Depois de conectar no Claude.ai, ChatGPT ou Codex, envie uma mensagem como:

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
- O access token OAuth e emitido pelo fluxo Authorization Code com PKCE quando o cliente envia PKCE; clientes confidenciais com `client_secret_post` tambem sao aceitos.
- Claude.ai e ChatGPT recebem apenas `MCP_OAUTH_CLIENT_ID` e `MCP_OAUTH_CLIENT_SECRET`.
- O Codex recebe somente o nome da variável local `MCP_BEARER_TOKEN`; o valor real deve ficar no ambiente local do Windows/macOS e no Worker.
- `MCP_ACCESS_TOKEN_SECRET` fica somente no Worker.
- Para revogar OAuth, troque `MCP_OAUTH_CLIENT_SECRET` e `MCP_ACCESS_TOKEN_SECRET` no Worker e publique uma nova versao. Para revogar Codex Bearer, troque `MCP_BEARER_TOKEN`.
- O repositorio nao deve conter chaves Cloudflare, GitHub, Browserless ou tokens reais.
- GitHub Pages nao serve para este caso porque e hospedagem estatica.
- GitHub Actions tambem nao e um servidor HTTPS sempre disponivel.
- Cloudflare Workers Free funciona aqui porque o conector atual nao precisa executar navegador.

## Publicacao manual

Use este caminho enquanto Wrangler for o controlador operacional escolhido:

```powershell
npm install
npm run verify
npx wrangler login
npx wrangler secret put MCP_OAUTH_CLIENT_ID
npx wrangler secret put MCP_OAUTH_CLIENT_SECRET
npx wrangler secret put MCP_ACCESS_TOKEN_SECRET
npx wrangler secret put MCP_OAUTH_REDIRECT_URIS
npx wrangler secret put MCP_BEARER_TOKEN # opcional para Codex
npm run deploy:worker
```
