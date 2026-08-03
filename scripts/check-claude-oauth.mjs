#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";

const defaultMcpUrl = "https://mcp.example.com/mcp";
const redirectUri = "https://claude.ai/api/mcp/auth_callback";
const scope = "jurisprudence:read";

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

async function responseBody(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const mcpUrl = new URL(process.argv[2] || process.env.URL_MCP || defaultMcpUrl);
  const unauthorized = await fetch(mcpUrl, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "claude-oauth-check", version: "1.0.0" } }
    })
  });
  assert(unauthorized.status === 401, `Esperado HTTP 401 no MCP sem token; recebido ${unauthorized.status}.`);

  const challengeHeader = unauthorized.headers.get("www-authenticate") || "";
  const metadataMatch = /resource_metadata="([^"]+)"/u.exec(challengeHeader);
  assert(metadataMatch, "WWW-Authenticate nao anunciou resource_metadata.");

  const resourceResponse = await fetch(metadataMatch[1]);
  const resource = await responseBody(resourceResponse);
  assert(resourceResponse.ok && resource?.resource === mcpUrl.href, "Protected Resource Metadata invalido.");
  const issuer = new URL(resource.authorization_servers?.[0]);

  const serverMetadataResponse = await fetch(new URL("/.well-known/oauth-authorization-server", issuer));
  const serverMetadata = await responseBody(serverMetadataResponse);
  assert(serverMetadataResponse.ok, "Authorization Server Metadata indisponivel.");
  assert(serverMetadata.registration_endpoint, "Authorization Server nao anuncia Dynamic Client Registration.");
  assert(serverMetadata.code_challenge_methods_supported?.includes("S256"), "Authorization Server nao anuncia PKCE S256.");

  const registrationResponse = await fetch(serverMetadata.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Claude Web",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none"
    })
  });
  const registration = await responseBody(registrationResponse);
  assert(registrationResponse.status === 201 && registration?.client_id, `DCR recusado: HTTP ${registrationResponse.status} ${JSON.stringify(registration)}`);

  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const authorizeUrl = new URL(serverMetadata.authorization_endpoint);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", registration.client_id);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("resource", mcpUrl.href);
  authorizeUrl.searchParams.set("scope", scope);
  authorizeUrl.searchParams.set("state", base64url(randomBytes(16)));
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const authorizeResponse = await fetch(authorizeUrl, { redirect: "manual", headers: { accept: "text/html" } });
  const authorizeBody = await authorizeResponse.text();
  assert(authorizeResponse.status === 200, `Endpoint de autorizacao retornou HTTP ${authorizeResponse.status}.`);
  assert(authorizeBody.includes("Continuar com Google"), "Tela de consentimento esperada nao foi encontrada.");

  console.log("Claude OAuth OK: discovery, DCR, PKCE S256 e tela de consentimento validados.");
  console.log("A conclusao do login Google deve ser validada manualmente no Claude.");
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
