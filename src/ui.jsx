import { colorFor, initials } from "./format";

export function Mark({ size = 28 }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="#dff56a" />
      <path d="M7 18.5c3.2-6.2 14.8-6.2 18 0" stroke="#17210c" strokeWidth="1.7" fill="none" />
      <path d="M5.5 14.5h21" stroke="#17210c" strokeWidth="1.4" opacity="0.75" />
    </svg>
  );
}

export function Avatar({ id, name, size = "md" }) {
  return (
    <span className={`avatar ${size}`} style={{ background: colorFor(id) }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function BackHeader({ onBack, title, sub }) {
  return (
    <header className="top">
      <button type="button" className="icon-btn" onClick={onBack} aria-label="Retour">
        ←
      </button>
      <div>
        <h1>{title}</h1>
        {sub ? <p className="sub">{sub}</p> : null}
      </div>
    </header>
  );
}

export function Meter({ label, done, total }) {
  const pct = total ? Math.round((100 * done) / total) : 0;
  return (
    <div className="meter">
      <div className="meter-top">
        <span>{label}</span>
        <b>
          {done}/{total}
        </b>
      </div>
      <div className="meter-track" role="img" aria-label={`${pct} pour cent`}>
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function FormDots({ form }) {
  const last = form.slice(-5);
  if (!last.length) return null;
  const label = last.map((item) => (item === "W" ? "victoire" : "défaite")).join(", ");
  return (
    <span className="form" aria-label={label}>
      {last.map((item, index) => (
        <i key={`${item}-${index}`} className={item === "W" ? "win" : "loss"} />
      ))}
    </span>
  );
}

export function RateBar({ gamesFor, gamesAgainst }) {
  const total = gamesFor + gamesAgainst;
  const pct = total ? Math.round((100 * gamesFor) / total) : 0;
  return (
    <span className="bar" aria-hidden="true">
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

export function Sparkline({ points, width = 280, height = 64 }) {
  if (!points?.length) return null;
  const values = points.map((point) => point.rating);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(12, max - min);
  const pad = 4;
  const coords = values.map((value, index) => {
    const x = pad + (index * (width - pad * 2)) / Math.max(1, values.length - 1);
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return `${x},${y}`;
  });
  const last = values[values.length - 1];
  const first = values[0];
  const up = last >= first;
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={`Niveau de ${Math.round(first)} à ${Math.round(last)}`}>
      <polyline fill="none" stroke={up ? "#dff56a" : "#ff8a5b"} strokeWidth="2.5" points={coords.join(" ")} />
      <circle cx={coords[coords.length - 1].split(",")[0]} cy={coords[coords.length - 1].split(",")[1]} r="3.5" fill={up ? "#dff56a" : "#ff8a5b"} />
    </svg>
  );
}
