export function formatWeekOf(weekOf: string, weekOfDate: number | null): string {
  if (weekOfDate === null) return weekOf;
  return new Date(weekOfDate).toLocaleDateString(undefined, {
    weekday: undefined,
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function timeAgo(timestampMs: number | null): string {
  if (timestampMs === null) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - timestampMs) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}
