import { loadConfig } from "./config.js";
import { createApp } from "./http/app.js";
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
  runner
});

app.listen(config.port, config.host, () => {
  console.log(`jurisprudenciaia-mcp listening on ${config.host}:${config.port}`);
  console.log(`MCP path: ${config.connectorPath}`);
});
