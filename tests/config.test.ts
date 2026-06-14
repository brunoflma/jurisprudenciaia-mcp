import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("loads valid config with defaults", () => {
    const config = loadConfig({});

    expect(config.port).toBe(3000);
    expect(config.host).toBe("127.0.0.1");
    expect(config.connectorPath).toBe("/mcp");
    expect(config.jurisprudenciaIaUrl).toBe("https://www.jurisprudenciaia.com.br/");
    expect(config.requestTimeoutMs).toBe(120000);
    expect(config.rateLimitWindowMs).toBe(60000);
    expect(config.rateLimitMaxRequests).toBe(4);
  });

  it("normalizes configured URL", () => {
    const config = loadConfig({
      JURISPRUDENCIAIA_URL: " https://www.jurisprudenciaia.com.br "
    });

    expect(config.jurisprudenciaIaUrl).toBe("https://www.jurisprudenciaia.com.br/");
  });

  it("allows an explicit local server host", () => {
    const config = loadConfig({
      HOST: " 0.0.0.0 "
    });

    expect(config.host).toBe("0.0.0.0");
  });

  it("rejects invalid positive integers", () => {
    expect(() =>
      loadConfig({
        REQUEST_TIMEOUT_MS: "0"
      })
    ).toThrow("REQUEST_TIMEOUT_MS must be a positive integer");
  });

  it("rejects ports outside the TCP port range", () => {
    expect(() =>
      loadConfig({
        PORT: "999999"
      })
    ).toThrow("PORT must be between 1 and 65535");
  });

  it("rejects invalid configured URL", () => {
    expect(() =>
      loadConfig({
        JURISPRUDENCIAIA_URL: "not a url"
      })
    ).toThrow("JURISPRUDENCIAIA_URL must be a valid URL");
  });

  it("rejects configured URL with unsupported protocol", () => {
    expect(() =>
      loadConfig({
        JURISPRUDENCIAIA_URL: "ftp://www.jurisprudenciaia.com.br/"
      })
    ).toThrow("JURISPRUDENCIAIA_URL must use http or https");
  });
});
