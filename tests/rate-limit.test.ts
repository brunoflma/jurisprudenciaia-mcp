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

  it("handles multiple keys with different start times", () => {
    const limiter = new FixedWindowRateLimiter(100, 1);
    limiter.allow("a", 10);
    limiter.allow("b", 20);
    limiter.allow("c", 30);
    expect(limiter.size).toBe(3);

    // At 115, a expires, b and c remain
    limiter.allow("d", 115);
    expect(limiter.size).toBe(3);
    expect(limiter.allow("b", 115).allowed).toBe(false);
    expect(limiter.allow("c", 115).allowed).toBe(false);
  });

  it("handles renewal of an expired key", () => {
    const limiter = new FixedWindowRateLimiter(100, 1);
    limiter.allow("a", 10);
    limiter.allow("b", 20);

    // a expires at 110, so at 115 it's renewed
    expect(limiter.allow("a", 115).allowed).toBe(true);
    expect(limiter.size).toBe(2); // a and b

    // at 125, b expires, a is still active
    limiter.allow("c", 125);
    expect(limiter.size).toBe(2); // a and c
  });

  it("handles removal of all expired entries", () => {
    const limiter = new FixedWindowRateLimiter(100, 1);
    limiter.allow("a", 10);
    limiter.allow("b", 20);
    limiter.allow("c", 30);

    // At 200, all should be expired
    limiter.allow("d", 200);
    expect(limiter.size).toBe(1); // only d
  });

  it("handles non-monotonic timestamps, simulating the clock going backwards", () => {
    const limiter = new FixedWindowRateLimiter(100, 1);
    limiter.allow("a", 100);
    limiter.allow("b", 50); // Clock went backwards

    // At 160, b (50) should be expired (160 - 50 = 110 >= 100)
    // a (100) is NOT expired (160 - 100 = 60 < 100)
    limiter.allow("c", 160);

    // We expect b to be expired, a and c to be active
    expect(limiter.size).toBe(2); // a and c
    expect(limiter.allow("a", 160).allowed).toBe(false);
    expect(limiter.allow("b", 160).allowed).toBe(true);
  });
});
