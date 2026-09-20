export type RateLimitDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; remaining: 0; retryAfterMs: number };

type WindowState = {
  startedAtMs: number;
  count: number;
};

export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, WindowState>();
  private isMonotonic = true;
  private lastInsertedMs = -1;

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
    // ⚡ Bolt: Fast LRU prune. Stop iterating immediately once we find an unexpired window.
    // Gracefully fallback to full iteration only if a backwards clock jump was previously detected.
    for (const [k, window] of this.windows) {
      if (nowMs - window.startedAtMs >= this.windowMs) {
        this.windows.delete(k);
      } else if (this.isMonotonic) {
        break;
      }
    }

    const current = this.windows.get(key);

    if (!current || nowMs - current.startedAtMs >= this.windowMs) {
      if (!current && this.windows.size >= 10000) {
        const oldestKey = this.windows.keys().next().value;
        if (oldestKey !== undefined) {
          this.windows.delete(oldestKey);
        }
      }

      if (nowMs < this.lastInsertedMs) {
        this.isMonotonic = false;
      } else if (this.windows.size === 0) {
        // If map is empty, we are monotonic again!
        this.isMonotonic = true;
      }
      this.lastInsertedMs = nowMs;

      if (current) this.windows.delete(key);
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
}
