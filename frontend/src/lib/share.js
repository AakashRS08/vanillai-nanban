/** Shareable place links: #p=<name>&lat=<lat>&lon=<lon> (read-only, no personal data). */
export function encodePlace(place) {
  const q = new URLSearchParams({ p: place.name, lat: String(round(place.lat)), lon: String(round(place.lon)) });
  return `#${q.toString()}`;
}

export function decodePlace(hash) {
  if (!hash || hash.length < 2) return null;
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const lat = Number(q.get('lat'));
  const lon = Number(q.get('lon'));
  const name = (q.get('p') || '').trim().slice(0, 120);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { name, lat, lon };
}

function round(v) {
  return Math.round(v * 1000) / 1000;
}
