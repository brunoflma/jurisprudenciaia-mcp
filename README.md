# JurisprudênciaIA MCP

Use o JurisprudênciaIA diretamente no Claude.ai, ChatGPT ou Codex.

Este projeto transforma a pesquisa jurisprudencial em uma ferramenta MCP: você pergunta no seu assistente, o conector consulta o JurisprudênciaIA e devolve resultados estruturados com ementa, links e inteiro teor quando a fonte disponibiliza.

## Para que serve

- Pesquisar jurisprudência brasileira sem sair da conversa.
- Buscar precedentes por tema, tribunal ou tese.
- Analisar se uma tese encontra apoio nos resultados encontrados.
- Comparar duas teses jurídicas para a mesma questão.
- Levar a mesma ferramenta para Claude.ai, ChatGPT e Codex.

## Por que usar

- Publica em Cloudflare Workers, inclusive no plano gratuito.
- Não exige senha ou login do JurisprudênciaIA dentro do conector.
- Funciona como servidor MCP remoto, com suporte a OAuth e Bearer token.
- Mantém a pesquisa em formato fácil de revisar por advogados.
- Inclui guias visuais para configurar sem precisar conhecer a parte técnica.

## Clientes suportados

| Cliente | Melhor caminho |
| --- | --- |
| Claude.ai | Conector personalizado com OAuth |
| ChatGPT | App em modo desenvolvedor com OAuth |
| Codex | MCP remoto por HTTP com streaming no Windows ou macOS |

O guia mais simples está em [`docs/deploy-guide.html`](docs/deploy-guide.html). Abra esse arquivo no navegador e escolha a aba do cliente que você quer configurar: Claude.ai, ChatGPT ou Codex.

## Arquitetura de produção

A produção roda somente em Cloudflare Workers. O arquivo `wrangler.toml` é a fonte declarativa para runtime, domínio, assets estáticos e observabilidade. GitHub Actions executa apenas CI e validação por `wrangler deploy --dry-run`; o deploy de produção deve ter um único controlador. Hoje o caminho operacional é publicação controlada por Wrangler. Uma integração de build do provedor só deve ser usada se substituir Wrangler como controlador único.

O servidor Node/Express continua no código para desenvolvimento local e testes, mas não é um alvo de hospedagem de produção neste repositório. O repositório público não deve conter workflow de deploy nem segredos.

## Ferramentas incluídas

O conector publica quatorze ferramentas MCP. As cinco primeiras cobrem pesquisa e análise de teses; as demais foram desenhadas a partir de capacidades equivalentes disponíveis nos conectores IAJus e JusRatio, adaptadas ao mecanismo de busca do JurisprudênciaIA.

- `consultar_jurisprudenciaia`: consulta livre ao JurisprudênciaIA.
- `pesquisar_jurisprudencia`: pesquisa direta por jurisprudência.
- `buscar_precedentes`: busca precedentes por tema e tribunais preferenciais.
- `analisar_tese_juridica`: avalia uma tese a partir dos resultados encontrados.
- `comparar_teses_juridicas`: compara duas teses para a mesma questão jurídica.
- `buscar_por_cnj`: localiza decisões e andamentos de um processo pelo número único CNJ.
- `pesquisar_legislacao`: pesquisa referências a uma norma ou dispositivo e solicita texto e interpretação conforme a cobertura da fonte.
- `buscar_informativos`: localiza informativos de jurisprudência de tribunais superiores sobre um tema.
- `analisar_jurimetria`: estima um panorama da amostra de julgados encontrada; não representa estatística oficial ou exaustiva do tribunal.
- `linha_do_tempo_precedentes`: monta uma linha do tempo cronológica dos principais precedentes sobre um tema, apontando mudanças de entendimento.
- `buscar_citacoes_dispositivo`: pesquisa precedentes que citem ou apliquem um dispositivo legal.
- `historico_alteracoes_norma`: pesquisa alterações legislativas documentadas de uma norma.
- `listar_overruling_tema`: pesquisa entendimentos expressamente superados ou revistos sobre um tema.
- `buscar_precedentes_qualificados`: prioriza precedentes vinculantes ou qualificados e explicita sua categoria.

As ferramentas especializadas são modos de consulta: elas transformam os campos recebidos em instruções estruturadas e usam o mesmo mecanismo de pesquisa do JurisprudênciaIA. Preferências, recortes e tribunais orientam a pesquisa textual; não são filtros, séries estatísticas ou bases legislativas independentes do serviço de origem.

## Começo rápido

Para instalar e publicar, use a versão visual:

```text
docs/deploy-guide.html
```

Para quem prefere comandos:

```powershell
npm install
npm run typecheck
npm test
npm run build
```

Depois publique o Worker e conecte o cliente escolhido seguindo um destes guias:

- [`docs/deploy-guide.html`](docs/deploy-guide.html): passo a passo visual.
- [`docs/deployment.md`](docs/deployment.md): publicação e variáveis do Worker.
- [`docs/codex.md`](docs/codex.md): configuração específica do Codex.

## Testes de conexão

Depois de publicar o Worker, estes comandos ajudam a confirmar se está tudo certo:

```powershell
npm run check:chatgpt-oauth -- https://<seu-worker>/mcp
npm run check:codex-http -- https://<seu-worker>/mcp
```

Se o teste listar as ferramentas MCP, o servidor está respondendo corretamente.
Use `npm run check:codex-http:all -- <URL_MCP>` para também executar uma chamada real de todas as ferramentas publicadas.

## Uso responsável

O conector ajuda a encontrar e organizar pesquisa jurídica, mas a revisão final continua sendo profissional. Antes de citar um precedente em peça, parecer ou minuta, confira o inteiro teor e a fonte oficial indicada no resultado.
