# Conectar no Codex com OAuth

O Codex usa o mesmo OAuth 2.1 com Google do Claude. O usuário não precisa receber Bearer token, Client ID nem Client Secret.

## Adicionar o servidor

Na interface do Codex:

1. Abra **Configurações > Plug-ins > MCPs**.
2. Clique em **Adicionar servidor**.
3. Escolha **Streamable HTTP**.
4. Use o nome `jurisprudenciaia`.
5. Informe:

   ```text
   https://mcp.seu-dominio.com/mcp
   ```

6. Salve e mantenha o servidor habilitado.
7. Clique em **Autenticar**.
8. Na página privada, clique em **Continuar com Google** e escolha uma conta autorizada.

O Codex abre um callback temporário em `127.0.0.1`. Isso é esperado: o Google retorna ao Worker, e o Worker devolve a autorização ao listener local do Codex. Não adicione esse callback efêmero no Google Cloud.

## CLI

Se o servidor já está configurado:

```powershell
codex mcp login jurisprudenciaia
```

Para conferir a configuração:

```powershell
codex mcp get jurisprudenciaia
```

O login deve abrir o navegador e terminar com uma confirmação de autenticação. Depois disso, reinicie o Codex ou abra uma conversa nova para carregar as ferramentas.

## config.toml

Configuração equivalente, sem token:

```toml
[mcp_servers.jurisprudenciaia]
url = "https://mcp.seu-dominio.com/mcp"
auth = "oauth"
enabled = true
tool_timeout_sec = 120
default_tools_approval_mode = "prompt"
```

Não configure `bearer_token_env_var` para o fluxo normal OAuth.

## Segurança do callback local

O Worker aceita somente o formato emitido pelo Codex:

```text
http://127.0.0.1:<porta>/callback/<id-aleatorio>
```

Também há suporte ao loopback IPv6 `[::1]`. São rejeitados `localhost`, hosts externos, HTTPS no loopback, porta ausente, credenciais na URL, query, fragmento e paths diferentes.

O cliente Codex deve usar:

- `token_endpoint_auth_method=none`;
- Authorization Code;
- PKCE S256;
- resposta `code`;
- escopo anunciado pelo servidor.

## Diagnóstico

O conector não aceita Bearer estático. Para validar a implantação, exercite o próprio fluxo OAuth:

```powershell
npm run check:loopback-oauth -- https://mcp.seu-dominio.com/mcp
```

O comando percorre descoberta de metadados, registro dinâmico, PKCE S256 e o callback loopback usado pelo Codex.

## Remover a autorização

```powershell
codex mcp logout jurisprudenciaia
```

Depois do logout, use **Autenticar** ou `codex mcp login jurisprudenciaia` para iniciar um novo fluxo Google.
