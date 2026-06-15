# Usar no Codex

O Codex aceita MCP por dois caminhos:

- `HTTP com streaming`: recomendado para usar o Worker publicado na Cloudflare.
- `STDIO`: útil para desenvolvimento local, iniciando o MCP como processo no computador.

## Opção recomendada: HTTP com streaming

Use esta opção quando o Worker já estiver publicado.

Antes de abrir o Codex, configure no Worker um Cloudflare Secret chamado `MCP_BEARER_TOKEN` e defina no ambiente local do Codex o mesmo valor.

No projeto publicado:

```powershell
npx wrangler secret put MCP_BEARER_TOKEN
```

Cole o Bearer token gerado para o Codex quando o Wrangler pedir o valor. O workflow público atual sincroniza os secrets OAuth, mas não sincroniza esse token opcional automaticamente.

PowerShell:

```powershell
$env:MCP_BEARER_TOKEN="<mesmo valor do Cloudflare Worker Secret MCP_BEARER_TOKEN>"
```

Na tela `Conectar a um MCP personalizado` ou `Atualizar MCP`:

```text
Nome: jurisprudenciaia-mcp
Tipo: HTTP com streaming
URL: https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp
Variável de ambiente de token do portador: MCP_BEARER_TOKEN
```

Se você configurou domínio customizado para resolver o favicon com mais previsibilidade:

```text
URL: https://mcp.<seu-dominio>/mcp
```

Você também pode configurar o servidor diretamente em `~/.codex/config.toml`:

```toml
[mcp_servers.jurisprudenciaia-mcp]
url = "https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp"
bearer_token_env_var = "MCP_BEARER_TOKEN"
enabled = true
tool_timeout_sec = 120
default_tools_approval_mode = "prompt"
```

O Codex lê `MCP_BEARER_TOKEN` do ambiente local e envia `Authorization: Bearer <token>` para o Worker. Não coloque o token na URL nem em `http_headers` fixos no arquivo de configuração.

O Worker também expõe OAuth para clientes como Claude.ai e ChatGPT. Se uma versão do Codex oferecer login OAuth no seu ambiente, ele pode ser usado como alternativa; para a tela mostrada atualmente, o campo correto é `Variável de ambiente de token do portador`.

O Codex usa as instruções MCP retornadas no `initialize`, então este servidor já anuncia que as ferramentas devem preservar ementa, inteiro teor, links e cautelas de validação.

## Alternativa local: STDIO

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
