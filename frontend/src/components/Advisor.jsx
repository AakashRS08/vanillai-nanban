export default function Advisor({ items }) {
  if (!items.length) return null;
  return (
    <section className="view-panel" aria-label="Activity planner">
      <h2>What should you do today?</h2>
      <p className="muted">Scored from the hourly forecast, UV and air quality for the next hours.</p>
      <ul className="advice">
        {items.map((a) => (
          <li key={a.id} className="card">
            <span className="a-icon" aria-hidden="true">{a.icon}</span>
            <div>
              <strong>{a.label}</strong>
              <p>{a.reason}</p>
            </div>
            <span className={`chip tone-${a.verdict.tone}`}>{a.verdict.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
