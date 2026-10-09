import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Worker favicon static assets", () => {
  it("configures Cloudflare Worker for JurisprudenciaIA MCP", () => {
    const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
    expect(config.name).toBe("jurisprudenciaia-mcp");
  });

  it("publishes the product symbol as a valid 256px PNG", () => {
    const png = readFileSync("public/favicon.png");
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.readUInt32BE(16)).toBe(256);
    expect(png.readUInt32BE(20)).toBe(256);
  });

  it("publishes browser and touch-icon variants", () => {
    const ico = readFileSync("public/favicon.ico");
    const touchIcon = readFileSync("public/apple-touch-icon.png");

    expect(existsSync("public/favicon.ico")).toBe(true);
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(6);
    expect(Array.from({ length: 6 }, (_, index) => ico[6 + index * 16] || 256)).toEqual([16, 32, 48, 64, 128, 256]);
    expect(existsSync("public/apple-touch-icon.png")).toBe(true);
    expect(touchIcon.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(touchIcon.readUInt32BE(16)).toBe(180);
    expect(touchIcon.readUInt32BE(20)).toBe(180);
    const lastFrame = 6 + 5 * 16;
    const frameSize = ico.readUInt32LE(lastFrame + 8);
    const frameOffset = ico.readUInt32LE(lastFrame + 12);
    const browserPng = ico.subarray(frameOffset, frameOffset + frameSize);
    expect(createHash("sha256").update(browserPng).digest("hex")).toBe(
      createHash("sha256").update(readFileSync("public/favicon.png")).digest("hex")
    );
  });
});
