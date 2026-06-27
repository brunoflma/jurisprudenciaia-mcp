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

A produção roda somente em Cloudflare Workers. O arquivo `wrangler.toml` e o workflow `Deploy Worker` são a fonte de verdade para publicação, domínio, assets estáticos, logs e segredos do Worker.

O servidor Node/Express continua no código para desenvolvimento local e testes, mas não é um alvo de hospedagem de produção neste repositório. A decisão está registrada em [`docs/architecture/adr-001-cloudflare-workers-production.md`](docs/architecture/adr-001-cloudflare-workers-production.md).

## Ferramentas incluídas

O conector publica cinco ferramentas MCP:

- `consultar_jurisprudenciaia`: consulta livre ao JurisprudênciaIA.
- `pesquisar_jurisprudencia`: pesquisa direta por jurisprudência.
- `buscar_precedentes`: busca precedentes por tema e tribunais preferenciais.
- `analisar_tese_juridica`: avalia uma tese a partir dos resultados encontrados.
- `comparar_teses_juridicas`: compara duas teses para a mesma questão jurídica.

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
npm run check:chatgpt-oauth -- https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp
npm run check:codex-http -- https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp
```

Se o teste listar as ferramentas MCP, o servidor está respondendo corretamente.

## Uso responsável

O conector ajuda a encontrar e organizar pesquisa jurídica, mas a revisão final continua sendo profissional. Antes de citar um precedente em peça, parecer ou minuta, confira o inteiro teor e a fonte oficial indicada no resultado.
