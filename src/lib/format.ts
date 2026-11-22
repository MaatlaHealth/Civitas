/**
 * Date formatting with a fixed locale and time zone so that server-rendered
 * and client-rendered text match. Operational times are shown in South
 * African Standard Time.
 */
const DISPLAY_TIME_ZONE = "Africa/Johannesburg";

const dateTimeFormatter = new Intl.DateTimeFormat("en-ZA", {
  timeZone: DISPLAY_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat("en-ZA", {
  timeZone: DISPLAY_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDateTime(value: Date | string): string {
  return `${dateTimeFormatter.format(new Date(value))} SAST`;
}

export function formatDate(value: Date | string): string {
  return dateFormatter.format(new Date(value));
}

export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}

export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(0)}%`;
}
