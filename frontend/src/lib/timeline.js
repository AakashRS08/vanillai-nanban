// Turns the API's weather snapshot + AI forecast into one 0..48h timeline the UI can scrub through.

const HOUR = 3600e3;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * @param weather  Snapshot { current, next48h[] }
 * @param forecast ForecastDto { predictions[] } or null
 * @param mode     'ai' | 'provider'
 * @returns {{points: Array, hasAI: boolean}} points[h] for h = 0..N (0 = now)
 */
export function buildTimeline(weather, forecast, mode = 'ai') {
  if (!weather?.current) return { points: [], hasAI: false };
  const nowMs = new Date(weather.current.observedAt).getTime();
  const c = weather.current;

  const providerByHour = new Map();
  for (const h of weather.next48h || []) {
    const hh = Math.round((new Date(h.time).getTime() - nowMs) / HOUR);
    if (hh >= 1 && !providerByHour.has(hh)) providerByHour.set(hh, h);
  }
  const maxH = Math.max(0, ...providerByHour.keys());

  const anchors = [{ h: 0, temp: c.temperature, condition: c.condition, confidence: 1 }];
  for (const p of forecast?.predictions || []) {
    const hh = Math.round((new Date(p.predictedFor).getTime() - nowMs) / HOUR);
    if (hh >= 1) anchors.push({ h: hh, temp: p.predictedTemp, condition: p.predictedCondition, confidence: p.confidenceScore, provider: p });
  }
  anchors.sort((a, b) => a.h - b.h);
  const hasAI = anchors.length > 1;
  const useAI = mode === 'ai' && hasAI;
  const last = Math.max(maxH, useAI ? anchors[anchors.length - 1].h : 0);

  const points = [];
  for (let h = 0; h <= last; h++) {
    const prov = h === 0 ? null : providerByHour.get(h);
    const provTemp = h === 0 ? c.temperature : prov?.temperature ?? null;
    const provCond = h === 0 ? c.condition : prov?.condition ?? null;

    let temp = provTemp;
    let condition = provCond;
    let confidence = null;
    if (useAI) {
      temp = interpolate(anchors, h);
      const near = nearest(anchors, h);
      condition = h === 0 ? c.condition : near.condition;
      confidence = interpolateField(anchors, h, 'confidence');
    }
    const fallbackWind = prov?.windSpeed ?? c.windSpeed;
    points.push({
      h,
      time: new Date(nowMs + h * HOUR).toISOString(),
      timeMs: nowMs + h * HOUR,
      temp: temp ?? provTemp ?? c.temperature,
      providerTemp: provTemp,
      condition: condition ?? provCond ?? c.condition,
      providerCondition: provCond,
      wind: h === 0 ? c.windSpeed : fallbackWind,
      humidity: h === 0 ? c.humidity : prov?.humidity ?? c.humidity,
      rainChance: h === 0 ? null : prov?.precipProbability ?? null,
      precipitation: h === 0 ? c.precipitation : prov?.precipitation ?? 0,
      confidence,
    });
  }
  return { points, hasAI };
}

function interpolate(anchors, h) {
  return interpolateField(anchors, h, 'temp');
}

function interpolateField(anchors, h, field) {
  if (h <= anchors[0].h) return anchors[0][field];
  for (let i = 1; i < anchors.length; i++) {
    if (h <= anchors[i].h) {
      const a = anchors[i - 1];
      const b = anchors[i];
      const t = (h - a.h) / (b.h - a.h || 1);
      return a[field] + (b[field] - a[field]) * clamp(t, 0, 1);
    }
  }
  return anchors[anchors.length - 1][field];
}

function nearest(anchors, h) {
  let best = anchors[0];
  for (const a of anchors) if (Math.abs(a.h - h) < Math.abs(best.h - h)) best = a;
  return best;
}
