type StoredTransaction = {
  payload: unknown;
  binding: string;
  expiresAt: number;
};

const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block"
} as const;

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", "Pragma": "no-cache", ...SECURITY_HEADERS } });
}

async function equalConstantTime(left: string, right: string): Promise<boolean> {
  if (left.length !== right.length) return false;
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right))
  ]);
  const aa = new Uint8Array(leftHash);
  const bb = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < aa.length; index += 1) difference |= aa[index]! ^ bb[index]!;
  return difference === 0;
}

export class OAuthStateStore {
  private readonly storage: DurableObjectStorage;

  constructor(state: DurableObjectState) {
    this.storage = state.storage;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === "PUT") {
      let value: unknown;
      try {
        value = await readJsonLimited(request, 1_048_576);
      } catch {
        return json({ ok: false }, 413);
      }
      const record = isRecord(value) ? value : null;
      if (typeof record?.binding !== "string" || typeof record.expiresAt !== "number" || !Number.isFinite(record.expiresAt)) {
        return json({ ok: false }, 400);
      }
      await this.storage.put("transaction", record as StoredTransaction);
      await this.storage.setAlarm(record.expiresAt);
      return json({ ok: true });
    }

    if (request.method === "POST" && new URL(request.url).pathname === "/consume") {
      const binding = request.headers.get("x-mcp-oauth-binding") ?? "";
      return this.storage.transaction(async (transaction) => {
        const record = await transaction.get<StoredTransaction>("transaction");
        if (!record || record.expiresAt <= Date.now()) {
          await transaction.delete("transaction");
          return json({ ok: false }, 404);
        }
        if (!(await equalConstantTime(binding, record.binding))) return json({ ok: false }, 403);
        await transaction.delete("transaction");
        return json({ payload: record.payload });
      });
    }

    return json({ ok: false }, 405);
  }

  async alarm(): Promise<void> {
    await this.storage.deleteAll();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readJsonLimited(request: Request, limit: number): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declared) || declared > limit) throw new Error("body_too_large");
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) { await reader.cancel(); throw new Error("body_too_large"); }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(result)) as unknown;
}
