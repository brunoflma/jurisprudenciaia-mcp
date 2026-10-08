# Integração local da autoridade OAuth v2

Os entrypoints Worker e Express compõem a autoridade somente quando `MCP_OAUTH_V2_ENABLED === "true"`. Ausência, `false`, `TRUE` e `true ` conservam o fluxo anterior. O Wrangler declara o binding SQLite e sua migração com ativação desabilitada. Políticas e chaves de produção exigem configuração explícita. O provider permanece no 0.10.3 fixado; upgrades exigem requalificar o contrato.

## Configuração explícita e operação

O Worker ativado exige `MCP_OAUTH_V2_LEDGER`, `MCP_OAUTH_V2_POLICY` e `MCP_OAUTH_V2_RECEIPT_KEY`. A classe exportada é `McpOAuthV2Ledger`, baseada no runtime comum e no ledger SQL transacional. A chave tem 32 bytes em base64url. O JSON da política exige `allowedScopes`, `codeTtlMs`, `accessTtlMs`, `receiptTtlMs` e `refresh` com `tokenTtlMs`, `absoluteTtlMs`, `idleTtlMs`. A configuração não tem TTL, chave ou cutoff produtivo padrão. `legacyCutoff`, quando aprovado, é um timestamp Unix em milissegundos dentro do JSON. O helper comum valida e retira esse campo antes de fornecer a política ao core. Configuração ausente ou inválida falha com 503; nunca recua ao v1.

`MCP_OAUTH_V2_ISSUANCE_PAUSED === "true"`, com v2 ativo, suspende novas autorizações, callbacks e emissão por code/refresh com 503 antes de consumir grants ou estado Google. Acesso e revogação continuam consultando a autoridade; o cutoff existente continua valendo. Revogação pelo endpoint histórico de token permanece disponível quando a requisição contém somente a operação de revogar. A pausa é ignorada com v2 desligado. Para recuperação de um piloto, pausar emissão mantém o leitor v2 disponível; desligar a flag não é substituto dessa operação.

A ativação exige política de duração/retenção/corte, provisionamento e rotação da chave e validação do piloto. O binding e a migração estão declarados; o código não escolhe prazos ou chaves de produção. A limpeza do core não é agendada por esta integração.

## Worker e Google

`worker.ts` obtém os helpers públicos do provider com uma chamada interna local a seu handler padrão. Essa Request é nova e não contém cabeçalhos, cookies, corpo ou credenciais do usuário. A URL usada não cria rota privilegiada nem executa rede externa. Os helpers reais fornecem parsing/registro/lookup de clientes; a autenticação confidencial compara exatamente o hash SHA-256 hexadecimal armazenado pelo provider 0.10.3. Um teste usa o client secret sintético retornado pelo DCR real, além do segredo incorreto.

O consentimento v2 exige code, PKCE S256, callback registrado e escopos/resource admitidos. O estado Google conserva `authorityVersion:2` através dos mesmos cookies e consumo de estado de uso único. Depois do userinfo Google existente e de sua allowlist, o código nasce diretamente no ledger; não há grant/token v2 gravado no KV do provider. Um callback v2 que chega depois de desligar a flag falha com 503 e não emite v1. Pausar emissão bloqueia o callback antes de consumir estado, permitindo retomar dentro da validade original.

Issuer e resource são canônicos; tenant continua `jurisia`. Cada chamada MCP consulta a autoridade, a revogação, o scope efetivo e a admissão atual do sujeito/email verificado. O hint do token localiza apenas a partição; contexto persistido e hash completo fazem a prova. Troca e refresh usam inspeção autenticada do ledger depois de autenticar o cliente; replay autêntico revoga sua família mesmo após remoção da allowlist. Revogação exige o token completo e cliente registrado, sem confiar em familyId ou identidade de cabeçalhos.

O contrato CORS do provider 0.10.3 é preservado nas rotas de token e MCP; `/oauth/revoke` usa o mesmo contrato do endpoint de token e OPTIONS retorna 204. Não foram ampliadas as origens MCP admitidas para execução.

A descoberta com v2 ativo anuncia somente resposta code, PKCE S256 e grants authorization_code/refresh_token; revogação aponta para `/oauth/revoke`. O caminho `/mcp` e o alias POST `/` passam pelo mesmo controle de versão e corte. Sufixos do prefixo `/mcp` são rejeitados com 404 antes do provider, pois o 0.10.3 faz prefix matching. Com a flag desligada, o comportamento de rota original é mantido.

