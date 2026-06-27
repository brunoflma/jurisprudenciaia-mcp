import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const wranglerConfig = readFileSync(
  new URL("../wrangler.toml", import.meta.url),
  "utf8"
);

describe("wrangler custom domain", () => {
  it("keeps the workers.dev endpoint enabled as a fallback", () => {
    expect(wranglerConfig).toMatch(/^workers_dev = true$/m);
  });

  it("binds jurisprudenciaia-mcp to its approved custom domain", () => {
    expect(wranglerConfig).toMatch(
      /\[\[routes\]\]\s+pattern = "jurisprudenciaia-mcp\.claudemux\.dpdns\.org"\s+custom_domain = true/
    );
  });

  it("keeps full logs and traces enabled for production diagnostics", () => {
    expect(wranglerConfig).toMatch(
      /\[observability\]\s+enabled = true\s+head_sampling_rate = 1/
    );
    expect(wranglerConfig).toMatch(
      /\[observability\.logs\]\s+enabled = true\s+head_sampling_rate = 1\s+persist = true\s+invocation_logs = true/
    );
    expect(wranglerConfig).toMatch(
      /\[observability\.traces\]\s+enabled = true\s+head_sampling_rate = 1\s+persist = true/
    );
  });
});
