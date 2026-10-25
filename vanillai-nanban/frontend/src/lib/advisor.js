const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export function verdict(score) {
  if (score >= 75) return { label: 'Great', tone: 'good' };
  if (score >= 50) return { label: 'Okay', tone: 'ok' };
  if (score >= 25) return { label: 'Not ideal', tone: 'poor' };
  return { label: 'Skip it', tone: 'bad' };
}

const maxOf = (arr, f, d = 0) => arr.reduce((m, x) => Math.max(m, f(x) ?? d), d);
const WET = ['Rain', 'Drizzle', 'Thunderstorm', 'Snow'];

/**
 * @param ctx {
 *   now: timeline point (h=0), next: next ~12 timeline points (with .daylight),
 *   feelsLike: °C, aqi: number|null, uv: number
 * }
 * Scores are 0-100. Each returns {id,label,icon,score,verdict,reason}.
 */
export function adviseActivities(ctx) {
  const { now, next = [], feelsLike = now?.temp, aqi = null, uv = 0 } = ctx;
  if (!now) return [];
  const soon = [now, ...next.slice(0, 3)];
  const rain3 = Math.max(maxOf(soon, (p) => p.rainChance), WET.includes(now.condition) ? 80 : 0);
  const rain12 = Math.max(maxOf(next, (p) => p.rainChance), ...[now, ...next].map((p) => (WET.includes(p.condition) ? 70 : 0)));
  const wind = now.wind ?? 0;
  const stormy = [now, ...next.slice(0, 3)].some((p) => p.condition === 'Thunderstorm');
  const out = [];

  // Run / outdoor exercise
  {
    let s = 100;
    const why = [];
    if (feelsLike > 28) { s -= (feelsLike - 28) * 5; why.push(`feels like ${Math.round(feelsLike)}°`); }
    if (feelsLike < 6) { s -= (6 - feelsLike) * 4; why.push('it is cold'); }
    if (rain3 > 20) { s -= rain3 * 0.7; why.push(`${Math.round(rain3)}% rain chance`); }
    if (wind > 30) { s -= (wind - 30) * 1.5; why.push('strong wind'); }
    if (aqi !== null && aqi > 100) { s -= (aqi - 100) * 0.6; why.push(`air quality ${Math.round(aqi)}`); }
    if (stormy) { s = 0; why.unshift('thunderstorms nearby'); }
    s = clamp(s);
    out.push({ id: 'run', label: 'Run outside', icon: '🏃', score: Math.round(s), verdict: verdict(s), reason: why[0] ? `Held back by ${why.join(', ')}.` : 'Comfortable, dry and breathable.' });
  }

  // Umbrella (score = how much you need one, shown inverted for the verdict)
  {
    const need = clamp(Math.max(rain3, rain12 * 0.8));
    out.push({
      id: 'umbrella', label: 'Umbrella', icon: '☂️', score: Math.round(need),
      verdict: need >= 40 ? { label: 'Bring one', tone: 'poor' } : { label: 'Leave it', tone: 'good' },
      reason: need >= 40 ? `Up to ${Math.round(Math.max(rain3, rain12))}% chance of rain in the next hours.` : 'Rain looks unlikely for the next 12 hours.',
    });
  }

  // Dry laundry outside
  {
    let s = 100 - (now.humidity ?? 60) * 0.8 + Math.min(wind, 20) * 1.2 - rain12 * 0.9;
    if (!now.daylight) s -= 40;
    if (stormy) s = 0;
    s = clamp(s + 20);
    const reason = rain12 >= 40 ? 'Rain is likely, so keep it indoors.' : !now.daylight ? 'No sun right now, so it will dry slowly.' : (now.humidity ?? 0) > 80 ? 'Air is too humid to dry quickly.' : 'Breezy and dry enough to dry quickly.';
    out.push({ id: 'laundry', label: 'Dry laundry', icon: '👕', score: Math.round(s), verdict: verdict(s), reason });
  }

  // Driving
  {
    let s = 100;
    const why = [];
    const cond = [now, ...next.slice(0, 3)].map((p) => p.condition);
    if (cond.includes('Thunderstorm')) { s -= 60; why.push('thunderstorms'); }
    if (cond.includes('Fog')) { s -= 45; why.push('fog'); }
    if (cond.includes('Snow')) { s -= 50; why.push('snow'); }
    if (cond.includes('Rain')) { s -= 30; why.push('heavy rain'); } else if (cond.includes('Drizzle')) { s -= 12; why.push('drizzle'); }
    if (wind > 45) { s -= 25; why.push('very strong wind'); }
    s = clamp(s);
    out.push({ id: 'drive', label: 'Driving', icon: '🚗', score: Math.round(s), verdict: verdict(s), reason: why.length ? `Take care: ${why.join(', ')}.` : 'Clear conditions on the road.' });
  }

  // Stargazing: judge the nearest dark hour
  {
    const darkHours = [now, ...next].filter((p) => p.daylight === false);
    if (!darkHours.length) {
      out.push({ id: 'stars', label: 'Stargazing', icon: '🔭', score: 0, verdict: { label: 'After dark', tone: 'poor' }, reason: 'The sun is still up. Check back this evening.' });
    } else {
      const base = { Clear: 100, 'Partly Cloudy': 60, Cloudy: 15 };
      const sky = darkHours.slice(0, 4).map((p) => base[p.condition] ?? 0);
      let s = sky.reduce((a, b) => a + b, 0) / sky.length;
      s -= Math.max(0, (darkHours[0].humidity ?? 50) - 75) * 1.2;
      s = clamp(s);
      out.push({ id: 'stars', label: 'Stargazing', icon: '🔭', score: Math.round(s), verdict: verdict(s), reason: s >= 75 ? 'Clear, dark skies tonight.' : s >= 50 ? 'Some clouds may get in the way.' : 'Cloud or moisture will hide the stars.' });
    }
  }

  // Picnic / beach
  {
    let s = 100;
    const why = [];
    const t = now.temp;
    if (t < 20) { s -= (20 - t) * 4; why.push('on the cool side'); }
    if (t > 32) { s -= (t - 32) * 6; why.push('very hot'); }
    if (rain3 > 20) { s -= rain3; why.push('rain risk'); }
    if (wind > 28) { s -= (wind - 28) * 2; why.push('windy'); }
    if (uv >= 8) { s -= 15; why.push(`high UV (${Math.round(uv)})`); }
    if (stormy) s = 0;
    s = clamp(s);
    out.push({ id: 'picnic', label: 'Picnic / beach', icon: '🧺', score: Math.round(s), verdict: verdict(s), reason: why.length ? `Watch out: ${why.join(', ')}.` : 'Lovely conditions for time outside.' });
  }
  return out;
}
