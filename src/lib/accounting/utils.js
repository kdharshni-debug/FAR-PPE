// Accounting utilities: dates, rounding, money formatting.
// Financial year runs April 1 -> March 31.

export const MONTH_LABELS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

export const FULL_MONTH_LABELS = [
  "April", "May", "June", "July", "August", "September",
  "October", "November", "December", "January", "February", "March",
];

export function num(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function daysInMonth(year, month) {
  // month is 0-based
  return new Date(year, month + 1, 0).getDate();
}

export function parseDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const parts = value.split("-").map(Number);
    if (parts.length === 3 && parts.every((p) => !isNaN(p))) {
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function toISODate(d) {
  const dt = parseDate(d);
  if (!dt) return "";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDate(d) {
  const dt = parseDate(d);
  if (!dt) return "";
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function getMonthsInFY(fyStartYear) {
  const months = [];
  for (let i = 0; i < 12; i++) {
    const monthIndex = (3 + i) % 12; // April = 3
    const year = monthIndex < 3 ? fyStartYear + 1 : fyStartYear;
    months.push({
      year,
      month: monthIndex,
      label: MONTH_LABELS[i],
      fullLabel: FULL_MONTH_LABELS[i],
      index: i,
      endDay: daysInMonth(year, monthIndex),
    });
  }
  return months;
}

// Active days within [monthYear, month] that fall between start and end (inclusive).
export function activeDaysInRange(start, end, monthYear, month) {
  if (!start) return 0;
  const dim = daysInMonth(monthYear, month);
  const first = new Date(monthYear, month, 1);
  const last = new Date(monthYear, month, dim);
  if (start > last) return 0;
  if (end && end < first) return 0;
  const effStart = start > first ? start : first;
  const effEnd = end && end < last ? end : last;
  return Math.round((effEnd - effStart) / 86400000) + 1;
}

// First and last day of the financial year that starts on 01-Apr of fyStartYear.
export function fyBounds(fyStartYear) {
  return { fyStart: new Date(fyStartYear, 3, 1), fyEnd: new Date(fyStartYear + 1, 2, 31) };
}

// Days of [start, end] that fall inside the financial year:
// MAX(0, MIN(FY end, end) - MAX(FY start, start) + 1). Mirrors the Excel formula.
export function daysApplicableInFY(start, end, fyStartYear) {
  if (!end) return 0;
  const { fyStart, fyEnd } = fyBounds(fyStartYear);
  const s = start && start > fyStart ? start : fyStart;
  const e = end < fyEnd ? end : fyEnd;
  return Math.max(0, Math.round((e - s) / 86400000) + 1);
}

// Financial year (Apr-Mar) that a date falls in, e.g. 15-Jan-2028 -> 2027.
export function fyOfDate(d) {
  const dt = parseDate(d);
  if (!dt) return null;
  return dt.getMonth() >= 3 ? dt.getFullYear() : dt.getFullYear() - 1;
}

export function formatMoney(n, symbol = "₹") {
  const v = round2(num(n));
  const neg = v < 0;
  const abs = Math.abs(v);
  const s = abs.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${neg ? "-" : ""}${symbol}${s}`;
}

export function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
