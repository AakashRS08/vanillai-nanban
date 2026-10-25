const CLOUD = 'M18 46h27a10 10 0 0 0 1.5-19.9A14 14 0 0 0 19.5 29 9.2 9.2 0 0 0 18 46z';

function Sun({ cx = 32, cy = 32, r = 10 }) {
  const rays = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <g>
      <g className="wi-spin" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        {rays.map((a) => (
          <line key={a} x1={cx} y1={cy - r - 5} x2={cx} y2={cy - r - 10} transform={`rotate(${a} ${cx} ${cy})`} stroke="#ffd479" strokeWidth="3" strokeLinecap="round" />
        ))}
      </g>
      <circle cx={cx} cy={cy} r={r} fill="url(#wi-sun)" className="wi-pulse" style={{ transformOrigin: `${cx}px ${cy}px` }} />
    </g>
  );
}

function Moon() {
  return (
    <g>
      <path d="M40 14a18 18 0 1 0 12 30A15 15 0 0 1 40 14z" fill="#e8efff" className="wi-pulse" style={{ transformOrigin: '32px 32px' }} />
      <circle cx="49" cy="17" r="1.8" fill="#fff" className="wi-twinkle" />
      <circle cx="54" cy="29" r="1.3" fill="#fff" className="wi-twinkle" style={{ animationDelay: '0.8s' }} />
    </g>
  );
}

const Cloud = ({ fill = '#fff', dy = 0, className = 'wi-float' }) => (
  <path d={CLOUD} transform={`translate(0 ${dy})`} fill={fill} className={className} />
);

/** Small animated weather glyph (pure SVG + CSS). Pass x/y/size to nest inside another <svg>. */
export default function WeatherIcon({ condition, daylight = true, size = 40, x, y, title }) {
  const nested = x !== undefined;
  const body = (() => {
    switch (condition) {
      case 'Clear':
        return daylight ? <Sun /> : <Moon />;
      case 'Partly Cloudy':
        return (<>{daylight ? <Sun cx={25} cy={24} r={8} /> : <g transform="translate(-6 -6) scale(0.8)"><Moon /></g>}<Cloud fill="#f4f7ff" dy={4} /></>);
      case 'Cloudy':
        return (<><Cloud fill="#b9c4da" dy={-4} className="wi-float slow" /><Cloud fill="#fff" dy={4} /></>);
      case 'Fog':
        return (<><Cloud fill="#dfe6f3" dy={-6} />{[44, 51, 58].map((yy, i) => <line key={yy} x1="14" x2="50" y1={yy} y2={yy} stroke="#e8eefb" strokeWidth="3" strokeLinecap="round" className="wi-slide" style={{ animationDelay: `${i * 0.5}s` }} />)}</>);
      case 'Drizzle':
      case 'Rain':
        return (<><Cloud fill="#c3cde2" dy={-6} />{[22, 32, 42].map((xx, i) => <line key={xx} x1={xx} y1="46" x2={xx - 3} y2="54" stroke="#7fc4ff" strokeWidth={condition === 'Rain' ? 3 : 2} strokeLinecap="round" className="wi-drop" style={{ animationDelay: `${i * 0.28}s` }} />)}</>);
      case 'Thunderstorm':
        return (<><Cloud fill="#8f9ab3" dy={-7} /><path d="M33 38l-8 12h6l-3 10 11-15h-6l4-7z" fill="#ffe27a" className="wi-bolt" /></>);
      case 'Snow':
        return (<><Cloud fill="#e2e9f7" dy={-6} />{[22, 32, 42].map((xx, i) => <circle key={xx} cx={xx} cy="49" r="2.4" fill="#fff" className="wi-flake" style={{ animationDelay: `${i * 0.45}s` }} />)}</>);
      default:
        return <Cloud />;
    }
  })();
  return (
    <svg x={x} y={y} width={size} height={size} viewBox="0 0 64 64" className="wicon" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} overflow="visible">
      {!nested && null}
      <defs>
        <radialGradient id="wi-sun" cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#fff3b8" /><stop offset="1" stopColor="#ffb938" /></radialGradient>
      </defs>
      {body}
    </svg>
  );
}
