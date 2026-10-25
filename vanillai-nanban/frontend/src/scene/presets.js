// Maps a weather condition (+ day/night, sun position) to the parameters the sky shader renders.
// Colours are 0-1 RGB. "ui" tints the glass panels so text stays readable on every sky.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const DAY = {
  Clear: { skyTop: [0.2, 0.46, 0.86], skyBottom: [0.62, 0.8, 0.97], sunColor: [1.0, 0.9, 0.65], cloudLit: [1, 1, 1], cloudShade: [0.62, 0.7, 0.86], sunStrength: 1.0, cover: 0.1, hero: 0.0, rain: 0, snow: 0, fog: 0, wind: 1.0, ui: [0.16, 0.3, 0.5, 0.42] },
  'Partly Cloudy': { skyTop: [0.36, 0.5, 0.76], skyBottom: [0.7, 0.79, 0.91], sunColor: [1.0, 0.84, 0.5], cloudLit: [1, 0.99, 0.97], cloudShade: [0.52, 0.6, 0.74], sunStrength: 0.95, cover: 0.24, hero: 0.9, rain: 0, snow: 0, fog: 0, wind: 1.0, ui: [0.34, 0.42, 0.58, 0.46] },
  Cloudy: { skyTop: [0.42, 0.48, 0.58], skyBottom: [0.72, 0.76, 0.82], sunColor: [0.95, 0.93, 0.88], cloudLit: [0.93, 0.95, 0.98], cloudShade: [0.5, 0.55, 0.64], sunStrength: 0.25, cover: 0.82, hero: 0.45, rain: 0, snow: 0, fog: 0, wind: 0.8, ui: [0.3, 0.35, 0.44, 0.5] },
  Fog: { skyTop: [0.6, 0.65, 0.71], skyBottom: [0.82, 0.85, 0.88], sunColor: [1, 0.97, 0.9], cloudLit: [0.95, 0.96, 0.98], cloudShade: [0.7, 0.74, 0.8], sunStrength: 0.2, cover: 0.6, hero: 0.2, rain: 0, snow: 0, fog: 0.85, wind: 0.3, ui: [0.36, 0.41, 0.48, 0.55] },
  Drizzle: { skyTop: [0.33, 0.38, 0.46], skyBottom: [0.6, 0.64, 0.7], sunColor: [0.9, 0.9, 0.88], cloudLit: [0.76, 0.79, 0.85], cloudShade: [0.36, 0.4, 0.48], sunStrength: 0.12, cover: 0.9, hero: 0.6, rain: 0.35, snow: 0, fog: 0.1, wind: 0.9, ui: [0.2, 0.24, 0.31, 0.52] },
  Rain: { skyTop: [0.26, 0.3, 0.38], skyBottom: [0.52, 0.57, 0.65], sunColor: [0.85, 0.87, 0.9], cloudLit: [0.7, 0.74, 0.82], cloudShade: [0.24, 0.27, 0.34], sunStrength: 0.08, cover: 0.8, hero: 0.8, rain: 0.75, snow: 0, fog: 0.12, wind: 1.2, ui: [0.14, 0.18, 0.25, 0.55] },
  Thunderstorm: { skyTop: [0.17, 0.2, 0.27], skyBottom: [0.46, 0.5, 0.57], sunColor: [0.7, 0.78, 0.95], cloudLit: [0.78, 0.84, 0.93], cloudShade: [0.12, 0.14, 0.2], sunStrength: 0.05, cover: 0.42, hero: 1.0, rain: 0.8, snow: 0, fog: 0.08, wind: 1.6, ui: [0.07, 0.09, 0.13, 0.55] },
  Snow: { skyTop: [0.55, 0.62, 0.74], skyBottom: [0.86, 0.9, 0.95], sunColor: [1, 1, 1], cloudLit: [0.97, 0.98, 1], cloudShade: [0.7, 0.76, 0.86], sunStrength: 0.2, cover: 0.85, hero: 0.5, rain: 0, snow: 1, fog: 0.25, wind: 0.5, ui: [0.34, 0.42, 0.54, 0.5] },
};

export const CONDITIONS = Object.keys(DAY);

const scale3 = (c, k) => c.map((v) => v * k);

function nightOf(d, condition) {
  const stormy = ['Rain', 'Thunderstorm', 'Drizzle', 'Snow'].includes(condition);
  const k = stormy ? 0.55 : 1;
  const open = 1 - d.cover; // open sky = visible stars and moon
  return {
    ...d,
    skyTop: stormy ? scale3(d.skyTop, 0.6) : [0.02, 0.04, 0.11],
    skyBottom: stormy ? scale3(d.skyBottom, 0.5) : [0.07, 0.12, 0.25],
    sunColor: [0.72, 0.84, 1.0],
    cloudLit: stormy ? scale3(d.cloudLit, 0.5) : [0.42, 0.5, 0.68],
    cloudShade: stormy ? scale3(d.cloudShade, 0.55) : [0.06, 0.08, 0.16],
    sunStrength: condition === 'Thunderstorm' ? 0.04 : 0.15 + 0.55 * open * k,
    moon: stormy ? 0 : clamp(open * 1.3, 0, 1),
    stars: stormy ? 0 : clamp(open * 1.15 - d.fog * 0.8, 0, 1),
    ui: [0.05, 0.09, 0.18, 0.55],
  };
}

/**
 * @param condition  Clear | Partly Cloudy | Cloudy | Fog | Drizzle | Rain | Snow | Thunderstorm
 * @param daylight   boolean
 * @param sunProgress 0 (sunrise) .. 1 (sunset); null when unknown
 * @param wind       km/h, speeds the cloud drift
 */
export function sceneFor({ condition = 'Partly Cloudy', daylight = true, sunProgress = 0.4, wind = 10 } = {}) {
  const base = DAY[condition] || DAY['Partly Cloudy'];
  const d = daylight ? { ...base, moon: 0, stars: 0 } : nightOf(base, condition);
  const p = clamp(sunProgress ?? 0.4, 0, 1);
  const sunPos = daylight ? [0.2 + 0.6 * p, 0.34 + 0.4 * Math.sin(Math.PI * p)] : [0.72, 0.74];
  return {
    skyTop: d.skyTop, skyBottom: d.skyBottom, sunColor: d.sunColor, cloudLit: d.cloudLit, cloudShade: d.cloudShade,
    sunPos,
    sunStrength: d.sunStrength, cover: d.cover, hero: d.hero, rain: d.rain, snow: d.snow, fog: d.fog,
    stars: d.stars, moon: d.moon,
    wind: d.wind * clamp(0.6 + wind / 40, 0.6, 2.2),
    lightning: condition === 'Thunderstorm' ? 1 : 0,
    ui: d.ui,
    key: `${condition}|${daylight ? 'day' : 'night'}`,
  };
}

/** CSS colours for the glass UI and the no-WebGL fallback background. */
export function uiVars(scene) {
  const [r, g, b, a] = scene.ui;
  const c = (x) => Math.round(x * 255);
  const css = (v) => `rgb(${c(v[0])} ${c(v[1])} ${c(v[2])})`;
  return {
    '--glass': `rgb(${c(r)} ${c(g)} ${c(b)} / ${a})`,
    '--glass-strong': `rgb(${c(r)} ${c(g)} ${c(b)} / ${Math.min(0.85, a + 0.2)})`,
    '--sky-top': css(scene.skyTop),
    '--sky-bottom': css(scene.skyBottom),
  };
}
