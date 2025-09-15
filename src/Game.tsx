import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { Field } from "./components/ui/Field";
import { Toggle } from "./components/ui/Toggle";
import { SteppedNumber } from "./components/ui/SteppedNumber";
import { Row } from "./components/ui/Row";
import { Diamond } from "./components/ui/Diamond";
import { EraTrendCard } from "./components/ui/EraTrendCard";
import {
  applyEvent,
  initialState,
  DEFAULT_RULES,
  rollEventFromProbs,
  eventProbsForHalf,
  monteCarlo,
  monteCarloLineup,
  adjustEventProbsWithPF,
  type GameState,
  type Rules,
  type Hand,
  type RateLine,
  type Batter,
  type BatterRates,
  type Roster,
  eventProbsFromRateLine,
  pickRateLine,
  currentBatterId,
} from "./engine/baseball";
import {
  currentBuff,
  withBuffedPitch,
  buffToRunsPF,
  type GameERIP,
} from "./engine/eraBuff";
import {
  getTeams,
  getTeamSummary,
  getTeamRoster,
  getPlayerPitchingStats,
  getPlayerPitchingGameLog,
  getNextProbablePitcher,
  getNextGameLineup,
  predictNextGameLineup,
  getGameLineup,
  getPlayerHittingStats,
  getPlayerInfo,
  getGameProbables,
  getGameTeams,
  getRecentLineupsForTeam,
  predictLineupFromRecent,
  type Team,
  type RosterPlayer,
  type PlayerHitting,
} from "./services/mlb";

// Traducciones bonitas de las razones del estado final
const reasonLabel: Record<string, string> = {
  regulation: "Final por reglamentarias",
  walkoff: "Walk-off",
  mercy: "Regla de misericordia",
  maxInnings: "LÃ­mite de entradas",
  tieAllowed: "Empate permitido",
  forfeit: "Forfeit",
};

