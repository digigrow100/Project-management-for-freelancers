// Shared by trusted extension pages. No tokens or request bodies are persisted here.
globalThis.FhqRequestGate = class {
  constructor(storage, now = () => Date.now(), random = () => Math.random()) {
    this.storage = storage;
    this.now = now;
    this.random = random;
    this.busy = false;
  }
  async run(operation, waitForTurn = false) {
    while (this.busy && waitForTurn) await this.idle;
    if (this.busy) return this.paused(1, 'A sync request is already running.');
    this.busy = true;
    this.idle = new Promise(resolve => { this.release = resolve; });
    try {
      const { extensionRetryState: saved } = await this.storage.get(['extensionRetryState']);
      const now = this.now();
      const until = Number(saved?.until || 0);
      if (Number.isFinite(until) && until > now && until <= now + 3600000) {
        return this.paused(Math.ceil((until - now) / 1000));
      }
      let response;
      try {
        response = await operation();
      } catch {
        await this.failed(saved, 0, null);
        return this.paused(60);
      }
      if (response.ok || response.status === 401) {
        await this.storage.set({ extensionRetryState: null });
      } else {
        await this.failed(saved, response.status, response.headers.get('retry-after'));
      }
      return response;
    } finally {
      this.busy = false;
      this.release();
    }
  }
  paused(seconds, message = 'Sync paused while the service is unavailable. It will retry automatically.') {
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 503, headers: { 'content-type': 'application/json', 'retry-after': String(seconds) },
    });
  }
  async failed(saved, status, retryAfter) {
    const failures = Math.min(6, Math.max(0, Number(saved?.failures) || 0) + 1);
    const base = status === 402 ? 900000 : Math.min(900000, 60000 * 2 ** (failures - 1));
    const numeric = retryAfter === null ? NaN : Number(retryAfter);
    const requested = Number.isFinite(numeric) ? numeric * 1000 : Date.parse(retryAfter || '') - this.now();
    const delay = Math.min(3600000, Math.max(base + Math.floor(base * 0.1 * this.random()), Number.isFinite(requested) ? requested : 0));
    await this.storage.set({ extensionRetryState: { failures, until: this.now() + delay } });
  }
};
