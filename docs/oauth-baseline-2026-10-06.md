Base pública: 4e6d7dc, branch local codex/mcp-oauth-baseline-20261006.

# Baseline MCP/OAuth local — 2026-10-06

Este pacote padroniza a fronteira OAuth do Worker. A implementação foi comparada à política comum do inventário e ao mcp-turnkey no commit `a4f624ad94e1c85342c972d685c97f9ed91539d6`; o instalador não foi executado. Não há alteração de configuração em produção, credenciais, callbacks, allowlist, SDK, lockfile ou serviços de pesquisa. A entrada Node/Express continua distinta: estes controles são do Worker protegido pelo provider.

## Contrato mantido e ajustes

| Controle | Contrato desta distribuição |
| --- | --- |
| Discovery | PRM raiz e caminho `/mcp` são fornecidos pelo provider. AS anuncia issuer/endpoints da origem HTTPS configurada; headers forwarded não definem essa confiança. Configuração malformada falha fechada. |
| Clientes | DCR e callbacks existentes preservados. CIMD permanece desabilitado; ativação exige análise própria de fetch/SSRF. |
| PKCE | S256 do provider e política loopback existentes preservados; plain, implicit e token exchange continuam desabilitados. Clientes confidenciais históricos exigem avaliação antes de impor PKCE além da política atual. |
| PKCE Google | Cada nova transação Worker→Google gera verifier independente de 256 bits (32 bytes base64url), envia somente challenge S256 no authorize e envia o verifier apenas no POST de token. O campo fica no estado Google de 600 s, sem logs e sem repasse ao grant MCP. Transações Google já iniciadas sem campo continuam até sua expiração; campo presente malformado falha fechado. Nenhuma credencial, scope, callback ou binding novo. |
| Callback do grant | Novos grants guardam `mcpRedirectUri` nas props cifradas. Quando o cliente fornece `redirect_uri` na troca do código, deve ser exatamente o autorizado, mesmo se outro callback também estiver registrado. A verificação usa callback público do provider após client/PKCE/resource e antes de consumir o código, com closure isolada por requisição. Campo presente inválido falha fechado; grants antigos sem campo mantêm a validação registrada anterior. A omissão de `redirect_uri` permitida com PKCE continua aceita, inclusive em novo login; não se afirma obrigatoriedade universal. |
| Recurso | O provider 0.10.3 já fixa resource/audience no MCP canônico, inclusive quando o cliente omite resource. Recurso explícito diferente é rejeitado antes do bootstrap do cliente legado no authorize. Token/refresh mantêm a validação exata do provider. |
| Issuer | `issuer` canônico acompanha as duas transações one-shot e o callback final usa `iss` do provider. Nenhuma identidade Google ou chave de grant é renomeada. |
| Scopes | `jurisprudence:read` é o escopo anunciado; `jurisprudenciaia:search` continua alias compatível de pesquisa. A ausência de scope mantém o default histórico de ambos. Escopo desconhecido no authorize é recusado antes de armazenar consentimento. Todas as ferramentas atuais são leitura/pesquisa; acesso a `/mcp` exige ao menos um desses escopos. |
| Escopo efetivo | O handler usa a API pública `unwrapToken` após a validação bearer/audience do provider. `summary.scope` representa a redução do token; `props.scopes` pode ser o teto antigo do grant e não é autoridade. Isto cobre tokens existentes sem migração, ao custo de uma leitura KV e decriptação adicionais por chamada. |
| Identidade/admissão | Google userinfo autenticado, `email_verified`, `sub` e allowlist atuais preservados. Por chamada, exige tenant `jurisia`, subject igual ao userId do token e email normalizado ainda admitido. A decisão usa o ambiente atual, sem cache de allowlist no provider. Dados públicos de jurisprudência não se tornam um acervo privado por conta. |
| Suspensão | Após a alteração da allowlist estar ativa no Worker, tokens existentes deixam de acessar o MCP. O patch não gira segredos nem muda a allowlist; renovar um token não garante acesso se a pessoa deixou de ser admitida. |
| Expiração | Consentimento/Google: 600 s; access: 1 h; refresh e registro: 30 dias. Nenhum TTL aumentado. Refresh não estende a validade original do grant. |
| Armazenamento | Estado de login usa Durable Object com transação; grants/tokens/clientes permanecem no KV existente. Props cifradas e tokens opacos/hash são controles do provider, sem migração de chaves ou dados nesta etapa. |
| Logs/erros | Provider retorna corpo sem description livre, preserva status/headers de protocolo e registra apenas operação, status e código de lista fechada; exceções da aplicação não imprimem nome, mensagem arbitrária, stack ou request. Google 429/5xx/falha de rede devolvem 503 `temporarily_unavailable`; invalid_grant continua falha de autorização. Nenhuma resposta bruta upstream é registrada. |
| Separação | Tokens internos, credenciais Google, estado do navegador e access token MCP permanecem distintos. Nenhum bearer estático ou privilégio administrativo foi criado. |

