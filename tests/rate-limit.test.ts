import { describe, expect, it } from "vitest";
import { FixedWindowRateLimiter } from "../src/infra/rate-limit.js";

describe("FixedWindowRateLimiter", () => {
  it("rejects non-positive window durations", () => {
    expect(() => new FixedWindowRateLimiter(0, 1)).toThrow("windowMs");
    expect(() => new FixedWindowRateLimiter(-1, 1)).toThrow("windowMs");
  });

  it("rejects non-positive request limits", () => {
    expect(() => new FixedWindowRateLimiter(1000, 0)).toThrow("maxRequests");
    expect(() => new FixedWindowRateLimiter(1000, -1)).toThrow("maxRequests");
  });

  it("allows requests within the configured window limit", () => {
    const limiter = new FixedWindowRateLimiter(1000, 2);

    expect(limiter.allow("client", 1000)).toEqual({ allowed: true, remaining: 1 });
    expect(limiter.allow("client", 1100)).toEqual({ allowed: true, remaining: 0 });
  });

  it("rejects requests over the window limit", () => {
    const limiter = new FixedWindowRateLimiter(1000, 1);

    expect(limiter.allow("client", 1000).allowed).toBe(true);
    expect(limiter.allow("client", 1100)).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterMs: 900
    });
  });

  it("resets after the window expires", () => {
    const limiter = new FixedWindowRateLimiter(1000, 1);

    limiter.allow("client", 1000);

    expect(limiter.allow("client", 2001)).toEqual({ allowed: true, remaining: 0 });
  });

  it("resets at the exact expiry boundary", () => {
    const limiter = new FixedWindowRateLimiter(1000, 1);

    limiter.allow("client", 1000);

    expect(limiter.allow("client", 2000)).toEqual({ allowed: true, remaining: 0 });
  });

  it("tracks independent windows per key", () => {
    const limiter = new FixedWindowRateLimiter(1000, 1);

    expect(limiter.allow("first", 1000).allowed).toBe(true);
    expect(limiter.allow("first", 1100).allowed).toBe(false);
    expect(limiter.allow("second", 1100)).toEqual({ allowed: true, remaining: 0 });
  });

  it("prunes expired windows when checking a new request", () => {
    const limiter = new FixedWindowRateLimiter(1000, 1);

    limiter.allow("expired", 1000);
    limiter.allow("active", 1900);

    expect(limiter.size).toBe(2);

    limiter.allow("new", 2000);

    expect(limiter.size).toBe(2);
  });
});
