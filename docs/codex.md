# Usar no Codex

O Codex aceita MCP por dois caminhos:

- `HTTP com streaming`: recomendado para usar o Worker publicado na Cloudflare.
- `STDIO`: útil para desenvolvimento local, iniciando o MCP como processo no computador.

## Opção recomendada: HTTP com streaming

Use esta opção quando o Worker já estiver publicado.

Na tela `Conectar a um MCP personalizado`:

```text
Nome: jurisprudenciaia-mcp
Tipo: HTTP com streaming
URL: https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp
```

Se você configurou domínio customizado para resolver o favicon com mais previsibilidade:

```text
URL: https://mcp.<seu-dominio>/mcp
```

O Worker exige OAuth para `/mcp`. No Codex CLI, depois de adicionar o servidor, execute:

```powershell
codex mcp login jurisprudenciaia-mcp
```

Você também pode configurar o servidor diretamente em `~/.codex/config.toml`:

```toml
[mcp_servers.jurisprudenciaia-mcp]
url = "https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp"
enabled = true
tool_timeout_sec = 120
default_tools_approval_mode = "prompt"
```

Depois rode:

```powershell
codex mcp login jurisprudenciaia-mcp
```

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

O modo HTTP usa OAuth e rate limit do Worker. O modo STDIO roda localmente e não usa os secrets OAuth do Worker.

Nos dois modos, consultas jurídicas podem conter dados sensíveis. Evite registrar consultas, nomes de partes, CPF, e-mails, números de processo sigilosos ou trechos de casos concretos em logs públicos.