## Pendências explícitas da arquitetura/dependência

A equivalência integral à política comum **não está concluída**. A leitura do provider instalado `@cloudflare/workers-oauth-provider@0.10.3` confirmou controles de resource, audience e client; não se inferiu ausência pelo wrapper. Também confirmou limites que não devem ser mascarados por mutex em memória ou flag no KV:

- Consumo de authorization code usa leitura/modificação/gravação no KV. O Durable Object do login não torna atômico o resgate final do código. Replay sequencial detectado não prova segurança concorrente; falta autoridade atômica e ensaio específico dessa futura mudança.
- Refresh aceita token atual e anterior, sem prazo separado do anterior ou histórico completo de família consumida. Falta política explícita de replay/revogação de família e coordenação concorrente.
- Grants antigos não têm `mcpRedirectUri`: continuam aceitando o callback registrado conforme o provider até expirar. A omissão de `redirect_uri` com PKCE também permanece compatível. Exigir o parâmetro de todos os clientes ou reconstruir o vínculo dos grants antigos precisa de decisão de compatibilidade/migração; a nova comparação exata quando fornecido já está implementada localmente.
- Remoção de grants/tokens depende da propagação do KV. Não prometer revogação global instantânea; TTL de access é teto temporal, não substituto de revogação. A rechecagem de allowlist por chamada não revoga, por si, um grant individual ou refresh token.
- Google upstream mantém userinfo autenticado e `email_verified`; não há validação local de ID token/nonce. Esse contrato existente não é, por si, prova de vulnerabilidade nem exige conversão para implementar PKCE. O `sub` histórico do único provider Google permanece. S256 upstream está implementado, mas a aceitação real pelo cliente Google Web configurado não foi comprovada pelos mocks; homologar com conta real depende de aprovação específica, sem presumir necessidade de novas credenciais.
- O provider 0.10.3 exige esquema HTTP `Bearer` com essa capitalização; o helper novo aceita variação de caixa, mas o provider a recusa antes dele. A integração não declara suporte a `bearer`/`BEARER`.
- Não há refresh token Google persistido neste fluxo: preservação de refresh Google omitido em reconexão não se aplica. O refresh existente é do MCP.
- A política de scopes não afirma isolamento entre documentos/tenants privados inexistentes neste produto; o gate verifica as identidades autenticadas atuais. Não houve prova real de duas contas, login de usuário ou pesquisa paga.

Os limites restantes precisam de trabalho adicional e classificação por compatibilidade. A atomicidade/família/revogação não pode ser garantida apenas pelo callback atual: ele não expõe o refresh apresentado/novo nem recebe um hook de commit/rollback; replay antigo é recusado antes dele. Uma autoridade persistente adicional ou alteração do provider precisa de desenho de falhas e migração. Essa limitação não impediu os ajustes locais compatíveis de PKCE Google e redirect acima; documentar pendências não equivale a corrigi-las.

## Verificação e limites

As execuções usam o harness `run_clean.py` do workspace de coordenação: ambiente mínimo, HOME/configuração vazios e credenciais fictícias. Nunca usar `.env`, `.dev.vars` ou tokens herdados. Os testes novos são `tests/oauth-access-policy.test.ts`, `tests/oauth-provider-baseline.test.ts` e `tests/oauth-google-pkce.test.ts`; os resultados reais ficam no relatório de coordenação e nos logs em `test-results`, com pass/fail/skips separados.

O gate `npm run verify` preserva geração de tipos, typecheck, testes, auditoria de dependências e build. A auditoria usa o registry público, não serviços de produção ou contas reais; indisponibilidade/falha não deve ser ocultada. Os testes de integração usam provider real com KV/DO simulados e respostas Google fictícias. Não comprovam consistência distribuída KV/DO, produção, browser real, duas contas reais ou compatibilidade de versões dos clientes finais.

Merge, push, publicação, deploy, mudanças de callback/allowlist/credenciais, testes com contas reais e consultas externas dependem de autorização posterior.

## Referências

- [MCP authorization 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [MCP client registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration)
- [RFC 9700, refresh replay](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14.2)
- [Cloudflare MCP authorization](https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/)
- [Consistência do Workers KV](https://developers.cloudflare.com/kv/concepts/how-kv-works/)
- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [Referência Turnkey fixada](https://github.com/brunobracaioli/mcp-turnkey/tree/a4f624ad94e1c85342c972d685c97f9ed91539d6)

A distribuição pública preserva a origem declarada em MCP_PUBLIC_ORIGIN. Sem essa configuração, discovery conserva a origem da requisição para compatibilidade de desenvolvimento; o login Google continua indisponível sem configuração explícita. O roundtrip do issuer no estado foi corrigido aqui. Não se transplanta configuração privada.
