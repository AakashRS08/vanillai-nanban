import { describe, expect, it } from 'vitest';
import { fmtSpeed, fmtTemp, toTemp, UNITS } from './units.js';
import { isDaylight, localClock, localDateKey, localDateShort, localHour12, localWeekday, sunProgress, weekdayOfDateString } from './time.js';
import { buildTimeline } from './timeline.js';
import { attachDaylight, describeSky, headlineFor } from './describe.js';
import { adviseActivities, verdict } from './advisor.js';
import { aqiBand, deriveAlerts, uvBand } from './alerts.js';
import { decodePlace, encodePlace } from './share.js';

const IST = 19800;
const NOW = Date.UTC(2026, 9, 25, 5, 30); // 11:00 in India

function weather({ cond = 'Partly Cloudy', temp = 30, wind = 10, rain = 10, hours = 48 } = {}) {
  return {
    current: { observedAt: new Date(NOW).toISOString(), temperature: temp, feelsLike: temp + 3, humidity: 70, windSpeed: wind, pressure: 1006, precipitation: 0, condition: cond, uvIndex: 6 },
    next48h: Array.from({ length: hours }, (_, i) => ({
      time: new Date(NOW + (i + 1) * 3600e3).toISOString(), temperature: temp + ((i + 1) % 5), humidity: 70, windSpeed: wind,
      precipitation: 0, precipProbability: rain, condition: cond,
    })),
    daily: [{ date: '2026-10-25', tempMax: 33, tempMin: 26, condition: cond, sunrise: new Date(Date.UTC(2026, 9, 25, 0, 30)).toISOString(), sunset: new Date(Date.UTC(2026, 9, 25, 12, 30)).toISOString(), uvMax: 9 }],
    utcOffsetSeconds: IST,
  };
}

describe('units', () => {
  it('converts and formats temperature', () => {
    expect(toTemp(100, UNITS.imperial)).toBe(212);
    expect(toTemp(0, UNITS.imperial)).toBe(32);
    expect(fmtTemp(26.4, UNITS.metric)).toBe('26°');
    expect(fmtTemp(26.4, UNITS.imperial)).toBe('80°');
    expect(fmtTemp(-0.3, UNITS.metric)).toBe('0°');
    expect(fmtTemp(null, UNITS.metric)).toBe('–');
    expect(fmtTemp('x', UNITS.metric)).toBe('–');
  });
  it('converts speed', () => {
    expect(fmtSpeed(100, UNITS.imperial)).toBe('62');
    expect(fmtSpeed(3.4, UNITS.metric, 2)).toBe('3.40');
    expect(fmtSpeed(undefined, UNITS.metric)).toBe('–');
  });
});

describe('place-local time', () => {
  it('shows the place clock regardless of the viewer time zone', () => {
    expect(localClock(NOW, IST)).toBe('11:00');
    expect(localClock(NOW, 0)).toBe('05:30');
    expect(localClock(NOW, -4 * 3600)).toBe('01:30');
    expect(localDateShort(NOW, IST)).toBe('25 Oct');
    expect(localWeekday(NOW, IST, true)).toBe('Sunday');
    expect(localHour12(NOW, IST)).toBe('11 AM');
  });
  it('rolls the date over for far-east places', () => {
    const late = Date.UTC(2026, 9, 25, 20, 0); // 01:00 next day in India
    expect(localDateKey(late, IST)).toBe('2026-10-26');
  });
  it('weekday of a plain date', () => {
    expect(weekdayOfDateString('2026-10-25')).toBe('Sunday');
    expect(weekdayOfDateString('2026-10-26', false)).toBe('Mon');
  });
  it('knows day from night using sunrise/sunset, with a fallback', () => {
    const w = weather();
    expect(isDaylight(NOW, w.daily, IST)).toBe(true);
    expect(isDaylight(Date.UTC(2026, 9, 25, 14, 0), w.daily, IST)).toBe(false); // after sunset
    expect(isDaylight(Date.UTC(2026, 9, 25, 6, 30), [], IST)).toBe(true); // fallback: 12:00 local
    expect(isDaylight(Date.UTC(2026, 9, 25, 20, 30), [], IST)).toBe(false); // fallback: 02:00 local
  });
  it('sun progress', () => {
    const d = weather().daily[0];
    expect(sunProgress(Date.UTC(2026, 9, 25, 6, 30), d)).toBeCloseTo(0.5);
    expect(sunProgress(NOW, null)).toBeNull();
  });
});

