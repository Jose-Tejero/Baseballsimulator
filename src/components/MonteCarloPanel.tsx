import type { Rules } from "../engine/baseball";

export function MonteCarloPanel({
  mcRuns,
  setMcRuns,
  onRun,
  mcResult,
  rules,
  homeLabel,
  awayLabel,
}: {
  mcRuns: number;
  setMcRuns: (n: number) => void;
  onRun: () => void;
  mcResult: null | {
    homeWinPct: number;
    awayWinPct: number;
    tiePct: number;
    avgHomeRuns: number;
    avgAwayRuns: number;
  };
  rules: Rules;
  homeLabel: string;
  awayLabel: string;
}) {
  return (
    <div className="card">
      <h3 className="h2">Monte Carlo</h3>
      <div className="field">
        <label>
          <strong>Simulaciones: {mcRuns}</strong>
        </label>
        <input
          type="range"
          min={50}
          max={2000}
          step={50}
          value={mcRuns}
          onChange={(e) => setMcRuns(Number(e.target.value))}
        />
      </div>
      <button className="button" onClick={onRun}>
        Correr Monte Carlo
      </button>

      {mcResult && (
        <div className="muted" style={{ marginTop: 8 }}>
          <div style={{ marginBottom: 6 }}>
            <div>
              <strong>Home:</strong> {homeLabel}
            </div>
            <div>
              <strong>Away:</strong> {awayLabel}
            </div>
          </div>
          <div>Home win%: {(mcResult.homeWinPct * 100).toFixed(1)}%</div>
          <div>Away win%: {(mcResult.awayWinPct * 100).toFixed(1)}%</div>
          {rules.allowTies && (
            <div>Tie%: {(mcResult.tiePct * 100).toFixed(1)}%</div>
          )}
          <div>Promedio carreras (Home): {mcResult.avgHomeRuns.toFixed(2)}</div>
          <div>Promedio carreras (Away): {mcResult.avgAwayRuns.toFixed(2)}</div>
          <div>
            Promedio total por juego (R/G combinado):{" "}
            {(mcResult.avgHomeRuns + mcResult.avgAwayRuns).toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
}

