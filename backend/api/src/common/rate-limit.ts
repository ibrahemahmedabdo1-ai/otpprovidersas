/** Fixed-window limiter, in-memory (single instance). Replace with a shared store before running multiple API replicas. */
export class RateLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  private limit: number; private windowMs: number; private clock: () => number;
  constructor(limit: number, windowMs: number, clock: () => number = Date.now) {
    this.limit = limit; this.windowMs = windowMs; this.clock = clock;
  }
  take(key: string): { allowed: boolean; retryAfterSec: number } {
    const t = this.clock();
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (t >= v.reset) this.hits.delete(k);
    let e = this.hits.get(key);
    if (!e || t >= e.reset) { e = { n: 0, reset: t + this.windowMs }; this.hits.set(key, e); }
    if (e.n >= this.limit) return { allowed: false, retryAfterSec: Math.ceil((e.reset - t) / 1000) };
    e.n++;
    return { allowed: true, retryAfterSec: 0 };
  }
}