describe('timeline', () => {
  it('provider mode follows the provider hour by hour', () => {
    const { points, hasAI } = buildTimeline(weather(), null, 'ai');
    expect(hasAI).toBe(false);
    expect(points).toHaveLength(49);
    expect(points[0].h).toBe(0);
    expect(points[0].temp).toBe(30);
    expect(points[7].temp).toBe(30 + (7 % 5));
    expect(points[3].rainChance).toBe(10);
  });
  it('AI mode interpolates between predictions and takes their conditions', () => {
    const forecast = { predictions: [
      { predictedFor: new Date(NOW + 6 * 3600e3).toISOString(), predictedTemp: 36, predictedCondition: 'Clear', confidenceScore: 0.9 },
      { predictedFor: new Date(NOW + 12 * 3600e3).toISOString(), predictedTemp: 24, predictedCondition: 'Thunderstorm', confidenceScore: 0.7 },
    ] };
    const { points, hasAI } = buildTimeline(weather(), forecast, 'ai');
    expect(hasAI).toBe(true);
    expect(points[3].temp).toBeCloseTo(33); // halfway 30 -> 36
    expect(points[6].temp).toBe(36);
    expect(points[9].temp).toBeCloseTo(30);
    expect(points[12].condition).toBe('Thunderstorm');
    expect(points[0].condition).toBe('Partly Cloudy'); // "now" is always the observation
    expect(points[12].confidence).toBeCloseTo(0.7);
    expect(points[12].providerCondition).toBe('Partly Cloudy'); // provider kept alongside
  });
  it('provider mode ignores AI even when present', () => {
    const forecast = { predictions: [{ predictedFor: new Date(NOW + 6 * 3600e3).toISOString(), predictedTemp: 99, predictedCondition: 'Snow', confidenceScore: 1 }] };
    const { points } = buildTimeline(weather(), forecast, 'provider');
    expect(points[6].temp).toBe(30 + (6 % 5));
    expect(points[6].condition).toBe('Partly Cloudy');
  });
  it('copes with missing data', () => {
    expect(buildTimeline(null, null).points).toEqual([]);
    const w = weather({ hours: 0 });
    expect(buildTimeline(w, null).points).toHaveLength(1);
  });
});

describe('describe', () => {
  it('headlines match the design copy and switch at night', () => {
    expect(headlineFor('Partly Cloudy', true)).toEqual({ title: 'Mostly Sunny', subtitle: 'partly cloudy skies' });
    expect(headlineFor('Thunderstorm', true).title).toBe('Thunderstorms');
    expect(headlineFor('Clear', false).title).toBe('Clear Night');
    expect(headlineFor('Mystery', true).title).toBe('Overcast');
  });
  it('writes a sensible description', () => {
    const w = weather({ temp: 27, wind: 8 });
    const { points } = buildTimeline(w, null);
    const withDay = attachDaylight(points, w.daily, IST);
    const d = describeSky(withDay[0], withDay.slice(1, 25));
    expect(d.title).toBe('Mostly Sunny');
    expect(d.body).toMatch(/^Clear skies with occasional clouds\./);
    expect(d.body).toMatch(/Light winds/);
  });
  it('warns about downpours in a storm and flags heat and wind', () => {
    const storm = describeSky({ condition: 'Thunderstorm', temp: 22, wind: 20, daylight: true }, []);
    expect(storm.body).toMatch(/lightning/);
    expect(storm.body).toMatch(/localized flooding/);
    expect(describeSky({ condition: 'Clear', temp: 38, wind: 50, daylight: true }, [{ temp: 39 }]).body).toMatch(/Very strong winds make it dangerously hot/);
  });
  it('is safe on empty input', () => {
    expect(describeSky(null)).toEqual({ title: '', subtitle: '', body: '' });
  });
});

