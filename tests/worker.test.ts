import { describe, expect, it } from "vitest";
import { OperationalError } from "../src/errors.js";
import type { JurisprudenciaIaRunner } from "../src/jurisprudenciaia/types.js";
import { handleWorkerRequest } from "../src/worker.js";

const env = {
  MCP_OAUTH_CLIENT_ID: "claude-test-client",
  MCP_OAUTH_CLIENT_SECRET: "client-secret-12345678901234567890",
  MCP_ACCESS_TOKEN_SECRET: "access-token-secret-12345678901234567890",
  MCP_OAUTH_REDIRECT_URIS: "https://claude.test/oauth/callback, https://chatgpt.com/connector/oauth/test-callback",
  MCP_BEARER_TOKEN: "codex-static-bearer-token-12345678901234567890",
  RATE_LIMIT_MAX_REQUESTS: "100"
};

const redirectUri = "https://claude.test/oauth/callback";
const chatGptRedirectUri = "https://chatgpt.com/connector/oauth/test-callback";
const invalidStaticBearerToken = "wrong-codex-static-bearer-token-12345678901234567890";

async function mcpRequest(body: unknown) {
  return new Request("https://worker.test/mcp", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${await accessToken()}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

function post(pathname: string, body: unknown, headers: HeadersInit = {}) {
  return new Request(`https://worker.test${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

async function json(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe("Cloudflare Worker MCP endpoint", () => {
  it("serves a health check without requiring MCP transport", async () => {
    const response = await handleWorkerRequest(
      new Request("https://worker.test/healthz"),
      {}
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      ok: true,
      runtime: "cloudflare-workers"
    });
  });

  it("serves a small landing page with the MCP endpoint", async () => {
    const response = await handleWorkerRequest(
      new Request("https://worker.test/"),
      {}
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("https://worker.test/mcp");
  });

  it("serves an SVG favicon", async () => {
    const response = await handleWorkerRequest(
      new Request("https://worker.test/favicon.svg"),
      {}
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/svg+xml");
    const body = await response.text();
    expect(body).toContain("<svg");
    expect(body).toContain("Balanca da justica");
  });

  it("serves a PNG favicon for connector clients that prefer raster icons", async () => {
    const response = await handleWorkerRequest(
      new Request("https://worker.test/favicon.png"),
      {}
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("serves a classic ICO favicon without redirect", async () => {
    const response = await handleWorkerRequest(
      new Request("https://worker.test/favicon.ico"),
      {}
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/x-icon");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("serves OAuth metadata for Claude custom connectors", async () => {
    const resourceResponse = await handleWorkerRequest(
      new Request("https://worker.test/.well-known/oauth-protected-resource"),
      {}
    );
    const serverResponse = await handleWorkerRequest(
      new Request("https://worker.test/.well-known/oauth-authorization-server"),
      {}
    );
    const serverAtResourceResponse = await handleWorkerRequest(
      new Request("https://worker.test/.well-known/oauth-authorization-server/mcp"),
      {}
    );

    expect(resourceResponse.status).toBe(200);
    expect(await json(resourceResponse)).toMatchObject({
      resource: "https://worker.test/mcp",
      resource_name: "JurisprudenciaIA MCP",
      logo_uri: "https://worker.test/favicon.png",
      resource_documentation: "https://worker.test/",
      authorization_servers: ["https://worker.test"]
    });

    expect(serverResponse.status).toBe(200);
    expect(await json(serverResponse)).toMatchObject({
      issuer: "https://worker.test",
      authorization_endpoint: "https://worker.test/oauth/authorize",
      token_endpoint: "https://worker.test/oauth/token",
      service_documentation: "https://worker.test/",
      logo_uri: "https://worker.test/favicon.png"
    });
    expect(serverAtResourceResponse.status).toBe(200);
  });

  it("allows an HTTPS external icon URL in OAuth metadata", async () => {
    const resourceResponse = await handleWorkerRequest(
      new Request("https://worker.test/.well-known/oauth-protected-resource"),
      { MCP_ICON_URL: "https://assets.example.test/jurisprudenciaia-mcp.png" }
    );
    const serverResponse = await handleWorkerRequest(
      new Request("https://worker.test/.well-known/oauth-authorization-server"),
      { MCP_ICON_URL: "http://assets.example.test/insecure.png" }
    );

    expect(await json(resourceResponse)).toMatchObject({
      logo_uri: "https://assets.example.test/jurisprudenciaia-mcp.png"
    });
    expect(await json(serverResponse)).toMatchObject({
      logo_uri: "https://worker.test/favicon.png"
    });
  });

  it("rejects token requests with missing client secret", async () => {
    const response = await handleWorkerRequest(
      new Request("https://worker.test/oauth/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: "dummy",
          redirect_uri: redirectUri,
          client_id: env.MCP_OAUTH_CLIENT_ID
        })
      }),
      env
    );

    expect(response.status).toBe(401);
    const body = await json(response);
    expect(body.error).toBe("invalid_client");
  });

  it("rejects token requests with incorrect client secret", async () => {
    const response = await handleWorkerRequest(
      new Request("https://worker.test/oauth/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: "dummy",
          redirect_uri: redirectUri,
          client_id: env.MCP_OAUTH_CLIENT_ID,
          client_secret: "wrong-secret-that-does-not-match"
        })
      }),
      env
    );

    expect(response.status).toBe(401);
    const body = await json(response);
    expect(body.error).toBe("invalid_client");
  });

  it("rejects MCP requests without a bearer token", async () => {
    const response = await handleWorkerRequest(
      post("/mcp", {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list"
      }),
      env,
      runner("# Resultado JurisprudenciaIA\n\nTexto.")
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://worker.test/.well-known/oauth-protected-resource"'
    );
    expect(response.headers.get("www-authenticate")).toContain('scope="jurisprudenciaia:search"');
  });

  it("accepts a static bearer token for Codex HTTP MCP", async () => {
    const response = await handleWorkerRequest(
      new Request("https://worker.test/mcp", {
        method: "POST",
        headers: {
          "authorization": `Bearer ${env.MCP_BEARER_TOKEN}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list"
        })
      }),
      env,
      runner("# Resultado JurisprudenciaIA\n\nTexto.")
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "consultar_jurisprudenciaia" })
        ])
      }
    });
  });

  it("rejects an invalid static bearer token", async () => {
    const response = await handleWorkerRequest(
      new Request("https://worker.test/mcp", {
        method: "POST",
        headers: {
          "authorization": `Bearer ${invalidStaticBearerToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list"
        })
      }),
      env,
      runner("# Resultado JurisprudenciaIA\n\nTexto.")
    );

    expect(response.status).toBe(401);
  });

  it("supports confidential OAuth clients without PKCE for ChatGPT custom apps", async () => {
    const token = await accessTokenWithoutPkce(chatGptRedirectUri);
    const response = await handleWorkerRequest(
      new Request("https://worker.test/mcp", {
        method: "POST",
        headers: {
          "authorization": `Bearer ${token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list"
        })
      }),
      env,
      runner("# Resultado JurisprudenciaIA\n\nTexto.")
    );

    expect(response.status).toBe(200);
  });

  it("handles MCP initialize", async () => {
    const response = await handleWorkerRequest(
      await mcpRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test-client", version: "0.1.0" }
        }
      }),
      env,
      runner("# Resultado JurisprudenciaIA\n\nTexto.")
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-11-25",
        capabilities: {
          tools: {}
        },
        instructions: expect.stringContaining("inteiro teor"),
        serverInfo: {
          name: "jurisprudenciaia-mcp",
          title: "JurisprudenciaIA MCP",
          version: "0.1.0",
          description: expect.stringContaining("Conector MCP"),
          icons: [
            {
              src: "https://worker.test/favicon.png",
              mimeType: "image/png",
              sizes: ["96x96"]
            },
            {
              src: "https://worker.test/favicon.ico",
              mimeType: "image/x-icon",
              sizes: ["16x16"]
            },
            {
              src: "https://worker.test/favicon.svg",
              mimeType: "image/svg+xml",
              sizes: ["any"]
            }
          ],
          websiteUrl: "https://worker.test/"
        },
        _meta: {
          "jurisprudenciaia-mcp/logo_uri": "https://worker.test/favicon.png",
          "jurisprudenciaia-mcp/icon_uri": "https://worker.test/favicon.png",
          "jurisprudenciaia-mcp/favicon_uri": "https://worker.test/favicon.ico"
        }
      }
    });
  });

  it("lists the JurisprudenciaIA tool", async () => {
    const response = await handleWorkerRequest(
      await mcpRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list"
      }),
      env,
      runner("# Resultado JurisprudenciaIA\n\nTexto.")
    );

    expect(response.status).toBe(200);
    const body = await json(response);

    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: expect.any(Array)
      }
    });
    expect(
      (body.result as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name)
    ).toEqual([
      "consultar_jurisprudenciaia",
      "pesquisar_jurisprudencia",
      "buscar_precedentes",
      "analisar_tese_juridica",
      "comparar_teses_juridicas"
    ]);
  });

  it("calls the tool and returns generated Markdown", async () => {
    const response = await handleWorkerRequest(
      await mcpRequest({
        jsonrpc: "2.0",
        id: "call-1",
        method: "tools/call",
        params: {
          name: "consultar_jurisprudenciaia",
          arguments: {
            query: "responsabilidade civil por dano moral"
          }
        }
      }),
      env,
      runner("# Resultado JurisprudenciaIA\n\nTexto consolidado.")
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      jsonrpc: "2.0",
      id: "call-1",
      result: {
        content: [
          {
            type: "text",
            text: "# Resultado JurisprudenciaIA\n\nTexto consolidado."
          }
        ]
      }
    });
  });

  it("calls specialist tools through the Cloudflare Worker JSON-RPC handler", async () => {
    let receivedInput: unknown;

    const response = await handleWorkerRequest(
      await mcpRequest({
        jsonrpc: "2.0",
        id: "call-1",
        method: "tools/call",
        params: {
          name: "analisar_tese_juridica",
          arguments: {
            tese: "autofianca e juridicamente impossivel em contrato de locacao",
            contexto: "fiador de si mesmo",
            max_wait_seconds: 60
          }
        }
      }),
      env,
      {
        async search(input) {
          receivedInput = input;
          return { markdown: "# Resultado JurisprudenciaIA\n\nTexto consolidado." };
        }
      }
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      result: {
        content: [
          {
            type: "text",
            text: "# Resultado JurisprudenciaIA\n\nTexto consolidado."
          }
        ]
      }
    });
    expect(receivedInput).toEqual({
      query: [
        "Analise a tese juridica a seguir com base na jurisprudencia: autofianca e juridicamente impossivel em contrato de locacao.",
        "Contexto do caso: fiador de si mesmo.",
        "Separe precedentes favoraveis, contrarios, distincoes possiveis e ressalvas relevantes.",
        "Estruture a resposta com tese principal, precedentes citados por referencia, tribunal, tipo/numero, data de julgamento, ementa, inteiro teor ou transcricao integral disponibilizada pela fonte, link quando disponivel e pontos de cautela. Nao substitua o inteiro teor por resumo, recorte ou excerto; quando a fonte nao disponibilizar inteiro teor, informe isso explicitamente."
      ].join(" "),
      maxWaitSeconds: 60,
      includeDebug: false
    });
  });

  it("returns tool errors as MCP content instead of leaking internals", async () => {
    const response = await handleWorkerRequest(
      await mcpRequest({
        jsonrpc: "2.0",
        id: "call-1",
        method: "tools/call",
        params: {
          name: "consultar_jurisprudenciaia",
          arguments: {
            query: "responsabilidade civil por dano moral"
          }
        }
      }),
      env,
      {
        async search() {
          throw new OperationalError("rate_limited", "Muitas requisicoes");
        }
      }
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      result: {
        isError: true,
        content: [
          {
            type: "text",
            text: "Falha ao consultar JurisprudenciaIA (rate_limited): Muitas requisicoes"
          }
        ]
      }
    });
  });

  it("rejects unknown paths", async () => {
    const response = await handleWorkerRequest(
      post("/unknown", {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list"
      }),
      env,
      runner("# Resultado JurisprudenciaIA\n\nTexto.")
    );

    expect(response.status).toBe(404);
  });

  it("blocks OAuth authorize with unregistered redirect URI", async () => {
    const authorizeUrl = new URL("https://worker.test/oauth/authorize");

    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", env.MCP_OAUTH_CLIENT_ID);
    authorizeUrl.searchParams.set("redirect_uri", "https://unregistered.test/callback");

    const response = await handleWorkerRequest(new Request(authorizeUrl), env);
    expect(response.status).toBe(400);
    expect(response.headers.has("location")).toBe(false);

    const body = await json(response);
    expect(body.error).toBe("invalid_request");
  });

  it("blocks OAuth authorize when allowlist is missing", async () => {
    const authorizeUrl = new URL("https://worker.test/oauth/authorize");

    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", env.MCP_OAUTH_CLIENT_ID);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);

    const envWithoutAllowlist = { ...env, MCP_OAUTH_REDIRECT_URIS: undefined };
    const response = await handleWorkerRequest(new Request(authorizeUrl), envWithoutAllowlist);

    expect(response.status).toBe(400);
    expect(response.headers.has("location")).toBe(false);

    const body = await json(response);
    expect(body.error).toBe("invalid_request");
  });

  it("blocks OAuth authorize with unknown client", async () => {
    const authorizeUrl = new URL("https://worker.test/oauth/authorize");

    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", "unknown-client");
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);

    const response = await handleWorkerRequest(new Request(authorizeUrl), env);
    expect(response.status).toBe(400);
    expect(response.headers.has("location")).toBe(false);

    const body = await json(response);
    expect(body.error).toBe("invalid_client");
  });

  it("handles malformed base64url safely without crashing", async () => {
    const request = post("/mcp", { jsonrpc: "2.0", id: 1, method: "tools/list" });
    request.headers.set("authorization", "Bearer valid.invalid!token.signature");

    const response = await handleWorkerRequest(request, env, runner(""));

    expect(response.status).toBe(401);
  });
});

