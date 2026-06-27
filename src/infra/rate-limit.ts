export type RateLimitDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; remaining: 0; retryAfterMs: number };

type WindowState = {
  startedAtMs: number;
  count: number;
};

export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, WindowState>();

  constructor(
    private readonly windowMs: number,
    private readonly maxRequests: number
  ) {
    if (windowMs <= 0) {
      throw new Error("windowMs must be greater than 0");
    }

    if (maxRequests <= 0) {
      throw new Error("maxRequests must be greater than 0");
    }
  }

  get size(): number {
    return this.windows.size;
  }

  allow(key: string, nowMs = Date.now()): RateLimitDecision {
    this.pruneExpired(nowMs);

    const current = this.windows.get(key);

    if (!current || nowMs - current.startedAtMs >= this.windowMs) {
      this.windows.set(key, { startedAtMs: nowMs, count: 1 });
      return { allowed: true, remaining: this.maxRequests - 1 };
    }

    if (current.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, this.windowMs - (nowMs - current.startedAtMs))
      };
    }

    current.count += 1;
    return { allowed: true, remaining: this.maxRequests - current.count };
  }

  private pruneExpired(nowMs: number): void {
    for (const [key, window] of this.windows) {
      if (nowMs - window.startedAtMs >= this.windowMs) {
        this.windows.delete(key);
      }
    }
  }
}
