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
- Inclui guias de configuração com placeholders para a sua própria hospedagem.

## Clientes suportados

| Cliente | Melhor caminho |
| --- | --- |
| Claude.ai | Conector personalizado com OAuth |
| ChatGPT | App em modo desenvolvedor com OAuth |
| Codex | MCP remoto por HTTP com streaming no Windows ou macOS |

Comece pelo guia de publicação em [`docs/deployment.md`](docs/deployment.md) e depois configure o cliente desejado.

## Execução

O caminho recomendado para uso remoto é publicar o Worker na sua própria conta Cloudflare. O arquivo `wrangler.toml` fica com defaults genéricos para desenvolvimento e publicação manual; domínios customizados, tokens, secrets e pipelines de deploy devem ser configurados fora do repositório.

O servidor Node/Express continua no código para desenvolvimento local e testes automatizados.

## Ferramentas incluídas

O conector publica cinco ferramentas MCP:

- `consultar_jurisprudenciaia`: consulta livre ao JurisprudênciaIA.
- `pesquisar_jurisprudencia`: pesquisa direta por jurisprudência.
- `buscar_precedentes`: busca precedentes por tema e tribunais preferenciais.
- `analisar_tese_juridica`: avalia uma tese a partir dos resultados encontrados.
- `comparar_teses_juridicas`: compara duas teses para a mesma questão jurídica.

## Começo rápido

Para instalar e validar localmente:

```powershell
npm install
npm run typecheck
npm test
npm run build
```

Depois publique o Worker e conecte o cliente escolhido seguindo um destes guias:

- [`docs/deployment.md`](docs/deployment.md): publicação e variáveis do Worker.
- [`docs/codex.md`](docs/codex.md): configuração específica do Codex.

## Testes de conexão

Depois de publicar o Worker, estes comandos ajudam a confirmar se está tudo certo:

```powershell
npm run check:chatgpt-oauth -- https://<sua-url-do-worker>/mcp
npm run check:codex-http -- https://<sua-url-do-worker>/mcp
```

Se o teste listar as ferramentas MCP, o servidor está respondendo corretamente.

## Uso responsável

O conector ajuda a encontrar e organizar pesquisa jurídica, mas a revisão final continua sendo profissional. Antes de citar um precedente em peça, parecer ou minuta, confira o inteiro teor e a fonte oficial indicada no resultado.
