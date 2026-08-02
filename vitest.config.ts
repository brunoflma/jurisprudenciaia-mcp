import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  ssr: {
    noExternal: ["@cloudflare/workers-oauth-provider"]
  },
  resolve: {
    alias: {
      "cloudflare:workers": fileURLToPath(new URL("./tests/support/cloudflare-workers.ts", import.meta.url))
    }
  },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**", ".worktrees/**"]
  }
});
