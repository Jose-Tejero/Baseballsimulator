import { Toggle } from "./ui/Toggle";
import type { Hand, Roster } from "../engine/baseball";

export function LineupPanel({
  useLineup,
  setUseLineup,
  anchorGamePk,
  anchorInfo,
  homePitcherHand,
  setHomePitcherHand,
  awayPitcherHand,
  setAwayPitcherHand,
  isTop,
  awayBatRoster,
  homeBatRoster,
  idxAway,
  idxHome,
  awayTeamId,
  homeTeamId,
  loadingLineupAway,
  loadingLineupHome,
  loadRealLineup,
  awayLineupInfo,
  homeLineupInfo,
  errLineupAway,
  errLineupHome,
}: {
  useLineup: boolean;
  setUseLineup: (v: boolean) => void;
  anchorGamePk: number | null;
  anchorInfo: string | null;
  homePitcherHand: Hand;
  setHomePitcherHand: (h: Hand) => void;
  awayPitcherHand: Hand;
  setAwayPitcherHand: (h: Hand) => void;
  isTop: boolean;
  awayBatRoster: Roster;
  homeBatRoster: Roster;
  idxAway: number;
  idxHome: number;
  awayTeamId: number | "";
  homeTeamId: number | "";
  loadingLineupAway: boolean;
  loadingLineupHome: boolean;
  loadRealLineup: (which: "home" | "away") => void | Promise<void>;
  awayLineupInfo: string | null;
  homeLineupInfo: string | null;
  errLineupAway: string | null;
  errLineupHome: string | null;
}) {
  return (
    <>
      <Toggle
        label="Usar lineup real (rates por PA)"
        checked={useLineup}
        onChange={setUseLineup}
      />
      {useLineup && (
        <div style={{ display: "grid", gap: 8 }}>
          {anchorGamePk && (
            <div className="muted">{anchorInfo ?? `Juego ancla: ${anchorGamePk}`}</div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div className="field">
              <label>
                <strong>Mano lanzador HOME (defiende en ALTAS)</strong>
              </label>
              <select
                value={homePitcherHand}
                onChange={(e) => setHomePitcherHand(e.target.value as Hand)}
              >
                <option value="R">R</option>
                <option value="L">L</option>
              </select>
            </div>
            <div className="field">
              <label>
                <strong>Mano lanzador AWAY (defiende en BAJAS)</strong>
              </label>
              <select
                value={awayPitcherHand}
                onChange={(e) => setAwayPitcherHand(e.target.value as Hand)}
              >
                <option value="R">R</option>
                <option value="L">L</option>
              </select>
            </div>
          </div>
          <div>
            <strong>Lineup al bate ahora:</strong>
            {(() => {
              const battingTop = isTop;
              const roster = battingTop ? awayBatRoster : homeBatRoster;
              const pHand: Hand = battingTop ? homePitcherHand : awayPitcherHand;
              const idx = battingTop ? idxAway : idxHome;
              const lineup = pHand === "L" ? roster.lineupVsL : roster.lineupVsR;
              if (!Array.isArray(lineup) || lineup.length === 0)
                return (
                  <div className="muted">Sin lineup cargado para el equipo al bate.</div>
                );
              const cur = ((idx % lineup.length) + lineup.length) % lineup.length;
              return (
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  {lineup.map((bid, i) => {
                    const b = roster.players[bid];
                    const is = i === cur;
                    return (
                      <li key={bid} style={{ fontWeight: is ? 700 : 400 }}>
                        {b?.name ?? bid}
                        {b?.hand ? ` (${b.hand})` : ""}
                      </li>
                    );
                  })}
                </ol>
              );
            })()}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="button secondary"
                disabled={!awayTeamId || loadingLineupAway}
                onClick={() => loadRealLineup("away")}
              >
                {loadingLineupAway ? "Cargando lineup AWAY…" : "Cargar lineup real (AWAY)"}
              </button>
              <button
                className="button secondary"
                disabled={!homeTeamId || loadingLineupHome}
                onClick={() => loadRealLineup("home")}
              >
                {loadingLineupHome ? "Cargando lineup HOME…" : "Cargar lineup real (HOME)"}
              </button>
            </div>
            {awayLineupInfo && (
              <div className="muted">AWAY: {awayLineupInfo}</div>
            )}
            {homeLineupInfo && (
              <div className="muted">HOME: {homeLineupInfo}</div>
            )}
            {errLineupAway && (
              <div className="muted">AWAY: {errLineupAway}</div>
            )}
            {errLineupHome && (
              <div className="muted">HOME: {errLineupHome}</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}



