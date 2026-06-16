export type AppConfig = {
  port: number;
  host: string;
  connectorPath: string;
  jurisprudenciaIaUrl: string;
  requestTimeoutMs: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
};

type Env = Record<string, string | undefined>;

function positiveInteger(env: Env, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function port(env: Env, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be between 1 and 65535`);
  }

  return value;
}

function httpUrl(env: Env, name: string, fallback: string): string {
  const raw = env[name]?.trim() || fallback;
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must use http or https`);
  }

  return url.toString();
}

function host(env: Env, name: string, fallback: string): string {
  return env[name]?.trim() || fallback;
}

export function loadConfig(env: Env = process.env): AppConfig {
  return {
    port: port(env, "PORT", 3000),
    host: host(env, "HOST", "127.0.0.1"),
    connectorPath: "/mcp",
    jurisprudenciaIaUrl: httpUrl(
      env,
      "JURISPRUDENCIAIA_URL",
      "https://www.jurisprudenciaia.com.br/"
    ),
    requestTimeoutMs: positiveInteger(env, "REQUEST_TIMEOUT_MS", 120000),
    rateLimitWindowMs: positiveInteger(env, "RATE_LIMIT_WINDOW_MS", 60000),
    rateLimitMaxRequests: positiveInteger(env, "RATE_LIMIT_MAX_REQUESTS", 30)
  };
}
