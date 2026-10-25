import { describe, expect, it } from 'vitest';
import { CONDITIONS, sceneFor, uiVars } from './presets.js';
import { kickCurve, sceneDistance, stepToward } from './morph.js';

const KEYS = ['skyTop', 'skyBottom', 'sunColor', 'cloudLit', 'cloudShade', 'sunPos', 'sunStrength', 'cover', 'hero', 'rain', 'snow', 'fog', 'stars', 'moon', 'wind', 'lightning'];

describe('scene presets', () => {
  it('every condition, day and night, yields a complete, in-range parameter set', () => {
    for (const c of CONDITIONS) {
      for (const daylight of [true, false]) {
        const s = sceneFor({ condition: c, daylight, sunProgress: 0.5, wind: 20 });
        for (const k of KEYS) expect(s[k], `${c}/${daylight}/${k}`).toBeDefined();
        for (const k of ['skyTop', 'skyBottom', 'sunColor', 'cloudLit', 'cloudShade']) {
          expect(s[k]).toHaveLength(3);
          s[k].forEach((v) => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); });
        }
        for (const k of ['sunStrength', 'cover', 'hero', 'rain', 'snow', 'fog', 'stars', 'moon']) {
          expect(s[k]).toBeGreaterThanOrEqual(0);
          expect(s[k]).toBeLessThanOrEqual(1.0001);
        }
        expect(s.sunPos[0]).toBeGreaterThanOrEqual(0); expect(s.sunPos[0]).toBeLessThanOrEqual(1);
      }
    }
  });
  it('storms are dark and wet, clear days are bright and dry', () => {
    const storm = sceneFor({ condition: 'Thunderstorm' });
    const clear = sceneFor({ condition: 'Clear' });
    expect(storm.skyTop[0]).toBeLessThan(clear.skyTop[0]);
    expect(storm.rain).toBeGreaterThan(0.5);
    expect(storm.lightning).toBe(1);
    expect(clear.rain).toBe(0);
    expect(clear.cover).toBeLessThan(storm.cover);
  });
  it('night shows stars only when the sky is open', () => {
    expect(sceneFor({ condition: 'Clear', daylight: false }).stars).toBeGreaterThan(0.7);
    expect(sceneFor({ condition: 'Thunderstorm', daylight: false }).stars).toBe(0);
    expect(sceneFor({ condition: 'Clear', daylight: true }).stars).toBe(0);
    expect(sceneFor({ condition: 'Clear', daylight: false }).moon).toBeGreaterThan(0.7);
  });
  it('the sun climbs and falls through the day', () => {
    const y = (p) => sceneFor({ condition: 'Clear', sunProgress: p }).sunPos[1];
    expect(y(0.5)).toBeGreaterThan(y(0.05));
    expect(y(0.5)).toBeGreaterThan(y(0.95));
  });
  it('unknown conditions fall back safely and wind speeds up the drift', () => {
    expect(sceneFor({ condition: 'Volcanic ash' }).key).toContain('Volcanic ash');
    expect(sceneFor({ condition: 'Volcanic ash' }).cover).toBe(sceneFor({ condition: 'Partly Cloudy' }).cover);
    expect(sceneFor({ wind: 60 }).wind).toBeGreaterThan(sceneFor({ wind: 2 }).wind);
  });
  it('exposes css variables', () => {
    const v = uiVars(sceneFor({ condition: 'Rain' }));
    expect(v['--glass']).toMatch(/^rgb\(\d+ \d+ \d+ \/ 0\.\d+\)$/);
    expect(v['--sky-top']).toMatch(/^rgb\(/);
  });
});

describe('morphing', () => {
  const a = sceneFor({ condition: 'Clear' });
  const b = sceneFor({ condition: 'Thunderstorm' });
  it('converges to the target and never overshoots', () => {
    let cur = a;
    for (let i = 0; i < 400; i++) cur = stepToward(cur, b, 1 / 30);
    expect(cur.cover).toBeCloseTo(b.cover, 3);
    expect(cur.skyTop[0]).toBeCloseTo(b.skyTop[0], 3);
    const mid = stepToward(a, b, 0.2);
    expect(mid.cover).toBeGreaterThan(a.cover);
    expect(mid.cover).toBeLessThan(b.cover);
  });
  it('is stable with no change and with a zero time step', () => {
    expect(stepToward(a, a, 1).cover).toBe(a.cover);
    expect(stepToward(a, b, 0).cover).toBe(a.cover);
  });
  it('measures how different two skies look', () => {
    expect(sceneDistance(a, a)).toBe(0);
    expect(sceneDistance(a, b)).toBeGreaterThan(1);
    expect(sceneDistance(sceneFor({ condition: 'Cloudy' }), sceneFor({ condition: 'Partly Cloudy' }))).toBeLessThan(sceneDistance(a, b));
  });
  it('kick curve starts and ends neutral and peaks mid-way', () => {
    expect(kickCurve(0)).toEqual({ zoom: 1, blur: 0, dim: 0 });
    expect(kickCurve(1)).toEqual({ zoom: 1, blur: 0, dim: 0 });
    expect(kickCurve(0.5).zoom).toBeGreaterThan(1.4);
    expect(kickCurve(0.5).blur).toBeGreaterThan(10);
  });
});
