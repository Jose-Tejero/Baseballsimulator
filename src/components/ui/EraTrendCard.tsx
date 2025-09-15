import { computeEraBuff, type GameERIP } from "../../engine/eraBuff";
import { MiniLineChart } from "./MiniLineChart";

export function EraTrendCard({
  title,
  series,
  seasonEra,
  seasonIPOuts,
  teamEra,
}: {
  title: string;
  series: GameERIP[] | null;
  seasonEra: number | null;
  seasonIPOuts: number | null;
  teamEra: number;
}) {
  const mkSeasonPoint = (era: number | null, ipOuts: number | null): GameERIP | null => {
    if (era == null || !Number.isFinite(era)) return null;
    if (ipOuts == null || !Number.isFinite(ipOuts) || ipOuts <= 0) return null;
    const ip = ipOuts / 3;
    const er = (era * ip) / 9;
    return { er, outs: ipOuts };
  };

  const data = (() => {
    if (series && series.length) return series;
    const p = mkSeasonPoint(seasonEra, seasonIPOuts);
    return p ? [p] : [];
  })();

  const buff = computeEraBuff(data, { leagueERA: 4.3 });
  const pts = buff.series;

  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <h3 className="h2" style={{ margin: 0 }}>{title}</h3>
        {buff.latest && (
          <div className="muted" style={{ fontSize: ".9em" }}>
            Nivel (Holt): {buff.latest.level.toFixed(2)} Tendencia: {buff.latest.trend.toFixed(2)} Buff: {buff.latest.buff.toFixed(3)}
          </div>
        )}
      </div>
      {pts.length >= 1 ? (
        <MiniLineChart
          height={140}
          series={[
            { name: "ERA acumulado", values: pts.map((p) => p.eraCum ?? pts.find((q) => q.eraCum != null)?.eraCum ?? 4.3), color: "#9aa4b0" },
            { name: "Nivel (Holt)", values: pts.map((p) => p.level), color: "var(--accent)" },
          ]}
          yLabel="ERA"
        />
      ) : (
        <div className="muted">Sin datos del abridor.</div>
      )}
      <div className="muted" style={{ marginTop: 6, fontSize: ".9em" }}>
        Referencia del equipo (ERA): {Number.isFinite(teamEra) ? teamEra.toFixed(2) : "i?"}
      </div>
    </div>
  );
}



