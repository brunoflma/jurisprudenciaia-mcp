#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";

const defaultMcpUrl = "https://mcp.example.com/mcp";
const redirectUri = "http://127.0.0.1:3334/oauth/callback";

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

async function body(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return text; }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const mcpUrl = new URL(process.argv[2] || process.env.URL_MCP || defaultMcpUrl);
  const resourceResponse = await fetch(new URL("/.well-known/oauth-protected-resource/mcp", mcpUrl));
  const resource = await body(resourceResponse);
  assert(resourceResponse.ok && resource?.resource === mcpUrl.href, "Protected Resource Metadata invalido.");

  const issuer = new URL(resource.authorization_servers?.[0]);
  const metadataResponse = await fetch(new URL("/.well-known/oauth-authorization-server", issuer));
  const metadata = await body(metadataResponse);
  assert(metadataResponse.ok && metadata.registration_endpoint, "Authorization Server Metadata ou DCR indisponivel.");
  assert(metadata.code_challenge_methods_supported?.includes("S256"), "PKCE S256 nao anunciado.");

  const registrationResponse = await fetch(metadata.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "MCP CLI Client",
      client_uri: "https://github.com/modelcontextprotocol/mcp-cli",
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "jurisprudence:read"
    })
  });
  const registration = await body(registrationResponse);
  assert(registrationResponse.status === 201 && registration?.client_id,
    `DCR loopback recusado: HTTP ${registrationResponse.status} ${JSON.stringify(registration)}`);

  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const authorizeUrl = new URL(metadata.authorization_endpoint);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", registration.client_id);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("resource", mcpUrl.href);
  authorizeUrl.searchParams.set("scope", "jurisprudence:read");
  authorizeUrl.searchParams.set("state", base64url(randomBytes(16)));
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const authorizeResponse = await fetch(authorizeUrl, { redirect: "manual", headers: { accept: "text/html" } });
  const html = await authorizeResponse.text();
  assert(authorizeResponse.status === 200, `Authorize loopback retornou HTTP ${authorizeResponse.status}.`);
  assert(html.includes("Aplicativo local") && html.includes("Continuar com Google"), "Aviso de aplicativo local ausente.");

  console.log("Loopback OAuth OK: discovery, DCR publico, porta dinamica e PKCE S256 validados.");
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
