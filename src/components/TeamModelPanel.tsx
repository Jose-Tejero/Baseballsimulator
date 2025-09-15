import { Field } from "./ui/Field";
import { SteppedNumber } from "./ui/SteppedNumber";
import type { Team } from "../services/mlb";
import type { RosterPlayer } from "../services/mlb";

export function TeamModelPanel(props: {
  season: number;
  setSeason: (n: number) => void;
  teams: Team[];
  awayTeamId: number | "";
  setAwayTeamId: (v: number | "") => void;
  homeTeamId: number | "";
  setHomeTeamId: (v: number | "") => void;
  loadingAway: boolean;
  loadingHome: boolean;
  errAway: string | null;
  errHome: string | null;
  loadTeamStats: (which: "home" | "away", teamId: number) => void | Promise<void>;
  loadRoster: (which: "home" | "away", teamId: number) => void | Promise<void>;
  awayRoster: RosterPlayer[];
  homeRoster: RosterPlayer[];
  loadingRosterAway: boolean;
  loadingRosterHome: boolean;
  errRosterAway: string | null;
  errRosterHome: string | null;
  awayStarterId: number | "";
  setAwayStarterId: (v: number | "") => void;
  homeStarterId: number | "";
  setHomeStarterId: (v: number | "") => void;
  loadStarterStats: (which: "home" | "away", personId: number) => void | Promise<void>;
  awayStarterERA: number | null;
  awayStarterWHIP: number | null;
  awayStarterIPOuts: number | null;
  homeStarterERA: number | null;
  homeStarterWHIP: number | null;
  homeStarterIPOuts: number | null;
  awayStarterName: string | null;
  homeStarterName: string | null;
  awayProbableMsg: string | null;
  homeProbableMsg: string | null;
  parkRunsPF: number;
  setParkRunsPF: (v: number) => void;
  parkHRPF: number;
  setParkHRPF: (v: number) => void;
  avgAway: number; setAvgAway: (v: number) => void;
  obpAway: number; setObpAway: (v: number) => void;
  slgAway: number; setSlgAway: (v: number) => void;
  eraAway: number; setEraAway: (v: number) => void;
  whipAway: number; setWhipAway: (v: number) => void;
  avgHome: number; setAvgHome: (v: number) => void;
  obpHome: number; setObpHome: (v: number) => void;
  slgHome: number; setSlgHome: (v: number) => void;
  eraHome: number; setEraHome: (v: number) => void;
  whipHome: number; setWhipHome: (v: number) => void;
  currentProbs: { OUT: number; BB: number; HBP: number; "1B": number; "2B": number; "3B": number; HR: number };
}) {
  const p = props;
  return (
    <div className="card">
      <h3 className="h2">Modelo por equipo (AVG - OBP - SLG - ERA - WHIP)</h3>

      <div className="field">
        <label>
          <strong>Temporada MLB</strong>
        </label>
        <input
          type="number"
          min={2015}
          max={2099}
          value={p.season}
          onChange={(e) => p.setSeason(Number(e.target.value) || p.season)}
        />
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <div className="field">
          <label>
            <strong>AWAY sssssAA Equipo MLB</strong>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <select
              value={p.awayTeamId}
              onChange={(e) => {
                const v = e.target.value === "" ? "" : Number(e.target.value);
                p.setAwayTeamId(v);
                if (v !== "" && !Number.isNaN(v as number)) {
                  p.loadTeamStats("away", v as number);
                  p.loadRoster("away", v as number);
                }
              }}
            >
              <option value="">Seleccionar equipo (AWAY)</option>
              {p.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.abbreviation ? `${t.abbreviation} - ` : ""}
                  {t.name}
                </option>
              ))}
            </select>
            <button
              className="button secondary"
              disabled={p.loadingAway || !p.awayTeamId}
              onClick={() =>
                typeof p.awayTeamId === "number" &&
                (p.loadTeamStats("away", p.awayTeamId), p.loadRoster("away", p.awayTeamId))
              }
            >
              {p.loadingAway ? "Cargando?sssssAA" : "Cargar"}
            </button>
          </div>
          {p.errAway && <div className="muted">{p.errAway}</div>}
          {p.awayTeamId && (
            <div style={{ marginTop: 8 }}>
              <label>
                <strong>Abridor AWAY (6 entradas)</strong>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                <select
                  value={p.awayStarterId}
                  onChange={(e) => {
                    const v = e.target.value === "" ? "" : Number(e.target.value);
                    p.setAwayStarterId(v);
                    if (v !== "" && !Number.isNaN(v as number)) {
                      p.loadStarterStats("away", v as number);
                      // name shown elsewhere via props
                    } else {
                      // reset via parent props handlers if needed
                    }
                  }}
                >
                  <option value="">- Seleccionar pitcher (AWAY) -</option>
                  {p.awayRoster.map((rp) => (
                    <option key={rp.id} value={rp.id}>
                      {rp.fullName}
                      {rp.primaryNumber ? ` #${rp.primaryNumber}` : ""}
                    </option>
                  ))}
                </select>
                <button
                  className="button secondary"
                  disabled={p.loadingRosterAway || !p.awayTeamId}
                  onClick={() => typeof p.awayTeamId === "number" && p.loadRoster("away", p.awayTeamId)}
                >
                  {p.loadingRosterAway ? "CargandosssssssssssssssAA?sssssssssssssssAA" : "Refrescar roster"}
                </button>
              </div>
            </div>
          )}
          {p.awayProbableMsg && p.awayStarterId === "" && (
            <div className="muted" style={{ marginTop: 4 }}>
              {p.awayProbableMsg}
            </div>
          )}
          {p.awayStarterName && (
            <div className="muted" style={{ marginTop: 4 }}>
              Seleccionado: {p.awayStarterName}
            </div>
          )}
        </div>

        <div className="field">
          <label>
            <strong>HOME sssssAA Equipo MLB</strong>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <select
              value={p.homeTeamId}
              onChange={(e) => {
                const v = e.target.value === "" ? "" : Number(e.target.value);
                p.setHomeTeamId(v);
                if (v !== "" && !Number.isNaN(v as number)) {
                  p.loadTeamStats("home", v as number);
                  p.loadRoster("home", v as number);
                }
              }}
            >
              <option value="">Seleccionar equipo (HOME)</option>
              {p.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.abbreviation ? `${t.abbreviation} - ` : ""}
                  {t.name}
                </option>
              ))}
            </select>
            <button
              className="button secondary"
              disabled={p.loadingHome || !p.homeTeamId}
              onClick={() =>
                typeof p.homeTeamId === "number" &&
                (p.loadTeamStats("home", p.homeTeamId), p.loadRoster("home", p.homeTeamId))
              }
            >
              {p.loadingHome ? "Cargando?sssssAA" : "Cargar"}
            </button>
          </div>
          {p.errHome && <div className="muted">{p.errHome}</div>}
          {p.homeTeamId && (
            <div style={{ marginTop: 8 }}>
              <label>
                <strong>Abridor HOME (6 entradas)</strong>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                <select
                  value={p.homeStarterId}
                  onChange={(e) => {
                    const v = e.target.value === "" ? "" : Number(e.target.value);
                    p.setHomeStarterId(v);
                    if (v !== "" && !Number.isNaN(v as number)) {
                      p.loadStarterStats("home", v as number);
                    } else {
                      // reset handled upstream
                    }
                  }}
                >
                  <option value="">- Seleccionar pitcher (HOME) -</option>
                  {p.homeRoster.map((rp) => (
                    <option key={rp.id} value={rp.id}>
                      {rp.fullName}
                      {rp.primaryNumber ? ` #${rp.primaryNumber}` : ""}
                    </option>
                  ))}
                </select>
                <button
                  className="button secondary"
                  disabled={p.loadingRosterHome || !p.homeTeamId}
                  onClick={() => typeof p.homeTeamId === "number" && p.loadRoster("home", p.homeTeamId)}
                >
                  {p.loadingRosterHome ? "CargandosssssssssssssssAA?sssssssssssssssAA" : "Refrescar roster"}
                </button>
              </div>
            </div>
          )}
          {p.homeProbableMsg && p.homeStarterId === "" && (
            <div className="muted" style={{ marginTop: 4 }}>
              {p.homeProbableMsg}
            </div>
          )}
          {p.homeStarterName && (
            <div className="muted" style={{ marginTop: 4 }}>
              Seleccionado: {p.homeStarterName}
            </div>
          )}
        </div>
      </div>

      <div className="field">
        <label>
          <strong>Park Factors (Runs / HR)</strong>
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <div className="muted" style={{ fontSize: ".9em" }}>
              Runs PF (0.80 - 1.20): {p.parkRunsPF.toFixed(2)}
            </div>
            <SteppedNumber value={p.parkRunsPF} onChange={p.setParkRunsPF} min={0.8} max={1.2} step={0.01} decimals={2} ariaLabel="Runs Park Factor" />
          </div>
          <div>
            <div className="muted" style={{ fontSize: ".9em" }}>
              HR PF (0.80 - 1.20): {p.parkHRPF.toFixed(2)}
            </div>
            <SteppedNumber value={p.parkHRPF} onChange={p.setParkHRPF} min={0.8} max={1.2} step={0.01} decimals={2} ariaLabel="HR Park Factor" />
          </div>
        </div>
      </div>

      <Field label={`AWAY sssssAA AVG (0.150 - 0.400): ${p.avgAway.toFixed(3)}`}>
        <SteppedNumber value={p.avgAway} onChange={p.setAvgAway} min={0.15} max={0.4} step={0.001} decimals={3} ariaLabel="AVG Away" />
      </Field>
      <Field label={`AWAY sssssAA OBP (0.250 - 0.500): ${p.obpAway.toFixed(3)}`}>
        <SteppedNumber value={p.obpAway} onChange={p.setObpAway} min={0.25} max={0.5} step={0.001} decimals={3} ariaLabel="OBP Away" />
      </Field>
      <Field label={`AWAY sssssAA SLG (0.300 - 0.700): ${p.slgAway.toFixed(3)}`}>
        <SteppedNumber value={p.slgAway} onChange={p.setSlgAway} min={0.3} max={0.7} step={0.001} decimals={3} ariaLabel="SLG Away" />
      </Field>
      <Field label={`AWAY sssssAA ERA (1.00 - 8.00): ${p.eraAway.toFixed(2)}`}>
        <SteppedNumber value={p.eraAway} onChange={p.setEraAway} min={1.0} max={8.0} step={0.01} decimals={2} ariaLabel="ERA Away" />
      </Field>
      <Field label={`AWAY sssssAA WHIP (0.80 - 1.80): ${p.whipAway.toFixed(2)}`}>
        <SteppedNumber value={p.whipAway} onChange={p.setWhipAway} min={0.8} max={1.8} step={0.01} decimals={2} ariaLabel="WHIP Away" />
      </Field>

      <hr style={{ opacity: 0.15, margin: "12px 0" }} />

      <Field label={`HOME sssssAA AVG (0.150 - 0.400): ${p.avgHome.toFixed(3)}`}>
        <SteppedNumber value={p.avgHome} onChange={p.setAvgHome} min={0.15} max={0.4} step={0.001} decimals={3} ariaLabel="AVG Home" />
      </Field>
      <Field label={`HOME sssssAA OBP (0.250 - 0.500): ${p.obpHome.toFixed(3)}`}>
        <SteppedNumber value={p.obpHome} onChange={p.setObpHome} min={0.25} max={0.5} step={0.001} decimals={3} ariaLabel="OBP Home" />
      </Field>
      <Field label={`HOME sssssAA SLG (0.300 - 0.700): ${p.slgHome.toFixed(3)}`}>
        <SteppedNumber value={p.slgHome} onChange={p.setSlgHome} min={0.3} max={0.7} step={0.001} decimals={3} ariaLabel="SLG Home" />
      </Field>
      <Field label={`HOME sssssAA ERA (1.00 - 8.00): ${p.eraHome.toFixed(2)}`}>
        <SteppedNumber value={p.eraHome} onChange={p.setEraHome} min={1.0} max={8.0} step={0.01} decimals={2} ariaLabel="ERA Home" />
      </Field>
      <Field label={`HOME sssssAA WHIP (0.80 - 1.80): ${p.whipHome.toFixed(2)}`}>
        <SteppedNumber value={p.whipHome} onChange={p.setWhipHome} min={0.8} max={1.8} step={0.01} decimals={2} ariaLabel="WHIP Home" />
      </Field>

      <details>
        <summary className="muted">Ver probabilidades del bateador actual</summary>
        <div className="muted" style={{ marginTop: 8 }}>
          <div>OUT: {p.currentProbs.OUT.toFixed(3)}</div>
          <div>1B: {p.currentProbs["1B"].toFixed(3)}</div>
          <div>2B: {p.currentProbs["2B"].toFixed(3)}</div>
          <div>3B: {p.currentProbs["3B"].toFixed(3)}</div>
          <div>HR: {p.currentProbs.HR.toFixed(3)}</div>
          <div>Reach% (H+BB aprox): {(1 - p.currentProbs.OUT).toFixed(3)}</div>
          <div>BB: {p.currentProbs.BB.toFixed(3)}</div>
          <div>HBP: {p.currentProbs.HBP.toFixed(3)}</div>
        </div>
      </details>
    </div>
  );
}


                      // name handled via props elsewhere if needed



