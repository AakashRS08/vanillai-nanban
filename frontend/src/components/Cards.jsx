import { useMemo } from 'react';
import { fmtSpeed, speedUnitLabel } from '../lib/units.js';
import { localClock, sunProgress } from '../lib/time.js';
import { aqiBand, uvBand } from '../lib/alerts.js';

/** Wind: current speed, a smooth 24h line and gust bars, like the reference's "wind" card. */
export function WindCard({ points, unit, selectedH }) {
  const series = useMemo(() => points.slice(0, 25).map((p) => p.wind ?? 0), [points]);
  const now = points[Math.min(selectedH, points.length - 1)];
  const max = Math.max(10, ...series);
  const W = 260;
  const H = 70;
  const xs = (i) => (i / Math.max(1, series.length - 1)) * W;
  const ys = (v) => H - 8 - (v / max) * (H - 22);
  const line = series.map((v, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(' ');
  const idx = Math.min(selectedH, series.length - 1);
  return (
    <section className="card wind-card" aria-label="Wind">
      <header><span>Wind</span><span className="chip">{fmtSpeed(max, unit)} peak</span></header>
      <div className="wind-main">
        <strong>{fmtSpeed(now?.wind ?? 0, unit)}</strong>
        <span>{speedUnitLabel(unit)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="wind-chart" role="img" aria-label="Wind speed over the next 24 hours">
        {series.map((v, i) => (
          <rect key={i} x={xs(i) - 3} y={ys(v)} width="6" height={H - 8 - ys(v)} rx="3" className={i === idx ? 'bar on' : 'bar'} />
        ))}
        <path d={line} className="wind-line" />
        {series.length > 0 && <circle cx="0" cy="0" r="4.5" className="wind-dot" style={{ transform: `translate(${xs(idx).toFixed(1)}px, ${ys(series[idx]).toFixed(1)}px)` }} />}
      </svg>
    </section>
  );
}

/** Sunrise / sunset arc with the sun's current position. */
export function SunCard({ day, tz, nowMs, selectedMs }) {
  if (!day?.sunrise || !day?.sunset) return null;
  const p = sunProgress(selectedMs, day);
  const clamped = Math.max(0, Math.min(1, p ?? 0));
  const R = 90;
  const cx = 110;
  const cy = 100;
  const ang = Math.PI * (1 - clamped);
  const sx = cx + R * Math.cos(ang);
  const sy = cy - R * Math.sin(ang);
  const up = p > 0 && p < 1;
  const rise = new Date(day.sunrise).getTime();
  const set = new Date(day.sunset).getTime();
  const lenH = (set - rise) / 3600e3;
  return (
    <section className="card sun-card" aria-label="Sunrise and sunset">
      <header><span>Sun</span><span className="chip">{Math.floor(lenH)}h {Math.round((lenH % 1) * 60)}m daylight</span></header>
      <svg viewBox="0 0 220 118" className="sun-arc" role="img" aria-label={up ? 'The sun is up' : 'The sun is down'}>
        <path d={`M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}`} className="arc-base" />
        <path d={`M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}`} className={up ? 'arc-done' : 'arc-done off'} pathLength="100"
              style={{ strokeDasharray: `${(clamped * 100).toFixed(2)} 100` }} />
        <line x1="8" y1={cy} x2="212" y2={cy} className="horizon" />
        <circle cx="0" cy="0" r={up ? 9 : 6} className={up ? 'sun-dot' : 'sun-dot off'} style={{ transform: `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)` }} />
      </svg>
      <div className="sun-times">
        <div><small>Sunrise</small><strong>{localClock(rise, tz)}</strong></div>
        <div><small>Sunset</small><strong>{localClock(set, tz)}</strong></div>
      </div>
      <span className="sr-only">{nowMs}</span>
    </section>
  );
}

export function AirCard({ air, uv }) {
  const band = aqiBand(air?.usAqi ?? null);
  const pct = air?.usAqi != null ? Math.min(100, (air.usAqi / 300) * 100) : 0;
  return (
    <section className="card air-card" aria-label="Air quality and UV">
      <header><span>Air &amp; UV</span>{band && <span className={`chip tone-${band.tone}`}>{band.label}</span>}</header>
      <div className="air-grid">
        <div>
          <small>US AQI</small>
          <strong>{air?.usAqi != null ? Math.round(air.usAqi) : '–'}</strong>
          <div className="meter" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
        </div>
        <div>
          <small>UV index</small>
          <strong>{uv != null ? Math.round(uv) : '–'}</strong>
          <span className="sub">{uv != null ? uvBand(uv) : ''}</span>
        </div>
        <div><small>PM2.5</small><strong className="sm">{air?.pm25 != null ? Math.round(air.pm25) : '–'}</strong></div>
        <div><small>Ozone</small><strong className="sm">{air?.ozone != null ? Math.round(air.ozone) : '–'}</strong></div>
      </div>
    </section>
  );
}
