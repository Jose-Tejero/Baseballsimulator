type StarterInfo = {
  label: string;
  name: string | null;
  era: number | null;
  whip: number | null;
};

type StartersCardProps = {
  away: StarterInfo;
  home: StarterInfo;
};

const formatValue = (value: number | null) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "-";

export function StartersCard({ away, home }: StartersCardProps) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="h2">Abridores</div>
      <div className="muted" style={{ display: "grid", gap: 6 }}>
        <div>
          <strong>{away.label}</strong>: {away.name ?? "-"} ERA {formatValue(away.era)} /
          WHIP {formatValue(away.whip)}
        </div>
        <div>
          <strong>{home.label}</strong>: {home.name ?? "-"} ERA {formatValue(home.era)} /
          WHIP {formatValue(home.whip)}
        </div>
      </div>
    </div>
  );
}
