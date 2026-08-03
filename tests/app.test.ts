import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JurisprudenciaIaRunner } from "../src/jurisprudenciaia/types.js";
import { createApp } from "../src/http/app.js";

const connectorPath = "/mcp";

function createStubRunner(): JurisprudenciaIaRunner {
  return {
    async search() {
      return { markdown: "# Resultado JurisprudenciaIA\n\nTexto consolidado." };
    }
  };
}

function createInitializeRequest(id = 1) {
  return {
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "0.1.0"
      }
    }
  };
}

type MockResponse = {
  status(code: number): { json(body: unknown): void };
};

type MockHandleRequest = (
  req: unknown,
  res: MockResponse,
  body: unknown
) => Promise<void> | void;

async function createAppWithMockedMcp(handleRequest: MockHandleRequest) {
  vi.resetModules();

  const connect = vi.fn().mockResolvedValue(undefined);
  const serverClose = vi.fn().mockResolvedValue(undefined);
  const transportClose = vi.fn().mockResolvedValue(undefined);
  const handleRequestMock = vi.fn(handleRequest);

  vi.doMock("@modelcontextprotocol/sdk/server/streamableHttp.js", () => ({
    StreamableHTTPServerTransport: vi.fn().mockImplementation(function () {
      return {
        close: transportClose,
        handleRequest: handleRequestMock
      };
    })
  }));

  vi.doMock("../src/mcp/create-server.js", () => ({
    createJurisprudenciaIaMcpServer: vi.fn().mockImplementation(() => ({
      close: serverClose,
      connect
    }))
  }));

  const { createApp: createMockedApp } = await import("../src/http/app.js");

  return {
    app: createMockedApp({
      connectorPath,
      rateLimitWindowMs: 60000,
      rateLimitMaxRequests: 4,
      runner: createStubRunner()
    }),
    connect,
    handleRequest: handleRequestMock,
    serverClose,
    transportClose
  };
}

afterEach(() => {
  vi.doUnmock("@modelcontextprotocol/sdk/server/streamableHttp.js");
  vi.doUnmock("../src/mcp/create-server.js");
  vi.resetModules();
});

describe("createApp", () => {
  it("returns health status", async () => {
    const app = createApp({
      connectorPath,
      rateLimitWindowMs: 60000,
      rateLimitMaxRequests: 4
    });

    const response = await request(app).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, service: "jurisprudenciaia-mcp" });
  });

  it("sets security headers on HTTP responses", async () => {
    const app = createApp({
      connectorPath,
      rateLimitWindowMs: 60000,
      rateLimitMaxRequests: 4
    });

    const response = await request(app).get("/healthz");

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(response.headers["strict-transport-security"]).toContain("max-age=");
  });

  it("does not expose the MCP endpoint at a generic path", async () => {
    const app = createApp({
      connectorPath,
      rateLimitWindowMs: 60000,
      rateLimitMaxRequests: 4
    });

    const response = await request(app).post("/mcp").send({});

    expect(response.status).toBe(404);
  });

  it("keeps unknown paths unavailable when the connector path is registered", async () => {
    const app = createApp({
      connectorPath,
      rateLimitWindowMs: 60000,
      rateLimitMaxRequests: 4,
      runner: createStubRunner()
    });

    const response = await request(app).post("/unknown").send({});

    expect(response.status).toBe(404);
  });

  it("routes valid MCP initialize requests to the connector path", async () => {
    const app = createApp({
      connectorPath,
      rateLimitWindowMs: 60000,
      rateLimitMaxRequests: 4,
      runner: createStubRunner()
    });

    const response = await request(app)
      .post(connectorPath)
      .set("Accept", "application/json, text/event-stream")
      .send(createInitializeRequest());

    expect(response.status).toBe(200);
    expect(response.status).not.toBe(404);
    expect(response.status).not.toBe(429);
    expect(response.status).not.toBe(500);
  });

  it("rate limits requests to the connector path", async () => {
    const app = createApp({
      connectorPath,
      rateLimitWindowMs: 60000,
      rateLimitMaxRequests: 1,
      runner: createStubRunner()
    });

    await request(app)
      .post(connectorPath)
      .set("Accept", "application/json, text/event-stream")
      .send(createInitializeRequest(1));

    const response = await request(app)
      .post(connectorPath)
      .set("Accept", "application/json, text/event-stream")
      .send(createInitializeRequest(2));

    expect(response.status).toBe(429);
    expect(response.body).toEqual({ error: "rate_limited" });
    expect(response.headers["retry-after"]).toBeDefined();
  });

  it("closes per-request MCP resources after the response closes", async () => {
    const { app, connect, handleRequest, serverClose, transportClose } =
      await createAppWithMockedMcp(
      (_req, res) => {
        res.status(202).json({ ok: true });
      }
    );

    const response = await request(app).post(connectorPath).send(createInitializeRequest());

    expect(response.status).toBe(202);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(handleRequest).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(transportClose).toHaveBeenCalledTimes(1);
      expect(serverClose).toHaveBeenCalledTimes(1);
    });
  });

  it("returns a JSON-RPC internal error and cleans up when MCP handling fails", async () => {
    const { app, connect, handleRequest, serverClose, transportClose } =
      await createAppWithMockedMcp(() => {
        throw new Error("transport failed");
      });

    const response = await request(app).post(connectorPath).send(createInitializeRequest());

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: "Internal server error"
      },
      id: null
    });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(handleRequest).toHaveBeenCalledTimes(1);
    expect(transportClose).toHaveBeenCalledTimes(1);
    expect(serverClose).toHaveBeenCalledTimes(1);
  });
});
