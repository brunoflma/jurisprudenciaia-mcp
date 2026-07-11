#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const expectedTools = [
  "consultar_jurisprudenciaia",
  "pesquisar_jurisprudencia",
  "buscar_precedentes",
  "analisar_tese_juridica",
  "comparar_teses_juridicas",
  "buscar_por_cnj",
  "pesquisar_legislacao",
  "buscar_informativos",
  "analisar_jurimetria",
  "linha_do_tempo_precedentes",
];

const usage = `Uso:
  npm run check:codex-http -- https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp
  npm run check:codex-http:all -- https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp

Variáveis usadas:
  MCP_BEARER_TOKEN  mesmo valor configurado como Cloudflare Worker Secret
  URL_MCP           alternativa para informar a URL sem argumento`;

const smokeCalls = [
  ["consultar_jurisprudenciaia", { query: "responsabilidade civil por negativacao indevida dano moral" }],
  ["pesquisar_jurisprudencia", { query: "responsabilidade civil por negativacao indevida dano moral" }],
  ["buscar_precedentes", { tema: "responsabilidade civil por negativacao indevida", tribunais: ["STJ"] }],
  ["analisar_tese_juridica", { tese: "a negativacao indevida gera dano moral presumido", contexto: "relacao de consumo" }],
  ["comparar_teses_juridicas", { questao: "a negativacao indevida gera dano moral presumido", tese_a: "o dano moral e presumido", tese_b: "o dano moral exige prova concreta" }],
  ["buscar_por_cnj", { numero_cnj: "0000000-00.2024.8.26.0000" }],
  ["pesquisar_legislacao", { norma: "artigo 14 do Codigo de Defesa do Consumidor" }],
  ["buscar_informativos", { tema: "responsabilidade civil por negativacao indevida", tribunais: ["STJ"] }],
  ["analisar_jurimetria", { tema: "responsabilidade civil por negativacao indevida", tribunal: "STJ", recorte: "resultado predominante" }],
  ["linha_do_tempo_precedentes", { tema: "dano moral por negativacao indevida" }],
];

function fail(message, code = 1) {
  console.error(message);
  process.exitCode = code;
}

function parseUrl() {
  const arg = process.argv.slice(2).find((value) => !value.startsWith("-"));

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(usage);
    process.exit(0);
  }

  const rawUrl = arg || process.env.URL_MCP;
  if (!rawUrl) {
    fail(`${usage}\n\nErro: informe a URL /mcp ou defina URL_MCP.`, 2);
    return undefined;
  }

  try {
    return new URL(rawUrl);
  } catch {
    fail(`Erro: URL inválida: ${rawUrl}`, 2);
    return undefined;
  }
}

function describeError(error) {
  if (error instanceof StreamableHTTPError) {
    if (error.code === 401 || error.code === 403) {
      return [
        `HTTP ${error.code}: o Worker recusou o Bearer token.`,
        "Confira se MCP_BEARER_TOKEN existe no ambiente local e se tem o mesmo valor do Cloudflare Worker Secret.",
      ].join("\n");
    }

    return `HTTP ${error.code ?? "desconhecido"}: ${error.message}`;
  }

  if (error?.name === "AbortError") {
    return "Timeout de rede ao conectar no Worker.";
  }

  return error?.message || String(error);
}

async function main() {
  const url = parseUrl();
  if (!url) return;

  const token = process.env.MCP_BEARER_TOKEN;
  if (!token) {
    fail(
      [
        "Erro: MCP_BEARER_TOKEN não está definido neste processo.",
        "Windows, variável de usuário:",
        '[Environment]::SetEnvironmentVariable("MCP_BEARER_TOKEN", "<mesmo valor do Worker>", "User")',
        "",
        "macOS, Codex Desktop aberto pelo Dock/Finder/Spotlight:",
        'launchctl setenv MCP_BEARER_TOKEN "<mesmo valor do Worker>"',
        "",
        "macOS ou Linux, Terminal/CLI:",
        'export MCP_BEARER_TOKEN="<mesmo valor do Worker>"',
        "",
        "Depois de criar ou alterar a variável, feche e abra o Codex.",
      ].join("\n"),
      2,
    );
    return;
  }

  const client = new Client({
    name: "jurisprudenciaia-codex-http-check",
    version: "0.1.0",
  });

  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  try {
    await client.connect(transport);
    console.log(`Conectado: ${url.href}`);

    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    console.log(`Ferramentas encontradas (${names.length}): ${names.join(", ")}`);

    const missing = expectedTools.filter((name) => !names.includes(name));
    if (missing.length) {
      fail(`Erro: ferramentas ausentes: ${missing.join(", ")}`);
      return;
    }

    const calls = process.argv.includes("--all-tools") ? smokeCalls : smokeCalls.slice(0, 1);
    for (const [name, arguments_] of calls) {
      const result = await client.callTool({
        name,
        arguments: { ...arguments_, max_wait_seconds: 45 },
      });

      if (result.isError) {
        fail(`Erro: ${name} respondeu com isError=true. A autenticacao MCP funcionou, mas a consulta falhou.`);
        return;
      }

      const text = result.content
        ?.filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("\n") ?? "";

      console.log(`Chamada real OK: ${name} retornou ${text.length} caracteres.`);
    }
  } catch (error) {
    fail(describeError(error));
  } finally {
    await client.close().catch(() => {});
  }
}

await main();
