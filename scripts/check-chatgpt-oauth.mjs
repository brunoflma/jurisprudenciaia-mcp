#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

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
  "buscar_citacoes_dispositivo",
  "historico_alteracoes_norma",
  "listar_overruling_tema",
  "buscar_precedentes_qualificados",
];

const scope = "jurisprudenciaia:search";
const defaultRedirectUri = "https://chatgpt.com/connector/oauth/local-test";

const usage = `Uso:
  npm run check:chatgpt-oauth -- https://jurisprudenciaia-mcp.<seu-subdominio>.workers.dev/mcp

Antes de rodar, defina nesta janela:
  $env:MCP_OAUTH_CLIENT_ID = Read-Host "Cole o OAuth Client ID do Worker"
  $env:MCP_OAUTH_CLIENT_SECRET = Read-Host "Cole o OAuth Client Secret do Worker"

Variaveis opcionais:
  URL_MCP                alternativa para informar a URL sem argumento
  CHATGPT_REDIRECT_URI   redirect_uri para simular o ChatGPT`;

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
    fail(`Erro: URL invalida: ${rawUrl}`, 2);
    return undefined;
  }
}

function base64url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function redactedLocation(location) {
  if (!location) return "";

  try {
    const url = new URL(location);
    if (url.searchParams.has("code")) {
      url.searchParams.set("code", "<redacted>");
    }
    return url.toString();
  } catch {
    return location.replace(/code=[^&]+/u, "code=<redacted>");
  }
}

async function readJsonOrText(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function oauthErrorMessage(stage, payload) {
  const error = typeof payload === "object" && payload ? payload.error : undefined;
  const description = typeof payload === "object" && payload ? payload.error_description : undefined;

  if (stage === "authorize" && error === "invalid_client") {
    return [
      "Erro no OAuth do ChatGPT: OAuth Client ID recusado pelo Worker.",
      "Use exatamente o valor salvo no Cloudflare Secret MCP_OAUTH_CLIENT_ID.",
    ].join("\n");
  }

  if (stage === "token" && error === "invalid_client") {
    return [
      "Erro no OAuth do ChatGPT: OAuth Client Secret recusado pelo Worker.",
      "Use exatamente o valor salvo no Cloudflare Secret MCP_OAUTH_CLIENT_SECRET.",
    ].join("\n");
  }

  if (error) {
    return `Erro no OAuth do ChatGPT (${stage}): ${error}${description ? ` - ${description}` : ""}`;
  }

  return `Erro no OAuth do ChatGPT (${stage}): ${typeof payload === "string" ? payload : JSON.stringify(payload)}`;
}

async function main() {
  const mcpUrl = parseUrl();
  if (!mcpUrl) return;

  const clientId = process.env.MCP_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.MCP_OAUTH_CLIENT_SECRET?.trim();
  const redirectUri = process.env.CHATGPT_REDIRECT_URI?.trim() || defaultRedirectUri;

  if (!clientId || !clientSecret) {
    fail(
      [
        "Erro: MCP_OAUTH_CLIENT_ID e MCP_OAUTH_CLIENT_SECRET devem estar definidos neste processo.",
        "Eles precisam ser os mesmos valores dos Cloudflare Worker Secrets.",
        usage,
      ].join("\n\n"),
      2,
    );
    return;
  }

  const origin = mcpUrl.origin;
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = base64url(randomBytes(16));

  const authorizeUrl = new URL("/oauth/authorize", origin);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("resource", mcpUrl.href);
  authorizeUrl.searchParams.set("scope", scope);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const authorizeResponse = await fetch(authorizeUrl, { redirect: "manual" });
  const location = authorizeResponse.headers.get("location");
  if (authorizeResponse.status !== 302 || !location) {
    fail(`Erro: /oauth/authorize retornou HTTP ${authorizeResponse.status}.`);
    return;
  }

  const redirect = new URL(location);
  if (redirect.searchParams.get("error")) {
    fail(oauthErrorMessage("authorize", {
      error: redirect.searchParams.get("error"),
      error_description: redirect.searchParams.get("error_description"),
    }));
    return;
  }

  if (redirect.searchParams.get("state") !== state) {
    fail("Erro: state OAuth voltou diferente. A resposta de autorizacao nao corresponde ao pedido.");
    return;
  }

  const code = redirect.searchParams.get("code");
  if (!code) {
    fail(`Erro: /oauth/authorize nao retornou code. Redirect: ${redactedLocation(location)}`);
    return;
  }

  console.log("Authorize OK: Client ID aceito pelo Worker.");

  const tokenResponse = await fetch(new URL("/oauth/token", origin), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: verifier,
    }),
  });

  const tokenPayload = await readJsonOrText(tokenResponse);
  if (!tokenResponse.ok || !tokenPayload?.access_token) {
    fail(oauthErrorMessage("token", tokenPayload));
    return;
  }

  console.log("Token OK: Client Secret aceito pelo Worker.");

  const client = new Client({
    name: "jurisprudenciaia-chatgpt-oauth-check",
    version: "0.1.0",
  });
  const transport = new StreamableHTTPClientTransport(mcpUrl, {
    requestInit: {
      headers: {
        Authorization: `Bearer ${tokenPayload.access_token}`,
      },
    },
  });

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    const missing = expectedTools.filter((name) => !names.includes(name));

    console.log(`MCP OK: ferramentas encontradas (${names.length}): ${names.join(", ")}`);
    if (missing.length) {
      fail(`Erro: ferramentas ausentes: ${missing.join(", ")}`);
      return;
    }

    console.log("ChatGPT OAuth OK: use estes mesmos valores no app do ChatGPT.");
  } finally {
    await client.close().catch(() => {});
  }
}

await main().catch((error) => fail(error?.message || String(error)));
