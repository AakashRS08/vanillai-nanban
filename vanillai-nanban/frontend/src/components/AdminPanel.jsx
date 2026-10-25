import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api.js';

export default function AdminPanel({ onClose }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.adminStats().then(setStats).catch((e) => setError(errorMessage(e)));
  }, []);

  const rows = stats && [
    ['Registered users', stats.users],
    ['Saved locations', stats.locations],
    ['Weather readings stored', stats.weatherReadings],
    ['Predictions generated', stats.predictions],
    ['Chat messages', stats.chatMessages],
    ['Predictions checked against reality', stats.evaluatedPredictions],
    ['Average temperature error', stats.meanAbsErrorTemp != null ? `±${stats.meanAbsErrorTemp}°C` : 'not enough data yet'],
  ];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="admin-title">
        <h2 id="admin-title">Admin analytics</h2>
        {error && <p className="error" role="alert">{error}</p>}
        {!stats && !error && <p className="muted">Loading…</p>}
        {rows && (
          <dl className="stats stats-col">
            {rows.map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        )}
        <button type="button" className="icon-btn modal-close" aria-label="Close" onClick={onClose}>✕</button>
      </div>
    </div>
  );
}
