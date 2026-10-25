import WeatherIcon from './WeatherIcon.jsx';
import { fmtTemp } from '../lib/units.js';
import { weekdayOfDateString } from '../lib/time.js';
import { confidencePercent } from '../format.js';

/** 7-day curve: temperature highs joined by a smooth line, an icon node per day, the selected day highlighted. */
export function WeekCurve({ daily, unit, selectedDay, onSelect }) {
  if (!daily?.length) return null;
  const W = 720;
  const H = 150;
  const padX = 52;
  const highs = daily.map((d) => d.tempMax);
  const lo = Math.min(...highs) - 2;
  const hi = Math.max(...highs) + 2;
  const x = (i) => padX + (i / Math.max(1, daily.length - 1)) * (W - padX * 2);
  const y = (v) => 34 + (1 - (v - lo) / (hi - lo || 1)) * (H - 80);
  const pts = daily.map((d, i) => [x(i), y(d.tempMax)]);
  let path = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const mx = (px + cx) / 2;
    path += ` C${mx},${py} ${mx},${cy} ${cx},${cy}`;
  }
  return (
    <section className="card week" aria-label="7 day forecast">
      <div className="week-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} className="week-svg">
          <path d={path} className="week-line" />
          {daily.map((d, i) => {
            const on = i === selectedDay;
            return (
              <g key={d.date} className={on ? 'node on' : 'node'} onClick={() => onSelect(i)} role="button" tabIndex={0}
                 aria-label={`${weekdayOfDateString(d.date)}: ${d.condition}, high ${fmtTemp(d.tempMax, unit)}`}
                 aria-pressed={on}
                 onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(i))}>
                <rect x={x(i) - 34} y="4" width="68" height={H - 8} rx="22" className="hit" />
                <text x={x(i)} y="22" className="wd">{i === 0 ? 'Today' : weekdayOfDateString(d.date, false)}</text>
                <circle cx={x(i)} cy={y(d.tempMax)} r={on ? 6 : 4} className="dot" />
                <text x={x(i)} y={y(d.tempMax) - 12} className="hi">{fmtTemp(d.tempMax, unit)}</text>
                <WeatherIcon condition={d.condition} x={x(i) - 15} y={H - 66} size={30} />
                <text x={x(i)} y={H - 12} className="lo">{fmtTemp(d.tempMin, unit)}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

/** Time-travel slider across the next hours, with the AI/provider switch. */
export function Scrubber({ points, hasAI, mode, onMode, hour, onHour, timeLabel, dayMode, onBackToHours }) {
  const max = Math.max(1, points.length - 1);
  const p = points[Math.min(hour, points.length - 1)];
  const conf = p?.confidence != null && mode === 'ai' ? confidencePercent(p.confidence) : null;
  return (
    <section className="card scrub" aria-label="Time travel">
      <div className="scrub-top">
        <div className="scrub-label">
          <span className="eyebrow">{dayMode ? 'Day preview' : hour === 0 ? 'Now' : `In ${hour} hour${hour === 1 ? '' : 's'}`}</span>
          <strong>{timeLabel}</strong>
          {conf !== null && hour > 0 && <span className="chip">{conf}% confidence</span>}
        </div>
        <div className="seg" role="group" aria-label="Forecast source">
          <button type="button" className={mode === 'ai' ? 'on' : ''} onClick={() => onMode('ai')} disabled={!hasAI} title={hasAI ? 'Predictions from the place’s own history' : 'AI forecast not available yet'}>Nanban AI</button>
          <button type="button" className={mode === 'provider' ? 'on' : ''} onClick={() => onMode('provider')}>Provider</button>
        </div>
      </div>
      {dayMode ? (
        <button type="button" className="btn btn-ghost" onClick={onBackToHours}>← Back to hourly view</button>
      ) : (
        <>
          <div className="scrub-graph">
            <TempSpark points={points} hour={Math.min(hour, max)} />
          </div>
          <input type="range" min="0" max={max} step="1" value={Math.min(hour, max)} onChange={(e) => onHour(Number(e.target.value))} aria-label="Hours from now" aria-valuetext={timeLabel} />
          <div className="scrub-ticks" aria-hidden="true">
            {[0, 0.25, 0.5, 0.75, 1].map((f) => <span key={f}>{points[Math.round(f * max)]?.label ?? ''}</span>)}
          </div>
        </>
      )}
    </section>
  );
}

/** Faint temperature curve for the whole timeline sitting behind the slider, with a glowing marker at the chosen hour. */
function TempSpark({ points, hour }) {
  if (points.length < 2) return null;
  const temps = points.map((p) => p.temp);
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  const W = 400;
  const H = 44;
  const xs = (i) => (i / (points.length - 1)) * W;
  const ys = (v) => H - 6 - ((v - lo) / (hi - lo || 1)) * (H - 14);
  let d = `M0,${ys(temps[0]).toFixed(1)}`;
  for (let i = 1; i < temps.length; i++) {
    const mx = (xs(i - 1) + xs(i)) / 2;
    d += ` C${mx.toFixed(1)},${ys(temps[i - 1]).toFixed(1)} ${mx.toFixed(1)},${ys(temps[i]).toFixed(1)} ${xs(i).toFixed(1)},${ys(temps[i]).toFixed(1)}`;
  }
  const pct = (hour / (points.length - 1)) * 100;
  return (
    <div className="spark" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.42" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient></defs>
        <path d={`${d} L${W},${H} L0,${H} Z`} fill="url(#sg)" />
        <path d={d} fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <i className="spark-dot" style={{ left: `${pct}%`, top: `${(ys(temps[hour]) / H) * 100}%` }} />
    </div>
  );
}
