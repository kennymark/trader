/** Fixed, locale-independent date formatting: dd MMM YY */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function asDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** dd MMM YY in UTC, e.g. 14 Aug 26 */
export function formatDate(value: string | Date | null | undefined): string {
  const d = asDate(value);
  if (!d) return "—";
  const day = pad(d.getUTCDate());
  const month = MONTHS[d.getUTCMonth()]!;
  const year = String(d.getUTCFullYear()).slice(-2);
  return `${day} ${month} ${year}`;
}

/** dd MMM YY HH:mm in UTC, e.g. 14 Aug 26 16:21 */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = asDate(value);
  if (!d) return "—";
  return `${formatDate(d)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
