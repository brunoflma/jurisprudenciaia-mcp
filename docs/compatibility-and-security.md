# Compatibilidade e segurança

O servidor utiliza Streamable HTTP com respostas JSON e o handshake MCP legado.
Uma tentativa de `server/discover` com uma revisão moderna não implementada recebe
HTTP 400, permitindo que clientes compatíveis recuem para `initialize`. O servidor
não anuncia capacidades de uma revisão que não implementa.

Os metadados OAuth derivam de `MCP_PUBLIC_ORIGIN`, ou da origem da requisição quando
essa configuração não é válida. Configure uma origem HTTPS própria e consistente
com a callback Google. Nenhuma origem de uma instalação particular está embutida.

## Controles aplicados

- PKCE S256, estado vinculado ao navegador e consumo único do estado OAuth.
- Login sem depender de listagem de grants no KV; a lista de e-mails autorizados
  continua obrigatória e falha fechada quando estiver ausente.
- Limites de corpo e de lote JSON-RPC; Worker e Express impõem 1 MB, inclusive
  em corpos enviados em blocos ou sem `Content-Length`. O Worker aplica o limite
  antes do provider OAuth e cancela os dois ramos de um corpo clonado ao rejeitá-lo.
- Limite mais restrito para registro dinâmico de clientes e proteção das callbacks.
- Cabeçalhos de segurança nas páginas, redirecionamentos e respostas OAuth.
- Limpeza mais eficiente e tamanho limitado do mapa local de rate limiting.
- Cache de origens e e-mails autorizados invalidado quando a configuração muda.
- Diagnóstico restrito a método conhecido, versão no formato esperado, status,
  duração e código de erro. Argumentos, resultados de ferramentas e credenciais
  não são registrados.

No servidor Node independente, a identidade usada pelo rate limiter vem do socket.
Um cabeçalho de proxy enviado pelo cliente não é considerado prova de identidade.
O Worker usa a identidade de rede fornecida pela plataforma. Esses limites são
locais ao processo/isolate e não substituem um limite distribuído da implantação.

## Verificação

```sh
npm ci --ignore-scripts
npm run verify
npm audit --audit-level=high
npx wrangler deploy --dry-run
```

O CI também testa corpos válidos, malformados e grandes, inclusive envio em blocos,
num contêiner sem rede externa, com filesystem somente leitura e recursos limitados.
O workflow público verifica o projeto, sem acessar credenciais de implantação.

Os testes de publicação examinam arquivos rastreados e novos, rejeitam arquivos
operacionais, identificadores de uma instalação particular, padrões de credenciais
e contatos que não sejam exemplos. O lockfile é regenerado pelo npm a partir do
manifesto público. Os exemplos de configuração e imagens usam dados fictícios.

Depois de corrigir uma conexão, confirme a execução de uma ferramenta de leitura.
Uma lista de ferramentas em cache, sozinha, não prova que o servidor está funcionando.
Se uma conversa antiga não receber o catálogo atualizado, teste uma conversa nova.
