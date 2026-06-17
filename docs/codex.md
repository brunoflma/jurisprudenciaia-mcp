# Usar no Codex

O caminho recomendado no Codex é `HTTP com streaming` usando o Worker publicado. Use `STDIO` apenas para desenvolvimento local.

O Codex não usa o OAuth do Claude.ai/ChatGPT nessa tela. Ele lê uma variável local chamada `MCP_BEARER_TOKEN` e envia `Authorization: Bearer <token>` para o Worker.

Essa variável funciona no Windows e no macOS. O importante é que o Codex consiga enxergá-la antes de abrir a conexão MCP.

## HTTP com streaming

### 1. Configure o token no Worker

No projeto publicado, grave o token como Cloudflare Worker Secret:

```powershell
npx wrangler secret put MCP_BEARER_TOKEN
```

Cole um token longo e aleatório quando o Wrangler pedir o valor. O workflow público atual sincroniza os secrets OAuth, mas não sincroniza esse token opcional automaticamente.

Não use `MCP_ACCESS_TOKEN_SECRET` aqui. Esse secret é interno do OAuth do Worker e não deve ser colado em clientes.

### 2. Configure o mesmo token no computador

Use o mesmo valor salvo no Worker.

#### Windows

Defina como variável de usuário do Windows:

```powershell
[Environment]::SetEnvironmentVariable("MCP_BEARER_TOKEN", "<mesmo valor do Worker>", "User")
```

Feche e abra o Codex depois disso. Uma variável definida apenas com `$env:MCP_BEARER_TOKEN=...` vale só para aquele PowerShell e normalmente não chega ao Codex Desktop já aberto.

#### macOS

Se você usa o Codex Desktop aberto pelo Dock, Finder ou Spotlight, grave a variável no ambiente do usuário do macOS:

```zsh
launchctl setenv MCP_BEARER_TOKEN "<mesmo valor do Worker>"
```

Feche e abra o Codex depois disso. Se reiniciar o Mac e a variável sumir, rode o comando novamente antes de abrir o Codex.

Se você usa Codex pelo Terminal, ou quer deixar o valor disponível nos próximos terminais, adicione ao `~/.zshrc`:

```zsh
echo 'export MCP_BEARER_TOKEN="<mesmo valor do Worker>"' >> ~/.zshrc
source ~/.zshrc
```

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

Windows:

```powershell
$env:MCP_BEARER_TOKEN = [Environment]::GetEnvironmentVariable("MCP_BEARER_TOKEN", "User")
npm run check:codex-http -- https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp
```

macOS:

```zsh
export MCP_BEARER_TOKEN="$(launchctl getenv MCP_BEARER_TOKEN)"
npm run check:codex-http -- https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp
```

Se você configurou o token apenas no `~/.zshrc`, abra um novo Terminal ou rode `source ~/.zshrc` antes do teste.

O teste deve listar estas ferramentas e fazer uma chamada real:

```text
consultar_jurisprudenciaia
pesquisar_jurisprudencia
buscar_precedentes
analisar_tese_juridica
comparar_teses_juridicas
```

Se o teste mostrar `MCP_BEARER_TOKEN não está definido`, o Codex também não conseguirá autenticar. Se mostrar `HTTP 401` ou `HTTP 403`, o token local e o secret do Worker não são o mesmo valor. Se a conexão funcionar mas a chamada der timeout, aumente o tempo de espera da chamada ou confira a disponibilidade da API do JurisprudênciaIA.

Depois de criar ou alterar um MCP, abra uma conversa nova no Codex. A lista de ferramentas pode ser carregada no início da sessão.

## STDIO local

Para desenvolvimento local, o servidor MCP também pode rodar via STDIO:

```toml
[mcp_servers.jurisprudenciaia-mcp-local]
command = "node"
args = ["dist/mcp-server.js"]
enabled = true
tool_timeout_sec = 120
default_tools_approval_mode = "prompt"
```

Antes de usar STDIO, rode:

```powershell
npm install
npm run build
```

O modo STDIO não usa o Worker publicado nem `MCP_BEARER_TOKEN`.
