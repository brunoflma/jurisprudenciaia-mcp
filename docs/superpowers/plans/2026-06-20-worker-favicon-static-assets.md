# Worker Favicon Static Assets Implementation Plan

**Goal:** Serve the supplied JurisprudenciaIA icon from the Worker custom domain without changing MCP or OAuth behavior.

**Architecture:** Cloudflare Static Assets serves exact favicon files before the Worker. The existing code remains the API handler and fallback favicon implementation.

**Tech Stack:** Cloudflare Workers, Wrangler 4.103.0, TypeScript, Vitest.

---

### Task 1: Lock the production asset contract with a failing test

**Files:**
- Create: `tests/favicon-assets.test.ts`

1. Assert `wrangler.toml` declares `public` as its assets directory.
2. Assert the PNG and ICO filenames exist.
3. Assert `favicon.png` is the supplied 256 x 256 PNG with SHA-256 `61982638715E551BA5F8022150C184147DBD3DFA38E2CD06CE9B0D40A9990A11`.
4. Run `npm test -- tests/favicon-assets.test.ts` and confirm it fails because assets are not configured.

### Task 2: Add the exact assets and Wrangler configuration

**Files:**
- Modify: `wrangler.toml`
- Create: `public/favicon.png`
- Create: `public/favicon.ico`
- Create: `public/apple-touch-icon.png`

1. Configure `[assets] directory = "./public/"` with asset-first routing.
2. Copy the supplied PNG without recompression.
3. Generate a standards-compatible multi-size ICO from the same PNG.
4. Re-run the focused test and confirm it passes.

### Task 3: Verify, review, deploy, and preserve OAuth configuration

1. Run the complete test suite, typecheck, build, and `wrangler deploy --dry-run`.
2. Obtain independent subagent review of the diff and test evidence.
3. Synchronize `MCP_OAUTH_REDIRECT_URIS` in the GitHub Actions secret so deployment cannot restore the previous callback list.
4. Deploy with Wrangler.
5. Verify the three icon URLs, OAuth metadata, ChatGPT and Claude authorization redirects, and the MCP authentication challenge.
