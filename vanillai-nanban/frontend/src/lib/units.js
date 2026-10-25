export const UNITS = { metric: 'metric', imperial: 'imperial' };

const finite = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

export function toTemp(celsius, unit) {
  if (!finite(celsius)) return null;
  const c = Number(celsius);
  return unit === UNITS.imperial ? (c * 9) / 5 + 32 : c;
}

/** "26°" - whole degrees, en dash for missing. */
export function fmtTemp(celsius, unit) {
  const t = toTemp(celsius, unit);
  if (t === null) return '–';
  const r = Math.round(t);
  return `${Object.is(r, -0) ? 0 : r}°`;
}

export function tempUnitLabel(unit) {
  return unit === UNITS.imperial ? 'F' : 'C';
}

export function toSpeed(kmh, unit) {
  if (!finite(kmh)) return null;
  return unit === UNITS.imperial ? Number(kmh) * 0.621371 : Number(kmh);
}

export function fmtSpeed(kmh, unit, digits = 0) {
  const s = toSpeed(kmh, unit);
  if (s === null) return '–';
  return s.toFixed(digits);
}

export function speedUnitLabel(unit) {
  return unit === UNITS.imperial ? 'mph' : 'km/h';
}
