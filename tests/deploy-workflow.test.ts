import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("GitHub Actions deployment boundary", () => {
  it("keeps GitHub Actions as CI-only automation", () => {
    expect(existsSync(".github/workflows/deploy-worker.yml")).toBe(false);

    const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(ciWorkflow).toContain("run: npm run verify");
    expect(ciWorkflow).toContain("run: npx wrangler deploy --dry-run");
    expect(ciWorkflow).not.toContain("wrangler secret put");
  });

  it("does not duplicate PR CI on every agent branch push", () => {
    const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");

    expect(ciWorkflow).toMatch(/push:\s*\n\s*branches:\s*\n\s*- master\s*\n\s*- main/m);
    expect(ciWorkflow).toContain("pull_request:");
  });
});
