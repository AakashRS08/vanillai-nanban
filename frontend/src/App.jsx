import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage, onUnauthorized, tokenStore } from './api.js';
import WeatherScene from './scene/WeatherScene.jsx';
import { sceneFor, uiVars } from './scene/presets.js';
import { buildTimeline } from './lib/timeline.js';
import { attachDaylight, describeSky } from './lib/describe.js';
import { localClock, localDateKey, localDateShort, localHour12, localWeekday, sunProgress, weekdayOfDateString } from './lib/time.js';
import { fmtTemp, fmtSpeed, speedUnitLabel, tempUnitLabel, toTemp } from './lib/units.js';
import AnimatedNumber from './components/AnimatedNumber.jsx';
import WeatherIcon from './components/WeatherIcon.jsx';
import { deriveAlerts } from './lib/alerts.js';
import { adviseActivities } from './lib/advisor.js';
import { decodePlace, encodePlace } from './lib/share.js';
import { useScramble } from './hooks/useScramble.js';
import { usePersisted } from './hooks/usePersisted.js';
import { createAmbient } from './audio.js';
import { AirCard, SunCard, WindCard } from './components/Cards.jsx';
import { Scrubber, WeekCurve } from './components/Charts.jsx';
import Advisor from './components/Advisor.jsx';
import AlertsView from './components/AlertsView.jsx';
import MapView from './components/MapView.jsx';
import SearchOverlay from './components/SearchOverlay.jsx';
import ChatWidget from './components/ChatWidget.jsx';
import AuthModal from './components/AuthModal.jsx';
import AdminPanel from './components/AdminPanel.jsx';

