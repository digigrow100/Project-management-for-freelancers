import type { TaskFocusState } from "./types";
export function isScheduledFocus(state: TaskFocusState) {
  return Boolean(state.availableOn || state.resumeAt || state.keepPending || state.resumeAfterCompletions > 0);
}
export function isFocusReady(state: TaskFocusState, today: string, now: number) {
  if (state.keepPending || state.resumeAfterCompletions > 0) return false;
  if (state.resumeAt && Date.parse(state.resumeAt) > now) return false;
  return !state.availableOn || state.availableOn <= today;
}
