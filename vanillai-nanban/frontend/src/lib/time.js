// All times from the API are real instants. A place's wall-clock is "instant + utcOffsetSeconds",
// formatted with timeZone: 'UTC' so the viewer's own time zone never leaks in.

const shift = (ms, offsetSeconds) => new Date(ms + (offsetSeconds || 0) * 1000);

export function localClock(ms, offsetSeconds) {
  return shift(ms, offsetSeconds).toLocaleTimeString('en-GB', {
    timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export function localHour12(ms, offsetSeconds) {
  return shift(ms, offsetSeconds).toLocaleTimeString('en-US', { timeZone: 'UTC', hour: 'numeric', hour12: true });
}

export function localDateShort(ms, offsetSeconds) {
  const d = shift(ms, offsetSeconds);
  const day = d.toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit' });
  const mon = d.toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'short' });
  return `${day} ${mon}`;
}

export function localWeekday(ms, offsetSeconds, long = false) {
  return shift(ms, offsetSeconds).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: long ? 'long' : 'short' });
}

export function localHourOfDay(ms, offsetSeconds) {
  return shift(ms, offsetSeconds).getUTCHours();
}

export function localDateKey(ms, offsetSeconds) {
  return shift(ms, offsetSeconds).toISOString().slice(0, 10);
}

/** Weekday name for a plain "YYYY-MM-DD" date (calendar date, no time zone involved). */
export function weekdayOfDateString(dateStr, long = true) {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: long ? 'long' : 'short' });
}

/** Is the sun up at instant `ms`? Uses that local day's sunrise/sunset, with a 6-18h fallback. */
export function isDaylight(ms, daily, offsetSeconds) {
  const key = localDateKey(ms, offsetSeconds);
  const day = (daily || []).find((d) => d.date === key);
  if (day && day.sunrise && day.sunset) {
    return ms >= new Date(day.sunrise).getTime() && ms < new Date(day.sunset).getTime();
  }
  const h = localHourOfDay(ms, offsetSeconds);
  return h >= 6 && h < 18;
}

/** 0 at sunrise → 1 at sunset (can fall outside 0..1 at night). */
export function sunProgress(ms, day) {
  if (!day || !day.sunrise || !day.sunset) return null;
  const a = new Date(day.sunrise).getTime();
  const b = new Date(day.sunset).getTime();
  return (ms - a) / (b - a);
}
