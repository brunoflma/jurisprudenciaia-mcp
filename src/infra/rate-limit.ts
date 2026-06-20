export type RateLimitDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; remaining: 0; retryAfterMs: number };

type WindowState = {
  startedAtMs: number;
  count: number;
};

export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, WindowState>();
  private lastPruneMs = 0;

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

  // Only for testing
  get size(): number {
    return this.windows.size;
  }

  allow(key: string, nowMs = Date.now()): RateLimitDecision {
    // Optimize Map iteration overhead: only run the full `O(N)` Map scan for expired entries
    // periodically (e.g. once per window duration) or when the Map gets sufficiently large,
    // to avoid an O(N^2) explosion on high traffic with many users.
    // To ensure exact sizes during tests without `allow` triggering immediate cleanup
    // of other entries, tests shouldn't strictly assume `limiter.size` drops perfectly
    // unless time advanced enough. But we can keep `pruneExpired` running if `Math.abs(nowMs - this.lastPruneMs) >= this.windowMs`
    if (Math.abs(nowMs - this.lastPruneMs) >= this.windowMs) {
      this.pruneExpired(nowMs);
      this.lastPruneMs = nowMs;
    }

    const current = this.windows.get(key);

    if (!current || Math.abs(nowMs - current.startedAtMs) >= this.windowMs) {
      // Lazy cleanup for this specific key
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

  private pruneExpired(nowMs: number): void {
    for (const [key, window] of this.windows) {
      if (Math.abs(nowMs - window.startedAtMs) >= this.windowMs) {
        this.windows.delete(key);
      }
    }
  }
}
