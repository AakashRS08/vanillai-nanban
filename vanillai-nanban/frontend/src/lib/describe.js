import { isDaylight } from './time.js';

const HEADLINES = {
  Clear: { day: ['Clear Skies', 'sunshine all around'], night: ['Clear Night', 'starlit skies'] },
  'Partly Cloudy': { day: ['Mostly Sunny', 'partly cloudy skies'], night: ['Partly Cloudy', 'clouds drifting past the moon'] },
  Cloudy: { day: ['Overcast', 'thick cloud cover'], night: ['Overcast Night', 'a blanket of cloud'] },
  Fog: { day: ['Foggy', 'low visibility'], night: ['Foggy Night', 'low visibility'] },
  Drizzle: { day: ['Light Drizzle', 'fine, misty rain'], night: ['Light Drizzle', 'fine, misty rain'] },
  Rain: { day: ['Rain Showers', 'steady rainfall'], night: ['Rainy Night', 'steady rainfall'] },
  Snow: { day: ['Snowfall', 'cold, wintry conditions'], night: ['Snowy Night', 'cold, wintry conditions'] },
  Thunderstorm: { day: ['Thunderstorms', 'intense weather conditions'], night: ['Thunderstorms', 'intense weather conditions'] },
};

const LEAD = {
  Clear: 'Clear skies with plenty of sunshine.',
  'Partly Cloudy': 'Clear skies with occasional clouds.',
  Cloudy: 'Cloud cover stays thick through the day.',
  Fog: 'Fog reduces visibility, so take extra care on the road.',
  Drizzle: 'Light drizzle on and off.',
  Rain: 'Rain is expected on and off.',
  Snow: 'Snow is expected, so dress warmly.',
  Thunderstorm: 'Heavy rain with thunder and lightning expected.',
};

export function headlineFor(condition, daylight = true) {
  const entry = HEADLINES[condition] || HEADLINES.Cloudy;
  const [title, subtitle] = daylight ? entry.day : entry.night;
  return { title, subtitle };
}

function windPhrase(kmh) {
  if (kmh < 12) return 'Light winds';
  if (kmh < 28) return 'A moderate breeze';
  if (kmh < 45) return 'Strong winds';
  return 'Very strong winds';
}

/**
 * @param point    a timeline point (temp in °C, wind in km/h, condition)
 * @param ahead    timeline points for the next ~24h from this point, used for the temperature range & rain chance
 */
export function describeSky(point, ahead = []) {
  if (!point) return { title: '', subtitle: '', body: '' };
  const daylight = point.daylight !== false;
  const { title, subtitle } = headlineFor(point.condition, daylight);

  const temps = [point.temp, ...ahead.map((p) => p.temp)].filter((t) => Number.isFinite(t));
  const lo = temps.length ? Math.min(...temps) : point.temp;
  const hi = temps.length ? Math.max(...temps) : point.temp;
  const rain = Math.max(0, ...ahead.map((p) => p.rainChance ?? 0));

  const wet = ['Rain', 'Drizzle', 'Thunderstorm', 'Snow'].includes(point.condition);
  const parts = [LEAD[point.condition] || LEAD.Cloudy];

  if (point.condition === 'Thunderstorm' || (point.condition === 'Rain' && rain >= 70)) {
    parts.push('Sudden downpours may lead to localized flooding in some areas.');
  } else {
    const feel = hi >= 36 ? 'make it dangerously hot' : hi >= 31 ? 'make it feel hot' : lo <= 5 ? 'make it feel cold' : lo <= 12 ? 'keep it cool' : 'keep temperatures comfortable';
    let s = `${windPhrase(point.wind ?? 0)} ${feel}`;
    if (hi - lo >= 6 && !wet) s += ', with warm afternoons and cooler evenings';
    parts.push(`${s}.`);
    if (!wet && rain >= 50) parts.push(`There is a ${Math.round(rain)}% chance of rain later.`);
  }
  return { title, subtitle, body: parts.join(' ') };
}

export function attachDaylight(points, daily, offsetSeconds) {
  return points.map((p) => ({ ...p, daylight: isDaylight(p.timeMs, daily, offsetSeconds) }));
}
