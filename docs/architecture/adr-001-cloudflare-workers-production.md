# ADR-001: Cloudflare Workers as the production runtime

## Status

Accepted

## Context

This project exposes a remote MCP server for Claude.ai, ChatGPT, and Codex. The repository had two production deployment targets:

- Cloudflare Workers via `wrangler.toml` and `.github/workflows/deploy-worker.yml`.
- Render via `render.yaml`, running the compiled Node/Express server with `npm start`.

Keeping both targets creates two public origins for the same MCP contract, two secret stores, two deployment lifecycles, and two places where OAuth redirect URLs, bearer tokens, rate limits, and observability can drift.

## Decision

Cloudflare Workers is the only production deployment target.

The Node/Express entrypoint remains available for local development and tests, but it is not a production hosting target for this repository. The Render Blueprint has been removed so Git-backed production deploys cannot accidentally create a second MCP endpoint.

## Rationale

1. The worker implementation is the authoritative runtime for OAuth, bearer-token auth, MCP discovery, static favicon assets, custom domain routing, and observability.
2. The repository already validates Workers in CI with `wrangler deploy --dry-run` and deploys through the `Deploy Worker` workflow.
3. Cloudflare Workers matches the service shape: short stateless HTTP requests, no database, no background worker, no long-running browser session, and a globally reachable MCP endpoint.
4. Render adds operational cost without adding a required capability for the current architecture.

## Trade-offs

- We give up a ready Render fallback service.
- If future requirements need long-lived Node processes, background workers, private networking, or browser automation, this decision should be revisited.

## Consequences

- `wrangler.toml` and `.github/workflows/deploy-worker.yml` are the production deployment source of truth.
- Secrets must be managed in GitHub Actions and Cloudflare Worker Secrets, not Render.
- Public repository replication should copy the Cloudflare Worker architecture, not a Render Blueprint.

