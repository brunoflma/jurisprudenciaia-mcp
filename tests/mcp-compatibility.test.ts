import { describe, expect, it, vi } from "vitest";
import { handleWorkerRequest } from "../src/worker.js";
import type { Env } from "../src/types.js";
const env = {} as Env;
const run = (request: Request) => handleWorkerRequest(request, env, { async search() { return { markdown: "unused" }; } });
async function payload(response: Response) {
  const text = await response.text();
  const data = response.headers.get("content-type")?.includes("text/event-stream")
    ? text.split(/\r?\n/).find(line => line.startsWith("data: "))?.slice(6) : text;
  return data ? JSON.parse(data) : null;
}
function request(method: string, version?: string, id: string | undefined = "compat", params: object = {}) {
  return new Request("https://mcp.test/mcp", { method: "POST", headers: {
    "content-type": "application/json", accept: "application/json, text/event-stream",
    ...(version ? { "mcp-protocol-version": version, "mcp-method": method } : {})
  }, body: JSON.stringify({ jsonrpc: "2.0", ...(id === undefined ? {} : { id }), method, params }) });
}
describe("MCP legacy compatibility", () => {
  it("does not log arbitrary method names, protocol headers or request arguments", async () => {
    const logs = vi.spyOn(console, "log").mockImplementation(() => {});
    const marker = "private-input-fixture";
    try {
      await run(request(marker, marker, "request", { secret: marker }));
      const output = JSON.stringify(logs.mock.calls);
      expect(output).not.toContain(marker);
      expect(output).toContain('unknown');
    } finally { logs.mockRestore(); }
  });
  it("distinguishes JSON-RPC failure from an HTTP 200 in safe protocol logs", async () => {
    const logs = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const response = await run(request("resources/list", "2025-06-18"));
      expect(response.status).toBe(200);
      expect((await payload(response)).error.code).toBe(-32601);
      const trace = logs.mock.calls.map(([line]) => {
        try { return JSON.parse(String(line)); } catch { return null; }
      }).find(entry => entry?.method === "resources/list");
      expect(trace).toMatchObject({ status: 200, rpc_error_code: -32601 });
    } finally {
      logs.mockRestore();
    }
  });
  it("rejects modern discovery with HTTP 400 instead of advertising unimplemented support", async () => {
    const response = await run(request("server/discover", "2026-07-28", "probe", { _meta: {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {}
    } }));
    expect(response.status).toBe(400);
    const body = await payload(response);
    expect(body.result).toBeUndefined();
    expect(body.error).toBeDefined();
    expect(body.error.code).not.toBe(-32022);
  });
  it.each(Array.from({ length: 12 }, (_, i) => i))("completes an independent legacy sequence %i", async (i) => {
    const init = await run(request("initialize", undefined, `init-${i}`, {
      protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "compat-test", version: "1.0" }
    }));
    expect(init.status).toBe(200);
    const initialized = await payload(init);
    expect(initialized.id).toBe(`init-${i}`);
    expect(initialized.result.protocolVersion).toBe("2025-06-18");
    const notification = await run(new Request("https://mcp.test/mcp", { method: "POST", headers: {
      "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18"
    }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) }));
    expect(notification.status).toBe(202);
    expect(await notification.text()).toBe("");
    const listed = await run(request("tools/list", "2025-06-18", `tools-${i}`));
    expect(listed.status).toBe(200);
    const tools = await payload(listed);
    expect(tools.id).toBe(`tools-${i}`);
    expect(tools.error).toBeUndefined();
    expect(tools.result.tools.length).toBeGreaterThan(0);
    const names = tools.result.tools.map((tool: { name: string; inputSchema: { type: string } }) => {
      expect(tool.inputSchema.type).toBe("object");
      return tool.name;
    });
    expect(new Set(names).size).toBe(names.length);
  });
});
