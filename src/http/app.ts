import express from "express";
import type { Express } from "express";
import helmet from "helmet";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { FixedWindowRateLimiter } from "../infra/rate-limit.js";
import type { JurisprudenciaIaRunner } from "../jurisprudenciaia/types.js";
import { createJurisprudenciaIaMcpServer } from "../mcp/create-server.js";

type CreateAppOptions = {
  connectorPath: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  runner?: JurisprudenciaIaRunner;
};

const internalErrorResponse = {
  jsonrpc: "2.0",
  error: {
    code: -32603,
    message: "Internal server error"
  },
  id: null
} as const;

export function createApp(options: CreateAppOptions): Express {
  const app = express();
  const runner = options.runner;
  const limiter = new FixedWindowRateLimiter(
    options.rateLimitWindowMs,
    options.rateLimitMaxRequests
  );

  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, service: "jurisprudenciaia-mcp" });
  });

  if (runner) {
    app.post(options.connectorPath, async (req, res) => {
      const key = req.ip || "unknown";
      const decision = limiter.allow(key);

      if (!decision.allowed) {
        res.setHeader("Retry-After", Math.ceil(decision.retryAfterMs / 1000).toString());
        res.status(429).json({ error: "rate_limited" });
        return;
      }

      let server: ReturnType<typeof createJurisprudenciaIaMcpServer> | undefined;
      let transport: StreamableHTTPServerTransport | undefined;
      let cleanedUp = false;

      const cleanup = async () => {
        if (cleanedUp) {
          return;
        }

        cleanedUp = true;
        await Promise.allSettled([
          transport?.close() ?? Promise.resolve(),
          server?.close() ?? Promise.resolve()
        ]);
      };

      res.on("close", () => {
        void cleanup();
      });

      try {
        server = createJurisprudenciaIaMcpServer(runner);
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch {
        await cleanup();

        if (!res.headersSent) {
          res.status(500).json(internalErrorResponse);
        }
      }
    });
  }

  return app;
}
