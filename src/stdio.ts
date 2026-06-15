import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { HttpApiJurisprudenciaIaRunner } from "./jurisprudenciaia/http-api-runner.js";
import { createJurisprudenciaIaMcpServer } from "./mcp/create-server.js";

const config = loadConfig();
const runner = new HttpApiJurisprudenciaIaRunner({
  sourceUrl: config.jurisprudenciaIaUrl,
  requestTimeoutMs: config.requestTimeoutMs
});
const server = createJurisprudenciaIaMcpServer(runner);
const transport = new StdioServerTransport();

await server.connect(transport);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void server.close().finally(() => {
      process.exit(0);
    });
  });
}