describe('activity advisor', () => {
  const mk = (over = {}, nextOver = {}) => ({
    now: { temp: 25, wind: 10, humidity: 50, condition: 'Clear', rainChance: 0, daylight: true, ...over },
    next: Array.from({ length: 12 }, () => ({ temp: 25, wind: 10, humidity: 50, condition: 'Clear', rainChance: 0, daylight: true, ...nextOver })),
    feelsLike: 26, aqi: 40, uv: 4,
  });
  const byId = (r) => Object.fromEntries(r.map((a) => [a.id, a]));

  it('perfect day', () => {
    const a = byId(adviseActivities(mk()));
    expect(a.run.score).toBeGreaterThanOrEqual(90);
    expect(a.run.verdict.label).toBe('Great');
    expect(a.umbrella.verdict.label).toBe('Leave it');
    expect(a.drive.score).toBe(100);
    expect(a.laundry.score).toBeGreaterThan(70);
    expect(a.stars.verdict.label).toBe('After dark');
  });
  it('thunderstorm ruins outdoor plans', () => {
    const a = byId(adviseActivities(mk({ condition: 'Thunderstorm', rainChance: 90 })));
    expect(a.run.score).toBe(0);
    expect(a.run.verdict.label).toBe('Skip it');
    expect(a.umbrella.verdict.label).toBe('Bring one');
    expect(a.picnic.score).toBe(0);
    expect(a.drive.score).toBeLessThan(50);
    expect(a.laundry.verdict.tone).not.toBe('good');
  });
  it('heat, wind and bad air each pull the run score down', () => {
    const base = adviseActivities(mk())[0].score;
    expect(adviseActivities({ ...mk(), feelsLike: 38 })[0].score).toBeLessThan(base - 30);
    expect(adviseActivities(mk({ wind: 60 }))[0].score).toBeLessThan(base - 30);
    expect(adviseActivities({ ...mk(), aqi: 220 })[0].score).toBeLessThan(base - 40);
  });
  it('stargazing needs a dark, clear sky', () => {
    const clear = byId(adviseActivities(mk({ daylight: false }, { daylight: false })));
    expect(clear.stars.score).toBeGreaterThanOrEqual(90);
    const cloudy = byId(adviseActivities(mk({ daylight: false, condition: 'Cloudy' }, { daylight: false, condition: 'Cloudy' })));
    expect(cloudy.stars.score).toBeLessThan(25);
  });
  it('scores stay within 0-100 and empty input is safe', () => {
    for (const a of adviseActivities({ ...mk({ temp: -30, wind: 200, humidity: 100 }), feelsLike: -40, aqi: 999, uv: 14 })) {
      expect(a.score).toBeGreaterThanOrEqual(0);
      expect(a.score).toBeLessThanOrEqual(100);
    }
    expect(adviseActivities({})).toEqual([]);
  });
  it('verdict bands', () => {
    expect(verdict(80).label).toBe('Great');
    expect(verdict(60).label).toBe('Okay');
    expect(verdict(30).label).toBe('Not ideal');
    expect(verdict(10).label).toBe('Skip it');
  });
});

describe('alerts', () => {
  const ctx = (w, extra = {}) => ({ current: w.current, points: buildTimeline(w, null).points, daily: w.daily, air: null, ...extra });

  it('a calm day has no alerts', () => {
    const w = weather({ rain: 10 });
    w.current.uvIndex = 4;
    w.daily[0].uvMax = 5;
    expect(deriveAlerts(ctx(w))).toEqual([]);
  });
  it('thunderstorm is severe and tells you when', () => {
    const w = weather();
    w.next48h[4].condition = 'Thunderstorm';
    const a = deriveAlerts(ctx(w));
    expect(a[0].kind).toBe('storm');
    expect(a[0].severity).toBe('severe');
    expect(a[0].detail).toMatch(/5 hours/);
    expect(a[0].id).toBe('storm:severe');
  });
  it('heat, wind, uv, air and rain each trigger at their thresholds, sorted by severity', () => {
    const w = weather({ temp: 40, wind: 45, rain: 80 });
    w.current.feelsLike = 43;
    w.current.uvIndex = 9;
    const a = deriveAlerts(ctx(w, { air: { usAqi: 160 } }));
    const kinds = a.map((x) => `${x.kind}:${x.severity}`);
    expect(kinds).toContain('heat:severe');
    expect(kinds).toContain('wind:warning');
    expect(kinds).toContain('uv:info');
    expect(kinds).toContain('air:warning');
    expect(kinds).toContain('rain:info');
    const order = { severe: 0, warning: 1, info: 2 };
    for (let i = 1; i < a.length; i++) expect(order[a[i - 1].severity]).toBeLessThanOrEqual(order[a[i].severity]);
  });
  it('freezing and heavy rain', () => {
    const cold = weather({ temp: 1 });
    cold.current.feelsLike = -1;
    expect(deriveAlerts(ctx(cold)).some((x) => x.kind === 'cold')).toBe(true);
    const w = weather();
    w.next48h[2].precipitation = 6;
    expect(deriveAlerts(ctx(w)).some((x) => x.kind === 'downpour')).toBe(true);
  });
  it('bands', () => {
    expect(aqiBand(30).label).toBe('Good');
    expect(aqiBand(120).tone).toBe('poor');
    expect(aqiBand(null)).toBeNull();
    expect(uvBand(2)).toBe('Low');
    expect(uvBand(9)).toBe('Very high');
    expect(uvBand(12)).toBe('Extreme');
  });
});

describe('share links', () => {
  it('round-trips a place', () => {
    const place = { name: 'Chennai, Tamil Nadu, India', lat: 13.0827, lon: 80.2707 };
    const back = decodePlace(encodePlace(place));
    expect(back).toEqual({ name: place.name, lat: 13.083, lon: 80.271 });
  });
  it('rejects junk and out-of-range values', () => {
    expect(decodePlace('')).toBeNull();
    expect(decodePlace('#p=X&lat=abc&lon=1')).toBeNull();
    expect(decodePlace('#p=X&lat=95&lon=1')).toBeNull();
    expect(decodePlace('#lat=1&lon=1')).toBeNull();
    expect(decodePlace('#p=<script>&lat=1&lon=1').name).toBe('<script>'); // returned as plain text; React escapes it on render
  });
});
