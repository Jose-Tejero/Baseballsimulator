export function LogPanel({ log }: { log: string[] }) {
  return (
    <div className="card">
      <h3 className="h2">Log</h3>
      <ul
        className="log"
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "grid",
          gap: 8,
          height: 280,
          overflow: "auto",
        }}
      >
        {log.map((line, i) => (
          <li key={i} className="muted">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

