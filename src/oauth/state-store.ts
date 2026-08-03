type StoredTransaction = {
  payload: unknown;
  binding: string;
  expiresAt: number;
};

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", "Pragma": "no-cache" } });
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
      const contentLength = Number(request.headers.get("content-length") ?? 0);
      if (contentLength > 1_048_576) return json({ ok: false }, 413);
      const value: unknown = await request.json();
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
