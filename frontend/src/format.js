const ICONS = {
  Clear: '☀️',
  'Partly Cloudy': '⛅',
  Cloudy: '☁️',
  Fog: '🌫️',
  Drizzle: '🌦️',
  Rain: '🌧️',
  Snow: '❄️',
  Thunderstorm: '⛈️',
};

export function conditionIcon(condition) {
  return ICONS[condition] ?? '🌡️';
}

export function formatTemp(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '–';
  return `${Math.round(Number(value))}°`;
}

/** Backend scores are 0-1; the UI shows whole percentages. */
export function confidencePercent(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(1, Math.max(0, n)) * 100);
}

export function confidenceLabel(score) {
  const p = confidencePercent(score);
  if (p >= 75) return 'High';
  if (p >= 50) return 'Medium';
  return 'Low';
}

export function formatHour(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', hour12: true });
}

export function formatDayHour(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString([], { weekday: 'short' });
  return `${day} ${formatHour(iso)}`;
}

export function placeLabel(geo) {
  const parts = [geo.name];
  if (geo.region && geo.region !== geo.name) parts.push(geo.region);
  if (geo.country) parts.push(geo.country);
  return parts.join(', ');
}
