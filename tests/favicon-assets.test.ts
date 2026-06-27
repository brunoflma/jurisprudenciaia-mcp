import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const expectedPngSha256 =
  "61982638715e551ba5f8022150c184147dbd3dfa38e2cd06ce9b0d40a9990a11";

describe("Worker favicon static assets", () => {
  it("configures the public directory for Cloudflare Static Assets", () => {
    const config = readFileSync("wrangler.toml", "utf8");

    expect(config).toMatch(/\[assets\][\s\S]*directory\s*=\s*"\.\/public\/"/);
  });

  it("publishes the supplied 256px PNG without recompression", () => {
    const png = readFileSync("public/favicon.png");

    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    expect(png.readUInt32BE(16)).toBe(256);
    expect(png.readUInt32BE(20)).toBe(256);
    expect(createHash("sha256").update(png).digest("hex")).toBe(expectedPngSha256);
  });

  it("publishes browser and touch-icon variants", () => {
    const ico = readFileSync("public/favicon.ico");
    const touchIcon = readFileSync("public/apple-touch-icon.png");

    expect(existsSync("public/favicon.ico")).toBe(true);
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(6);
    expect(
      Array.from({ length: 6 }, (_, index) => ico[6 + index * 16] || 256)
    ).toEqual([16, 32, 48, 64, 128, 256]);

    expect(existsSync("public/apple-touch-icon.png")).toBe(true);
    expect(createHash("sha256").update(touchIcon).digest("hex")).toBe(
      expectedPngSha256
    );
  });
});
