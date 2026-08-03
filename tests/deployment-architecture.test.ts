import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("production deployment architecture", () => {
  it("uses Cloudflare Workers as the only production deployment target", () => {
    expect(existsSync("wrangler.jsonc")).toBe(true);
    expect(existsSync("render.yaml")).toBe(false);
    expect(existsSync(".github/workflows/deploy-worker.yml")).toBe(false);
  });

  it("keeps the Node HTTP server scripts explicitly local-only", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts.dev).toBeUndefined();
    expect(pkg.scripts.start).toBeUndefined();
    expect(pkg.scripts["dev:server"]).toBe("tsx watch src/server.ts");
    expect(pkg.scripts["start:server"]).toBe("node dist/src/server.js");
    expect(pkg.scripts["dev:worker"]).toBe("wrangler dev");
    expect(pkg.scripts["deploy:worker"]).toBe("wrangler deploy");
    expect(pkg.scripts.verify).toBe(
      "npm run cf-types && npm run typecheck && npm test && npm audit --audit-level=high --omit=dev && npm run build"
    );
  });

  it("documents the actual Worker health response", () => {
    const deploymentGuide = readFileSync("docs/deployment.md", "utf8");
    const visualGuide = readFileSync("docs/deploy-guide.html", "utf8");

    expect(deploymentGuide).toContain('{"ok":true,"service":"jurisprudenciaia-mcp"}');
    expect(deploymentGuide).not.toContain('"runtime":"cloudflare-workers"');
    expect(visualGuide).not.toContain('{"ok":true,"service":"jurisprudenciaia-mcp"}');
    expect(visualGuide).not.toContain('"runtime":"cloudflare-workers"');
  });

  it("keeps the skip-link target visible below the sticky progress header", () => {
    const visualGuide = readFileSync("docs/deploy-guide.html", "utf8");

    expect(visualGuide).toContain("scroll-padding-top: 5.5rem");
    expect(visualGuide).toContain('<a href="#main-content" class="skip-link">');
    expect(visualGuide).toContain('<main id="main-content" tabindex="-1">');
    expect(visualGuide).not.toMatch(/main:focus-visible\s*{\s*outline:\s*none/);
  });

  it("documents the Google OAuth flow without legacy client secrets", () => {
    const readme = readFileSync("README.md", "utf8");
    const deploymentGuide = readFileSync("docs/deployment.md", "utf8");
    const visualGuide = readFileSync("docs/deploy-guide.html", "utf8");
    const activeDocs = [readme, deploymentGuide, visualGuide].join("\n");

    expect(activeDocs).toContain("MCP_GOOGLE_CLIENT_SECRET");
    expect(activeDocs).toContain("MCP_ALLOWED_EMAILS");
    expect(activeDocs).not.toContain("MCP_OAUTH_CLIENT_SECRET");
    expect(activeDocs).not.toContain("MCP_ACCESS_TOKEN_SECRET");
    expect(activeDocs).not.toContain("MCP_OAUTH_REDIRECT_URIS");
    expect(visualGuide).toContain("Deixe Client ID e Client Secret vazios");
  });

  it("documents OAuth as the supported Codex authentication path", () => {
    const readme = readFileSync("README.md", "utf8");
    const codexGuide = readFileSync("docs/codex.md", "utf8");

    expect(readme).toContain("| Codex | Suportado para uso normal | OAuth 2.1, PKCE S256 e Google |");
    expect(codexGuide).toContain("codex mcp login jurisprudenciaia");
    expect(codexGuide).toContain('auth = "oauth"');
    expect(codexGuide).toContain("Não configure `bearer_token_env_var` para o fluxo normal OAuth.");
  });

  it("ships only sanitized, reproducible OAuth guide images", () => {
    const assetDir = "docs/assets/oauth-guide";
    const mockups = readFileSync(`${assetDir}/mockups.html`, "utf8");
    const expectedImages = [
      "01-adicionar-conector.png",
      "02-autorizar-google.png",
      "03-conexao-concluida.png"
    ];

    expect(mockups).toContain("DADOS FICTÍCIOS · MOCKUP");
    expect(mockups).not.toMatch(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
    expect(mockups).not.toMatch(/\d+-[a-z0-9]+\.apps\.googleusercontent\.com/i);
    expect(mockups).not.toMatch(/ofid_[a-z0-9]+/i);
    for (const image of expectedImages) {
      const bytes = readFileSync(`${assetDir}/${image}`);
      expect(existsSync(`${assetDir}/${image}`)).toBe(true);
      expect(bytes.readUInt32BE(16)).toBe(1440);
      expect(bytes.readUInt32BE(20)).toBe(900);
    }
  });
});
