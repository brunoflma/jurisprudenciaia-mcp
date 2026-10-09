import { loadConfig } from "./config.js";
import { createApp } from "./http/app.js";
import { configuredNodeAuthority } from "./http/authority-backchannel.js";
import { HttpApiJurisprudenciaIaRunner } from "./jurisprudenciaia/http-api-runner.js";

const config = loadConfig();

const runner = new HttpApiJurisprudenciaIaRunner({
  sourceUrl: config.jurisprudenciaIaUrl,
  requestTimeoutMs: config.requestTimeoutMs
});

const app = createApp({
  connectorPath: config.connectorPath,
  rateLimitWindowMs: config.rateLimitWindowMs,
  rateLimitMaxRequests: config.rateLimitMaxRequests,
  runner,
  oauthV2: { enabled: process.env.MCP_OAUTH_V2_ENABLED, authority: configuredNodeAuthority(process.env) }
});

app.listen(config.port, config.host, () => {
  console.log(`jurisprudenciaia-mcp listening on ${config.host}:${config.port}`);
  console.log(`MCP path: ${config.connectorPath}`);
});
