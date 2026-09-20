import assert from "node:assert/strict";
import { once } from "node:events";
import { Readable } from "node:stream";
import { createApp } from "../dist/src/http/app.js";

const app = createApp({
  connectorPath: "/mcp",
  rateLimitWindowMs: 60000,
  rateLimitMaxRequests: 10,
  runner: { async search() { return { markdown: "Synthetic fixture" }; } }
});
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const url = `http://127.0.0.1:${server.address().port}/mcp`;
const headers = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream"
};

async function expectStatus(body, expected, extra = {}) {
  const response = await fetch(url, {
    method: "POST", headers, body,
    signal: AbortSignal.timeout(5000), ...extra
  });
  const text = await response.text();
  assert.equal(response.status, expected);
  return text;
}

try {
  const valid = await expectStatus(JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: {
      protocolVersion: "2025-11-25", capabilities: {},
      clientInfo: { name: "isolated-fixture", version: "1.0.0" }
    }
  }), 200);
  assert.match(valid, /protocolVersion/);
  await expectStatus('{"jsonrpc":', 400);
  await expectStatus(JSON.stringify({ data: "x".repeat(1_048_576) }), 413);
  const chunked = Readable.from([
    Buffer.from('{"data":"'),
    ...Array.from({ length: 17 }, () => Buffer.alloc(65_536, 120)),
    Buffer.from('"}')
  ]);
  await expectStatus(chunked, 413, { duplex: "half" });
  console.log("Parser boundary: valid MCP=200, malformed JSON=400, oversized fixed/chunked bodies=413");
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
