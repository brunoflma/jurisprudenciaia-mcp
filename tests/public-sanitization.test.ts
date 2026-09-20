import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function publishableFiles(): string[] {
  return [...new Set(execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  }).split(/\r?\n/).filter(Boolean))];
}

const privateTerms = [
  ["clau", "demux"].join(""), ["dp", "dns"].join(""),
  ["jurisprudenciaia-mcp", "personal"].join("-"),
];
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bsk-[A-Za-z0-9_-]{24,}\b/,
  /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/,
  /\bAIza[A-Za-z0-9_-]{35}\b/,
  /(?:CLOUDFLARE_API_TOKEN|CF_API_TOKEN)\s*[=:]\s*["']?[A-Za-z0-9_-]{30,}/i,
  /https?:\/\/[^/\s"']+:[^@\s"']+@/i,
  /\b\d{10,}-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com\b/,
];

function findings(text: string): string[] {
  const results: string[] = [];
  if (privateTerms.some(term => text.toLowerCase().includes(term.toLowerCase()))) results.push("private-identifier");
  if (secretPatterns.some(pattern => pattern.test(text))) results.push("credential-pattern");
  const emails = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
  if (emails.some(email => !/@(?:[a-z0-9-]+\.)*(?:example\.(?:com|net|org)|test|invalid)$/i.test(email))) results.push("non-example-email");
  if (/[CD]:[\\/](?:Users|OneDrive|Github)[\\/]/i.test(text)) results.push("local-machine-path");
  return results;
}

describe("public repository sanitization", () => {
  it("excludes credentials and operational files from the publication set", () => {
    const forbidden = publishableFiles().filter(file =>
      /^(?:\.env(?:\..+)?|\.dev\.vars(?:\..+)?|worker-configuration\.d\.ts)$/.test(file) && file !== ".env.example"
      || /^(?:\.claude|\.codex|staging|docs\/superpowers|docs\/architecture)\//.test(file)
      || /^\.github\/workflows\//.test(file) && file !== ".github/workflows/verify.yml");
    expect(forbidden).toEqual([]);
  });

  it("checks tracked and new text files without printing matched sensitive values", () => {
    const hits: { file: string; rules: string[] }[] = [];
    for (const file of publishableFiles()) {
      if (file === "package-lock.json" || /\.(?:png|ico|zip|pdf|woff2?)$/i.test(file)) continue;
      const rules = findings(readFileSync(file, "utf8"));
      if (rules.length) hits.push({ file, rules });
    }
    expect(hits).toEqual([]);
  });

  it("detects synthetic identifiers, credentials and personal contact details", () => {
    expect(findings(`https://${privateTerms[0]}.${privateTerms[1]}.org`)).toContain("private-identifier");
    expect(findings("ghp_" + "x".repeat(36))).toContain("credential-pattern");
    expect(findings("GOCSPX-" + "x".repeat(28))).toContain("credential-pattern");
    expect(findings("AIza" + "x".repeat(35))).toContain("credential-pattern");
    expect(findings('CLOUDFLARE_API_TOKEN="' + "x".repeat(40) + '"')).toContain("credential-pattern");
    expect(findings(["fixture", "gmail.com"].join("@"))).toContain("non-example-email");
    expect(findings("user@example.com https://mcp.example.com")).toEqual([]);
  });

  it("keeps verification CI independent of deployment credentials", () => {
    const workflow = readFileSync(".github/workflows/verify.yml", "utf8");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("--network none");
    expect(workflow).not.toMatch(/secrets\.|pull_request_target|wrangler secret/);
    expect(workflow.match(/wrangler deploy[^\n]*/g)).toEqual(["wrangler deploy --dry-run"]);
  });
});
