import { useEffect, useRef, useState } from 'react';

const supported = () => typeof Notification !== 'undefined';

export default function AlertsView({ alerts, placeName }) {
  const [perm, setPerm] = useState(supported() ? Notification.permission : 'unsupported');
  const sent = useRef(new Set());

  // Notify once per alert id while permission is granted (ids are stable: kind + severity).
  useEffect(() => {
    if (perm !== 'granted') return;
    for (const a of alerts) {
      if (a.severity === 'info' || sent.current.has(`${placeName}:${a.id}`)) continue;
      sent.current.add(`${placeName}:${a.id}`);
      try { new Notification(`${a.title} · ${placeName}`, { body: a.detail }); } catch { /* ignore */ }
    }
  }, [alerts, perm, placeName]);

  async function enable() {
    if (!supported()) return;
    setPerm(await Notification.requestPermission());
  }

  return (
    <section className="view-panel" aria-label="Weather alerts">
      <h2>Alerts for {placeName}</h2>
      {alerts.length === 0 ? (
        <div className="card calm"><span aria-hidden="true">🌤️</span><div><strong>All calm</strong><p>Nothing noteworthy in the next 24 hours.</p></div></div>
      ) : (
        <ul className="advice">
          {alerts.map((a) => (
            <li key={a.id} className={`card alert sev-${a.severity}`}>
              <span className="a-icon" aria-hidden="true">{a.icon}</span>
              <div><strong>{a.title}</strong><p>{a.detail}</p></div>
              <span className="chip">{a.severity}</span>
            </li>
          ))}
        </ul>
      )}
      {perm === 'default' && <button type="button" className="btn" onClick={enable}>Notify me about severe weather</button>}
      {perm === 'granted' && <p className="muted small">Notifications are on. Severe and warning alerts are sent while this tab is open.</p>}
      {perm === 'denied' && <p className="muted small">Notifications are blocked in your browser settings.</p>}
      {perm === 'unsupported' && <p className="muted small">This browser does not support notifications.</p>}
    </section>
  );
}
