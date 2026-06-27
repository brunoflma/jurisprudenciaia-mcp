import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("deploy-worker workflow", () => {
  it("checks and synchronizes the required OAuth redirect allowlist secret", () => {
    const workflow = readFileSync(".github/workflows/deploy-worker.yml", "utf8");
    const references = workflow.match(/MCP_OAUTH_REDIRECT_URIS/g) ?? [];

    expect(references.length).toBeGreaterThanOrEqual(4);
    expect(workflow).toContain(
      "MCP_OAUTH_REDIRECT_URIS: ${{ secrets.MCP_OAUTH_REDIRECT_URIS }}"
    );
  });

  it("fails production deploys when required Worker secrets are missing", () => {
    const workflow = readFileSync(".github/workflows/deploy-worker.yml", "utf8");

    expect(workflow).toContain("::error::GitHub secret $name is required for Worker deploy.");
    expect(workflow).toContain("exit 1");
    expect(workflow).not.toContain("skipping Worker deploy");
    expect(workflow).not.toContain("configured=false");
  });

  it("syncs the Codex bearer token only when the optional secret exists", () => {
    const workflow = readFileSync(".github/workflows/deploy-worker.yml", "utf8");

    expect(workflow).toContain("MCP_BEARER_TOKEN: ${{ secrets.MCP_BEARER_TOKEN }}");
    expect(workflow).toContain('if [ -n "$MCP_BEARER_TOKEN" ]; then');
    expect(workflow).toContain('printf "%s" "$MCP_BEARER_TOKEN" | npx wrangler secret put MCP_BEARER_TOKEN');
  });

  it("syncs Worker secrets before publishing production code", () => {
    const workflow = readFileSync(".github/workflows/deploy-worker.yml", "utf8");

    const syncIndex = workflow.indexOf("- name: Sync Worker secrets");
    const deployIndex = workflow.indexOf("- name: Deploy Worker");

    expect(syncIndex).toBeGreaterThan(-1);
    expect(deployIndex).toBeGreaterThan(-1);
    expect(syncIndex).toBeLessThan(deployIndex);
  });
});
