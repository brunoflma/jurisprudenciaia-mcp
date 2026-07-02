# Worker Favicon Static Assets Design

## Goal

Publish the supplied JurisprudenciaIA 256 px icon from the custom Worker domain so connector clients can use the intended identity instead of the parent domain favicon.

## Chosen design

Use Cloudflare Workers Static Assets with asset-first routing. Store the supplied PNG as `public/favicon.png` and `public/apple-touch-icon.png`, and publish a real multi-size `public/favicon.ico` generated from the same source. Keep the existing Worker-generated favicon responses as a fallback for direct unit tests and unexpected asset-binding failures.

The landing page, OAuth metadata, and MCP server metadata reference cache-busted PNG and ICO URLs derived from the supplied file. The legacy SVG route remains available but is no longer advertised, preventing clients from preferring the old generated image. `MCP_ICON_URL`, when explicitly configured, continues to override the local PNG in OAuth and MCP metadata.

MCP and OAuth routes continue to fall through to the Worker because no matching static files exist for those paths. Wrangler also declares logs and traces at 100% sampling so a deployment preserves the production observability policy.

## Alternatives considered

- Replace the TypeScript base64 constants: duplicates about 53 KB of binary data in source and the ICO representation.
- Add an `ASSETS` binding and proxy assets in Worker code: adds runtime routing code without benefit because asset-first routing handles exact files.

## Validation

- A repository test verifies Static Assets configuration, required filenames, PNG signature, 256 x 256 dimensions, and source SHA-256.
- Existing Worker tests, typecheck, build, and Wrangler dry-run remain green.
- After deployment, `/favicon.png`, `/favicon.ico`, and `/apple-touch-icon.png` must return 200 with image content types; `/mcp` must continue returning the OAuth challenge when unauthenticated.
