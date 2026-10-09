import { canonicalOAuthOrigin } from "../access-policy.js";

export const AUTHORITY_BACKCHANNEL_PATH = "/_internal/oauth-v2/authorize";
export const BACKCHANNEL_BODY_LIMIT = 16384;
const encoder = new TextEncoder();

function keyBytes(key: string | undefined): Uint8Array {
  if (!key || !/^[A-Za-z0-9_-]{43}$/.test(key)) throw { code: "temporarily_unavailable" };
  const bytes = Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/") + "="), value => value.charCodeAt(0));
  if (bytes.length !== 32 || btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") !== key) throw { code: "temporarily_unavailable" };
  return bytes;
}

async function mac(key: string | undefined, issuer: string, body: Uint8Array, stamp: string, nonce: string): Promise<string> {
  const secret = await crypto.subtle.importKey("raw", keyBytes(key) as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", body as BufferSource));
  const hash = [...digest].map(value => value.toString(16).padStart(2, "0")).join("");
  const payload = encoder.encode(`POST\n${canonicalOAuthOrigin(issuer)}\n${AUTHORITY_BACKCHANNEL_PATH}\n${stamp}\n${nonce}\n${hash}`);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", secret, payload));
  return btoa(String.fromCharCode(...signature)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Transport proof is bound to the exact authority, path, timestamp and request bytes. */
export async function signAuthorityRequest(key: string, issuer: string, body: Uint8Array, now = Date.now()): Promise<string> {
  const stamp = String(now);
  const nonce = crypto.randomUUID();
  return `MCP-Authority-V2 ${stamp}.${nonce}.${await mac(key, issuer, body, stamp, nonce)}`;
}

export async function verifyAuthorityRequest(request: Request, key: string | undefined, issuer: string, body: Uint8Array, now = Date.now()): Promise<void> {
  keyBytes(key); // A missing transport configuration is an outage, never anonymous access.
  const url = new URL(request.url);
  const proof = /^MCP-Authority-V2 (\d{13})\.([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") ?? "");
  if (request.method !== "POST" || url.origin !== canonicalOAuthOrigin(issuer) || url.pathname !== AUTHORITY_BACKCHANNEL_PATH || url.search || !proof || Math.abs(now - Number(proof[1])) > 30000) throw { code: "access_denied" };
  const expected = await mac(key, issuer, body, proof[1]!, proof[2]!);
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ proof[3]!.charCodeAt(index);
  if (difference !== 0) throw { code: "access_denied" };
}

/** Stream limit also applies when content-length is missing or misleading. */
export async function readBackchannelBytes(message: { body: ReadableStream<Uint8Array> | null }): Promise<Uint8Array> {
  const reader = message.body?.getReader();
  if (!reader) throw { code: "invalid_request" };
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > BACKCHANNEL_BODY_LIMIT) { void reader.cancel().catch(() => {}); throw { code: "invalid_request" }; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export function decodeBackchannelJson(bytes: Uint8Array): unknown {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw { code: "invalid_request" }; }
}
