export function SteppedNumber({
  value,
  onChange,
  min,
  max,
  step,
  decimals,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  decimals: number;
  ariaLabel?: string;
}) {
  const clamp = (x: number) => Math.max(min, Math.min(max, x));
  const fmt = (x: number) => Number(x.toFixed(decimals));

  function bump(delta: number) {
    const next = fmt(clamp(value + delta));
    onChange(next);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8 }}>
      <button
        type="button"
        className="button"
        onClick={() => bump(-step)}
        aria-label={`Disminuir ${ariaLabel ?? ""}`}
      >
        -
      </button>

      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={value.toFixed(decimals)}
        onChange={(e) => {
          const raw = e.target.value;
          const parsed = raw === "" ? min : Number(raw);
          if (!Number.isNaN(parsed)) onChange(parsed);
        }}
        onBlur={(e) => {
          const parsed = Number(e.target.value);
          if (!Number.isNaN(parsed)) onChange(fmt(clamp(parsed)));
          else onChange(fmt(value));
        }}
        aria-label={ariaLabel}
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,.12)",
          background: "color-mix(in oklab, var(--surface) 92%, black 8%)",
          color: "var(--text)",
          textAlign: "center",
          fontVariantNumeric: "tabular-nums",
        }}
      />

      <button
        type="button"
        className="button"
        onClick={() => bump(step)}
        aria-label={`Aumentar ${ariaLabel ?? ""}`}
      >
        +
      </button>
    </div>
  );
}

