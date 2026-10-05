const BUSINESS_TIME_ZONE = "Asia/Karachi";

function partMap(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function businessDateKey(date = new Date()): string {
  const parts = partMap(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function businessMonthKey(date = new Date()): string {
  return businessDateKey(date).slice(0, 7);
}

export function businessYearKey(date = new Date()): string {
  return businessDateKey(date).slice(0, 4);
}


export function businessTomorrowMorningIso(date = new Date()): string {
  const parts = partMap(date);
  const base = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  base.setUTCDate(base.getUTCDate() + 1);
  const year = base.getUTCFullYear();
  const month = String(base.getUTCMonth() + 1).padStart(2, "0");
  const day = String(base.getUTCDate()).padStart(2, "0");
  // 08:00 in Asia/Karachi is 03:00 UTC (Pakistan does not observe DST).
  return `${year}-${month}-${day}T03:00:00.000Z`;
}
