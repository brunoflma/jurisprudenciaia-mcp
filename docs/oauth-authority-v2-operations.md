# Operação da autoridade OAuth v2

O Wrangler declara o binding SQLite `MCP_OAUTH_V2_LEDGER` e a migração da classe
`McpOAuthV2Ledger`. A ativação fica desligada por padrão. Declarar a migração
não comprova implantação ou ativação.

As flags `MCP_OAUTH_V2_ENABLED` e `MCP_OAUTH_V2_ISSUANCE_PAUSED`
são operacionais e não são declaradas em `vars`. `keep_vars=true`
preserva seus valores publicados; ausência equivale a desativado.
Um deploy de código não deve desligar v2 nem retirar uma pausa de emissão.
Quando há uma nova migração de Durable Objects, `versions upload` não a
aplica: a publicação inicial exige `wrangler deploy` sob os mesmos controles.

A ativação exige `MCP_OAUTH_V2_POLICY` e uma chave `MCP_OAUTH_V2_RECEIPT_KEY`
diferente por autoridade: 32 bytes aleatórios em base64url canônico.
Uma chave nova pode ser gerada por CSPRNG em processo protegido e fornecida
diretamente à entrada padrão do Wrangler nativo, sem impressão ou arquivo.
Credenciais existentes fornecidas pelo titular usam entrada protegida.
Valores não pertencem a chat, histórico de comandos, arquivos, fixtures ou
repositório. Chaves existentes não são substituídas como diagnóstico.

A política explícita conserva scopes suportados, código de cinco minutos,
acesso de uma hora, recibo de dois minutos e refresh limitado a 30 dias
por token, duração absoluta e inatividade. O ledger persiste a policy
imutável; mudar durações exige procedimento próprio de migração.
Não há corte das sessões antigas nesta etapa. `legacyCutoff` exige timestamp
Unix em milissegundos e validação prévia do acesso substituto.

Google client, callbacks, admission/allowlist, sub, ACL, cache de negócio e
credenciais administrativas existentes conservam suas funções. Chave de
recibo e token MCP não substituem credencial Google ou de backend.

Cada chamada MCP revalida ledger, revogação, identidade e scope efetivo.
O piloto exige login real, initialize/list, refresh/replay, revogação e
remoção de acesso entre duas identidades autorizadas. Fixtures locais
com SQLite e Google sintético não comprovam essa etapa em produção.

Para recuperação, conservar v2 ligado e configurar
`MCP_OAUTH_V2_ISSUANCE_PAUSED=true`: emissão pausa, leitor/revogação continuam.
Conservar policy, chave, ledger, epochs e tombstones. Desligar v2 ou publicar
binário que ignore revogação não é recuperação segura. Namespaces e buckets
não são purgados para corrigir login.

O cadastro público é limitado a 16 KiB, inclusive sem Content-Length.
Callbacks continuam restritos pela política de cliente do serviço.
