import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);
}

function readTrackedText(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

describe("public repository sanitization", () => {
  it("does not publish private agent, planning, architecture, or workflow files", () => {
    const files = trackedFiles();
    const forbiddenPrefixes = [
      "." + ["ju", "les"].join("") + "/",
      "." + ["Ju", "les"].join("") + "/",
      ["docs", ["su", "per", "powers"].join("")].join("/") + "/",
      ["docs", "architecture"].join("/") + "/",
      ["." + "github", "workflows"].join("/") + "/"
    ];

    for (const prefix of forbiddenPrefixes) {
      expect(files.filter((file) => file.startsWith(prefix))).toEqual([]);
    }
  });

  it("does not publish personal infrastructure identifiers or private mirror notes", () => {
    const content = trackedFiles()
      .map(readTrackedText)
      .filter((text): text is string => text !== null)
      .join("\n");

    const forbiddenTerms = [
      ["clau", "demux"].join(""),
      ["dp", "dns"].join(""),
      ["jurisprudenciaia-mcp", "personal"].join("-"),
      ["Cloudflare", "Builds"].join(" "),
      ["workers", "domains"].join("/"),
      [["es", "pelho"].join(""), "privado"].join(" "),
      [["es", "pelho"].join(""), "publico"].join(" "),
      [["es", "pelho"].join(""), "p\u00fablico"].join(" ")
    ];

    for (const term of forbiddenTerms) {
      expect(content).not.toContain(term);
    }
  });
});