const DEFAULT_PLACE = { name: 'Chennai, Tamil Nadu, India', lat: 13.0827, lon: 80.2707 };
const NAV = [
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'search', label: 'Search', icon: '⌕' },
  { id: 'map', label: 'Radar', icon: '◎' },
  { id: 'plan', label: 'Plan', icon: '✓' },
  { id: 'alerts', label: 'Alerts', icon: '!' },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [menu, setMenu] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [favError, setFavError] = useState('');

  const [place, setPlace] = useState(() => decodePlace(window.location.hash) || DEFAULT_PLACE);
  const [weather, setWeather] = useState(null);
  const [weatherError, setWeatherError] = useState('');
  const [forecast, setForecast] = useState(null);
  const [air, setAir] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [view, setView] = useState('home');
  const [searching, setSearching] = useState(false);
  const [mode, setMode] = useState('ai');
  const [sel, setSel] = useState({ kind: 'hour', h: 0 });
  const dsel = useDeferredValue(sel); // dragging the slider stays instant; the heavy sky/text update follows without blocking it
  const [unit, setUnit] = usePersisted('nanban.unit', 'metric');
  const [quality, setQuality] = usePersisted('nanban.quality2', 'max');
  const [showFps, setShowFps] = usePersisted('nanban.fps', false);
  const [fps, setFps] = useState(0);
  const [gear, setGear] = useState(false);
  const engineRef = useRef(null);
  const [flash, setFlash] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [minIntro, setMinIntro] = useState(false);
  const [gone, setGone] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const ambient = useRef(null);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setFavorites([]);
    setMenu(false);
    setPlace((p) => ({ ...p, locationId: undefined }));
  }, []);
  useEffect(() => { onUnauthorized(logout); }, [logout]);

  useEffect(() => {
    if (!tokenStore.get()) return;
    api.me().then(setUser).catch(() => tokenStore.clear());
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    let live = true;
    setFavError('');
    api.listLocations().then((rows) => live && setFavorites(rows)).catch((e) => live && setFavError(errorMessage(e)));
    return () => { live = false; };
  }, [user]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    const m = setTimeout(() => setMinIntro(true), 1700);
    return () => { clearInterval(t); clearTimeout(m); };
  }, []);

  // Weather, AI forecast and air quality load independently so one failing never blanks the page.
  useEffect(() => {
    let live = true;
    setLoading(true);
    setWeatherError('');
    setSaveError('');
    api.weather(place.lat, place.lon)
      .then((w) => { if (live) { setWeather(w); setSel({ kind: 'hour', h: 0 }); } })
      .catch((e) => { if (live) { setWeather(null); setWeatherError(errorMessage(e)); } })
      .finally(() => live && setLoading(false));
    const call = place.locationId && user ? api.forecastForLocation(place.locationId) : api.forecastForCoords(place.lat, place.lon, place.name);
    call.then((f) => live && setForecast(f)).catch(() => live && setForecast(null));
    api.air(place.lat, place.lon).then((a) => live && setAir(a)).catch(() => live && setAir(null));
    return () => { live = false; };
  }, [place.lat, place.lon, place.locationId, user, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try { window.history.replaceState(null, '', encodePlace(place)); } catch { /* ignore */ }
  }, [place]);

  useEffect(() => { if (weather && minIntro) setIntroDone(true); }, [weather, minIntro]);
  useEffect(() => { if (weatherError && minIntro) setIntroDone(true); }, [weatherError, minIntro]);
  useEffect(() => { if (!introDone) return undefined; const t = setTimeout(() => setGone(true), 1000); return () => clearTimeout(t); }, [introDone]);

  /* ---------- derived data ---------- */
  const tz = weather?.utcOffsetSeconds ?? 0;
  const daily = weather?.daily ?? [];

  const { points, hasAI } = useMemo(() => {
    if (!weather) return { points: [], hasAI: false };
    const tl = buildTimeline(weather, forecast, mode);
    const withDay = attachDaylight(tl.points, daily, tz).map((p) => ({ ...p, label: localHour12(p.timeMs, tz) }));
    return { points: withDay, hasAI: tl.hasAI };
  }, [weather, forecast, mode, daily, tz]);

  const view1 = useMemo(() => {
    if (!weather || !points.length) return null;
    if (dsel.kind === 'day') {
      const d = daily[dsel.i] || daily[0];
      const ms = Date.parse(`${d.date}T12:00:00Z`) - tz * 1000;
      const point = {
        h: -1, timeMs: ms, temp: d.tempMax, condition: d.condition, wind: weather.current.windSpeed,
        humidity: weather.current.humidity, rainChance: d.precipProbabilityMax, daylight: true,
      };
      return { point, ms, day: d, ahead: [], uv: d.uvMax };
    }
    const point = points[Math.min(dsel.h, points.length - 1)];
    const day = daily.find((x) => x.date === localDateKey(point.timeMs, tz)) || daily[0];
    return { point, ms: point.timeMs, day, ahead: points.slice(point.h + 1, point.h + 25), uv: point.h === 0 ? weather.current.uvIndex : day?.uvMax };
  }, [weather, points, dsel, daily, tz]);

  const scene = useMemo(() => sceneFor({
    condition: view1?.point.condition ?? 'Partly Cloudy',
    daylight: view1?.point.daylight ?? true,
    sunProgress: view1 ? sunProgress(view1.ms, view1.day) : 0.4,
    wind: view1?.point.wind ?? 10,
  }), [view1]);

  const sky = useMemo(() => (view1 ? describeSky(view1.point, view1.ahead) : { title: '', subtitle: '', body: '' }), [view1]);
  const title = useScramble(sky.title || 'Vanillai Nanban');
  const alerts = useMemo(() => (weather ? deriveAlerts({ current: weather.current, points, daily, air }) : []), [weather, points, daily, air]);
  const advice = useMemo(() => (points.length ? adviseActivities({
    now: points[0], next: points.slice(1, 13), feelsLike: weather.current.feelsLike, aqi: air?.usAqi ?? null, uv: weather.current.uvIndex ?? 0,
  }) : []), [points, weather, air]);
  const hot = alerts.filter((a) => a.severity !== 'info').length;

  const vars = uiVars(scene);

  useEffect(() => {
    if (view1) document.title = `${fmtTemp(view1.point.temp, unit)} ${place.name.split(',')[0]} · Vanillai Nanban`;
  }, [view1, place.name, unit]);

  useEffect(() => {
    if (!showFps) return undefined;
    const t = setInterval(() => setFps(Math.round(engineRef.current?.fps ?? 0)), 500);
    return () => clearInterval(t);
  }, [showFps]);

  // Soft spotlight that follows the cursor across glass cards.
  useEffect(() => {
    const move = (e) => {
      const c = e.target?.closest?.('.card');
      if (!c) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', `${e.clientX - r.left}px`);
      c.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    document.addEventListener('pointermove', move, { passive: true });
    return () => document.removeEventListener('pointermove', move);
  }, []);

  useEffect(() => { ambient.current?.setMood({ rain: Math.max(scene.rain, scene.snow * 0.2), wind: scene.wind / 2 }); }, [scene]);

  async function toggleSound() {
    if (!ambient.current) ambient.current = createAmbient();
    try {
      if (soundOn) { ambient.current.disable(); setSoundOn(false); }
      else { await ambient.current.enable(); ambient.current.setMood({ rain: scene.rain, wind: scene.wind / 2 }); setSoundOn(true); }
    } catch { setSoundOn(false); }
  }

  /* ---------- actions ---------- */
  function selectPlace(p) {
    const match = favorites.find((f) => f.cityName.toLowerCase() === p.name.toLowerCase());
    setSearching(false);
    setView('home');
    setPlace({ ...p, locationId: match?.id });
  }
  function selectFavorite(f) {
    setSearching(false);
    setView('home');
    setPlace({ name: f.cityName, lat: f.latitude, lon: f.longitude, locationId: f.id });
  }
  async function savePlace() {
    if (!user) { setShowAuth(true); return; }
    setSaving(true);
    setSaveError('');
    try {
      const saved = await api.saveLocation({ cityName: place.name, latitude: place.lat, longitude: place.lon });
      setFavorites((f) => [...f, saved].sort((a, b) => a.cityName.localeCompare(b.cityName)));
      setPlace((p) => ({ ...p, locationId: saved.id }));
    } catch (e) { setSaveError(errorMessage(e)); } finally { setSaving(false); }
  }
  async function removeFavorite(f) {
    try {
      await api.deleteLocation(f.id);
      setFavorites((l) => l.filter((x) => x.id !== f.id));
      setPlace((p) => (p.locationId === f.id ? { ...p, locationId: undefined } : p));
    } catch (e) { setFavError(errorMessage(e)); }
  }
  async function share() {
    const url = `${window.location.origin}${window.location.pathname}${encodePlace(place)}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Vanillai Nanban', url });
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    } catch { /* user cancelled */ }
  }
  function nav(id) {
    if (id === 'search') setSearching(true);
    else setView(id);
  }

  const saved = Boolean(place.locationId);
  const p = view1?.point;
  const sub = p ? `${fmtTemp(view1.day?.tempMax, unit)} / ${fmtTemp(view1.day?.tempMin, unit)}` : '';
  const timeLabel = view1 ? (dsel.kind === 'day' ? `${weekdayOfDateString(view1.day.date)}, ${localDateShort(view1.ms, tz)}` : `${localWeekday(view1.ms, tz)} ${localClock(view1.ms, tz)}`) : '';

  return (
    <div className="app" style={vars} data-condition={scene.key} data-quality={quality} data-flash={flash || undefined}>
      <WeatherScene scene={scene} quality={quality} onEngine={(e) => { engineRef.current = e; }} onThunder={() => { ambient.current?.thunder(); setFlash(true); setTimeout(() => setFlash(false), 260); }} />
      <div className="shade" aria-hidden="true" />

      {!gone && (
        <div className={`intro ${introDone ? 'out' : ''}`} role="status" aria-live="polite">
          <div className="intro-mark">vanillai<span>.</span>nanban</div>
          <p>Reading the sky…</p>
        </div>
      )}

      <header className="topbar">
        <div className="logo" aria-label="Vanillai Nanban">vanillai<span>.</span><b>nanban</b></div>
        <nav className="pill-nav" aria-label="Main">
          {NAV.map((n) => (
            <button key={n.id} type="button" className={(n.id === view && !searching) || (n.id === 'search' && searching) ? 'on' : ''}
                    onClick={() => nav(n.id)} aria-current={n.id === view ? 'page' : undefined}>
              <i aria-hidden="true">{n.icon}</i><span>{n.label}</span>
              {n.id === 'alerts' && hot > 0 && <em className="badge">{hot}</em>}
            </button>
          ))}
        </nav>
        <div className="top-right">
          <time className="clock" dateTime={new Date(now).toISOString()}>
            {weather ? `${localDateShort(now, tz)} | ${localClock(now, tz)}` : ''}
          </time>
          <button type="button" className={`round ${soundOn ? 'on' : ''}`} onClick={toggleSound} aria-pressed={soundOn} aria-label="Ambient sound" title="Ambient weather sound">{soundOn ? '♪' : '♫'}</button>
          <div className="user">
            <button type="button" className="round" onClick={() => setGear((g) => !g)} aria-haspopup="true" aria-expanded={gear} aria-label="Display quality" title="Display quality">⚙</button>
            {gear && (
              <div className="menu quality" role="group" aria-label="Display quality">
                <strong>Quality</strong>
                {[['max', 'Max (default)'], ['auto', 'Auto'], ['balanced', 'Balanced'], ['low', 'Battery saver']].map(([k, l]) => (
                  <button key={k} type="button" className={quality === k ? 'on' : ''} aria-pressed={quality === k} onClick={() => setQuality(k)}>{l}</button>
                ))}
                <label className="fps-toggle"><input type="checkbox" checked={showFps} onChange={(e) => setShowFps(e.target.checked)} /> Show FPS</label>
              </div>
            )}
          </div>
          <div className="user">
            <button type="button" className="user-pill" onClick={() => (user ? setMenu((m) => !m) : setShowAuth(true))} aria-haspopup={user ? 'menu' : undefined} aria-expanded={user ? menu : undefined}>
              {user ? user.name.split(' ')[0] : 'Sign in'}
            </button>
            {menu && user && (
              <div className="menu" role="menu">
                {user.admin && <button type="button" role="menuitem" onClick={() => { setShowAdmin(true); setMenu(false); }}>Admin analytics</button>}
                <button type="button" role="menuitem" onClick={logout}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="stage">
        {weatherError && !weather && (
          <div className="card center-card" role="alert">
            <strong>Couldn’t load the weather</strong>
            <p>{weatherError}</p>
            <button type="button" className="btn" onClick={() => setReload((n) => n + 1)}>Try again</button>
          </div>
        )}

        {weather && view1 && view === 'home' && (
          <div className="home">
            <section className="hero" aria-live="polite">
              <div className="place-row">
                <h1 className="sr-only">{place.name}: {sky.title}</h1>
                <span className="place">{place.name.split(',').slice(0, 2).join(',')}</span>
                <button type="button" className={`round small ${saved ? 'on' : ''}`} onClick={savePlace} disabled={saving || saved} aria-label={saved ? 'Saved to favourites' : 'Save to favourites'} title={saved ? 'Saved' : 'Save place'}>{saved ? '♥' : '♡'}</button>
                <button type="button" className="round small" onClick={share} aria-label="Share this place" title="Share">{copied ? '✓' : '↗'}</button>
                {view1.uv != null && <span className="uv-pill">UV {Math.round(view1.uv)}</span>}
              </div>
              <p className="eyebrow" aria-hidden="true">{sky.subtitle}</p>
              <div className="title" aria-hidden="true">{title}</div>
              <p className="body" key={sky.body}>{sky.body}</p>
              {saveError && <p className="error" role="alert">{saveError}</p>}
              <div className="temp-row">
                <div className="temp" aria-label={`Temperature ${fmtTemp(p.temp, unit)}`}>
                  <span className="deg"><AnimatedNumber value={toTemp(p.temp, unit)} /></span><sup>°</sup>
                </div>
                <div className="temp-side">
                  <div className="seg unit" role="group" aria-label="Temperature unit">
                    <button type="button" className={unit === 'metric' ? 'on' : ''} onClick={() => setUnit('metric')} aria-pressed={unit === 'metric'}>°C</button>
                    <button type="button" className={unit === 'imperial' ? 'on' : ''} onClick={() => setUnit('imperial')} aria-pressed={unit === 'imperial'}>°F</button>
                  </div>
                  <span className="hilo cond"><WeatherIcon condition={p.condition} daylight={p.daylight !== false} size={38} title={p.condition} /> {p.condition}</span>
                  <span className="hilo">H/L {sub}</span>
                  {dsel.kind === 'hour' && dsel.h === 0 && <span className="hilo">Feels {fmtTemp(weather.current.feelsLike, unit)} · {Math.round(weather.current.humidity)}% humidity</span>}
                </div>
              </div>
              <span className="sr-only">Wind {fmtSpeed(p.wind, unit)} {speedUnitLabel(unit)}; {tempUnitLabel(unit)}</span>
            </section>

            <aside className="side">
              <WindCard points={points} unit={unit} selectedH={dsel.kind === 'hour' ? dsel.h : 0} />
              <SunCard day={view1.day} tz={tz} selectedMs={view1.ms} nowMs={now} />
              <AirCard air={air} uv={view1.uv} />
            </aside>

            <div className="bottom">
              <Scrubber
                points={points} hasAI={hasAI} mode={mode} onMode={setMode}
                hour={sel.kind === 'hour' ? sel.h : 0}
                onHour={(h) => setSel({ kind: 'hour', h })}
                timeLabel={timeLabel} dayMode={sel.kind === 'day'} onBackToHours={() => setSel({ kind: 'hour', h: 0 })}
              />
              <WeekCurve daily={daily} unit={unit} selectedDay={sel.kind === 'day' ? sel.i : -1} onSelect={(i) => setSel({ kind: 'day', i })} />
            </div>
          </div>
        )}

        {weather && view === 'plan' && <Advisor items={advice} />}
        {weather && view === 'alerts' && <AlertsView alerts={alerts} placeName={place.name.split(',')[0]} />}
        {view === 'map' && <MapView place={place} onPick={selectPlace} />}
      </main>

      {showFps && <div className="fps" aria-hidden="true">{fps} fps</div>}
      <footer className="foot">
        Weather by Open-Meteo · AI predictions are estimates, not official forecasts.
      </footer>

      {searching && (
        <SearchOverlay
          onSelect={selectPlace} onClose={() => setSearching(false)}
          favorites={favorites} favError={favError} signedIn={Boolean(user)}
          onSignIn={() => { setSearching(false); setShowAuth(true); }}
          onSelectFavorite={selectFavorite} onRemoveFavorite={removeFavorite}
        />
      )}
      <ChatWidget place={place} signedIn={Boolean(user)} />
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onAuthed={({ token, user: u }) => { tokenStore.set(token); setUser(u); setShowAuth(false); }} />}
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
      {loading && weather && <div className="loading-bar" aria-hidden="true" />}
    </div>
  );
}
