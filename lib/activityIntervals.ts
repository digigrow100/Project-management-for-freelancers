// Extension checkpoints normally run every minute. A long gap is not proof of work.
export const MAX_CONFIRMED_ACTIVITY_SECONDS = 90;
export interface ActivityIntervalRow {
  started_at: string;
  ended_at?: string | null;
  duration_seconds?: number | null;
  project_id?: string | null;
}
export function confirmedActivityTime(rows: ActivityIntervalRow[], from: number, to: number) {
  const intervals = rows.map(row => {
    const start = Date.parse(row.started_at);
    const end = row.ended_at ? Date.parse(row.ended_at) : start;
    const duration = Math.max(0, Math.min(Number(row.duration_seconds) || 0, MAX_CONFIRMED_ACTIVITY_SECONDS));
    return {start: Math.max(start, from), end: Math.min(end, start + duration * 1000, to), project: row.project_id};
  }).filter(row => Number.isFinite(row.start) && Number.isFinite(row.end) && row.end > row.start)
    .sort((a,b) => a.start-b.start || a.end-b.end || String(a.project).localeCompare(String(b.project)));
  let coveredUntil = from;
  let milliseconds = 0;
  const byProject: Record<string,number> = {};
  for (const row of intervals) {
    const duration = Math.max(0, row.end - Math.max(row.start, coveredUntil));
    milliseconds += duration;
    if (row.project) byProject[row.project] = (byProject[row.project] ?? 0) + duration / 1000;
    coveredUntil = Math.max(coveredUntil, row.end);
  }
  return {seconds: Math.floor(milliseconds / 1000), byProject};
}
