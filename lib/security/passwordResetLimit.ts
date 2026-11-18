const UNAVAILABLE = "Password reset is temporarily unavailable. Please try again later.";

// The limiter throws RateLimitExceeded with the window it enforced. Matching the
// code and window (not only the class) still works if the action and the limiter
// end up with two copies of the class. Anything else, including an unavailable
// security check, must not look like a cooldown.
export function passwordResetLimiterMessage(error: unknown): string {
  const seconds = retryAfterSeconds(error);
  if (seconds == null) return UNAVAILABLE;
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `You can try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

function retryAfterSeconds(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const record = error as { code?: unknown; name?: unknown; retryAfterSeconds?: unknown };
  const limited = record.code === "rate_limited" || record.name === "RateLimitExceeded";
  const seconds = record.retryAfterSeconds;
  if (!limited || typeof seconds !== "number" || !Number.isInteger(seconds) || seconds < 1 || seconds > 86400) return null;
  return seconds;
}
