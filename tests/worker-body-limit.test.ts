import { describe, expect, it } from "vitest";
import worker, { handleWorkerRequest } from "../src/worker.js";
import type { Env } from "../src/types.js";

function oversizedStream(path: string, declared?: string) {
  let chunks = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { chunks++; controller.enqueue(new Uint8Array(65536)); },
    cancel() { cancelled = true; },
  });
  const options: RequestInit & { duplex: "half" } = {
    method: "POST", body, duplex: "half",
    headers: { "content-type": "application/json",
      ...(declared === undefined ? {} : { "content-length": declared }) },
  };
  return { request: new Request(`https://mcp.example.com${path}`, options),
    chunks: () => chunks, cancelled: () => cancelled };
}

describe("Worker streaming body limit", () => {
  it.each([undefined, "1"])("rejects MCP streams without trusting length %s", async declared => {
    const input = oversizedStream("/mcp", declared);
    const response = await handleWorkerRequest(input.request, {} as Env, {
      async search() { throw new Error("must not reach a tool"); },
    });
    expect(response.status).toBe(413);
    expect(input.chunks()).toBeLessThan(25);
    await expect.poll(input.cancelled).toBe(true);
  }, 2000);

  it.each(["/oauth/register", "/oauth/token", "/authorize"])("bounds %s before the OAuth provider", async path => {
    const input = oversizedStream(path);
    const response = await worker.fetch(input.request, {} as Env, {} as ExecutionContext);
    expect(response.status).toBe(413);
    expect(input.chunks()).toBeLessThan(25);
    await expect.poll(input.cancelled).toBe(true);
  }, 2000);
});
