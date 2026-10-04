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
