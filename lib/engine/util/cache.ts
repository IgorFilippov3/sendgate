/** Small TTL + LRU cache. Map iteration order is insertion order. */
export class TtlCache<V> {
  private store = new Map<string, { value: V; expires: number }>();

  constructor(
    private readonly maxSize: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    // Refresh LRU position.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V, ttlMs: number) {
    if (ttlMs <= 0) return;
    this.store.delete(key);
    this.store.set(key, { value, expires: this.now() + ttlMs });
    while (this.store.size > this.maxSize) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  get size() {
    return this.store.size;
  }
}

/** Limits how many async tasks run at once. */
export function createLimiter(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    if (active >= concurrency) return;
    const run = queue.shift();
    if (run) {
      active++;
      run();
    }
  };

  return function limit<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
  };
}

export type Limiter = ReturnType<typeof createLimiter>;

/** Fixed-window rate limiter keyed by client id. */
export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly perMinute: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Consumes `cost` units. Returns seconds to wait, or 0 if allowed. */
  take(key: string, cost = 1): number {
    if (this.perMinute <= 0) return 0;
    const t = this.now();
    let w = this.windows.get(key);
    if (!w || t - w.start >= 60_000) {
      w = { start: t, count: 0 };
      this.windows.set(key, w);
      if (this.windows.size > 10_000) this.prune(t);
    }
    if (w.count + cost > this.perMinute) {
      return Math.ceil((w.start + 60_000 - t) / 1000);
    }
    w.count += cost;
    return 0;
  }

  private prune(t: number) {
    for (const [key, w] of this.windows) {
      if (t - w.start >= 60_000) this.windows.delete(key);
    }
  }
}
