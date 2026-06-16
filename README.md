# JurisprudenciaIA MCP

Use o JurisprudenciaIA diretamente no Claude.ai, ChatGPT ou Codex.

Este projeto transforma a pesquisa jurisprudencial em uma ferramenta MCP: voce pergunta no seu assistente, o conector consulta o JurisprudenciaIA e devolve resultados estruturados com ementa, links e inteiro teor quando a fonte disponibiliza.

## Para que serve

- Pesquisar jurisprudencia brasileira sem sair da conversa.
- Buscar precedentes por tema, tribunal ou tese.
- Analisar se uma tese encontra apoio nos resultados encontrados.
- Comparar duas teses juridicas para a mesma questao.
- Levar a mesma ferramenta para Claude.ai, ChatGPT e Codex.

## Por que usar

- Publica em Cloudflare Workers, inclusive no plano gratuito.
- Nao exige senha ou login do JurisprudenciaIA dentro do conector.
- Funciona como servidor MCP remoto, com suporte a OAuth e Bearer token.
- Mantem a pesquisa em formato facil de revisar por advogados.
- Inclui guias visuais para configurar sem precisar conhecer a parte tecnica.

## Clientes suportados

| Cliente | Melhor caminho |
| --- | --- |
| Claude.ai | Conector personalizado com OAuth |
| ChatGPT | App em modo desenvolvedor com OAuth |
| Codex | MCP remoto por HTTP com streaming |

O guia mais simples esta em [`docs/deploy-guide.html`](docs/deploy-guide.html). Abra esse arquivo no navegador e escolha a aba do cliente que voce quer configurar: Claude.ai, ChatGPT ou Codex.

## Ferramentas incluidas

O conector publica cinco ferramentas MCP:

- `consultar_jurisprudenciaia`: consulta livre ao JurisprudenciaIA.
- `pesquisar_jurisprudencia`: pesquisa direta por jurisprudencia.
- `buscar_precedentes`: busca precedentes por tema e tribunais preferenciais.
- `analisar_tese_juridica`: avalia uma tese a partir dos resultados encontrados.
- `comparar_teses_juridicas`: compara duas teses para a mesma questao juridica.

## Comeco rapido

Para instalar e publicar, use a versao visual:

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
- [`docs/deployment.md`](docs/deployment.md): publicacao e variaveis do Worker.
- [`docs/codex.md`](docs/codex.md): configuracao especifica do Codex.

## Testes de conexao

Depois de publicar o Worker, estes comandos ajudam a confirmar se esta tudo certo:

```powershell
npm run check:chatgpt-oauth -- https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp
npm run check:codex-http -- https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp
```

Se o teste listar as ferramentas MCP, o servidor esta respondendo corretamente.

## Uso responsavel

O conector ajuda a encontrar e organizar pesquisa juridica, mas a revisao final continua sendo profissional. Antes de citar um precedente em peca, parecer ou minuta, confira o inteiro teor e a fonte oficial indicada no resultado.
