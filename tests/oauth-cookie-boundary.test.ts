import { describe, expect, it } from "vitest";
import { createOAuthTransaction, consumeOAuthTransaction, type OAuthStateNamespace } from "../src/oauth/state.js";
import type { AuthRequest } from "@cloudflare/workers-oauth-provider";

const payload: AuthRequest = { responseType: "code", clientId: "fixture-client",
  redirectUri: "https://claude.ai/api/mcp/auth_callback", state: "fixture-state", scope: [] };

function storage() {
  let consumes = 0;
  const namespace = {
    idFromName: (name: string) => ({ toString: () => name }),
    get: () => ({ fetch: async (request: Request) => {
      if (request.method === "PUT") return Response.json({ ok: true });
      consumes++;
      return Response.json({ payload });
    } }),
  } as unknown as OAuthStateNamespace;
  return { namespace, count: () => consumes };
}

describe("OAuth cookie boundaries", () => {
  it("accepts a bound cookie after a separator and optional whitespace", async () => {
    const state = storage();
    const transaction = await createOAuthTransaction(state.namespace, "consent", payload);
    const cookie = transaction.setCookie.split(";", 1)[0];
    const request = new Request("https://mcp.example.com/authorize", {
      headers: { cookie: `other=fixture;\t ${cookie} ` },
    });
    await expect(consumeOAuthTransaction(state.namespace, "consent", transaction.token, request))
      .resolves.toMatchObject({ clientId: payload.clientId });
    expect(state.count()).toBe(1);
  });

  it("rejects a bound-looking string embedded in another cookie value", async () => {
    const state = storage();
    const transaction = await createOAuthTransaction(state.namespace, "consent", payload);
    const cookie = transaction.setCookie.split(";", 1)[0];
    const request = new Request("https://mcp.example.com/authorize", {
      headers: { cookie: `other=fixture ${cookie}` },
    });
    await expect(consumeOAuthTransaction(state.namespace, "consent", transaction.token, request))
      .rejects.toThrow("oauth_state_not_bound");
    expect(state.count()).toBe(0);
  });
});
