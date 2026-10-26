// Best-effort per-instance circuit breaker. Never caches a successful identity.
let unavailableUntil = 0;
export class ExtensionServiceUnavailable extends Error {
  constructor() { super("Sync service is temporarily unavailable. Please try again later."); }
}
export function assertExtensionServiceAvailable() {
  if (Date.now() < unavailableUntil) throw new ExtensionServiceUnavailable();
}
export function noteExtensionServiceFailure(status: number) {
  if (status === 0 || status === 402 || status === 429 || status >= 500) {
    unavailableUntil = Date.now() + 60000;
    throw new ExtensionServiceUnavailable();
  }
}
