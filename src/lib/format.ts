export function formatRelativeDate(timestamp: number, now = Date.now()): string {
  const seconds = Math.floor((now - timestamp) / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

const compactNumber = new Intl.NumberFormat("en", { notation: "compact" });

/** 1234 → "1.2K", the way YouTube shows like counts. */
export function formatCount(value: number): string {
  return compactNumber.format(value);
}
