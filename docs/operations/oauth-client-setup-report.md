

## Descoberta de escopos para clientes MCP

A descoberta OAuth publica somente o escopo canônico:

`jurisprudence:read`

Isso mantém Claude, Codex e outros clientes de DCR no mesmo perfil do AMF Jurisprudência.

O escopo legado `jurisprudenciaia:search` continua aceito internamente quando um cliente
compatível, como uma integração ChatGPT existente, o solicita explicitamente. Ele não é
mais anunciado em `scopes_supported` nos endpoints `.well-known`.

A separação é intencional: não remover o alias legado do provider sem uma migração dos
clientes existentes, e não voltar a anunciá-lo na descoberta padrão sem retestar o DCR
real do Claude.
