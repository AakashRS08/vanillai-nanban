import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api.js';
import { placeLabel } from '../format.js';

const QUICK = [
  { name: 'Chennai, Tamil Nadu, India', lat: 13.0827, lon: 80.2707 },
  { name: 'Mumbai, Maharashtra, India', lat: 19.076, lon: 72.8777 },
  { name: 'London, England, United Kingdom', lat: 51.5072, lon: -0.1276 },
  { name: 'New York, New York, United States', lat: 40.7128, lon: -74.006 },
  { name: 'Tokyo, Japan', lat: 35.6762, lon: 139.6503 },
  { name: 'Sydney, New South Wales, Australia', lat: -33.8688, lon: 151.2093 },
];

export default function SearchOverlay({ onSelect, onClose, favorites, favError, signedIn, onSignIn, onSelectFavorite, onRemoveFavorite }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [msg, setMsg] = useState('');
  const [locating, setLocating] = useState(false);
  const reqId = useRef(0);
  const input = useRef(null);

  useEffect(() => {
    input.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Debounced autocomplete; stale responses are dropped so fast typing never shows old results.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setMsg(''); return undefined; }
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const found = await api.searchCities(q);
        if (id !== reqId.current) return;
        setResults(found);
        setMsg(found.length ? '' : 'No places found');
      } catch (e) {
        if (id !== reqId.current) return;
        setResults([]);
        setMsg(errorMessage(e));
      }
    }, 280);
    return () => clearTimeout(t);
  }, [query]);

  function locate() {
    if (!navigator.geolocation) { setMsg('Your browser does not support location detection'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onSelect({ name: 'My location', lat: Math.round(pos.coords.latitude * 1000) / 1000, lon: Math.round(pos.coords.longitude * 1000) / 1000 });
      },
      () => { setLocating(false); setMsg('Could not get your location. Allow access or search for a city.'); },
      { timeout: 10000, maximumAge: 300000 }
    );
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search-panel" role="dialog" aria-modal="true" aria-label="Search places">
        <div className="search-row">
          <input ref={input} type="search" autoComplete="off" placeholder="Search any city…" value={query} aria-label="Search for a city"
                 onChange={(e) => setQuery(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) onSelect({ name: placeLabel(results[0]), lat: results[0].latitude, lon: results[0].longitude }); }} />
          <button type="button" className="btn" onClick={locate} disabled={locating}>{locating ? 'Locating…' : '📍 Near me'}</button>
        </div>
        {msg && <p className="muted small" role="status">{msg}</p>}
        {results.length > 0 && (
          <ul className="results">
            {results.map((g) => (
              <li key={`${g.latitude},${g.longitude}`}>
                <button type="button" onClick={() => onSelect({ name: placeLabel(g), lat: g.latitude, lon: g.longitude })}>{placeLabel(g)}</button>
              </li>
            ))}
          </ul>
        )}
        {results.length === 0 && (
          <>
            <h3>Favourites</h3>
            {!signedIn ? (
              <p className="muted small">Sign in to keep a list of places and get AI forecasts that learn from them. <button type="button" className="link" onClick={onSignIn}>Sign in</button></p>
            ) : favorites.length === 0 ? (
              <p className="muted small">Nothing saved yet. Use the ♡ next to a place name to save it.</p>
            ) : (
              <ul className="results">
                {favorites.map((f) => (
                  <li key={f.id} className="fav">
                    <button type="button" onClick={() => onSelectFavorite(f)}>{f.cityName}</button>
                    <button type="button" className="icon-btn" aria-label={`Remove ${f.cityName}`} onClick={() => onRemoveFavorite(f)}>✕</button>
                  </li>
                ))}
              </ul>
            )}
            {favError && <p className="error" role="alert">{favError}</p>}
            <h3>Popular</h3>
            <div className="chips">
              {QUICK.map((q) => <button key={q.name} type="button" className="chip chip-btn" onClick={() => onSelect(q)}>{q.name.split(',')[0]}</button>)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
