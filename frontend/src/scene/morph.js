// Smooth transitions between two scene parameter sets.

const isArr = Array.isArray;

/** Move `cur` toward `target` by an exponential-smoothing step. Returns a new object. */
export function stepToward(cur, target, dt, rate = 2.2) {
  const k = 1 - Math.exp(-rate * Math.max(0, dt));
  const out = {};
  for (const key of Object.keys(target)) {
    const t = target[key];
    const c = cur?.[key];
    if (isArr(t)) out[key] = t.map((v, i) => (c ? c[i] : v) + (v - (c ? c[i] : v)) * k);
    else if (typeof t === 'number') out[key] = (c ?? t) + (t - (c ?? t)) * k;
    else out[key] = t;
  }
  return out;
}

/** How different two scenes look (0 = identical). Used to decide whether a transition deserves the fly-through effect. */
export function sceneDistance(a, b) {
  if (!a || !b) return 1;
  const f = (k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0));
  const col = (k) => (a[k] && b[k] ? a[k].reduce((s, v, i) => s + Math.abs(v - b[k][i]), 0) / 3 : 0);
  return f('cover') + f('rain') + f('snow') + f('stars') + f('hero') * 0.5 + f('sunStrength') * 0.6 + col('skyTop') + col('skyBottom');
}

/** Zoom/blur pulse used during a big transition. t in 0..1 → {zoom, blur, dim}. */
export function kickCurve(t) {
  if (t <= 0 || t >= 1) return { zoom: 1, blur: 0, dim: 0 };
  const bell = Math.sin(Math.PI * t); // 0 → 1 → 0
  const eased = bell * bell * (3 - 2 * bell);
  return { zoom: 1 + 0.55 * eased, blur: 14 * eased, dim: 0.08 * eased };
}