export default function Game() {
  // ------------------ Estado de juego ------------------
  const [gs, setGs] = useState<GameState>({ ...initialState });
  const [rules, setRules] = useState<Rules>({ ...DEFAULT_RULES });
  const [log, setLog] = useState<string[]>([]);
  const [auto, setAuto] = useState(false);
  const [mode, setMode] = useState<"free" | "half" | "game">("free");
  const [delay, setDelay] = useState(350); // ms entre turnos
  const [season, setSeason] = useState<number>(2025);
  const [teams, setTeams] = useState<Team[]>([]);
  const [homeTeamId, setHomeTeamId] = useState<number | "">("");
  const [awayTeamId, setAwayTeamId] = useState<number | "">("");
  const [loadingHome, setLoadingHome] = useState(false);
  const [loadingAway, setLoadingAway] = useState(false);
  const [errHome, setErrHome] = useState<string | null>(null);
  const [errAway, setErrAway] = useState<string | null>(null);

  // Rosters / abridores
  const [awayRoster, setAwayRoster] = useState<RosterPlayer[]>([]);
  const [homeRoster, setHomeRoster] = useState<RosterPlayer[]>([]);
  const [loadingRosterAway, setLoadingRosterAway] = useState(false);
  const [loadingRosterHome, setLoadingRosterHome] = useState(false);
  const [errRosterAway, setErrRosterAway] = useState<string | null>(null);
  const [errRosterHome, setErrRosterHome] = useState<string | null>(null);

  const [awayStarterId, setAwayStarterId] = useState<number | "">("");
  const [homeStarterId, setHomeStarterId] = useState<number | "">("");
  const [awayStarterERA, setAwayStarterERA] = useState<number | null>(null);
  const [awayStarterWHIP, setAwayStarterWHIP] = useState<number | null>(null);
  const [awayStarterIPOuts, setAwayStarterIPOuts] = useState<number | null>(
    null
  );
  const [homeStarterERA, setHomeStarterERA] = useState<number | null>(null);
  const [homeStarterWHIP, setHomeStarterWHIP] = useState<number | null>(null);
  const [homeStarterIPOuts, setHomeStarterIPOuts] = useState<number | null>(
    null
  );
  const [awayStarterName, setAwayStarterName] = useState<string | null>(null);
  const [homeStarterName, setHomeStarterName] = useState<string | null>(null);
  const [awayStarterLog, setAwayStarterLog] = useState<GameERIP[] | null>(null);
  const [homeStarterLog, setHomeStarterLog] = useState<GameERIP[] | null>(null);
  const [awayProbableMsg, setAwayProbableMsg] = useState<string | null>(null);
  const [homeProbableMsg, setHomeProbableMsg] = useState<string | null>(null);

  const over = gs.status.over;
  const syncRules = () => setGs((prev) => ({ ...prev, rules: { ...rules } }));

  const [mcRuns, setMcRuns] = useState(200);
  const [mcResult, setMcResult] = useState<null | {
    runs: number;
    homeWinPct: number;
    awayWinPct: number;
    tiePct: number;
    avgHomeRuns: number;
    avgAwayRuns: number;
  }>(null);

  // --- Park Factors (benefician al HOME cuando batea) ---
  const [parkRunsPF, setParkRunsPF] = useState(1.0); // 1.00 neutro (carreras)
  const [parkHRPF, setParkHRPF] = useState(1.0); // 1.00 neutro (HR)

  // --- Modelo por equipo: AVG / OBP / SLG / ERA ---
  const [avgAway, setAvgAway] = useState(0.26);
  const [obpAway, setObpAway] = useState(0.325);
  const [slgAway, setSlgAway] = useState(0.41);
  const [eraAway, setEraAway] = useState(4.2);
  const [whipAway, setWhipAway] = useState(1.3);

  const [avgHome, setAvgHome] = useState(0.255);
  const [obpHome, setObpHome] = useState(0.32);
  const [slgHome, setSlgHome] = useState(0.4);
  const [eraHome, setEraHome] = useState(3.9);
  const [whipHome, setWhipHome] = useState(1.2);

  const gsRef = useRef(gs);
  useEffect(() => {
    gsRef.current = gs;
  }, [gs]);

  // ------------------ Lineup real (Paso 3) ------------------
  const [useLineup, setUseLineup] = useState(false);

  const defaultRates = (
    h: number,
    bb: number,
    k: number,
    hr: number,
    d2: number,
    d3: number,
    hbp: number
  ): RateLine => ({ h, bb, k, hr, double: d2, triple: d3, hbp });

  function mkBatter(
    id: string,
    name: string,
    hand: Hand,
    vsR: RateLine,
    vsL?: RateLine
  ): Batter {
    return {
      id,
      name,
      hand,
      rates: { vsR, vsL: (vsL ?? vsR) as RateLine },
    } as Batter;
  }

  function mkSampleRoster(team: "HOME" | "AWAY"): Roster {
    // Base aproximado MLB por PA; variado un poco por bateador
    const baseR = defaultRates(0.245, 0.085, 0.225, 0.032, 0.045, 0.004, 0.01);
    const plus = (r: RateLine, d: Partial<RateLine>): RateLine => ({ ...r, ...d });
    const ps: Batter[] = [
      mkBatter(`${team}-1`, team === "HOME" ? "H1" : "A1", "L", plus(baseR, { bb: 0.095, h: 0.26 })),
      mkBatter(`${team}-2`, team === "HOME" ? "H2" : "A2", "R", plus(baseR, { h: 0.255, double: 0.05 })),
      mkBatter(`${team}-3`, team === "HOME" ? "H3" : "A3", "R", plus(baseR, { hr: 0.05, h: 0.25 })),
      mkBatter(`${team}-4`, team === "HOME" ? "H4" : "A4", "L", plus(baseR, { hr: 0.06, k: 0.24, h: 0.26 })),
      mkBatter(`${team}-5`, team === "HOME" ? "H5" : "A5", "R", plus(baseR, { h: 0.24, double: 0.055 })),
      mkBatter(`${team}-6`, team === "HOME" ? "H6" : "A6", "S", plus(baseR, { k: 0.2, bb: 0.09 })),
      mkBatter(`${team}-7`, team === "HOME" ? "H7" : "A7", "R", plus(baseR, { h: 0.235 })),
      mkBatter(`${team}-8`, team === "HOME" ? "H8" : "A8", "L", plus(baseR, { h: 0.225, k: 0.23 })),
      mkBatter(`${team}-9`, team === "HOME" ? "H9" : "A9", "R", plus(baseR, { h: 0.22, bb: 0.075 })),
    ];
    // Ajuste vsL levemente mejor para zurdos y peor para derechos (ejemplo simple)
    const adjVsL = (r: RateLine, handed: Hand): RateLine => {
      if (handed === "L") return plus(r, { h: (r.h ?? 0) + 0.01, k: Math.max(0, (r.k ?? 0) - 0.01) });
      if (handed === "R") return plus(r, { h: Math.max(0, (r.h ?? 0) - 0.01), k: (r.k ?? 0) + 0.01 });
      return r;
    };
    const players: Record<string, Batter> = {};
    ps.forEach((b) => {
      const vsR = b.rates.vsR;
      const vsL = adjVsL(vsR, b.hand);
      players[b.id] = { ...b, rates: { vsR, vsL } } as Batter;
    });
    const order = ps.map((b) => b.id);
    return { players, lineupVsL: order, lineupVsR: order } as Roster;
  }

  const [homeBatRoster, setHomeBatRoster] = useState<Roster>(() => mkSampleRoster("HOME"));
  const [awayBatRoster, setAwayBatRoster] = useState<Roster>(() => mkSampleRoster("AWAY"));
  const [homePitcherHand, setHomePitcherHand] = useState<Hand>("R"); // lanza en ALTAS
  const [awayPitcherHand, setAwayPitcherHand] = useState<Hand>("R"); // lanza en BAJAS
  const [idxHome, setIdxHome] = useState(0);
  const [idxAway, setIdxAway] = useState(0);

  // Anclaje por gamePk si ambos equipos comparten el prÃ³ximo juego
  const [homeGamePk, setHomeGamePk] = useState<number | null>(null);
  const [awayGamePk, setAwayGamePk] = useState<number | null>(null);
  const [anchorGamePk, setAnchorGamePk] = useState<number | null>(null);
  const [anchorInfo, setAnchorInfo] = useState<string | null>(null);

  // Lineup real: estado de carga y errores
  const [loadingLineupHome, setLoadingLineupHome] = useState(false);
  const [loadingLineupAway, setLoadingLineupAway] = useState(false);
  const [errLineupHome, setErrLineupHome] = useState<string | null>(null);
  const [errLineupAway, setErrLineupAway] = useState<string | null>(null);
  const [homeLineupInfo, setHomeLineupInfo] = useState<string | null>(null);
  const [awayLineupInfo, setAwayLineupInfo] = useState<string | null>(null);

  // Construir RateLine desde stats de bateo
  const toRateLineFromHitting = (s: PlayerHitting): RateLine => {
    const pa = Math.max(0, Number(s.pa ?? 0));
    const safe = pa > 0 ? pa : 1;
    const h = Math.max(0, Number(s.h ?? 0)) / safe;
    const hr = Math.max(0, Number(s.hr ?? 0)) / safe;
    const doubles = Math.max(0, Number(s.doubles ?? 0)) / safe;
    const triples = Math.max(0, Number(s.triples ?? 0)) / safe;
    const bb = Math.max(0, Number(s.bb ?? 0)) / safe;
    const k = Math.max(0, Number(s.so ?? 0)) / safe;
    const hbp = Math.max(0, Number(s.hbp ?? 0)) / safe;
    return { h, hr, double: doubles, triple: triples, bb, k, hbp } as RateLine;
  };

  async function loadRealLineup(which: "home" | "away") {
    const teamId = which === "home" ? homeTeamId : awayTeamId;
    if (!teamId || typeof teamId !== "number") {
      if (which === "home") setErrLineupHome("Selecciona equipo HOME");
      else setErrLineupAway("Selecciona equipo AWAY");
      return;
    }
    which === "home" ? setLoadingLineupHome(true) : setLoadingLineupAway(true);
    which === "home" ? setErrLineupHome(null) : setErrLineupAway(null);
    try {
      const info = await getNextGameLineup(teamId, { daysAhead: 10, gameType: "R" });
      if (!info.lineup.length) throw new Error("Lineup no disponible aÃºn para el prÃ³ximo juego");
      // Para cada bateador, obtener splits vs L/R
      const seasonForStats = season;
      const playerEntries = await Promise.all(
        info.lineup.map(async (b) => {
          // Intentar splits por mano del pitcher
          const [vsL, vsR] = await Promise.all([
            getPlayerHittingStats(b.id, seasonForStats, "R", "L").catch(() => ({} as PlayerHitting)),
            getPlayerHittingStats(b.id, seasonForStats, "R", "R").catch(() => ({} as PlayerHitting)),
          ]);
          const pinfo = await getPlayerInfo(b.id).catch(() => null);
          // Fallback overall si alguna split viene vacÃ­a
          let overall: PlayerHitting | null = null;
          if (!vsL.pa || !vsR.pa) {
            overall = await getPlayerHittingStats(b.id, seasonForStats, "R").catch(() => ({} as PlayerHitting));
          }
          const mk = (s: PlayerHitting | null | undefined) =>
            toRateLineFromHitting(s && s.pa ? s : overall ?? ({} as PlayerHitting));
          const rates = { vsL: mk(vsL), vsR: mk(vsR) } as BatterRates;
          const handRaw = (b.batSide as Hand) || (pinfo?.batSide as Hand) || ("R" as Hand);
          const hand: Hand = handRaw === "L" || handRaw === "R" || handRaw === "S" ? handRaw : "R";
          return { id: String(b.id), name: b.fullName, hand, rates } as Batter;
        })
      );
      const players: Record<string, Batter> = {};
      for (const p of playerEntries) players[p.id] = p;
      const orderIds = info.lineup.map((b) => String(b.id));
      const roster: Roster = {
        players,
        lineupVsL: orderIds,
        lineupVsR: orderIds,
      };
      if (which === "home") {
        setHomeBatRoster(roster);
        setHomeLineupInfo(`${info.side.toUpperCase()} vs prÃ³ximo juego ${new Date(info.gameDate).toLocaleString()}`);
      } else {
        setAwayBatRoster(roster);
        setAwayLineupInfo(`${info.side.toUpperCase()} vs prÃ³ximo juego ${new Date(info.gameDate).toLocaleString()}`);
      }
    } catch (e: any) {
      // Fallback: intentar prediccin de lineup con juegos recientes
      try {
        const pred = await predictNextGameLineup(teamId, { daysAhead: 10, recentLimit: 3, gameType: "R" });
        if (pred.lineup && pred.lineup.length) {
          const seasonForStats = season;
          const playerEntries = await Promise.all(
            pred.lineup.map(async (b) => {
              const [vsL, vsR] = await Promise.all([
                getPlayerHittingStats(b.id, seasonForStats, "R", "L").catch(() => ({} as PlayerHitting)),
                getPlayerHittingStats(b.id, seasonForStats, "R", "R").catch(() => ({} as PlayerHitting)),
              ]);
              const pinfo = await getPlayerInfo(b.id).catch(() => null);
              let overall: PlayerHitting | null = null;
              if (!vsL.pa || !vsR.pa) {
                overall = await getPlayerHittingStats(b.id, seasonForStats, "R").catch(() => ({} as PlayerHitting));
              }
              const mk = (s: PlayerHitting | null | undefined) =>
                toRateLineFromHitting(s && s.pa ? s : overall ?? ({} as PlayerHitting));
              const rates = { vsL: mk(vsL), vsR: mk(vsR) } as BatterRates;
              const handRaw = (b.batSide as Hand) || (pinfo?.batSide as Hand) || ("R" as Hand);
              const hand: Hand = handRaw === "L" || handRaw === "R" || handRaw === "S" ? handRaw : "R";
              return { id: String(b.id), name: b.fullName, hand, rates } as Batter;
            })
          );
          const players: Record<string, Batter> = {};
          for (const p of playerEntries) players[p.id] = p;
          const orderIds = pred.lineup.map((b) => String(b.id));
          const roster: Roster = {
            players,
            lineupVsL: orderIds,
            lineupVsR: orderIds,
          };
          if (which === "home") {
            setHomeBatRoster(roster);
            setHomeLineupInfo(`Predicción vs próximo juego ${new Date(pred.gameDate).toLocaleString()}`);
            setErrLineupHome("Lineup no disponible; usando Predicción basada en juegos recientes.");
          } else {
            setAwayBatRoster(roster);
            setAwayLineupInfo(`Predicción vs próximo juego ${new Date(pred.gameDate).toLocaleString()}`);
            setErrLineupAway("Lineup no disponible; usando Predicción basada en juegos recientes.");
          }
          return;
        }
      } catch {}
      const msg = e?.message ? String(e.message) : "Error al cargar lineup";
      if (which === "home") setErrLineupHome(msg);
      else setErrLineupAway(msg);
    } finally {
      which === "home" ? setLoadingLineupHome(false) : setLoadingLineupAway(false);
    }
  }

  // Carga ambos lineups anclados a un mismo gamePk y fija manos de abridores de ese juego
  async function loadAnchoredLineups(gamePk: number) {
    setAnchorGamePk(gamePk);
    setAnchorInfo(`Juego ancla: ${gamePk}`);
    setLoadingLineupHome(true);
    setLoadingLineupAway(true);
    setErrLineupHome(null);
    setErrLineupAway(null);
    try {
      const [lh, la] = await Promise.all([
        getGameLineup(gamePk, "home").catch(() => [] as any[]),
        getGameLineup(gamePk, "away").catch(() => [] as any[]),
      ]);
      let lhome = lh as any[];
      let laway = la as any[];
      let usedPredHome = false;
      let usedPredAway = false;
      const seasonForStats = season;
      // Intentar conocer teamIds para poder predecir si falta lineup
      let homeTid: number | undefined;
      let awayTid: number | undefined;
      try {
        const teams = await getGameTeams(gamePk);
        homeTid = typeof teams?.homeTeamId === "number" ? teams.homeTeamId : undefined;
        awayTid = typeof teams?.awayTeamId === "number" ? teams.awayTeamId : undefined;
      } catch {}
      // Helper to build roster from lineup list
      const buildRoster = async (arr: { id: number; fullName: string; batSide?: string }[]): Promise<Roster> => {
        const batters: Batter[] = await Promise.all(
          arr.slice(0, 9).map(async (b) => {
            const [vsL, vsR] = await Promise.all([
              getPlayerHittingStats(b.id, seasonForStats, "R", "L").catch(() => ({} as PlayerHitting)),
              getPlayerHittingStats(b.id, seasonForStats, "R", "R").catch(() => ({} as PlayerHitting)),
            ]);
            const pinfo = await getPlayerInfo(b.id).catch(() => null);
            let overall: PlayerHitting | null = null;
            if (!vsL.pa || !vsR.pa) {
              overall = await getPlayerHittingStats(b.id, seasonForStats, "R").catch(() => ({} as PlayerHitting));
            }
            const mk = (s: PlayerHitting | null | undefined) =>
              toRateLineFromHitting(s && s.pa ? s : overall ?? ({} as PlayerHitting));
            const rates = { vsL: mk(vsL), vsR: mk(vsR) } as BatterRates;
            const handRaw = (b.batSide as Hand) || (pinfo?.batSide as Hand) || ("R" as Hand);
            const hand: Hand = handRaw === "L" || handRaw === "R" || handRaw === "S" ? handRaw : "R";
            return { id: String(b.id), name: b.fullName, hand, rates } as Batter;
          })
        );
        const players: Record<string, Batter> = {};
        batters.forEach((p) => (players[p.id] = p));
        const orderIds = arr.slice(0, 9).map((b) => String(b.id));
        return { players, lineupVsL: orderIds, lineupVsR: orderIds } as Roster;
      };

      // Si no hay lineup oficial, intentar Predicción por juegos recientes
      if ((!Array.isArray(lhome) || lhome.length === 0) && typeof homeTid === "number") {
        try {
          const recent = await getRecentLineupsForTeam(homeTid, { limit: 3 });
          const pred = predictLineupFromRecent(recent);
          if (pred.length) {
            lhome = pred as any[];
            usedPredHome = true;
          }
        } catch {}
      }
      if ((!Array.isArray(laway) || laway.length === 0) && typeof awayTid === "number") {
        try {
          const recentA = await getRecentLineupsForTeam(awayTid, { limit: 3 });
          const predA = predictLineupFromRecent(recentA);
          if (predA.length) {
            laway = predA as any[];
            usedPredAway = true;
          }
        } catch {}
      }
      // HOME
      if (Array.isArray(lhome) && lhome.length > 0) {
        const homeRosterBuilt = await buildRoster(lhome);
        setHomeBatRoster(homeRosterBuilt);
        setErrLineupHome(null);
        setHomeLineupInfo(`Anclado a gamePk ${gamePk}`);
        if (usedPredHome) {
          setErrLineupHome("Lineup no disponible; usando Predicción basada en juegos recientes.");
          setHomeLineupInfo(`Predicción anclada a gamePk ${gamePk}`);
        }
      } else {
        setErrLineupHome("Lineup no disponible aÃºn para el prÃ³ximo juego (HOME)");
      }
      // AWAY
      if (Array.isArray(laway) && laway.length > 0) {
        const awayRosterBuilt = await buildRoster(laway);
        setAwayBatRoster(awayRosterBuilt);
        setErrLineupAway(null);
        setAwayLineupInfo(`Anclado a gamePk ${gamePk}`);
        if (usedPredAway) {
          setErrLineupAway("Lineup no disponible; usando Predicción basada en juegos recientes.");
          setAwayLineupInfo(`Predicción anclada a gamePk ${gamePk}`);
        }
      } else {
        setErrLineupAway("Lineup no disponible aÃºn para el prÃ³ximo juego (AWAY)");
      }

      // Probables y mano desde el mismo juego anclado
      try {
        const gp = await getGameProbables(gamePk);
        if (gp?.home?.id) {
          getPlayerInfo(gp.home.id)
            .then((pi) => {
              if (pi?.pitchHand === "L" || pi?.pitchHand === "R") setHomePitcherHand(pi.pitchHand as Hand);
            })
            .catch(() => {});
        }
        if (gp?.away?.id) {
          getPlayerInfo(gp.away.id)
            .then((pi) => {
              if (pi?.pitchHand === "L" || pi?.pitchHand === "R") setAwayPitcherHand(pi.pitchHand as Hand);
            })
            .catch(() => {});
        }
      } catch {
        // ignore; hands will remain as previously detected
      }

    } catch (e: any) {
      const msg = e?.message ? String(e.message) : "Error al cargar lineups anclados";
      setErrLineupHome(msg);
      setErrLineupAway(msg);
    } finally {
      setLoadingLineupHome(false);
      setLoadingLineupAway(false);
    }
  }

  // Cargar listado de equipos para la temporada
  useEffect(() => {
    let cancelled = false;
    getTeams(season)
      .then((ts) => {
        if (!cancelled) setTeams(ts);
      })
      .catch(() => {
        if (!cancelled) setTeams([]);
      });
    return () => {
      cancelled = true;
    };
  }, [season]);

  const loadTeamStats = useCallback(
    async (
      which: "home" | "away",
      teamId: number,
      forSeason: number = season
    ) => {
      if (which === "home") {
        setLoadingHome(true);
        setErrHome(null);
      } else {
        setLoadingAway(true);
        setErrAway(null);
      }
      try {
        const { hitting, pitching } = await getTeamSummary(
          teamId,
          forSeason,
          "R"
        );
        if (which === "home") {
          if (hitting.avg != null) setAvgHome(hitting.avg);
          if (hitting.obp != null) setObpHome(hitting.obp);
          if (hitting.slg != null) setSlgHome(hitting.slg);
          if (pitching.era != null) setEraHome(pitching.era);
          if (pitching.whip != null) setWhipHome(pitching.whip);
        } else {
          if (hitting.avg != null) setAvgAway(hitting.avg);
          if (hitting.obp != null) setObpAway(hitting.obp);
          if (hitting.slg != null) setSlgAway(hitting.slg);
          if (pitching.era != null) setEraAway(pitching.era);
          if (pitching.whip != null) setWhipAway(pitching.whip);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Error al cargar stats";
        if (which === "home") setErrHome(msg);
        else setErrAway(msg);
      } finally {
        if (which === "home") setLoadingHome(false);
        else setLoadingAway(false);
      }
    },
    [season]
  );

  const loadRoster = useCallback(
    async (
      which: "home" | "away",
      teamId: number,
      forSeason: number = season
    ) => {
      if (which === "home") {
        setLoadingRosterHome(true);
        setErrRosterHome(null);
      } else {
        setLoadingRosterAway(true);
        setErrRosterAway(null);
      }
      try {
        const roster = await getTeamRoster(teamId, forSeason);
        const byName = [...roster].sort((a, b) =>
          a.fullName.localeCompare(b.fullName)
        );
        const pitchers = byName.filter(
          (p) => (p.positionCode ?? "").toUpperCase() === "P"
        );
        const finalList = pitchers.length > 0 ? pitchers : byName; // fallback a roster completo si no hay pitchers detectados
        if (which === "home") setHomeRoster(finalList);
        else setAwayRoster(finalList);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Error al cargar roster";
        if (which === "home") setErrRosterHome(msg);
        else setErrRosterAway(msg);
      } finally {
        if (which === "home") setLoadingRosterHome(false);
        else setLoadingRosterAway(false);
      }
    },
    [season]
  );

  const loadStarterStats = useCallback(
    async (
      which: "home" | "away",
      personId: number,
      forSeason: number = season
    ) => {
      try {
        const s = await getPlayerPitchingStats(personId, forSeason, "R");
        if (which === "home") {
          setHomeStarterERA(s.era ?? null);
          setHomeStarterWHIP(s.whip ?? null);
          // outs pitched in season (for confidence weighting)
          const ipOuts = (s as any).inningsPitchedOuts as number | undefined;
          setHomeStarterIPOuts(
            typeof ipOuts === "number" && Number.isFinite(ipOuts)
              ? ipOuts
              : null
          );
        } else {
          setAwayStarterERA(s.era ?? null);
          setAwayStarterWHIP(s.whip ?? null);
          const ipOuts = (s as any).inningsPitchedOuts as number | undefined;
          setAwayStarterIPOuts(
            typeof ipOuts === "number" && Number.isFinite(ipOuts)
              ? ipOuts
              : null
          );
        }

        // Fetch game-by-game ER/IP (game log)
        try {
          const gl = await getPlayerPitchingGameLog(personId, forSeason, "R");
          const series: GameERIP[] = gl
            .filter(
              (g) => typeof g.er === "number" && typeof g.outs === "number"
            )
            .map((g) => ({ er: g.er as number, outs: g.outs as number }));
          if (which === "home")
            setHomeStarterLog(series.length ? series : null);
          else setAwayStarterLog(series.length ? series : null);
        } catch {
          if (which === "home") setHomeStarterLog(null);
          else setAwayStarterLog(null);
        }
      } catch (e) {
        if (which === "home") {
          setHomeStarterERA(null);
          setHomeStarterWHIP(null);
          setHomeStarterIPOuts(null);
          setHomeStarterLog(null);
        } else {
          setAwayStarterERA(null);
          setAwayStarterWHIP(null);
          setAwayStarterIPOuts(null);
          setAwayStarterLog(null);
        }
      }
    },
    [season]
  );

  // Refrescar stats al cambiar selecciÃ³n o temporada
  useEffect(() => {
    if (homeTeamId && typeof homeTeamId === "number") {
      loadTeamStats("home", homeTeamId, season);
      loadRoster("home", homeTeamId, season);
      // Auto-cargar lineup real HOME
      loadRealLineup("home");
      setHomeStarterId("");
      setHomeStarterERA(null);
      setHomeStarterWHIP(null);
      setHomeStarterIPOuts(null);
      setHomeProbableMsg(null);
      // Autoseleccionar probable pitcher HOME
      getNextProbablePitcher(homeTeamId, { daysAhead: 10, gameType: "R" })
        .then((pp) => {
          if (pp && typeof pp.id === "number") {
            setHomeStarterId(pp.id);
            setHomeStarterName(pp.fullName ?? null);
            setHomeGamePk(pp.gamePk ?? null);
            setAnchorInfo(null);
            loadStarterStats("home", pp.id, season);
            // Autodetectar mano del abridor HOME
            getPlayerInfo(pp.id)
              .then((pi) => {
                if (pi?.pitchHand === "L" || pi?.pitchHand === "R")
                  setHomePitcherHand(pi.pitchHand as Hand);
              })
              .catch(() => {});
            setHomeProbableMsg(null);
          } else {
            setHomeProbableMsg("Sin probable anunciado");
            setHomeGamePk(null);
          }
        })
        .catch(() => setHomeProbableMsg("No se pudo obtener probable"));
    }
  }, [homeTeamId, season, loadTeamStats, loadRoster]);

  useEffect(() => {
    if (awayTeamId && typeof awayTeamId === "number") {
      loadTeamStats("away", awayTeamId, season);
      loadRoster("away", awayTeamId, season);
      // Auto-cargar lineup real AWAY
      loadRealLineup("away");
      setAwayStarterId("");
      setAwayStarterERA(null);
      setAwayStarterWHIP(null);
      setAwayStarterIPOuts(null);
      setAwayProbableMsg(null);
      // Autoseleccionar probable pitcher AWAY
      getNextProbablePitcher(awayTeamId, { daysAhead: 10, gameType: "R" })
        .then((pp) => {
          if (pp && typeof pp.id === "number") {
            setAwayStarterId(pp.id);
            setAwayStarterName(pp.fullName ?? null);
            setAwayGamePk(pp.gamePk ?? null);
            setAnchorInfo(null);
            loadStarterStats("away", pp.id, season);
            // Autodetectar mano del abridor AWAY
            getPlayerInfo(pp.id)
              .then((pi) => {
                if (pi?.pitchHand === "L" || pi?.pitchHand === "R")
                  setAwayPitcherHand(pi.pitchHand as Hand);
              })
              .catch(() => {});
            setAwayProbableMsg(null);
          } else {
            setAwayProbableMsg("Sin probable anunciado");
            setAwayGamePk(null);
          }
        })
        .catch(() => setAwayProbableMsg("No se pudo obtener probable"));
    }
  }, [awayTeamId, season, loadTeamStats, loadRoster]);

  // Anclar automÃ¡ticamente si ambos prÃ³ximos gamePk coinciden
  useEffect(() => {
    if (
      homeGamePk != null &&
      awayGamePk != null &&
      Number.isFinite(homeGamePk) &&
      Number.isFinite(awayGamePk) &&
      homeGamePk === awayGamePk
    ) {
      if (anchorGamePk !== homeGamePk) {
        setAnchorGamePk(homeGamePk);
        setAnchorInfo(`Juego ancla: ${homeGamePk}`);
        // Cargar lineups de ambos lados para ese gamePk
        loadAnchoredLineups(homeGamePk);
      }
    }
  }, [homeGamePk, awayGamePk]);

  // Armoniza mensajes cuando se usa predicciÃ³n pero el anclaje dejÃ³ un mensaje genÃ©rico de no-disponible
  useEffect(() => {
    if (awayLineupInfo && awayLineupInfo.includes("Predicción") && errLineupAway && errLineupAway.startsWith("Lineup no disponible")) {
      setErrLineupAway("Lineup no disponible; usando Predicción basada en juegos recientes.");
    }
    if (homeLineupInfo && homeLineupInfo.includes("Predicción") && errLineupHome && errLineupHome.startsWith("Lineup no disponible")) {
      setErrLineupHome("Lineup no disponible; usando Predicción basada en juegos recientes.");
    }
  }, [awayLineupInfo, errLineupAway, homeLineupInfo, errLineupHome]);

  // Vista previa de probs para la mitad ACTUAL (solo lectura UI)
  const currentProbs = useMemo(() => {
    if (useLineup) {
      const battingTop = gs.half === "top";
      const roster = battingTop ? awayBatRoster : homeBatRoster;
      const pHand: Hand = battingTop ? homePitcherHand : awayPitcherHand;
      const idx = battingTop ? idxAway : idxHome;
      const bid = currentBatterId(roster, pHand, idx);
      if (bid) {
        const batter = roster.players[bid];
        const rate = pickRateLine(batter, pHand);
        const base = eventProbsFromRateLine(rate);
        // Ajustes: vista previa simplificada (buff neutro) + PFs
        // Buff por tendencia (reutilizamos cÃ¡lculo de abajo en computeStep)
        // Usaremos pfBuff con base en logs ya calculados en computeStep, pero aquÃ­ simplificamos a neutro (0)
        const pfBuffTop = 1; // si quisiÃ©ramos, podrÃ­amos exponer el buff actual aquÃ­
        const pfBuffBottom = 1;
        const pfParkTop = 1; // homeAdvOnly => solo aplica a BAJAS
        const pfParkBottom = parkRunsPF;
        const pfHRTop = 1;
        const pfHRBottom = parkHRPF;
        const adj = battingTop
          ? { runsPF: pfBuffTop * pfParkTop, hrPF: pfHRTop }
          : { runsPF: pfBuffBottom * pfParkBottom, hrPF: pfHRBottom };
        return adjustEventProbsWithPF(base, adj);
      }
      return { OUT: 0.7, BB: 0.08, HBP: 0.01, "1B": 0.16, "2B": 0.04, "3B": 0.005, HR: 0.005 } as const;
    }
    // Confidence-adjusted ERA for starters using innings pitched
    const IP0 = 50; // prior weight in innings for regression-to-mean
    const regressERA = (
      era: number,
      ipOuts: number | null,
      baseline: number,
      ip0: number
    ) => {
      if (typeof era !== "number" || !Number.isFinite(era)) return baseline;
      if (typeof baseline !== "number" || !Number.isFinite(baseline))
        baseline = era;
      const ip =
        typeof ipOuts === "number" && Number.isFinite(ipOuts) ? ipOuts / 3 : 0;
      const w = ip <= 0 ? 0 : ip / (ip + ip0);
      const adj = w * era + (1 - w) * baseline;
      return Number.isFinite(adj) ? adj : era;
    };
    const starterInnings = 6;
    const useHomeStarter =
      gs.half === "top" &&
      gs.inning <= starterInnings &&
      homeStarterERA != null;
    const useAwayStarter =
      gs.half === "bottom" &&
      gs.inning <= starterInnings &&
      awayStarterERA != null;
    const homeStarterERAAdj =
      useHomeStarter && homeStarterERA != null
        ? regressERA(homeStarterERA, homeStarterIPOuts, eraHome, IP0)
        : null;
    const awayStarterERAAdj =
      useAwayStarter && awayStarterERA != null
        ? regressERA(awayStarterERA, awayStarterIPOuts, eraAway, IP0)
        : null;
    const homePitchEffBase = useHomeStarter
      ? {
          ERA: (homeStarterERAAdj ?? homeStarterERA) as number,
          WHIP: homeStarterWHIP ?? undefined,
        }
      : { ERA: eraHome, WHIP: whipHome };
    const awayPitchEffBase = useAwayStarter
      ? {
          ERA: (awayStarterERAAdj ?? awayStarterERA) as number,
          WHIP: awayStarterWHIP ?? undefined,
        }
      : { ERA: eraAway, WHIP: whipAway };

    // ERA-trend buff (Holt) usando totales de temporada del abridor si hay IP
    const mkSeasonPoint = (era: number | null, ipOuts: number | null) => {
      if (era == null || !Number.isFinite(era)) return null;
      if (ipOuts == null || !Number.isFinite(ipOuts) || ipOuts <= 0)
        return null;
      const ip = ipOuts / 3;
      const er = (era * ip) / 9;
      return { er, outs: ipOuts };
    };
    const homeSeries: GameERIP[] = useHomeStarter
      ? homeStarterLog && homeStarterLog.length
        ? homeStarterLog
        : (() => {
            const p = mkSeasonPoint(homeStarterERA, homeStarterIPOuts);
            return p ? [p] : [];
          })()
      : [];
    const awaySeries: GameERIP[] = useAwayStarter
      ? awayStarterLog && awayStarterLog.length
        ? awayStarterLog
        : (() => {
            const p = mkSeasonPoint(awayStarterERA, awayStarterIPOuts);
            return p ? [p] : [];
          })()
      : [];
    const homeBuff = homeSeries.length
      ? currentBuff(homeSeries, { leagueERA: 4.3 }).buff
      : 0;
    const awayBuff = awaySeries.length
      ? currentBuff(awaySeries, { leagueERA: 4.3 }).buff
      : 0;
    const homePitchEff = useHomeStarter
      ? withBuffedPitch(homePitchEffBase, homeBuff)
      : homePitchEffBase;
    const awayPitchEff = useAwayStarter
      ? withBuffedPitch(awayPitchEffBase, awayBuff)
      : awayPitchEffBase;
    return eventProbsForHalf(
      gs.half,
      {
        bat: { AVG: avgHome, OBP: obpHome, SLG: slgHome },
        pitch: homePitchEff,
      },
      {
        bat: { AVG: avgAway, OBP: obpAway, SLG: slgAway },
        pitch: awayPitchEff,
      },
      { runsPF: parkRunsPF, hrPF: parkHRPF, homeAdvOnly: true }
    );
  }, [
    gs.half,
    gs.inning,
    useLineup,
    homeBatRoster,
    awayBatRoster,
    idxHome,
    idxAway,
    homePitcherHand,
    awayPitcherHand,
    avgHome,
    obpHome,
    slgHome,
    eraHome,
    whipHome,
    avgAway,
    obpAway,
    slgAway,
    eraAway,
    whipAway,
    homeStarterERA,
    homeStarterWHIP,
    homeStarterIPOuts,
    awayStarterERA,
    awayStarterWHIP,
    awayStarterIPOuts,
    homeStarterLog,
    awayStarterLog,
    parkRunsPF,
    parkHRPF,
  ]);

  function computeStepOnce(prev: GameState): {
    next: GameState;
    logLine: string;
  } {
    const next = structuredClone(prev) as GameState;

    const starterInnings = 6;
    const IP0 = 50;
    const regressERA = (
      era: number,
      ipOuts: number | null,
      baseline: number,
      ip0: number
    ) => {
      if (typeof era !== "number" || !Number.isFinite(era)) return baseline;
      if (typeof baseline !== "number" || !Number.isFinite(baseline))
        baseline = era;
      const ip =
        typeof ipOuts === "number" && Number.isFinite(ipOuts) ? ipOuts / 3 : 0;
      const w = ip <= 0 ? 0 : ip / (ip + ip0);
      const adj = w * era + (1 - w) * baseline;
      return Number.isFinite(adj) ? adj : era;
    };
    const useHomeStarter =
      next.half === "top" &&
      next.inning <= starterInnings &&
      homeStarterERA != null;
    const useAwayStarter =
      next.half === "bottom" &&
      next.inning <= starterInnings &&
      awayStarterERA != null;
    const homeERAAdj =
      useHomeStarter && homeStarterERA != null
        ? regressERA(homeStarterERA, homeStarterIPOuts, eraHome, IP0)
        : null;
    const awayERAAdj =
      useAwayStarter && awayStarterERA != null
        ? regressERA(awayStarterERA, awayStarterIPOuts, eraAway, IP0)
        : null;
    const homePitchEffBase = useHomeStarter
      ? {
          ERA: (homeERAAdj ?? homeStarterERA) as number,
          WHIP: homeStarterWHIP ?? undefined,
        }
      : { ERA: eraHome, WHIP: whipHome };
    const awayPitchEffBase = useAwayStarter
      ? {
          ERA: (awayERAAdj ?? awayStarterERA) as number,
          WHIP: awayStarterWHIP ?? undefined,
        }
      : { ERA: eraAway, WHIP: whipAway };

    // Buff/nerf por tendencia de ERA usando historial por juego si hay; si no, punto de temporada
    const mkSeasonPoint = (era: number | null, ipOuts: number | null) => {
      if (era == null || !Number.isFinite(era)) return null as any;
      if (ipOuts == null || !Number.isFinite(ipOuts) || ipOuts <= 0)
        return null as any;
      const ip = ipOuts / 3;
      const er = (era * ip) / 9;
      return { er, outs: ipOuts } as GameERIP;
    };
    const homeSeries2: GameERIP[] = useHomeStarter
      ? homeStarterLog && homeStarterLog.length
        ? homeStarterLog
        : (() => {
            const p = mkSeasonPoint(homeStarterERA, homeStarterIPOuts);
            return p ? [p] : [];
          })()
      : [];
    const awaySeries2: GameERIP[] = useAwayStarter
      ? awayStarterLog && awayStarterLog.length
        ? awayStarterLog
        : (() => {
            const p = mkSeasonPoint(awayStarterERA, awayStarterIPOuts);
            return p ? [p] : [];
          })()
      : [];
    const homeBuff = homeSeries2.length
      ? currentBuff(homeSeries2, { leagueERA: 4.3 }).buff
      : 0;
    const awayBuff = awaySeries2.length
      ? currentBuff(awaySeries2, { leagueERA: 4.3 }).buff
      : 0;
    const homePitchEff = useHomeStarter
      ? withBuffedPitch(homePitchEffBase, homeBuff)
      : homePitchEffBase;
    const awayPitchEff = useAwayStarter
      ? withBuffedPitch(awayPitchEffBase, awayBuff)
      : awayPitchEffBase;

    const probs = (() => {
      if (useLineup) {
        const battingTop = next.half === "top";
        const roster = battingTop ? awayBatRoster : homeBatRoster;
        const pHand: Hand = battingTop ? homePitcherHand : awayPitcherHand;
        const idx = battingTop ? idxAway : idxHome;
        const bid = currentBatterId(roster, pHand, idx);
        if (bid) {
          const batter = roster.players[bid];
          const rate = pickRateLine(batter, pHand);
          const base = eventProbsFromRateLine(rate);
          // Ajustes: buff del abridor (runsPF) + park (hrPF y runsPF en BAJAS)
          const pfBuffTop = buffToRunsPF(homeBuff);
          const pfBuffBottom = buffToRunsPF(awayBuff);
          const pfParkTop = 1; // homeAdvOnly: PF del parque solo para BAJAS
          const pfParkBottom = parkRunsPF;
          const pfHRTop = 1;
          const pfHRBottom = parkHRPF;
          const adj = battingTop
            ? { runsPF: pfBuffTop * pfParkTop, hrPF: pfHRTop }
            : { runsPF: pfBuffBottom * pfParkBottom, hrPF: pfHRBottom };
          return adjustEventProbsWithPF(base, adj);
        }
        // fallback neutro
        return { OUT: 0.7, BB: 0.08, HBP: 0.01, "1B": 0.16, "2B": 0.04, "3B": 0.005, HR: 0.005 } as const;
      }
      return eventProbsForHalf(
        next.half,
        {
          bat: { AVG: avgHome, OBP: obpHome, SLG: slgHome },
          pitch: homePitchEff,
        },
        {
          bat: { AVG: avgAway, OBP: obpAway, SLG: slgAway },
          pitch: awayPitchEff,
        },
        { runsPF: parkRunsPF, hrPF: parkHRPF, homeAdvOnly: true }
      );
    })();

    const ev = rollEventFromProbs(probs);
    const before = structuredClone(prev) as GameState;
    const desc = applyEvent(next, ev);
    const after = next;
    const logLine = narratePlay(before, desc, after);
    // Avanzar Ã­ndice de lineup del lado que bateÃ³
    if (useLineup) {
      const battingTop = prev.half === "top";
      if (battingTop) setIdxAway((i) => i + 1);
      else setIdxHome((i) => i + 1);
    }

    return { next, logLine };
  }

  // ------------------ Acciones ------------------
  function stepOnce() {
    if (gsRef.current.status.over) return;
    const { next, logLine } = computeStepOnce(gsRef.current);
    next.rules = { ...rules };
    setGs(next); // âœ… solo setea estado
    setLog((l) => [logLine, ...l].slice(0, 120)); // âœ… log fuera del updater
  }

  function resetGame() {
    setGs({ ...initialState, rules: { ...rules } });
    setLog([]);
    setAuto(false);
  }

  // ------------------ Auto-simulaciÃ³n ------------------
  useEffect(() => {
    if (!auto || gs.status.over) return;

    const id = setInterval(() => {
      if (gsRef.current.status.over) {
        setAuto(false);
        return;
      }

      const beforeHalf = gsRef.current.half;
      const beforeInning = gsRef.current.inning;

      const { next, logLine } = computeStepOnce(gsRef.current);
      next.rules = { ...rules };

      setGs(next);
      gsRef.current = next; // âœ… avanzamos la ref inmediatamente
      setLog((l) => [logLine, ...l].slice(0, 120));

      if (
        mode === "half" &&
        (next.half !== beforeHalf || next.inning !== beforeInning)
      ) {
        setAuto(false);
      }
      if (mode === "game" && next.status.over) {
        setAuto(false);
      }
    }, Math.max(50, delay));

    return () => clearInterval(id);
  }, [
    auto,
    delay,
    mode,
    rules,
    gs.status.over,
    useLineup,
    avgHome,
    obpHome,
    slgHome,
    eraHome,
    whipHome,
    avgAway,
    obpAway,
    slgAway,
    eraAway,
    whipAway,
  ]);

  // ------------------ Render ------------------
  return (
    <main className="main">
      <div className="container grid">
        {/* IZQ: marcador */}
        <section style={{ display: "grid", gap: 24 }}>
          <h1 className="h-hero">Simulador de Béisbol</h1>

          <div className="card scoreboard">
            <header>
              <h2 className="h1">Baseball Simulator</h2>
              <p className="muted">
                Inning {gs.inning} Â· {gs.half === "top" ? "Alta" : "Baja"} Â·
                Outs: {gs.outs} Â· Al bate:{" "}
                <strong>{gs.half === "top" ? "Away" : "Home"}</strong>
              </p>
              <p className="muted">
                {(() => {
                  const starterInnings = 6;
                  const isTop = gs.half === "top";
                  const teamLbl = isTop ? "Home" : "Away";
                  const useStarter = isTop
                    ? gs.inning <= starterInnings && homeStarterERA != null
                    : gs.inning <= starterInnings && awayStarterERA != null;
                  // compute adjusted ERA for starters for display too
                  const IP0 = 50;
                  const regressERA = (
                    era: number,
                    ipOuts: number | null,
                    baseline: number,
                    ip0: number
                  ) => {
                    if (typeof era !== "number" || !Number.isFinite(era))
                      return baseline;
                    if (
                      typeof baseline !== "number" ||
                      !Number.isFinite(baseline)
                    )
                      baseline = era;
                    const ip =
                      typeof ipOuts === "number" && Number.isFinite(ipOuts)
                        ? ipOuts / 3
                        : 0;
                    const w = ip <= 0 ? 0 : ip / (ip + ip0);
                    const adj = w * era + (1 - w) * baseline;
                    return Number.isFinite(adj) ? adj : era;
                  };
                  const era = isTop
                    ? useStarter
                      ? regressERA(
                          homeStarterERA as number,
                          homeStarterIPOuts,
                          eraHome,
                          IP0
                        )
                      : eraHome
                    : useStarter
                    ? regressERA(
                        awayStarterERA as number,
                        awayStarterIPOuts,
                        eraAway,
                        IP0
                      )
                    : eraAway;
                  const whip = isTop
                    ? useStarter
                      ? homeStarterWHIP
                      : whipHome
                    : useStarter
                    ? awayStarterWHIP
                    : whipAway;
                  const name = isTop
                    ? homeRoster.find((p) => p.id === homeStarterId)?.fullName
                    : awayRoster.find((p) => p.id === awayStarterId)?.fullName;
                  const who = useStarter
                    ? `Abridor${name ? `: ${name}` : ""}`
                    : "Equipo";
                  const eraTxt =
                    era == null
                      ? "â€”"
                      : typeof era === "number"
                      ? era.toFixed(2)
                      : String(era);
                  const whipTxt =
                    whip == null
                      ? "â€”"
                      : typeof whip === "number"
                      ? whip.toFixed(2)
                      : String(whip);
                  return `Pitcheo vigente: ${teamLbl} Â· ${who} Â· ERA ${eraTxt} / WHIP ${whipTxt}`;
                })()}
              </p>
            </header>

            {/* Pizarra: Away arriba, Home abajo */}
            <Row name="Away" value={gs.scoreAway} />
            <Row name="Home" value={gs.scoreHome} />

            <div>
              <h3 className="h2">Bases</h3>
              <Diamond bases={gs.bases} />
            </div>

            {/* Controles */}
            <div style={{ display: "grid", gap: 10 }}>
              {/** Lineup real: toggle y manos de pitchers + lineup actual */}
              <div className="card" style={{ padding: 12 }}>
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
                        const battingTop = gs.half === "top";
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
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="button"
                  onClick={() => stepOnce()}
                  disabled={over}
                >
                  Turno al bate
                </button>

                <button className="button secondary" onClick={resetGame}>
                  Reiniciar
                </button>

                <button
                  className="button"
                  onClick={() => setAuto((a) => !a)}
                  disabled={over}
                  style={{
                    background: auto ? "var(--accent-2)" : "var(--accent)",
                  }}
                >
                  {auto ? "Pausar" : "Auto (Play)"}
                </button>
              </div>

              <div className="card" style={{ padding: 12 }}>
                <div className="field">
                  <label>
                    <strong>Modo auto-simulaciÃ³n</strong>
                  </label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as typeof mode)}
                  >
                    <option value="free">Libre (turnos continuos)</option>
                    <option value="half">Completar mitad (alta/baja)</option>
                    <option value="game">Jugar hasta el final</option>
                  </select>
                </div>

                <div className="field">
                  <label>
                    <strong>Velocidad: {delay} ms/turno</strong>
                  </label>
                  <input
                    type="range"
                    min={80}
                    max={1500}
                    step={10}
                    value={delay}
                    onChange={(e) => setDelay(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            {over && (
              <div className="card" style={{ marginTop: 12 }}>
                <strong>Final del juego:</strong>{" "}
                {gs.status.winner === "tie"
                  ? "Empate"
                  : gs.status.winner === "home"
                  ? "Gana Home"
                  : "Gana Away"}
                {gs.status.reason ? ` â€” ${reasonLabel[gs.status.reason]}` : ""}
              </div>
            )}
          </div>
          {/* Tarjetas: Tendencia ERA de abridores (debajo del scoreboard) */}
          <div style={{ display: "grid", gap: 12 }}>
            <EraTrendCard
              title={`Tendencia ERA abridor AWAY${
                awayStarterName ? ` â€“ ${awayStarterName}` : ""
              }`}
              seasonEra={awayStarterERA}
              seasonIPOuts={awayStarterIPOuts}
              teamEra={eraAway}
              series={awayStarterLog}
            />
            <EraTrendCard
              title={`Tendencia ERA abridor HOME${
                homeStarterName ? ` â€“ ${homeStarterName}` : ""
              }`}
              seasonEra={homeStarterERA}
              seasonIPOuts={homeStarterIPOuts}
              teamEra={eraHome}
              series={homeStarterLog}
            />
          </div>
        </section>

        {/* DER: reglas + modelo + log */}
        <aside className="panel">
          {/* Log */}
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

          {/* Reglas */}
          <div className="card">
            <h3 className="h2">Reglas del juego</h3>

            <Field
              label={`Entradas reglamentarias: ${rules.regulationInnings}`}
            >
              <input
                type="range"
                min={3}
                max={12}
                value={rules.regulationInnings}
                onChange={(e) =>
                  setRules({ ...rules, regulationInnings: +e.target.value })
                }
                onMouseUp={syncRules}
                onTouchEnd={syncRules}
              />
            </Field>

            <Toggle
              label="Walk-off activo"
              checked={rules.walkoff}
              onChange={(v) => {
                setRules({ ...rules, walkoff: v });
                syncRules();
              }}
            />

            <Toggle
              label="Entradas extra"
              checked={rules.enableExtraInnings}
              onChange={(v) => {
                setRules({ ...rules, enableExtraInnings: v });
                syncRules();
              }}
            />

            <Toggle
              label="Base running estocástico"
              checked={(rules as any).stochasticBaseRunning ?? true}
              onChange={(v) => {
                setRules({
                  ...(rules as any),
                  stochasticBaseRunning: v,
                } as Rules);
                syncRules();
              }}
            />

            <Toggle
              label="Permitir empates"
              checked={rules.allowTies}
              onChange={(v) => {
                setRules({ ...rules, allowTies: v });
                syncRules();
              }}
            />

            <Field
              label={`LÃ­mite de entradas extra: ${rules.maxInnings ?? ""}`}
            >
              <input
                type="number"
                min={rules.regulationInnings}
                placeholder="vacÃ­o = sin lÃ­mite"
                value={rules.maxInnings ?? ""}
                onChange={(e) => {
                  const v =
                    e.target.value === ""
                      ? null
                      : Math.max(+e.target.value, rules.regulationInnings);
                  setRules({ ...rules, maxInnings: v });
                }}
                onBlur={syncRules}
              />
            </Field>

            <hr style={{ opacity: 0.15, margin: "12px 0" }} />

            <Field
              label={`Mercy rule (diferencia): ${rules.mercyDiff ?? ""}`}
            >
              <input
                type="number"
                min={1}
                placeholder="vacÃ­o = off"
                value={rules.mercyDiff ?? ""}
                onChange={(e) => {
                  const v =
                    e.target.value === ""
                      ? undefined
                      : Math.max(1, +e.target.value);
                  setRules({ ...rules, mercyDiff: v });
                }}
                onBlur={syncRules}
              />
            </Field>

            <Field
              label={`Mercy rule (a partir de la entrada): ${
                rules.mercyInning ?? ""
              }`}
            >
              <input
                type="number"
                min={1}
                placeholder="vacÃ­o = off"
                value={rules.mercyInning ?? ""}
                onChange={(e) => {
                  const v =
                    e.target.value === ""
                      ? undefined
                      : Math.max(1, +e.target.value);
                  setRules({ ...rules, mercyInning: v });
                }}
                onBlur={syncRules}
              />
            </Field>
          </div>

          {/* Modelo AVG + ERA + OBP + SLG + por equipo */}
          <div className="card">
            <h3 className="h2">
              Modelo por equipo (AVG Â· OBP Â· SLG Â· ERA - WHIP)
            </h3>

            {/* MLB: Selectores de equipos y temporada */}
            <div className="field">
              <label>
                <strong>Temporada MLB</strong>
              </label>
              <input
                type="number"
                min={2015}
                max={2099}
                value={season}
                onChange={(e) => setSeason(Number(e.target.value) || season)}
              />
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div className="field">
                <label>
                  <strong>AWAY â€¢ Equipo MLB</strong>
                </label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 8,
                  }}
                >
                  <select
                    value={awayTeamId}
                    onChange={(e) => {
                      const v =
                        e.target.value === "" ? "" : Number(e.target.value);
                      setAwayTeamId(v);
                      if (v !== "" && !Number.isNaN(v as number)) {
                        loadTeamStats("away", v as number);
                        loadRoster("away", v as number);
                      }
                    }}
                  >
                    <option value="">â€” Seleccionar equipo (AWAY) â€”</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.abbreviation ? `${t.abbreviation} â€” ` : ""}
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="button secondary"
                    disabled={loadingAway || !awayTeamId}
                    onClick={() =>
                      typeof awayTeamId === "number" &&
                      (loadTeamStats("away", awayTeamId),
                      loadRoster("away", awayTeamId))
                    }
                  >
                    {loadingAway ? "Cargandoâ€¦" : "Cargar"}
                  </button>
                </div>
                {errAway && <div className="muted">{errAway}</div>}
                {awayTeamId && (
                  <div style={{ marginTop: 8 }}>
                    <label>
                      <strong>Abridor AWAY (6 entradas)</strong>
                    </label>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: 8,
                      }}
                    >
                      <select
                        value={awayStarterId}
                        onChange={(e) => {
                          const v =
                            e.target.value === "" ? "" : Number(e.target.value);
                          setAwayStarterId(v);
                          if (v !== "" && !Number.isNaN(v as number)) {
                            loadStarterStats("away", v as number);
                            const found = awayRoster.find(
                              (p) => p.id === (v as number)
                            );
                            setAwayStarterName(found?.fullName ?? null);
                          } else {
                            setAwayStarterERA(null);
                            setAwayStarterWHIP(null);
                            setAwayStarterIPOuts(null);
                            setAwayStarterName(null);
                          }
                        }}
                      >
                        <option value="">- Seleccionar pitcher (AWAY) -</option>
                        {awayRoster.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.fullName}
                            {p.primaryNumber ? ` #${p.primaryNumber}` : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        className="button secondary"
                        disabled={loadingRosterAway || !awayTeamId}
                        onClick={() =>
                          typeof awayTeamId === "number" &&
                          loadRoster("away", awayTeamId)
                        }
                      >
                        {loadingRosterAway ? "Cargandoï¿½?ï¿½" : "Refrescar roster"}
                      </button>
                    </div>
                    {(errRosterAway && (
                      <div className="muted">{errRosterAway}</div>
                    )) || (
                      <div className="muted" style={{ marginTop: 4 }}>
                        {awayStarterId !== "" ? (
                          (() => {
                            const IP0 = 50;
                            const regressERA = (
                              era: number,
                              ipOuts: number | null,
                              baseline: number,
                              ip0: number
                            ) => {
                              if (
                                typeof era !== "number" ||
                                !Number.isFinite(era)
                              )
                                return baseline;
                              if (
                                typeof baseline !== "number" ||
                                !Number.isFinite(baseline)
                              )
                                baseline = era;
                              const ip =
                                typeof ipOuts === "number" &&
                                Number.isFinite(ipOuts)
                                  ? ipOuts / 3
                                  : 0;
                              const w = ip <= 0 ? 0 : ip / (ip + ip0);
                              const adj = w * era + (1 - w) * baseline;
                              return Number.isFinite(adj) ? adj : era;
                            };
                            const raw = awayStarterERA ?? undefined;
                            const adj =
                              raw != null
                                ? regressERA(
                                    raw,
                                    awayStarterIPOuts,
                                    eraAway,
                                    IP0
                                  )
                                : undefined;
                            const ip =
                              typeof awayStarterIPOuts === "number"
                                ? awayStarterIPOuts / 3
                                : undefined;
                            const conf =
                              ip != null
                                ? Math.round((ip / (ip + IP0)) * 100)
                                : undefined;
                            const name =
                              awayRoster.find((p) => p.id === awayStarterId)
                                ?.fullName ?? "";
                            return (
                              <>
                                Abridor: {name} Â· 1â€“6: ERA {raw ?? ""}
                                {raw != null && adj != null
                                  ? ` (ajustada ${adj.toFixed(2)}${
                                      conf != null ? ", conf " + conf + "%" : ""
                                    })`
                                  : ""}
                                {"  Â·  "}
                                WHIP {awayStarterWHIP ?? ""}
                                {"  Â·  "}
                                7+: ERA {eraAway.toFixed(2)} / WHIP{" "}
                                {whipAway.toFixed(2)}
                              </>
                            );
                          })()
                        ) : (
                          <>
                            Sin abridor seleccionado Â· Usa ERA/WHIP del equipo
                            todo el juego
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {awayStarterId === "" && awayProbableMsg && (
                  <div className="muted" style={{ marginTop: 4 }}>
                    {awayProbableMsg}
                  </div>
                )}
                {awayStarterName && (
                  <div className="muted" style={{ marginTop: 4 }}>
                    Seleccionado: {awayStarterName}
                  </div>
                )}
              </div>

              <div className="field">
                <label>
                  <strong>HOME â€¢ Equipo MLB</strong>
                </label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 8,
                  }}
                >
                  <select
                    value={homeTeamId}
                    onChange={(e) => {
                      const v =
                        e.target.value === "" ? "" : Number(e.target.value);
                      setHomeTeamId(v);
                      if (v !== "" && !Number.isNaN(v as number)) {
                        loadTeamStats("home", v as number);
                        loadRoster("home", v as number);
                      }
                    }}
                  >
                    <option value="">â€” Seleccionar equipo (HOME) â€”</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.abbreviation ? `${t.abbreviation} â€” ` : ""}
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="button secondary"
                    disabled={loadingHome || !homeTeamId}
                    onClick={() =>
                      typeof homeTeamId === "number" &&
                      (loadTeamStats("home", homeTeamId),
                      loadRoster("home", homeTeamId))
                    }
                  >
                    {loadingHome ? "Cargandoâ€¦" : "Cargar"}
                  </button>
                </div>
                {errHome && <div className="muted">{errHome}</div>}
                {homeTeamId && (
                  <div style={{ marginTop: 8 }}>
                    <label>
                      <strong>Abridor HOME (6 entradas)</strong>
                    </label>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: 8,
                      }}
                    >
                      <select
                        value={homeStarterId}
                        onChange={(e) => {
                          const v =
                            e.target.value === "" ? "" : Number(e.target.value);
                          setHomeStarterId(v);
                          if (v !== "" && !Number.isNaN(v as number)) {
                            loadStarterStats("home", v as number);
                            const found = homeRoster.find(
                              (p) => p.id === (v as number)
                            );
                            setHomeStarterName(found?.fullName ?? null);
                          } else {
                            setHomeStarterERA(null);
                            setHomeStarterWHIP(null);
                            setHomeStarterIPOuts(null);
                            setHomeStarterName(null);
                          }
                        }}
                      >
                        <option value="">- Seleccionar pitcher (HOME) -</option>
                        {homeRoster.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.fullName}
                            {p.primaryNumber ? ` #${p.primaryNumber}` : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        className="button secondary"
                        disabled={loadingRosterHome || !homeTeamId}
                        onClick={() =>
                          typeof homeTeamId === "number" &&
                          loadRoster("home", homeTeamId)
                        }
                      >
                        {loadingRosterHome ? "Cargandoï¿½?ï¿½" : "Refrescar roster"}
                      </button>
                    </div>
                    {(errRosterHome && (
                      <div className="muted">{errRosterHome}</div>
                    )) || (
                      <div className="muted" style={{ marginTop: 4 }}>
                        {homeStarterId !== "" ? (
                          (() => {
                            const IP0 = 50;
                            const regressERA = (
                              era: number,
                              ipOuts: number | null,
                              baseline: number,
                              ip0: number
                            ) => {
                              if (
                                typeof era !== "number" ||
                                !Number.isFinite(era)
                              )
                                return baseline;
                              if (
                                typeof baseline !== "number" ||
                                !Number.isFinite(baseline)
                              )
                                baseline = era;
                              const ip =
                                typeof ipOuts === "number" &&
                                Number.isFinite(ipOuts)
                                  ? ipOuts / 3
                                  : 0;
                              const w = ip <= 0 ? 0 : ip / (ip + ip0);
                              const adj = w * era + (1 - w) * baseline;
                              return Number.isFinite(adj) ? adj : era;
                            };
                            const raw = homeStarterERA ?? undefined;
                            const adj =
                              raw != null
                                ? regressERA(
                                    raw,
                                    homeStarterIPOuts,
                                    eraHome,
                                    IP0
                                  )
                                : undefined;
                            const ip =
                              typeof homeStarterIPOuts === "number"
                                ? homeStarterIPOuts / 3
                                : undefined;
                            const conf =
                              ip != null
                                ? Math.round((ip / (ip + IP0)) * 100)
                                : undefined;
                            const name =
                              homeRoster.find((p) => p.id === homeStarterId)
                                ?.fullName ?? "";
                            return (
                              <>
                                Abridor: {name} Â· 1â€“6: ERA {raw ?? ""}
                                {raw != null && adj != null
                                  ? ` (ajustada ${adj.toFixed(2)}${
                                      conf != null ? ", conf " + conf + "%" : ""
                                    })`
                                  : ""}
                                {"  Â·  "}
                                WHIP {homeStarterWHIP ?? ""}
                                {"  Â·  "}
                                7+: ERA {eraHome.toFixed(2)} / WHIP{" "}
                                {whipHome.toFixed(2)}
                              </>
                            );
                          })()
                        ) : (
                          <>
                            Sin abridor seleccionado Â· Usa ERA/WHIP del equipo
                            todo el juego
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {homeStarterId === "" && homeProbableMsg && (
                  <div className="muted" style={{ marginTop: 4 }}>
                    {homeProbableMsg}
                  </div>
                )}
                {homeStarterName && (
                  <div className="muted" style={{ marginTop: 4 }}>
                    Seleccionado: {homeStarterName}
                  </div>
                )}
              </div>
            </div>

            {/* Park Factors â€” aplican para ambos equipos */}
            <div className="field">
              <label>
                <strong>Park Factors (Runs / HR)</strong>
              </label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                <div>
                  <div className="muted" style={{ fontSize: ".9em" }}>
                    Runs PF (0.80â€“1.20): {parkRunsPF.toFixed(2)}
                  </div>
                  <SteppedNumber
                    value={parkRunsPF}
                    onChange={setParkRunsPF}
                    min={0.8}
                    max={1.2}
                    step={0.01}
                    decimals={2}
                    ariaLabel="Runs Park Factor"
                  />
                </div>
                <div>
                  <div className="muted" style={{ fontSize: ".9em" }}>
                    HR PF (0.80â€“1.20): {parkHRPF.toFixed(2)}
                  </div>
                  <SteppedNumber
                    value={parkHRPF}
                    onChange={setParkHRPF}
                    min={0.8}
                    max={1.2}
                    step={0.01}
                    decimals={2}
                    ariaLabel="HR Park Factor"
                  />
                </div>
              </div>
            </div>

            {/* AWAY (ALTA) */}
            <Field label={`AWAY Â· AVG (0.150â€“0.400): ${avgAway.toFixed(3)}`}>
              <SteppedNumber
                value={avgAway}
                onChange={setAvgAway}
                min={0.15}
                max={0.4}
                step={0.001}
                decimals={3}
                ariaLabel="AVG Away"
              />
            </Field>
            <Field label={`AWAY Â· OBP (0.250â€“0.500): ${obpAway.toFixed(3)}`}>
              <SteppedNumber
                value={obpAway}
                onChange={setObpAway}
                min={0.25}
                max={0.5}
                step={0.001}
                decimals={3}
                ariaLabel="OBP Away"
              />
            </Field>
            <Field label={`AWAY Â· SLG (0.300â€“0.700): ${slgAway.toFixed(3)}`}>
              <SteppedNumber
                value={slgAway}
                onChange={setSlgAway}
                min={0.3}
                max={0.7}
                step={0.001}
                decimals={3}
                ariaLabel="SLG Away"
              />
            </Field>
            <Field label={`AWAY Â· ERA (1.00â€“8.00): ${eraAway.toFixed(2)}`}>
              <SteppedNumber
                value={eraAway}
                onChange={setEraAway}
                min={1.0}
                max={8.0}
                step={0.01}
                decimals={2}
                ariaLabel="ERA Away"
              />
            </Field>
            <Field label={`AWAY Â· WHIP (0.80â€“1.80): ${whipAway.toFixed(2)}`}>
              <SteppedNumber
                value={whipAway}
                onChange={setWhipAway}
                min={0.8}
                max={1.8}
                step={0.01}
                decimals={2}
                ariaLabel="WHIP Away"
              />
            </Field>

            <hr style={{ opacity: 0.15, margin: "12px 0" }} />

            {/* HOME (BAJA) */}
            <Field label={`HOME Â· AVG (0.150â€“0.400): ${avgHome.toFixed(3)}`}>
              <SteppedNumber
                value={avgHome}
                onChange={setAvgHome}
                min={0.15}
                max={0.4}
                step={0.001}
                decimals={3}
                ariaLabel="AVG Home"
              />
            </Field>
            <Field label={`HOME Â· OBP (0.250â€“0.500): ${obpHome.toFixed(3)}`}>
              <SteppedNumber
                value={obpHome}
                onChange={setObpHome}
                min={0.25}
                max={0.5}
                step={0.001}
                decimals={3}
                ariaLabel="OBP Home"
              />
            </Field>
            <Field label={`HOME Â· SLG (0.300â€“0.700): ${slgHome.toFixed(3)}`}>
              <SteppedNumber
                value={slgHome}
                onChange={setSlgHome}
                min={0.3}
                max={0.7}
                step={0.001}
                decimals={3}
                ariaLabel="SLG Home"
              />
            </Field>
            <Field label={`HOME Â· ERA (1.00â€“8.00): ${eraHome.toFixed(2)}`}>
              <SteppedNumber
                value={eraHome}
                onChange={setEraHome}
                min={1.0}
                max={8.0}
                step={0.01}
                decimals={2}
                ariaLabel="ERA Home"
              />
            </Field>
            <Field label={`HOME Â· WHIP (0.80â€“1.80): ${whipHome.toFixed(2)}`}>
              <SteppedNumber
                value={whipHome}
                onChange={setWhipHome}
                min={0.8}
                max={1.8}
                step={0.01}
                decimals={2}
                ariaLabel="WHIP Home"
              />
            </Field>

            {/* Vista de probabilidades de la mitad actual */}
            <details>
              <summary className="muted">
                Ver probabilidades del bateador actual
              </summary>
              <div className="muted" style={{ marginTop: 8 }}>
                <div>OUT: {currentProbs.OUT.toFixed(3)}</div>
                <div>1B: {currentProbs["1B"].toFixed(3)}</div>
                <div>2B: {currentProbs["2B"].toFixed(3)}</div>
                <div>3B: {currentProbs["3B"].toFixed(3)}</div>
                <div>HR: {currentProbs.HR.toFixed(3)}</div>
                <div>
                  Reach% (H+BB aprox): {(1 - currentProbs.OUT).toFixed(3)}
                </div>
                <div>BB: {currentProbs.BB.toFixed(3)}</div>
                <div>HBP: {currentProbs.HBP.toFixed(3)}</div>
              </div>
            </details>
          </div>

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
            <button
              className="button"
              onClick={() => {
                if (useLineup) {
                  // Monte Carlo por lineup con los mismos ajustes (buff + parque)
                  const mkSeries = (
                    era: number | null,
                    ipOuts: number | null,
                    log: GameERIP[] | null
                  ): GameERIP[] | null => {
                    if (log && log.length) return log;
                    if (
                      ipOuts != null &&
                      Number.isFinite(ipOuts) &&
                      ipOuts > 0 &&
                      Number.isFinite(era as number)
                    ) {
                      return [
                        { er: ((era as number) * (ipOuts / 3)) / 9, outs: ipOuts },
                      ];
                    }
                    return null;
                  };
                  const seriesHome = mkSeries(
                    homeStarterERA,
                    homeStarterIPOuts,
                    homeStarterLog
                  );
                  const seriesAway = mkSeries(
                    awayStarterERA,
                    awayStarterIPOuts,
                    awayStarterLog
                  );
                  const buffHome = seriesHome
                    ? currentBuff(seriesHome, { leagueERA: 4.3 }).buff
                    : 0;
                  const buffAway = seriesAway
                    ? currentBuff(seriesAway, { leagueERA: 4.3 }).buff
                    : 0;
                  const pfBuffTop = buffToRunsPF(buffHome); // ALTAS: pitcher HOME
                  const pfBuffBottom = buffToRunsPF(buffAway); // BAJAS: pitcher AWAY
                  const adjustTop = { runsPF: pfBuffTop, hrPF: 1 };
                  const adjustBottom = {
                    runsPF: pfBuffBottom * parkRunsPF,
                    hrPF: parkHRPF,
                  };
                  const res = monteCarloLineup(
                    homeBatRoster,
                    awayBatRoster,
                    mcRuns,
                    { homePitcher: homePitcherHand, awayPitcher: awayPitcherHand },
                    rules,
                    adjustTop,
                    adjustBottom
                  );
                  setMcResult(res);
                } else {
                  // Monte Carlo por equipo (AVG/OBP/SLG + ERA), pero manteniendo buff de abridores
                  const IP0 = 50;
                  const mkSeries = (
                    era: number | null,
                    ipOuts: number | null,
                    log: GameERIP[] | null
                  ): GameERIP[] | null => {
                    if (log && log.length) return log;
                    if (
                      ipOuts != null &&
                      Number.isFinite(ipOuts) &&
                      ipOuts > 0 &&
                      Number.isFinite(era as number)
                    ) {
                      return [
                        { er: ((era as number) * (ipOuts / 3)) / 9, outs: ipOuts },
                      ];
                    }
                    return null;
                  };
                  const seriesHome = mkSeries(
                    homeStarterERA,
                    homeStarterIPOuts,
                    homeStarterLog
                  );
                  const seriesAway = mkSeries(
                    awayStarterERA,
                    awayStarterIPOuts,
                    awayStarterLog
                  );
                  const res = monteCarlo(
                    {
                      bat: { AVG: avgHome, OBP: obpHome, SLG: slgHome },
                      pitch: { ERA: eraHome, WHIP: whipHome },
                    },
                    {
                      bat: { AVG: avgAway, OBP: obpAway, SLG: slgAway },
                      pitch: { ERA: eraAway, WHIP: whipAway },
                    },
                    mcRuns,
                    rules,
                    {
                      starterHome: (() => {
                        if (homeStarterERA == null) return undefined;
                        const ip =
                          typeof homeStarterIPOuts === "number" &&
                          Number.isFinite(homeStarterIPOuts)
                            ? homeStarterIPOuts / 3
                            : 0;
                        const w = ip <= 0 ? 0 : ip / (ip + IP0);
                        const adj = w * (homeStarterERA as number) + (1 - w) * eraHome;
                        const base = {
                          ERA: Number.isFinite(adj) ? adj : (homeStarterERA as number),
                          WHIP: homeStarterWHIP ?? undefined,
                        };
                        const seriesH: GameERIP[] | null = seriesHome;
                        const buff =
                          seriesH && seriesH.length
                            ? currentBuff(seriesH, { leagueERA: 4.3 }).buff
                            : 0;
                        return withBuffedPitch(base, buff);
                      })(),
                      starterAway: (() => {
                        if (awayStarterERA == null) return undefined;
                        const ip =
                          typeof awayStarterIPOuts === "number" &&
                          Number.isFinite(awayStarterIPOuts)
                            ? awayStarterIPOuts / 3
                            : 0;
                        const w = ip <= 0 ? 0 : ip / (ip + IP0);
                        const adj = w * (awayStarterERA as number) + (1 - w) * eraAway;
                        const base = {
                          ERA: Number.isFinite(adj) ? adj : (awayStarterERA as number),
                          WHIP: awayStarterWHIP ?? undefined,
                        };
                        const seriesA: GameERIP[] | null = seriesAway;
                        const buff =
                          seriesA && seriesA.length
                            ? currentBuff(seriesA, { leagueERA: 4.3 }).buff
                            : 0;
                        return withBuffedPitch(base, buff);
                      })(),
                      starterInnings: 6,
                      park: { runsPF: parkRunsPF, hrPF: parkHRPF },
                    }
                  );
                  setMcResult(res);
                }
              }}
            >
              Correr Monte Carlo
            </button>

            {mcResult && (
              <div className="muted" style={{ marginTop: 8 }}>
                {(() => {
                  const homeTeam =
                    typeof homeTeamId === "number"
                      ? teams.find((t) => t.id === homeTeamId)
                      : undefined;
                  const awayTeam =
                    typeof awayTeamId === "number"
                      ? teams.find((t) => t.id === awayTeamId)
                      : undefined;
                  const homeLbl = homeTeam
                    ? homeTeam.abbreviation
                      ? `${homeTeam.abbreviation} â€“ ${homeTeam.name}`
                      : homeTeam.name
                    : "(HOME manual)";
                  const awayLbl = awayTeam
                    ? awayTeam.abbreviation
                      ? `${awayTeam.abbreviation} â€“ ${awayTeam.name}`
                      : awayTeam.name
                    : "(AWAY manual)";
                  return (
                    <div style={{ marginBottom: 6 }}>
                      <div>
                        <strong>Home:</strong> {homeLbl}
                      </div>
                      <div>
                        <strong>Away:</strong> {awayLbl}
                      </div>
                    </div>
                  );
                })()}
                <div>Home win%: {(mcResult.homeWinPct * 100).toFixed(1)}%</div>
                <div>Away win%: {(mcResult.awayWinPct * 100).toFixed(1)}%</div>
                {rules.allowTies && (
                  <div>Tie%: {(mcResult.tiePct * 100).toFixed(1)}%</div>
                )}
                <div>
                  Promedio carreras (Home): {mcResult.avgHomeRuns.toFixed(2)}
                </div>
                <div>
                  Promedio carreras (Away): {mcResult.avgAwayRuns.toFixed(2)}
                </div>
                <div>
                  Promedio total por juego (R/G combinado):{" "}
                  {(mcResult.avgHomeRuns + mcResult.avgAwayRuns).toFixed(2)}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}





/* function EraTrendCard_OLD({
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
  // Fallback a un solo punto de temporada si no hay game log
  const mkSeasonPoint = (
    era: number | null,
    ipOuts: number | null
  ): GameERIP | null => {
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

  // Construye serie filtrada con computeEraBuff
  const buff = computeEraBuff(data, { leagueERA: 4.3 });
  const pts = buff.series;

  return (
    <div className="card" style={{ padding: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
        }}
      >
        <h3 className="h2" style={{ margin: 0 }}>
          {title}
        </h3>
        {buff.latest && (
          <div className="muted" style={{ fontSize: ".9em" }}>
            Nivel (Holt): {buff.latest.level.toFixed(2)} Â· Tendencia:{" "}
            {buff.latest.trend.toFixed(2)} Â· Buff: {buff.latest.buff.toFixed(3)}
          </div>
        )}
      </div>
      {pts.length >= 1 ? (
        <MiniLineChart
          height={140}
          series={[
            {
              name: "ERA acumulado",
              values: pts.map(
                (p) =>
                  p.eraCum ?? pts.find((q) => q.eraCum != null)?.eraCum ?? 4.3
              ),
              color: "#9aa4b0",
            },
            {
              name: "Nivel (Holt)",
              values: pts.map((p) => p.level),
              color: "var(--accent)",
            },
          ]}
          yLabel="ERA"
        />
      ) : (
        <div className="muted">Sin datos del abridor.</div>
      )}
      <div className="muted" style={{ marginTop: 6, fontSize: ".9em" }}>
        Referencia del equipo (ERA):{" "}
        {Number.isFinite(teamEra) ? teamEra.toFixed(2) : "â€“"}
      </div>
    </div>
  );
}



*/
function narratePlay(
  before: GameState,
  evDesc: string,
  after: GameState
): string {
  // Inning/mitad antes de la jugada
  const inningTxt = `${before.inning}Âª ${
    before.half === "top" ? "Alta" : "Baja"
  }`;
  const team = before.half === "top" ? "Away" : "Home";

  // Detectar cambio de mitad
  const halfChanged =
    before.half !== after.half || before.inning !== after.inning;

  // Outs mostrados (corrige el 3er out sin depender del texto)
  let outsShown = after.outs;
  if (halfChanged) {
    outsShown = 3;
  }
  const outsTxt = `${outsShown} ${outsShown === 1 ? "out" : "outs"}`;

  // Bases despuÃ©s de la jugada
  const b = after.bases;
  const basesTxt =
    b.first || b.second || b.third
      ? [b.first && "1B", b.second && "2B", b.third && "3B"]
          .filter(Boolean)
          .join(", ")
      : "bases vacÃ­as";

  // Marcador
  const scoreTxt = `Home ${after.scoreHome} â€“ Away ${after.scoreAway}`;

  // Texto base
  let line = `${inningTxt}: ${team} al bate. ${evDesc}. ${outsTxt}, ${basesTxt}, marcador ${scoreTxt}.`;

  // AÃ±adir nota de cambio de mitad
  if (halfChanged) {
    const nextInningTxt = `${after.inning}Âª ${
      after.half === "top" ? "Alta" : "Baja"
    }`;
    line += ` Cambio de mitad: ${nextInningTxt}.`;
  }

  // DetecciÃ³n de walk-off (Home gana en baja)
  if (
    after.status.over &&
    after.status.winner === "home" &&
    before.half === "bottom"
  ) {
    line += " Â¡Walk-off! Se acaba el juego.";
  }

  return line;
}

/* UI helpers */




/* cleaned legacy inline component removed */




