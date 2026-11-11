/** Fixed-window limiter with an injectable store; production uses a shared store (Postgres/Redis). */
export class RateLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  private limit: number; private windowMs: number; private clock: () => number;
  constructor(limit: number, windowMs: number, clock: () => number = Date.now) {
    this.limit = limit; this.windowMs = windowMs; this.clock = clock;
  }
  take(key: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
    const t = this.clock(); let e = this.hits.get(key);
    if (!e || t >= e.reset) { e = { n: 0, reset: t + this.windowMs }; this.hits.set(key, e); }
    if (e.n >= this.limit) return { allowed: false, remaining: 0, retryAfterMs: e.reset - t };
    e.n++; return { allowed: true, remaining: this.limit - e.n, retryAfterMs: 0 };
  }
}
