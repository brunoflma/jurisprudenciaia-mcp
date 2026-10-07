# Cadastro do ChatGPT e callback estável

O ChatGPT usa `https://chatgpt.com/connector_platform_oauth_redirect` quando o
servidor anuncia suporte à identificação do issuer na resposta OAuth. Essa URL
exata deve ser permitida pela política de registro de clientes. Referência:
[autenticação de plugins no ChatGPT](https://developers.openai.com/plugins/build/auth#redirect-url).

Em 2026-10-07, a descoberta pública do JurisprudênciaIA respondeu HTTP 200 e
anunciou `authorization_response_iss_parameter_supported: true`. O MCP sem
autenticação respondeu HTTP 401 com o endereço canônico dos metadados. A
política local aceitava apenas o callback anterior do ChatGPT. A regressão do
Worker com o provider instalado reproduziu HTTP 400 `invalid_client_metadata`
para a URL estável antes da correção.

A correção permite a URL estável por comparação literal, preservando os
callbacks anteriores. Variações de host, protocolo, porta, credenciais, query,
fragmento, caminho, codificação ou espaços continuam recusadas. Não amplia a
política de loopback nem altera escopos ou a autenticação Google.

Os testes usam KV e estado de consentimento sintéticos. Exercitam o cadastro
DCR e a tela de consentimento com PKCE S256 no Worker real, sem chamadas
externas ou emissão de grants. Esses resultados locais não comprovam cadastro
pela interface do ChatGPT nem login Google em produção.

O checkout de origem possui atualizações de dependências preexistentes. A
correção foi preparada em um checkout separado da main versionada, sem incluir
ou modificar essas atualizações. Nenhuma publicação foi executada nesta etapa.

## Dependências e validação local

A auditoria exigida pelo CI também apontou seis alertas altos na main
versionada. O pacote de correção inclui SDK MCP 1.31.0, Wrangler 4.148.0 e
overrides source-map-js 1.2.2 e sharp 0.35.5. Os avisos e as versões corrigidas
foram conferidos nos advisories dos mantenedores e no registro público npm:
[SDK MCP](https://github.com/advisories/GHSA-6qxp-vccf-f47h),
[source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) e
[sharp](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).
O provider OAuth permanece na versão da main, 0.10.3; a atualização preexistente
desse provider no checkout de origem não integra este pacote.

Validação local em 2026-10-07: 184 testes aprovados em 17 arquivos com
`vitest run --maxWorkers=1`, tipos Cloudflare e TypeScript aprovados, build e
`wrangler deploy --dry-run` aprovados, e auditorias de produção e de todas as
dependências sem vulnerabilidades. A sintaxe dos scripts de apresentação e o
guia de instalação offline também passaram. O DCR local retornou HTTP 201 e
o consentimento HTTP 200 após a correção, tanto para o callback estável quanto
para o callback anterior do ChatGPT.

Os checks remotos do CI e a jornada na interface do ChatGPT ainda estão
pendentes. A publicação deste serviço exige autorização específica.
