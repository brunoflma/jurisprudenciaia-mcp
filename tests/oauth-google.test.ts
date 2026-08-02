import type { AuthRequest, CompleteAuthorizationOptions } from "@cloudflare/workers-oauth-provider";
import { describe, expect, it, vi } from "vitest";
import { consentPage, handleGoogleAuth, type GoogleOAuthEnv } from "../src/oauth/google-auth.js";

class FakeOAuthState {
  private readonly values = new Map<string, { payload: unknown; binding: string; expiresAt: number }>();

  idFromName(name: string): DurableObjectId {
    return { toString: () => name } as DurableObjectId;
  }

  get(id: DurableObjectId): DurableObjectStub {
    const key = id.toString();
    return { fetch: async (request: Request) => {
      if (request.method === "PUT") {
        const value = await request.json() as { payload: unknown; binding: string; expiresAt: number };
        this.values.set(key, value);
        return Response.json({ ok: true });
      }
      const value = this.values.get(key);
      if (!value) return Response.json({ ok: false }, { status: 404 });
      if (request.headers.get("x-jurisia-oauth-binding") !== value.binding && request.headers.get("x-amf-oauth-binding") !== value.binding) return Response.json({ ok: false }, { status: 403 });
      this.values.delete(key);
      return Response.json({ payload: value.payload });
    }} as DurableObjectStub;
  }
}

const authRequest: AuthRequest = {
  responseType: "code",
  clientId: "claude-client",
  redirectUri: "https://claude.ai/api/mcp/auth_callback",
  scope: ["jurisprudence:read"],
  state: "claude-state",
  codeChallenge: "challenge",
  codeChallengeMethod: "S256"
};

function cookie(response: Response, type: "CONSENT" | "GOOGLE"): string {
  return new RegExp(`__Host-AMF_JURIS_${type}=[^;,]*`).exec(response.headers.get("set-cookie") ?? "")?.[0] ?? "";
}

