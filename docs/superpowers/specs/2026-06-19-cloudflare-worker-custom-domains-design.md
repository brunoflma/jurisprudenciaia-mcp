# Design: domínios personalizados dos Cloudflare Workers

**Data:** 2026-06-19

**Status:** aprovado para planejamento

**Zona Cloudflare:** `claudemux.dpdns.org`

## Objetivo

Publicar cada Worker da conta Cloudflare em um hostname próprio sob a zona
`claudemux.dpdns.org`, com DNS e TLS gerenciados automaticamente pelo
Cloudflare, sem introduzir roteamento por caminhos nem acoplar os serviços.

## Estado confirmado

- A zona `claudemux.dpdns.org` está delegada aos nameservers do Cloudflare.
- A conta contém três Workers: `amf-proxy`, `amf-ingestao-mcp` e
  `jurisprudenciaia-mcp`.
- Nenhum dos três Workers possui Custom Domain na zona no momento.
- O Wrangler local está autenticado na conta correta e possui permissões para
  Workers, rotas e certificados.

## Mapeamento aprovado

| Worker | Custom Domain |
| --- | --- |
| `amf-proxy` | `amf-proxy.claudemux.dpdns.org` |
| `amf-ingestao-mcp` | `amf-ingestao-mcp.claudemux.dpdns.org` |
| `jurisprudenciaia-mcp` | `jurisprudenciaia-mcp.claudemux.dpdns.org` |

Cada hostname será configurado como **Custom Domain**, pois o respectivo
Worker será a origem de todo o tráfego daquele hostname. Não serão usadas
Workers Routes sobre uma origem externa.

## Alternativas consideradas

1. **Um Custom Domain por Worker — escolhida.** Mantém isolamento, observação e
   rollback independentes e não exige alteração do código de roteamento.
2. **Um hostname com multiplexação por caminhos.** Rejeitada porque exigiria um
   Worker frontal adicional ou mudanças no `amf-proxy`, criando acoplamento e
   um ponto único de falha.
3. **Domínio raiz para um Worker e subdomínios para os demais.** Rejeitada para
   manter `claudemux.dpdns.org` disponível para uma futura página, gateway ou
   documentação.

## Configuração e fonte de verdade

- O vínculo será criado por Worker usando a API/CLI oficial do Cloudflare.
- Quando o código-fonte e a configuração Wrangler de cada Worker estiverem
  disponíveis, o mesmo mapeamento deverá ser persistido no respectivo arquivo
  de configuração para evitar divergência em implantações futuras.
- No repositório atual, o domínio de `jurisprudenciaia-mcp` será declarado em
  `wrangler.toml`.
- Os endereços `*.workers.dev` permanecerão habilitados inicialmente como
  fallback. Desativá-los está fora deste escopo e exige validação separada dos
  clientes existentes.

## Segurança e operação

- O Cloudflare provisionará os registros DNS e certificados TLS dos Custom
  Domains; nenhum IP de origem fictício será criado.
- Nenhum segredo ou valor de binding será lido, alterado ou registrado.
- A mudança não altera código de aplicação, autenticação, limites ou bindings.
- A criação será feita de forma incremental, com verificação de cada hostname
  antes de avançar ao seguinte.

## Verificação e rollback

Para cada Worker:

1. confirmar o vínculo do Custom Domain pela API do Cloudflare;
2. confirmar resolução DNS pública;
3. confirmar emissão/ativação TLS;
4. executar uma requisição HTTPS ao endpoint esperado e verificar que a
   resposta vem do Worker correto;
5. executar os checks específicos existentes quando aplicáveis, inclusive os
   checks MCP/OAuth do `jurisprudenciaia-mcp`.

Em caso de falha, remover apenas o Custom Domain afetado. O endereço
`workers.dev` continuará disponível durante toda a mudança.

## Critérios de conclusão

- Os três hostnames resolvem via DNS e respondem por HTTPS com certificado
  válido.
- Cada hostname está associado ao Worker correto na API do Cloudflare.
- O fluxo existente de cada Worker continua funcional.
- A configuração durável do `jurisprudenciaia-mcp` está versionada neste
  repositório.
- Não houve exposição ou modificação de segredos.