Corpos de token/revogação são limitados a 8192 bytes. Os demais POST/PUT v2 são lidos uma vez da fonte, limitados a 1 MiB e reproduzidos com bytes e cabeçalhos preservados. Cancelamento de fonte excessiva não aguarda uma promessa de cancelamento possivelmente pendente e não cria tee. Os limites legados permanecem no caminho desligado.

Na distribuição privada, callbacks ChatGPT continuam vetados no v2; o cliente estático histórico não é criado por esse caminho. Nenhuma restrição de identidade foi ampliada.

## Express e canal de confiança

`createApp` aceita `oauthV2: { enabled, authority }`. A dependência `TrustedNodeAuthority` é fornecida pelo construtor, não por headers, cookies ou body. Sua função `authorize` deve usar um canal autenticado para a mesma autoridade Worker e executar uma consulta atual em cada chamada. O middleware confirma issuer, resource, tenant, sujeito, email e scopes antes de entrar nas rotas MCP reais. Um resultado de outra autoridade é rejeitado, e erros não publicam detalhes ou segredos.

O `server.ts` configura `createNodeAuthority` com `MCP_PUBLIC_ORIGIN`, `MCP_OAUTH_V2_BACKCHANNEL_KEY` e a allowlist do operador. Configuração ausente ou inválida falha com 503 e Retry-After. O destino HTTPS é fixo: `/_internal/oauth-v2/authorize` na mesma autoridade. Headers do cliente não escolhem URL, issuer ou identidade; redirects de rede são recusados.

O POST interno exige HMAC-SHA256 sobre issuer, método, caminho, timestamp, nonce e hash dos bytes. A prova vale por 30 segundos e a chave separada tem 32 bytes base64url canônicos. A requisição serve somente para autorização atual: não emite ou renova credenciais, não altera grants e não cria ledger por processo. Não há cache positivo. Cada chamada consulta SQLite, admissão e revogação; replay da prova não dispensa essa nova consulta. O endpoint existe somente com v2 ligado, sem chave falha fechado e não aceita tokens MCP como prova de transporte.

O Node limita a consulta a cinco segundos e os corpos do canal a 16 KiB; revalida issuer, resource, tenant, sujeito, expiração e scopes antes de executar MCP. O Worker retorna somente as propriedades mínimas da identidade, sem credenciais Google ou props arbitrárias. Falhas de rede/backend produzem 503, credencial inválida 401 e acesso recusado 403. A pausa de emissão conserva este leitor e a revogação. Chaves ficam no ambiente protegido dos dois processos e nunca em arquivos do repositório.

## Evidência e limites

- `tests/oauth-authority-v2-worker.test.ts`: default Worker exportado, classe DO exportada com SQLite real local, Google e armazenamento de estado fictícios; callback→code→exchange→MCP initialize/list→refresh/revoke→negação. Inclui dois sujeitos, remoção de admissão, replay, DCR confidencial real, metadata, flag desligada, dependências ausentes, flag flip, body excessivo com sentinela de 500 ms, aliases/cutoff e pausa sem consumir estado/code.
- `tests/oauth-authority-v2-node.test.ts`: aplicação Express real com injeção confiável, duas identidades, initialize/list, revogação e admissão por chamada, 503 sem dependência, headers de identidade ignorados e erros seguros.
- `tests/oauth-authority-v2.test.ts`: testes do candidato, provider 0.10.3 e ledger SQLite; inclui fonte excessiva pelo router, preservação de bytes v1 e ausência de downgrade v2.
- Regressões focadas de Google/provider/app, TypeScript e Wrangler `deploy --dry-run` verificam os pontos alterados. Comandos rodam por `run_clean.py`, que não herda credenciais nem configuração pessoal. Saídas e códigos ficam no diretório de evidências da tarefa, incluindo tentativas que falharam antes das correções.

Os testes não usam contas reais, upstream pago, Google real ou infraestrutura Cloudflare. SQLite em processo e doubles de namespace/estado não comprovam execução distribuída ou o fluxo real com duas contas. Dry run verifica empacotamento, não é deploy nem prova de binding operacional. Nenhum merge, publicação remota ou alteração produtiva foi realizado.
