export function MiniLineChart({
  series,
  height = 140,
  yLabel,
}: {
  series: { name: string; values: number[]; color: string }[];
  height?: number;
  yLabel?: string;
}) {
  const n = Math.max(0, ...series.map((s) => s.values.length));
  const valuesAll = series.flatMap((s) => s.values);
  const finite = valuesAll.filter((v) => Number.isFinite(v));
  const yMin = finite.length ? Math.min(...finite) : 0;
  const yMax = finite.length ? Math.max(...finite) : 1;
  const pad = (yMax - yMin) * 0.1 || 0.5;
  const ymin = yMin - pad;
  const ymax = yMax + pad;
  const W = 600; // logical width; SVG scales to container
  const H = height;
  const sx = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const sy = (v: number) => {
    const t = (v - ymin) / Math.max(1e-6, ymax - ymin);
    return H - t * H;
  };

  function pathOf(vals: number[]): string {
    if (!vals.length) return "";
    const cmds: string[] = [];
    for (let i = 0; i < vals.length; i++) {
      const v = Number.isFinite(vals[i]) ? vals[i] : i > 0 ? vals[i - 1] : vals.find(Number.isFinite) ?? 0;
      const x = sx(i).toFixed(2);
      const y = sy(v).toFixed(2);
      cmds.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
    }
    return cmds.join(" ");
  }

  return (
    <div style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="ERA trend chart" style={{ width: "100%", height }}>
        {/* grid lines */}
        <line x1="0" y1={H} x2={W} y2={H} stroke="rgba(255,255,255,.1)" />
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="rgba(255,255,255,.08)" />
        {/* series */}
        {series.map((s, idx) => (
          <path key={idx} d={pathOf(s.values)} fill="none" stroke={s.color} strokeWidth={2} />
        ))}
      </svg>
      {yLabel && <div className="muted" style={{ fontSize: ".85em", marginTop: 4 }}>{yLabel}</div>}
    </div>
  );
}

