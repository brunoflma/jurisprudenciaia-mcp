# Usar no Claude-3p com mcp-remote

O Claude-3p usa uma bridge STDIO para acessar servidores MCP remotos. Neste projeto, a bridge recomendada e `mcp-remote`, usando OAuth 2.1 com Dynamic Client Registration e callback HTTP estritamente loopback.

Nao configure Client ID ou Client Secret estatico. O `mcp-remote` registra um cliente publico temporario e usa Authorization Code com PKCE S256.

## Configuracao

Adicione ao `config.json` do Claude-3p:

```json
{
  "mcpServers": {
    "jurisprudenciaia": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@latest",
        "https://mcp.seu-dominio.com/mcp",
        "--host",
        "127.0.0.1",
        "--transport",
        "http-only",
        "--auth-timeout",
        "120"
      ]
    }
  }
}
```

`127.0.0.1` e preferivel a `localhost` para evitar ambiguidades de resolucao. A porta inicial padrao do `mcp-remote` e `3334`; se estiver ocupada, ele seleciona outra porta disponivel. O Worker aceita a porta dinamica somente no host loopback e no caminho exato `/oauth/callback`.

## Primeiro acesso

1. Reinicie o Claude-3p depois de salvar o arquivo.
2. Aguarde o navegador abrir a pagina de consentimento.
3. Confira o aviso `Aplicativo local`.
4. Continue com Google usando uma conta presente na allowlist privada.
5. Volte ao Claude-3p e confirme que as ferramentas foram carregadas.

## Estado OAuth antigo

Se o `mcp-remote` reutilizar um registro ou token anterior, encerre o Claude-3p e remova somente o estado local correspondente ao servidor antes de reconectar. A localizacao padrao usada pelo `mcp-remote` e a pasta `.mcp-auth` no perfil do usuario.

Nao remova outros arquivos de configuracao e nao coloque tokens, Client IDs ou Client Secrets no `config.json`.

## Diagnostico do servidor

Antes de testar no Claude-3p, valide discovery, DCR loopback, porta dinamica e PKCE:

```powershell
npm run check:loopback-oauth
```

O resultado esperado e:

```text
Loopback OAuth OK: discovery, DCR publico, porta dinamica e PKCE S256 validados.
```

Esse smoke test nao conclui o login Google. A validacao ponta a ponta exige o navegador e o listener local iniciado pelo `mcp-remote`.

## Controles de seguranca

- callbacks HTTPS continuam limitados aos clientes hospedados aprovados;
- callbacks locais aceitam somente `http://127.0.0.1:<porta>/oauth/callback` ou `http://localhost:<porta>/oauth/callback`;
- callbacks de LAN, `0.0.0.0`, IPv6, HTTPS local, caminhos alternativos, query e fragmento sao rejeitados;
- clientes loopback devem ser publicos e usar PKCE S256;
- a allowlist Google continua obrigatoria;
- o Worker nao confia no nome declarado pelo cliente.

