# Guia de migração: OAuth 2.1 e loopback para MCPs remotos

Este guia é o roteiro operacional para migrar cada MCP privado para OAuth 2.1 com **Dynamic Client Registration (DCR)**. Ele permite clientes hospedados, como Claude.ai, e clientes locais com bridge, como Claude-3p com \`mcp-remote\`.

Para uma explicação humana e visual, veja [oauth21-loopback-migration-guide.html](oauth21-loopback-migration-guide.html).

## Resultado esperado

Cada Worker deve aceitar DCR somente para estes perfis:

| Perfil | Redirect URI permitido | Proteção |
| --- | --- | --- |
| Hospedado | \`https://claude.ai/api/mcp/auth_callback\` | URL HTTPS exata |
| Hospedado | \`https://claude.com/api/mcp/auth_callback\` | URL HTTPS exata |
| Local loopback | \`http://127.0.0.1:<porta>/oauth/callback\` | Cliente público e PKCE S256 |
| Local loopback | \`http://localhost:<porta>/oauth/callback\` | Cliente público e PKCE S256 |

Nunca aceite domínios parecidos, IPs de LAN, \`0.0.0.0\`, IPv6, HTTPS loopback, paths alternativos, query string, fragmentos ou misturas entre perfis.

## 1. Preparar o projeto

1. Trabalhe somente no repositório privado do MCP.
2. Não faça commit, push ou sincronização com repositório público antes do aceite.
3. Nunca grave tokens, Client Secrets, cookies ou chaves em código, documentos versionados, testes, logs ou comandos.
4. Preserve domínio, KV, Durable Objects e bindings existentes. A mudança é de política OAuth, não de armazenamento.
5. Leia os arquivos de ignore antes de pesquisar o projeto.

## 2. Implementar uma política estrita de callbacks

Crie um módulo isolado, por exemplo \`src/oauth/client-policy.ts\`, com estas responsabilidades:

1. classificar uma redirect URI como \`hosted\`, \`loopback\` ou inválida;
2. validar os metadados recebidos no DCR;
3. exigir PKCE S256 na autorização de clientes loopback.

A regra para loopback deve exigir simultaneamente:

- protocolo \`http:\`;
- host exatamente \`127.0.0.1\` ou \`localhost\`;
- porta explícita entre 1 e 65535;
- path exatamente \`/oauth/callback\`;
- sem usuário, senha, query ou hash.

Para clientes loopback, exija:

~~~
token_endpoint_auth_method === "none"
grant_types inclui "authorization_code"
grant_types contém somente "authorization_code" e, opcionalmente, "refresh_token"
response_types === ["code"]
code_challenge_method === "S256"
~~~

Não use \`client_name\` como segurança: ele é declarado pelo cliente e pode mudar.

## 3. Ligar a política ao provider OAuth

Registre a validação no callback de DCR da biblioteca OAuth e mantenha o endpoint de registro anunciado no metadata:

~~~ts
const provider = new OAuthProvider({
  apiRoute: "/mcp",
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
  clientRegistrationCallback: ({ clientMetadata }) => {
    if (!validateDynamicClientMetadata(clientMetadata)) {
      return {
        code: "invalid_client_metadata",
        description: "Callback ou metadados OAuth não permitidos.",
        status: 400
      };
    }
  },
  allowPlainPKCE: false,
  allowImplicitFlow: false
});
~~~

No início da autorização, depois de analisar a requisição OAuth e antes de criar estado ou redirecionar ao provedor de identidade, valide o PKCE loopback:

~~~ts
const authRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
requireLoopbackPkce(authRequest);
~~~

O callback do Google, ou de outro provedor de identidade, continua HTTPS no domínio público do Worker. Loopback é somente o redirect final do cliente MCP.

## 4. Preservar o login privado

DCR não substitui a autenticação de usuários:

- mantenha a allowlist privada de e-mails;
- mantenha a troca do código do provedor de identidade no callback HTTPS público;
- mantenha TTL explícita para estados, access tokens e refresh tokens;
- exponha erros genéricos no navegador e registre apenas códigos seguros no Worker;
- deixe segredos somente no armazenamento de secrets da Cloudflare.

## 5. Criar testes unitários

Cubra no mínimo:

1. aceitar os dois callbacks hospedados exatos;
2. aceitar \`127.0.0.1\` e \`localhost\` com porta dinâmica e \`/oauth/callback\`;
3. rejeitar sem porta, path diferente, query, hash, credenciais na URL, \`0.0.0.0\`, LAN, IPv6 e HTTPS loopback;
4. rejeitar um registro que misture callback hospedado e loopback;
5. exigir \`token_endpoint_auth_method: "none"\` para loopback;
6. exigir Authorization Code e response type \`code\`;
7. rejeitar autorização loopback sem PKCE S256;
8. preservar o fluxo hospedado existente.

Casos que devem ser rejeitados:

~~~
http://127.0.0.1/oauth/callback
http://127.0.0.1:3334/other
http://127.0.0.1:3334/oauth/callback?next=x
http://0.0.0.0:3334/oauth/callback
http://192.168.0.10:3334/oauth/callback
https://127.0.0.1:3334/oauth/callback
http://[::1]:3334/oauth/callback
~~~

## 6. Criar um smoke test público

Inclua um script como \`scripts/check-loopback-oauth.mjs\` que:

1. leia \`/.well-known/oauth-protected-resource/mcp\`;
2. leia o authorization-server metadata indicado;
3. faça DCR com um cliente público e \`http://127.0.0.1:3334/oauth/callback\`;
4. confirme HTTP 201 e um \`client_id\`;
5. monte a autorização com \`code_challenge_method=S256\`;
6. confirme que \`/authorize\` entrega a página de consentimento.

O teste não deve fazer login de usuário nem usar segredos. DCR cria um cliente temporário; documente a TTL configurada para esse registro.

Inclua no \`package.json\`:

~~~json
"check:loopback-oauth": "node scripts/check-loopback-oauth.mjs"
~~~

## 7. Validar antes da publicação

No repositório privado, execute:

~~~powershell
npm test -- tests/worker.test.ts tests/oauth-google.test.ts
npx wrangler deploy --dry-run
~~~

Só continue se os testes passarem e o dry-run listar domínio, KV, Durable Objects e variáveis públicas esperadas. Não revele o conteúdo dos secrets.

## 8. Publicar apenas o Worker privado

Depois da validação:

~~~powershell
npx wrangler deploy
~~~

Esse comando publica o Worker, mas não cria commit nem envia código ao GitHub. Registre o \`Current Version ID\` no handoff.

> **Erro recorrente no Windows:** não envie valores por pipeline para \`wrangler secret put\`. O Wrangler pode informar sucesso e criar secret vazio. Digite cada valor no prompt interativo e valide o comportamento real depois do deploy.

## 9. Verificar a produção

Execute:

~~~powershell
npm run check:loopback-oauth
~~~

Resultado esperado:

~~~
Loopback OAuth OK: discovery, DCR publico, porta dinamica e PKCE S256 validados.
~~~

Se o código local aceitar loopback, mas produção responder \`invalid_client_metadata\`, trate como falha de publicação: confirme Worker e domínio, publique o bundle validado e rode o smoke test novamente. Nunca abra callbacks inseguros para contornar o problema.

## 10. Configurar Claude-3p

Use \`mcp-remote\` sem Client ID ou Client Secret estático:

~~~json
{
  "mcpServers": {
    "nome-do-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@latest",
        "https://SEU-DOMINIO/mcp",
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
~~~

1. Reinicie Claude-3p.
2. Confirme no navegador o aviso de \`Aplicativo local\`.
3. Entre com um e-mail presente na allowlist.
4. Volte ao cliente e teste uma ferramenta do MCP.

Se o \`mcp-remote\` reaproveitar estado obsoleto, feche o cliente e limpe apenas o estado daquele servidor na pasta local \`.mcp-auth\`. Não remova configurações de outros MCPs.

## Checklist de aceite

- [ ] DCR está anunciado no metadata OAuth.
- [ ] Callbacks Claude hospedados continuam funcionais.
- [ ] Loopback aceita somente host, porta e path estritos.
- [ ] Loopback exige cliente público e PKCE S256.
- [ ] Nenhum segredo foi exposto ou versionado.
- [ ] Testes unitários e dry-run passaram.
- [ ] O Worker privado foi publicado e a versão foi registrada.
- [ ] O smoke test público passou.
- [ ] Claude-3p/mcp-remote completou login e listou ferramentas.
- [ ] Nenhum repositório público foi atualizado antes do aceite.