async function accessToken(): Promise<string> {
  const verifier = "test-code-verifier-12345678901234567890";
  const state = "test-state";
  const authorizeUrl = new URL("https://worker.test/oauth/authorize");

  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", env.MCP_OAUTH_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("resource", "https://worker.test/mcp");
  authorizeUrl.searchParams.set("code_challenge", await pkceChallenge(verifier));
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const authorizeResponse = await handleWorkerRequest(new Request(authorizeUrl), env);
  expect(authorizeResponse.status).toBe(302);

  const location = authorizeResponse.headers.get("location");
  expect(location).toBeTruthy();

  const callbackUrl = new URL(location ?? redirectUri);
  expect(callbackUrl.searchParams.get("state")).toBe(state);

  const code = callbackUrl.searchParams.get("code");
  expect(code).toBeTruthy();

  const tokenResponse = await handleWorkerRequest(
    new Request("https://worker.test/oauth/token", {
      method: "POST",
      headers: {
        "authorization": `Basic ${btoa(
          `${env.MCP_OAUTH_CLIENT_ID}:${env.MCP_OAUTH_CLIENT_SECRET}`
        )}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code ?? "",
        redirect_uri: redirectUri,
        code_verifier: verifier
      })
    }),
    env
  );

  expect(tokenResponse.status).toBe(200);

  const tokenBody = await json(tokenResponse);
  expect(tokenBody.token_type).toBe("Bearer");
  expect(typeof tokenBody.access_token).toBe("string");

  return tokenBody.access_token as string;
}

async function accessTokenWithoutPkce(callbackUrl: string): Promise<string> {
  const state = "chatgpt-test-state";
  const authorizeUrl = new URL("https://worker.test/oauth/authorize");

  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", env.MCP_OAUTH_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", callbackUrl);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("resource", "https://worker.test/mcp");

  const authorizeResponse = await handleWorkerRequest(new Request(authorizeUrl), env);
  expect(authorizeResponse.status).toBe(302);

  const location = authorizeResponse.headers.get("location");
  expect(location).toBeTruthy();

  const redirectedUrl = new URL(location ?? callbackUrl);
  expect(redirectedUrl.searchParams.get("state")).toBe(state);

  const code = redirectedUrl.searchParams.get("code");
  expect(code).toBeTruthy();

  const tokenResponse = await handleWorkerRequest(
    new Request("https://worker.test/oauth/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code ?? "",
        redirect_uri: callbackUrl,
        client_id: env.MCP_OAUTH_CLIENT_ID,
        client_secret: env.MCP_OAUTH_CLIENT_SECRET
      })
    }),
    env
  );

  expect(tokenResponse.status).toBe(200);

  const tokenBody = await json(tokenResponse);
  expect(tokenBody.token_type).toBe("Bearer");
  expect(typeof tokenBody.access_token).toBe("string");

  return tokenBody.access_token as string;
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function runner(markdown: string): JurisprudenciaIaRunner {
  return {
    async search() {
      return { markdown };
    }
  };
}
