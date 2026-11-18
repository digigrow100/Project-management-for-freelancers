export class RateLimiter {
  private hits = new Map<string, number[]>();

  allow(key: string, limit: number, windowMs: number, now: number) {
    const recent = (this.hits.get(key) ?? []).filter((time) => now - time < windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}
