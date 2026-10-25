const SEV_ORDER = { severe: 0, warning: 1, info: 2 };
const WET = ['Rain', 'Drizzle', 'Thunderstorm', 'Snow'];

export function aqiBand(aqi) {
  if (aqi === null || aqi === undefined) return null;
  if (aqi <= 50) return { label: 'Good', tone: 'good' };
  if (aqi <= 100) return { label: 'Moderate', tone: 'ok' };
  if (aqi <= 150) return { label: 'Unhealthy for sensitive groups', tone: 'poor' };
  if (aqi <= 200) return { label: 'Unhealthy', tone: 'bad' };
  if (aqi <= 300) return { label: 'Very unhealthy', tone: 'bad' };
  return { label: 'Hazardous', tone: 'bad' };
}

export function uvBand(uv) {
  if (uv < 3) return 'Low';
  if (uv < 6) return 'Moderate';
  if (uv < 8) return 'High';
  if (uv < 11) return 'Very high';
  return 'Extreme';
}

/**
 * Derives warnings from the data already on screen. Pure function: same input, same alerts (stable ids,
 * so notifications are only sent once per alert).
 * @param ctx { place, current, points (timeline, provider or AI), daily, air }
 */
export function deriveAlerts(ctx) {
  const { current, points = [], daily = [], air = null } = ctx;
  const next24 = points.filter((p) => p.h >= 0 && p.h <= 24);
  const out = [];
  const push = (a) => out.push({ ...a, id: `${a.kind}:${a.severity}` });

  const storm = next24.find((p) => p.condition === 'Thunderstorm');
  if (storm) {
    push({ kind: 'storm', severity: 'severe', icon: '⛈️', title: 'Thunderstorm expected',
      detail: storm.h === 0 ? 'Thunderstorms are happening now. Stay indoors and away from open ground.' : `Thunderstorms are forecast in about ${storm.h} hour${storm.h === 1 ? '' : 's'}. Plan to be indoors.`, h: storm.h });
  }

  const maxRain = Math.max(0, ...next24.map((p) => p.rainChance ?? 0));
  const heavyHours = next24.filter((p) => (p.precipitation ?? 0) >= 4).length;
  if (heavyHours >= 1) {
    push({ kind: 'downpour', severity: 'warning', icon: '🌧️', title: 'Heavy rain possible',
      detail: 'Rainfall of 4 mm/h or more is forecast. Watch for waterlogging and slow traffic.' });
  } else if (maxRain >= 70 && !storm) {
    push({ kind: 'rain', severity: 'info', icon: '☔', title: 'Rain likely today', detail: `Up to ${Math.round(maxRain)}% chance of rain in the next 24 hours. Carry an umbrella.` });
  }

  const feels = current?.feelsLike ?? current?.temperature;
  const hiTemp = Math.max(feels ?? -Infinity, ...next24.map((p) => p.temp ?? -Infinity));
  if (hiTemp >= 41) push({ kind: 'heat', severity: 'severe', icon: '🥵', title: 'Extreme heat', detail: `It could feel like ${Math.round(hiTemp)}°C. Avoid the midday sun, hydrate often and check on others.` });
  else if (hiTemp >= 36) push({ kind: 'heat', severity: 'warning', icon: '🌡️', title: 'Very hot', detail: `Temperatures up to ${Math.round(hiTemp)}°C. Drink plenty of water and limit time in direct sun.` });

  const loTemp = Math.min(feels ?? Infinity, ...next24.map((p) => p.temp ?? Infinity));
  if (loTemp <= -5) push({ kind: 'cold', severity: 'severe', icon: '🥶', title: 'Dangerous cold', detail: `Down to ${Math.round(loTemp)}°C. Cover up and limit time outdoors.` });
  else if (loTemp <= 2) push({ kind: 'cold', severity: 'warning', icon: '❄️', title: 'Near-freezing temperatures', detail: `Down to ${Math.round(loTemp)}°C. Watch for ice.` });

  const gust = Math.max(current?.windSpeed ?? 0, ...next24.map((p) => p.wind ?? 0));
  if (gust >= 62) push({ kind: 'wind', severity: 'severe', icon: '🌪️', title: 'Damaging winds', detail: `Winds up to ${Math.round(gust)} km/h. Secure loose objects and avoid travel if you can.` });
  else if (gust >= 40) push({ kind: 'wind', severity: 'warning', icon: '💨', title: 'Strong winds', detail: `Winds up to ${Math.round(gust)} km/h. Take care when driving or cycling.` });

  const uv = Math.max(current?.uvIndex ?? 0, daily[0]?.uvMax ?? 0);
  if (uv >= 11) push({ kind: 'uv', severity: 'warning', icon: '🕶️', title: 'Extreme UV', detail: 'UV index 11+. Skin can burn in minutes: cover up, wear sunscreen and seek shade at midday.' });
  else if (uv >= 8) push({ kind: 'uv', severity: 'info', icon: '🧴', title: 'Very high UV', detail: `UV index up to ${Math.round(uv)}. Use sunscreen and a hat between 10am and 4pm.` });

  const aqi = air?.usAqi;
  if (aqi >= 200) push({ kind: 'air', severity: 'severe', icon: '😷', title: 'Very unhealthy air', detail: `US AQI ${Math.round(aqi)}. Avoid outdoor exercise and consider a mask.` });
  else if (aqi >= 150) push({ kind: 'air', severity: 'warning', icon: '😷', title: 'Unhealthy air quality', detail: `US AQI ${Math.round(aqi)}. Sensitive groups should stay indoors.` });
  else if (aqi >= 101) push({ kind: 'air', severity: 'info', icon: '🌫️', title: 'Air quality is poor for sensitive people', detail: `US AQI ${Math.round(aqi)}.` });

  if (next24.some((p) => p.condition === 'Fog')) push({ kind: 'fog', severity: 'info', icon: '🌫️', title: 'Fog expected', detail: 'Low visibility. Use dipped headlights and allow extra time.' });
  if (!out.length && !next24.some((p) => WET.includes(p.condition))) { /* nothing noteworthy */ }

  return out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
}
