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

const RESET_INCOMPLETE = "Could not complete this request. Please try again later.";
const RESET_SEND_FAILED = "We couldn't send the reset email. Please try again in a few minutes.";

export type PasswordResetAuthLog = {
  name: string;
  status: number | null;
  code: string | null;
};

// Safe to print. Auth messages often include the address, so this keeps only
// the error name, HTTP status, and a short code.
export function passwordResetAuthLog(error: unknown): PasswordResetAuthLog {
  const record = error && typeof error === "object" ? (error as { name?: unknown; status?: unknown; code?: unknown }) : {};
  const name = typeof record.name === "string" && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(record.name) ? record.name : "Error";
  const status = typeof record.status === "number" && Number.isInteger(record.status) && record.status >= 0 && record.status <= 599 ? record.status : null;
  const code = typeof record.code === "string" && /^[a-z0-9_]{1,64}$/i.test(record.code) ? record.code : null;
  return { name, status, code };
}

export function passwordResetProviderMessage(error: unknown): string {
  const { status, code } = passwordResetAuthLog(error);
  if (status === 429 || code === "over_email_send_rate_limit" || code === "over_request_rate_limit") {
    const seconds = cooldownSeconds(error);
    if (seconds == null) return "You can try again in 60 seconds.";
    return `You can try again in ${seconds} ${seconds === 1 ? "second" : "seconds"}.`;
  }
  // 500 is "Error sending recovery email". 504 is Auth's mail timeout.
  // supabase-js puts those on AuthRetryableFetchError and often leaves code empty.
  if (status === 500 || status === 504 || code === "unexpected_failure" || code === "request_timeout") return RESET_SEND_FAILED;
  return RESET_INCOMPLETE;
}

function cooldownSeconds(error: unknown): number | null {
  const message = error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
    ? (error as { message: string }).message
    : "";
  const match = message.match(/\bafter (\d{1,4}) seconds?\b/i);
  if (!match) return null;
  const seconds = Number(match[1]);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) return null;
  return seconds;
}