describe("Google OAuth for Claude", () => {
  it("uses the visual layout and escapes the client name", () => {
    const html = consentPage("Claude <script>", "transaction", "nonce");
    expect(html).toContain("JurisprudênciaIA MCP");
    expect(html).toContain("Fontes oficiais");
    expect(html).toContain("Claude &lt;script&gt;");
    expect(html).not.toContain("Claude <script>");
  });

  it("warns when authorization returns to a local application", () => {
    const html = consentPage("MCP CLI Client", "transaction", "nonce", true);
    expect(html).toContain("Aplicativo local");
    expect(html).toContain("Confirme que você iniciou esta conexão.");
  });

  it("authenticates Google, enforces the allowlist and completes Claude authorization", async () => {
    const state = new FakeOAuthState();
    let completion: CompleteAuthorizationOptions | undefined;
    const env = {
      OAUTH_STATE: state,
      MCP_GOOGLE_CLIENT_ID: "google-client",
      MCP_GOOGLE_CLIENT_SECRET: "google-secret",
      MCP_PUBLIC_ORIGIN: "https://mcp.example.com",
      MCP_GOOGLE_CALLBACK_ORIGIN: "https://mcp.example.com",
      MCP_ALLOWED_EMAILS: "advogado@example.com",
      OAUTH_PROVIDER: {
        parseAuthRequest: vi.fn(async () => authRequest),
        lookupClient: vi.fn(async () => ({ clientId: "claude-client", redirectUris: [authRequest.redirectUri], clientName: "Claude" })),
        completeAuthorization: vi.fn(async (options: CompleteAuthorizationOptions) => {
          completion = options;
          return { redirectTo: "https://claude.ai/api/mcp/auth_callback?code=jurisia-code" };
        })
      }
    } satisfies GoogleOAuthEnv;

    const consent = await handleGoogleAuth(new Request("https://mcp.example.com/authorize"), env, async () => new Response("fallback"));
    expect(consent.status).toBe(200);
    const transaction = /name="transaction" value="([^"]+)"/.exec(await consent.text())?.[1];
    expect(transaction).toBeTruthy();

    const googleStart = await handleGoogleAuth(new Request("https://mcp.example.com/authorize", {
      method: "POST",
      headers: { Cookie: cookie(consent, "CONSENT"), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ transaction: transaction! })
    }), env, async () => new Response("fallback"));
    expect(googleStart.status).toBe(302);
    const googleUrl = new URL(googleStart.headers.get("location")!);
    expect(googleUrl.hostname).toBe("accounts.google.com");
    expect(googleUrl.searchParams.get("redirect_uri")).toBe("https://mcp.example.com/oauth/google/callback");

    const googleFetch = vi.fn(async (input: RequestInfo | URL) => String(input instanceof Request ? input.url : input).includes("/token")
      ? Response.json({ access_token: "google-token" })
      : Response.json({ sub: "google-user", email: "advogado@example.com", name: "Advogado", email_verified: true }));
    const callback = await handleGoogleAuth(new Request(`https://mcp.example.com/oauth/google/callback?code=google-code&state=${googleUrl.searchParams.get("state")}`, {
      headers: { Cookie: cookie(googleStart, "GOOGLE") }
    }), env, async () => new Response("fallback"), googleFetch);

    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toContain("jurisia-code");
    expect(completion).toMatchObject({ userId: "google-user", scope: ["jurisprudence:read"], metadata: { email: "advogado@example.com" } });
  });

  it("preserves the ChatGPT search scope in the issued authorization", async () => {
    const state = new FakeOAuthState();
    let completion: CompleteAuthorizationOptions | undefined;
    const chatGptRequest: AuthRequest = {
      ...authRequest,
      clientId: "jurisprudenciaia-mcp-client",
      redirectUri: "https://chatgpt.com/connector/oauth/AxMS-ux405ET",
      scope: ["jurisprudenciaia:search"]
    };
    const env = {
      OAUTH_STATE: state,
      MCP_GOOGLE_CLIENT_ID: "google-client",
      MCP_GOOGLE_CLIENT_SECRET: "google-secret",
      MCP_PUBLIC_ORIGIN: "https://mcp.example.com",
      MCP_GOOGLE_CALLBACK_ORIGIN: "https://mcp.example.com",
      MCP_ALLOWED_EMAILS: "advogado@example.com",
      OAUTH_PROVIDER: {
        parseAuthRequest: vi.fn(async () => chatGptRequest),
        lookupClient: vi.fn(async () => ({ clientName: "ChatGPT" })),
        completeAuthorization: vi.fn(async (options: CompleteAuthorizationOptions) => {
          completion = options;
          return { redirectTo: "https://chatgpt.com/connector/oauth/AxMS-ux405ET?code=jurisia-code" };
        })
      }
    } satisfies GoogleOAuthEnv;
    const consent = await handleGoogleAuth(new Request("https://mcp.example.com/authorize"), env, async () => new Response("fallback"));
    const transaction = /name="transaction" value="([^"]+)"/.exec(await consent.text())![1]!;
    const googleStart = await handleGoogleAuth(new Request("https://mcp.example.com/authorize", {
      method: "POST",
      headers: { Cookie: cookie(consent, "CONSENT"), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ transaction })
    }), env, async () => new Response("fallback"));
    const stateToken = new URL(googleStart.headers.get("location")!).searchParams.get("state");
    const googleFetch = vi.fn(async (input: RequestInfo | URL) => String(input instanceof Request ? input.url : input).includes("/token")
      ? Response.json({ access_token: "google-token" })
      : Response.json({ sub: "google-user", email: "advogado@example.com", name: "Advogado", email_verified: true }));

    await handleGoogleAuth(new Request(`https://mcp.example.com/oauth/google/callback?code=google-code&state=${stateToken}`, {
      headers: { Cookie: cookie(googleStart, "GOOGLE") }
    }), env, async () => new Response("fallback"), googleFetch);

    expect(completion).toMatchObject({ scope: ["jurisprudenciaia:search"] });
  });

  it("rejects a Google identity outside the private allowlist", async () => {
    const state = new FakeOAuthState();
    const env = {
      OAUTH_STATE: state,
      MCP_GOOGLE_CLIENT_ID: "google-client",
      MCP_GOOGLE_CLIENT_SECRET: "google-secret",
      MCP_PUBLIC_ORIGIN: "https://mcp.example.com",
      MCP_GOOGLE_CALLBACK_ORIGIN: "https://mcp.example.com",
      MCP_ALLOWED_EMAILS: "advogado@example.com",
      OAUTH_PROVIDER: {
        parseAuthRequest: vi.fn(async () => authRequest),
        lookupClient: vi.fn(async () => ({ clientId: "claude-client", redirectUris: [authRequest.redirectUri], clientName: "Claude" })),
        completeAuthorization: vi.fn()
      }
    } satisfies GoogleOAuthEnv;
    const consent = await handleGoogleAuth(new Request("https://mcp.example.com/authorize"), env, async () => new Response("fallback"));
    const transaction = /name="transaction" value="([^"]+)"/.exec(await consent.text())![1]!;
    const start = await handleGoogleAuth(new Request("https://mcp.example.com/authorize", {
      method: "POST", headers: { Cookie: cookie(consent, "CONSENT"), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ transaction })
    }), env, async () => new Response("fallback"));
    const stateToken = new URL(start.headers.get("location")!).searchParams.get("state");
    const googleFetch = vi.fn(async (input: RequestInfo | URL) => String(input instanceof Request ? input.url : input).includes("/token")
      ? Response.json({ access_token: "google-token" })
      : Response.json({ sub: "intruder", email: "intruso@example.com", email_verified: true }));
    await expect(handleGoogleAuth(new Request(`https://mcp.example.com/oauth/google/callback?code=x&state=${stateToken}`, {
      headers: { Cookie: cookie(start, "GOOGLE") }
    }), env, async () => new Response("fallback"), googleFetch)).rejects.toThrow("oauth_user_not_allowed");
  });

  it.each([
    [undefined, undefined],
    ["challenge", "plain"]
  ])("rejects a loopback authorization without PKCE S256", async (codeChallenge, codeChallengeMethod) => {
    const loopbackRequest: AuthRequest = {
      ...authRequest,
      redirectUri: "http://127.0.0.1:3334/oauth/callback"
    };
    if (codeChallenge) loopbackRequest.codeChallenge = codeChallenge;
    else delete loopbackRequest.codeChallenge;
    if (codeChallengeMethod) loopbackRequest.codeChallengeMethod = codeChallengeMethod;
    else delete loopbackRequest.codeChallengeMethod;

    const env = {
      OAUTH_STATE: new FakeOAuthState(),
      MCP_GOOGLE_CLIENT_ID: "google-client",
      MCP_GOOGLE_CLIENT_SECRET: "google-secret",
      MCP_PUBLIC_ORIGIN: "https://mcp.example.com",
      MCP_ALLOWED_EMAILS: "advogado@example.com",
      OAUTH_PROVIDER: {
        parseAuthRequest: vi.fn(async () => loopbackRequest),
        lookupClient: vi.fn(async () => ({ clientName: "MCP CLI Client" })),
        completeAuthorization: vi.fn()
      }
    } satisfies GoogleOAuthEnv;

    await expect(handleGoogleAuth(
      new Request("https://mcp.example.com/authorize"),
      env,
      async () => new Response("fallback")
    )).rejects.toThrow("oauth_pkce_s256_required");
  });
});
