// Date helpers shared by delivery, client and billing services. Dates are
// stored as timezone-aware timestamps; comparisons use whole days so a record
// stays "due today" until the following day begins.

export function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export function endOfToday() {
  const date = startOfDay();
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

export function addDaysFrom(value, days) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

export function isBeforeToday(value) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < startOfDay().getTime();
}

export function isWithinDays(value, days) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const end = startOfDay();
  end.setUTCDate(end.getUTCDate() + days);
  return date.getTime() >= startOfDay().getTime() && date.getTime() < end.getTime();
}

export function overlapsToday(value) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() >= startOfDay().getTime() && date.getTime() < endOfToday().getTime();
}

export function toDateInput(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function monthKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 7);
}
