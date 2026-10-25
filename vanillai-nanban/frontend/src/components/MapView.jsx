import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/** Interactive map with an animated rain radar (RainViewer). Click anywhere to check that spot's weather. */
export default function MapView({ place, onPick }) {
  const el = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const layers = useRef([]);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const [status, setStatus] = useState('Loading radar…');
  const [playing, setPlaying] = useState(true);
  const [frame, setFrame] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([place.lat, place.lon], 6);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap, © CARTO', maxZoom: 12,
    }).addTo(m);
    marker.current = L.circleMarker([place.lat, place.lon], { radius: 8, color: '#fff', weight: 2, fillColor: '#5bb4ff', fillOpacity: 1 }).addTo(m);
    m.on('click', (e) => pickRef.current({ name: 'Pinned location', lat: Math.round(e.latlng.lat * 1000) / 1000, lon: Math.round(e.latlng.lng * 1000) / 1000 }));
    map.current = m;

    let dead = false;
    fetch('https://api.rainviewer.com/public/weather-maps.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('radar'))))
      .then((j) => {
        if (dead) return;
        const frames = [...(j.radar?.past || []), ...(j.radar?.nowcast || [])].slice(-10);
        layers.current = frames.map((f) => L.tileLayer(`${j.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`, { opacity: 0, zIndex: 5 }).addTo(m));
        setCount(frames.length);
        setFrame(Math.max(0, (j.radar?.past?.length || 1) - 1));
        setStatus(frames.length ? '' : 'No radar data available');
      })
      .catch(() => !dead && setStatus('Radar is unavailable right now'));
    const fix = setTimeout(() => m.invalidateSize(), 150);
    return () => { dead = true; clearTimeout(fix); m.remove(); map.current = null; layers.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map.current) return;
    marker.current?.setLatLng([place.lat, place.lon]);
    map.current.panTo([place.lat, place.lon]);
  }, [place.lat, place.lon]);

  useEffect(() => { layers.current.forEach((l, i) => l.setOpacity(i === frame ? 0.65 : 0)); }, [frame, count]);

  useEffect(() => {
    if (!playing || count < 2) return undefined;
    const t = setInterval(() => setFrame((f) => (f + 1) % count), 700);
    return () => clearInterval(t);
  }, [playing, count]);

  return (
    <section className="view-panel map-panel" aria-label="Radar map">
      <div className="map-head">
        <h2>Rain radar</h2>
        <span className="muted small">{status || 'Click the map to check any spot'}</span>
        {count > 1 && (
          <div className="map-ctl">
            <button type="button" className="btn btn-ghost" onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</button>
            <input type="range" min="0" max={count - 1} value={frame} onChange={(e) => { setPlaying(false); setFrame(Number(e.target.value)); }} aria-label="Radar frame" />
          </div>
        )}
      </div>
      <div ref={el} className="map" />
    </section>
  );
}
