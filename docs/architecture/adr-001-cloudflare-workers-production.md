# ADR-001: Cloudflare Workers as the production runtime

## Status

Accepted

## Context

This project exposes a remote MCP server for Claude.ai, ChatGPT, and Codex. The repository had multiple deployment controllers for the same service:

- Cloudflare Workers via `wrangler.toml`, Cloudflare Builds, and previously `.github/workflows/deploy-worker.yml`.
- Render via `render.yaml`, running the compiled Node/Express server with `npm start`.

Keeping multiple deploy controllers creates competing public origins, secret stores, deployment lifecycles, and places where OAuth redirect URLs, bearer tokens, rate limits, and observability can drift.

## Decision

Cloudflare Workers is the only production deployment target.

Cloudflare Builds owns production deploys from the private repository. GitHub Actions is limited to CI and bundle validation. The public repository is a reviewed mirror and must not contain deploy workflows or secrets.

The Node/Express entrypoint remains available for local development and tests, but it is not a production hosting target for this repository. Render may remain as a manually controlled fallback during migration only after an explicit operational decision; it must not auto-deploy from Git while Cloudflare Builds owns production.

## Rationale

1. The worker implementation is the authoritative runtime for OAuth, bearer-token auth, MCP discovery, static favicon assets, custom domain routing, and observability.
2. The repository validates Workers in CI with `wrangler deploy --dry-run`; production publication is owned by Cloudflare Builds.
3. Cloudflare Workers matches the service shape: short stateless HTTP requests, no database, no background worker, no long-running browser session, and a globally reachable MCP endpoint.
4. Render adds operational cost without adding a required capability for the current architecture.

## Trade-offs

- Render is not an equivalent OAuth-capable rollback target unless its Node path is separately upgraded and verified.
- If future requirements need long-lived Node processes, background workers, private networking, or browser automation, this decision should be revisited.

## Consequences

- `wrangler.toml` is the production runtime source of truth.
- GitHub Actions must remain CI-only and must not rotate Worker secrets or deploy production code automatically.
- Worker secrets must be managed in Cloudflare. GitHub secrets are only needed for CI if a future workflow requires them, not for public mirror deploys.
- Public repository replication should copy the Cloudflare Worker architecture, not a Render Blueprint or deploy workflow.
