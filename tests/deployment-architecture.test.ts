import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("production deployment architecture", () => {
  it("uses Cloudflare Workers as the only production deployment target", () => {
    expect(existsSync("wrangler.toml")).toBe(true);
    expect(existsSync("render.yaml")).toBe(false);

    const deployWorkflow = readFileSync(".github/workflows/deploy-worker.yml", "utf8");
    expect(deployWorkflow).toContain("npx wrangler deploy");
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
  });

  it("documents the actual Worker health response", () => {
    const deploymentGuide = readFileSync("docs/deployment.md", "utf8");
    const visualGuide = readFileSync("docs/deploy-guide.html", "utf8");

    expect(deploymentGuide).toContain('{"ok":true,"service":"jurisprudenciaia-mcp"}');
    expect(deploymentGuide).not.toContain('"runtime":"cloudflare-workers"');
    expect(visualGuide).toContain('{"ok":true,"service":"jurisprudenciaia-mcp"}');
    expect(visualGuide).not.toContain('"runtime":"cloudflare-workers"');
  });
});
