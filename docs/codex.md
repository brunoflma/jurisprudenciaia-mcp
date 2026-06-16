# Usar no Codex

O caminho recomendado no Codex é `HTTP com streaming` usando o Worker publicado. Use `STDIO` apenas para desenvolvimento local.

## HTTP com streaming

O Codex não usa o OAuth do Claude.ai/ChatGPT nessa tela. Ele lê uma variável local chamada `MCP_BEARER_TOKEN` e envia `Authorization: Bearer <token>` para o Worker.

### 1. Configure o token no Worker

No projeto publicado, grave o token como Cloudflare Worker Secret:

```powershell
npx wrangler secret put MCP_BEARER_TOKEN
```

Cole um token longo e aleatório quando o Wrangler pedir o valor. O workflow público atual sincroniza os secrets OAuth, mas não sincroniza esse token opcional automaticamente.

Não use `MCP_ACCESS_TOKEN_SECRET` aqui. Esse secret é interno do OAuth do Worker e não deve ser colado em clientes.

### 2. Configure o mesmo token no Windows

Defina o mesmo valor como variável de usuário do Windows:

```powershell
[Environment]::SetEnvironmentVariable("MCP_BEARER_TOKEN", "<mesmo valor do Worker>", "User")
```

Feche e abra o Codex depois disso. Uma variável definida apenas com `$env:MCP_BEARER_TOKEN=...` vale só para aquele PowerShell e normalmente não chega ao Codex Desktop já aberto.

### 3. Preencha a tela do Codex

Na tela `Conectar a um MCP personalizado` ou `Atualizar MCP`:

```text
Nome: jurisprudenciaia-mcp
Tipo: HTTP com streaming
URL: https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp
Variável de ambiente de token do portador: MCP_BEARER_TOKEN
```

Se você configurou domínio customizado:

```text
URL: https://mcp.<seu-dominio>/mcp
```

Você também pode configurar diretamente em `~/.codex/config.toml`:

```toml
[mcp_servers.jurisprudenciaia-mcp]
url = "https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp"
bearer_token_env_var = "MCP_BEARER_TOKEN"
enabled = true
tool_timeout_sec = 120
default_tools_approval_mode = "prompt"
```

Não coloque o token na URL nem em `http_headers` fixos no arquivo de configuração.

### 4. Teste fora da interface

Para testar o mesmo fluxo HTTP/Bearer que o Codex usa:

```powershell
$env:MCP_BEARER_TOKEN = [Environment]::GetEnvironmentVariable("MCP_BEARER_TOKEN", "User")
npm run check:codex-http -- https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp
```

O teste deve listar estas ferramentas e fazer uma chamada real:

```text
consultar_jurisprudenciaia
pesquisar_jurisprudencia
buscar_precedentes
analisar_tese_juridica
comparar_teses_juridicas
```

Se o teste mostrar `MCP_BEARER_TOKEN nao esta definido`, o Codex também não conseguirá autenticar. Se mostrar `HTTP 401` ou `HTTP 403`, o token local e o secret do Worker não são o mesmo valor. Se a conexão funcionar mas a chamada der timeout, aumente o tempo de espera da chamada ou confira a disponibilidade da API do JurisprudenciaIA.

Depois de criar ou alterar um MCP, abra uma conversa nova no Codex. A lista de ferramentas pode ser carregada no início da sessão.

## STDIO local

Use esta opção quando quiser rodar o MCP localmente no Codex sem passar pelo Worker.

Prepare o projeto:

```powershell
npm ci
npm run build
```

Na tela `Conectar a um MCP personalizado`, selecione `STDIO` e preencha:

```text
Nome: jurisprudenciaia-mcp-local
Comando para iniciar: node
Argumento 1: dist/src/stdio.js
Diretório de trabalho: <caminho-do-clone>
```

Variáveis de ambiente recomendadas:

```text
JURISPRUDENCIAIA_URL=https://www.jurisprudenciaia.com.br/
REQUEST_TIMEOUT_MS=120000
```

Para desenvolvimento sem build, use:

```text
Comando para iniciar: npx
Argumento 1: tsx
Argumento 2: src/stdio.ts
Diretório de trabalho: <caminho-do-clone>
```

## Privacidade

O modo HTTP usa Bearer token no Codex, OAuth no Claude/ChatGPT e rate limit no Worker. O modo STDIO roda localmente e não usa os secrets OAuth do Worker.

Nos dois modos, consultas jurídicas podem conter dados sensíveis. Evite registrar consultas, nomes de partes, CPF, e-mails, números de processo sigilosos ou trechos de casos concretos em logs públicos.
