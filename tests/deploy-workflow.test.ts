import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("deploy-worker workflow", () => {
  it("checks and synchronizes the required OAuth redirect allowlist secret", () => {
    const workflow = readFileSync(".github/workflows/deploy-worker.yml", "utf8");
    const references = workflow.match(/MCP_OAUTH_REDIRECT_URIS/g) ?? [];

    expect(references).toHaveLength(6);
    expect(workflow).toContain(
      "MCP_OAUTH_REDIRECT_URIS: ${{ secrets.MCP_OAUTH_REDIRECT_URIS }}"
    );
  });
});
