import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { TOOL_DEFINITIONS } from "../src/mcp/tool-definition.js";

type Example = {
  id: string;
  tool: string;
  requiresInput?: boolean;
  arguments: Record<string, unknown>;
  question: string;
  request: string[];
  check: string;
  prompt: string;
};
const site = JSON.parse(readFileSync("docs/assets/site-data.json", "utf8")) as {
  tools: { id: string; title: string; group: string; description: string }[];
  examples: Example[];
};
const html = readFileSync("docs/index.html", "utf8");

describe("public connector presentation", () => {
  it("keeps the public catalog aligned with the actual MCP tools", () => {
    expect(site.tools.map(tool => tool.id)).toEqual(TOOL_DEFINITIONS.map(tool => tool.name));
    expect(new Set(site.tools.map(tool => tool.id)).size).toBe(site.tools.length);
    expect(site.tools.every(tool => tool.title && tool.group && tool.description)).toBe(true);
  });

  it("uses supported input fields in every illustrative workflow", () => {
    expect(site.examples).toHaveLength(7);
    expect(new Set(site.examples.map(example => example.id)).size).toBe(7);
    for (const example of site.examples) {
      const definition = TOOL_DEFINITIONS.find(tool => tool.name === example.tool);
      expect(definition, example.tool).toBeDefined();
      expect(z.object(definition!.inputSchema).safeParse(example.arguments).success).toBe(true);
      expect(example.request.length).toBeGreaterThan(0);
      expect(example.question && example.check && example.prompt).toBeTruthy();
      if (!example.requiresInput) {
        expect(definition!.normalizeInput(example.arguments).query.length).toBeGreaterThan(0);
      }
    }
    const process = site.examples.find(example => example.tool === "buscar_por_cnj")!;
    expect(process.requiresInput).toBe(true);
    expect(process.arguments.numero_cnj).toBe("[INFORME O NÚMERO CNJ]");
  });

  it("presents the site directly and preserves existing guide routes", () => {
    expect(html).not.toMatch(/http-equiv="refresh"|noindex|location\.replace/);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      const value = match[1];
      if (value.startsWith("#")) {
        if (value !== "#") expect(ids).toContain(value.slice(1));
      } else if (!/^https?:\/\//.test(value)) {
        expect(existsSync(join("docs", value.split(/[?#]/)[0])), value).toBe(true);
      }
    }
    expect(html).toContain('href="deploy-guide.html"');
    expect(existsSync("docs/compatibility-and-security.md")).toBe(true);
  });

  it("keeps the static demo local and GitHub calls to action on the correct project", () => {
    const script = readFileSync("docs/assets/site.js", "utf8");
    expect([...script.matchAll(/fetch\("([^"]+)"\)/g)].map(match => match[1])).toEqual(["assets/site-data.json"]);
    expect(html).not.toContain('type="file"');
    const calls = [...html.matchAll(/<a\b[^>]*data-github-cta[^>]*>/g)];
    expect(calls.length).toBeGreaterThanOrEqual(5);
    for (const [tag] of calls) {
      expect(tag.match(/href="([^"]+)"/)![1]).toMatch(/^https:\/\/github\.com\/brunoflma\/jurisprudenciaia-mcp(?:[\/#]|$)/);
    }
    expect(existsSync(".github/ISSUE_TEMPLATE/experiencia.yml")).toBe(true);
  });

  it("ships a real share image with matching public metadata", () => {
    const png = readFileSync("docs/assets/social-preview.png");
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1280, 640]);
    expect(png.byteLength).toBeLessThan(1_000_000);
    expect(html).toContain('content="https://brunoflma.github.io/jurisprudenciaia-mcp/assets/social-preview.png"');
    expect(html).toContain('content="summary_large_image"');
  });

  it("resolves both onboarding routes, guide anchors and local assets", () => {
    const guide = readFileSync("docs/deploy-guide.html", "utf8");
    const ids = [...guide.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const page of [html, guide]) {
      for (const [, value] of page.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
        if (/^https?:\/\//.test(value)) continue;
        const [path, anchor] = value.split("#");
        if (path) expect(existsSync(join("docs", path.split("?")[0])), value).toBe(true);
        if (anchor && (page === guide || path === "deploy-guide.html")) expect(ids, value).toContain(anchor);
      }
    }
    expect(html).toContain('href="deploy-guide.html#instalar"');
    expect(html).toContain('href="deploy-guide.html#conectar"');
    for (const [, target] of guide.matchAll(/data-copy="([^"]+)"/g)) {
      expect(ids, `Copy button target: ${target}`).toContain(target);
    }
    expect(guide).not.toMatch(/<script[^>]+src="https?:|<link[^>]+rel="stylesheet"[^>]+href="https?:/);
  });

  it("documents the clone destination correctly and keeps installation separate from connection", () => {
    const guide = readFileSync("docs/deploy-guide.html", "utf8");
    const clone = guide.match(/git clone https:\/\/github\.com\/brunoflma\/([^\s]+)\.git\s+cd ([^\s]+)/);
    expect(clone).not.toBeNull();
    expect(clone![2]).toBe(clone![1]);
    const connection = guide.slice(guide.indexOf('id="conectar"'), guide.indexOf('id="ajuda"'));
    expect(connection).not.toMatch(/wrangler (?:deploy|secret|kv)/);
    expect(connection).toContain("codex mcp login jurisprudenciaia");
    expect(connection).toContain("pesquisar_jurisprudencia");
    expect(connection).toContain("Deixe Client ID e Client Secret vazios");
  });
});
