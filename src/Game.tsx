import { useEffect, useMemo, useState, useRef, useCallback } from "react";
// UI helpers now used via panels
import { LogPanel } from "./components/LogPanel";
import { RulesPanel } from "./components/RulesPanel";
import { EraTrendsPanel } from "./components/EraTrendsPanel";
import { TeamModelPanel } from "./components/TeamModelPanel";
import { MonteCarloPanel } from "./components/MonteCarloPanel";
import { LineupPanel } from "./components/LineupPanel";
import { ScoreboardPanel } from "./components/ScoreboardPanel";
import { GameControls } from "./components/GameControls";
import { StartersCard } from "./components/StartersCard";
import {
  applyEvent,
  initialState,
  DEFAULT_RULES,
  rollEventFromProbs,
  eventProbsForHalf,
  adjustEventProbsWithPF,
  monteCarlo,
  monteCarloLineup,
  type GameState,
  type Rules,
  type Hand,
  type RateLine,
  type Batter,
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
import { type Team, type RosterPlayer } from "./services/mlb";
import {
  useTeams,
  useTeamSummary,
  useRoster as useTeamRosterHook,
  useProbable as useProbableHook,
  useNextGameLineup as useNextGameLineupHook,
  useAnchoredLineups as useAnchoredLineupsHook,
  usePitcherStats as usePitcherStatsHook,
} from "./hooks/mlb";

// (reasonLabel removido: no se usa en UI)

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
  // Rosters / abridores
  const [awayRoster, setAwayRoster] = useState<RosterPlayer[]>([]);
  const [homeRoster, setHomeRoster] = useState<RosterPlayer[]>([]);
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

  // const over = gs.status.over; // no se usa directamente
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

  // Hooks: equipos
  const teamsState = useTeams(season);
  useEffect(() => {
    if (Array.isArray(teamsState.data)) setTeams(teamsState.data);
  }, [teamsState.data]);

  const homeTeam = useMemo(
    () =>
      typeof homeTeamId === "number"
        ? teams.find((t) => t.id === homeTeamId)
        : undefined,
    [homeTeamId, teams]
  );
  const awayTeam = useMemo(
    () =>
      typeof awayTeamId === "number"
        ? teams.find((t) => t.id === awayTeamId)
        : undefined,
    [awayTeamId, teams]
  );

  // Hooks: resumen de equipo (stats)
  const homeSummaryState = useTeamSummary(
    typeof homeTeamId === "number" ? homeTeamId : undefined,
    season
  );
  const awaySummaryState = useTeamSummary(
    typeof awayTeamId === "number" ? awayTeamId : undefined,
    season
  );
  useEffect(() => {
    const s = homeSummaryState.data;
    if (s) {
      if (s.hitting.avg != null) setAvgHome(s.hitting.avg);
      if (s.hitting.obp != null) setObpHome(s.hitting.obp);
      if (s.hitting.slg != null) setSlgHome(s.hitting.slg);
      if (s.pitching.era != null) setEraHome(s.pitching.era);
      if (s.pitching.whip != null) setWhipHome(s.pitching.whip);
    }
  }, [homeSummaryState.data]);
  useEffect(() => {
    const s = awaySummaryState.data;
    if (s) {
      if (s.hitting.avg != null) setAvgAway(s.hitting.avg);
      if (s.hitting.obp != null) setObpAway(s.hitting.obp);
      if (s.hitting.slg != null) setSlgAway(s.hitting.slg);
      if (s.pitching.era != null) setEraAway(s.pitching.era);
      if (s.pitching.whip != null) setWhipAway(s.pitching.whip);
    }
  }, [awaySummaryState.data]);

  // Hooks: roster
  const homeRosterState = useTeamRosterHook(
    typeof homeTeamId === "number" ? homeTeamId : undefined,
    season
  );
  const awayRosterState = useTeamRosterHook(
    typeof awayTeamId === "number" ? awayTeamId : undefined,
    season
  );
  useEffect(() => {
    const r = homeRosterState.data;
    if (Array.isArray(r)) {
      const byName = [...r].sort((a, b) =>
        a.fullName.localeCompare(b.fullName)
      );
      const pitchers = byName.filter(
        (p) => (p.positionCode ?? "").toUpperCase() === "P"
      );
      setHomeRoster(pitchers.length ? pitchers : byName);
    }
  }, [homeRosterState.data]);
  useEffect(() => {
    const r = awayRosterState.data;
    if (Array.isArray(r)) {
      const byName = [...r].sort((a, b) =>
        a.fullName.localeCompare(b.fullName)
      );
      const pitchers = byName.filter(
        (p) => (p.positionCode ?? "").toUpperCase() === "P"
      );
      setAwayRoster(pitchers.length ? pitchers : byName);
    }
  }, [awayRosterState.data]);

  // Hooks: probables (auto)
  const homeProbableState = useProbableHook(
    typeof homeTeamId === "number" ? homeTeamId : undefined,
    { daysAhead: 10, gameType: "R" }
  );
  const awayProbableState = useProbableHook(
    typeof awayTeamId === "number" ? awayTeamId : undefined,
    { daysAhead: 10, gameType: "R" }
  );
  const homePitcherStatsState = usePitcherStatsHook(
    typeof homeStarterId === "number" ? homeStarterId : undefined,
    season,
    { gameType: "R" }
  );
  const awayPitcherStatsState = usePitcherStatsHook(
    typeof awayStarterId === "number" ? awayStarterId : undefined,
    season,
    { gameType: "R" }
  );
  useEffect(() => {
    if (homeProbableState.error)
      setHomeProbableMsg("No se pudo obtener probable");
    const p = homeProbableState.data;
    if (p) {
      setHomeStarterId(p.id);
      setHomeStarterName(p.fullName ?? null);
      setHomeGamePk(p.gamePk ?? null);
      setAnchorInfo(null);
      if (homeProbableState.hand === "L" || homeProbableState.hand === "R")
        setHomePitcherHand(homeProbableState.hand);
      setHomeProbableMsg(null);
      loadStarterStats("home", p.id, season);
    } else if (!homeProbableState.loading && typeof homeTeamId === "number") {
      setHomeProbableMsg("Sin probable anunciado");
      setHomeGamePk(null);
    }
  }, [
    homeProbableState.data,
    homeProbableState.loading,
    homeProbableState.error,
    homeProbableState.hand,
    season,
  ]);
  useEffect(() => {
    if (awayProbableState.error)
      setAwayProbableMsg("No se pudo obtener probable");
    const p = awayProbableState.data;
    if (p) {
      setAwayStarterId(p.id);
      setAwayStarterName(p.fullName ?? null);
      setAwayGamePk(p.gamePk ?? null);
      setAnchorInfo(null);
      if (awayProbableState.hand === "L" || awayProbableState.hand === "R")
        setAwayPitcherHand(awayProbableState.hand);
      setAwayProbableMsg(null);
      loadStarterStats("away", p.id, season);
    } else if (!awayProbableState.loading && typeof awayTeamId === "number") {
      setAwayProbableMsg("Sin probable anunciado");
      setAwayGamePk(null);
    }
  }, [
    awayProbableState.data,
    awayProbableState.loading,
    awayProbableState.error,
    awayProbableState.hand,
    season,
  ]);
  useEffect(() => {
    const data = homePitcherStatsState.data;
    if (!data) {
      setHomeStarterERA(null);
      setHomeStarterWHIP(null);
      setHomeStarterIPOuts(null);
      setHomeStarterLog(null);
      return;
    }
    const stats = data.season;
    setHomeStarterERA(stats?.era ?? null);
    setHomeStarterWHIP(stats?.whip ?? null);
    setHomeStarterIPOuts(stats?.inningsPitchedOuts ?? null);
    const log = data.gameLog && data.gameLog.length ? data.gameLog : null;
    setHomeStarterLog(log);
  }, [homePitcherStatsState.data]);
  useEffect(() => {
    const data = awayPitcherStatsState.data;
    if (!data) {
      setAwayStarterERA(null);
      setAwayStarterWHIP(null);
      setAwayStarterIPOuts(null);
      setAwayStarterLog(null);
      return;
    }
    const stats = data.season;
    setAwayStarterERA(stats?.era ?? null);
    setAwayStarterWHIP(stats?.whip ?? null);
    setAwayStarterIPOuts(stats?.inningsPitchedOuts ?? null);
    const log = data.gameLog && data.gameLog.length ? data.gameLog : null;
    setAwayStarterLog(log);
  }, [awayPitcherStatsState.data]);

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
    const plus = (r: RateLine, d: Partial<RateLine>): RateLine => ({
      ...r,
      ...d,
    });
    const ps: Batter[] = [
      mkBatter(
        `${team}-1`,
        team === "HOME" ? "H1" : "A1",
        "L",
        plus(baseR, { bb: 0.095, h: 0.26 })
      ),
      mkBatter(
        `${team}-2`,
        team === "HOME" ? "H2" : "A2",
        "R",
        plus(baseR, { h: 0.255, double: 0.05 })
      ),
      mkBatter(
        `${team}-3`,
        team === "HOME" ? "H3" : "A3",
        "R",
        plus(baseR, { hr: 0.05, h: 0.25 })
      ),
      mkBatter(
        `${team}-4`,
        team === "HOME" ? "H4" : "A4",
        "L",
        plus(baseR, { hr: 0.06, k: 0.24, h: 0.26 })
      ),
      mkBatter(
        `${team}-5`,
        team === "HOME" ? "H5" : "A5",
        "R",
        plus(baseR, { h: 0.24, double: 0.055 })
      ),
      mkBatter(
        `${team}-6`,
        team === "HOME" ? "H6" : "A6",
        "S",
        plus(baseR, { k: 0.2, bb: 0.09 })
      ),
      mkBatter(
        `${team}-7`,
        team === "HOME" ? "H7" : "A7",
        "R",
        plus(baseR, { h: 0.235 })
      ),
      mkBatter(
        `${team}-8`,
        team === "HOME" ? "H8" : "A8",
        "L",
        plus(baseR, { h: 0.225, k: 0.23 })
      ),
      mkBatter(
        `${team}-9`,
        team === "HOME" ? "H9" : "A9",
        "R",
        plus(baseR, { h: 0.22, bb: 0.075 })
      ),
    ];
    // Ajuste vsL levemente mejor para zurdos y peor para derechos (ejemplo simple)
    const adjVsL = (r: RateLine, handed: Hand): RateLine => {
      if (handed === "L")
        return plus(r, {
          h: (r.h ?? 0) + 0.01,
          k: Math.max(0, (r.k ?? 0) - 0.01),
        });
      if (handed === "R")
        return plus(r, {
          h: Math.max(0, (r.h ?? 0) - 0.01),
          k: (r.k ?? 0) + 0.01,
        });
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

  const [homeBatRoster, setHomeBatRoster] = useState<Roster>(() =>
    mkSampleRoster("HOME")
  );
  const [awayBatRoster, setAwayBatRoster] = useState<Roster>(() =>
    mkSampleRoster("AWAY")
  );
  const [homePitcherHand, setHomePitcherHand] = useState<Hand>("R"); // lanza en ALTAS
  const [awayPitcherHand, setAwayPitcherHand] = useState<Hand>("R"); // lanza en BAJAS
  const [idxHome, setIdxHome] = useState(0);
  const [idxAway, setIdxAway] = useState(0);

  // Anclaje por gamePk si ambos equipos comparten el próximo juego
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

  // Hooks de lineups (próximo juego y anclado)
  const homeNextLineupState = useNextGameLineupHook(
    typeof homeTeamId === "number" ? homeTeamId : undefined,
    season
  );
  const awayNextLineupState = useNextGameLineupHook(
    typeof awayTeamId === "number" ? awayTeamId : undefined,
    season
  );
  const anchoredState = useAnchoredLineupsHook(anchorGamePk, season);

  // (legacy) toRateLineFromHitting eliminado: los hooks construyen los rosters

  async function loadRealLineup(which: "home" | "away") {
    const st = which === "home" ? homeNextLineupState : awayNextLineupState;
    const teamId = which === "home" ? homeTeamId : awayTeamId;
    if (!teamId || typeof teamId !== "number") {
      if (which === "home") setErrLineupHome("Selecciona equipo HOME");
      else setErrLineupAway("Selecciona equipo AWAY");
      return;
    }
    if (st?.error) {
      if (which === "home") setErrLineupHome(st.error);
      else setErrLineupAway(st.error);
      return;
    }
    if (st?.data) {
      const infoTxt = (
        (st.predicted ? "Predicción" : "") +
        " vs próximo juego " +
        new Date(st.data.gameDate).toLocaleString()
      ).trim();
      if (which === "home") {
        setHomeBatRoster(st.data.roster);
        setIdxHome(0);
        setHomeLineupInfo(infoTxt);
        setErrLineupHome(
          st.predicted
            ? "Lineup no disponible; usando predicción basada en juegos recientes."
            : null
        );
        setHomeGamePk(st.data.gamePk ?? null);
      } else {
        setAwayBatRoster(st.data.roster);
        setIdxAway(0);
        setAwayLineupInfo(infoTxt);
        setErrLineupAway(
          st.predicted
            ? "Lineup no disponible; usando predicción basada en juegos recientes."
            : null
        );
        setAwayGamePk(st.data.gamePk ?? null);
      }
      return;
    }
    const msg = "Lineup no disponible aún para el próximo juego";
    if (which === "home") setErrLineupHome(msg);
    else setErrLineupAway(msg);
  }
  async function loadAnchoredLineups(gamePk: number) {
    // Hook-first: fijar ancla y delegar a useAnchoredLineups
    setAnchorGamePk(gamePk);
    setAnchorInfo(`Juego ancla: ${gamePk}`);
    setErrLineupHome(null);
    setErrLineupAway(null);
  }
  // Cargar listado de equipos para la temporada (integrado arriba con hook)

  const loadTeamStats = useCallback(
    async (which: "home" | "away", _teamId?: number) => {
      if (which === "home") {
        homeSummaryState.refresh();
      } else {
        awaySummaryState.refresh();
      }
    },
    [homeSummaryState.refresh, awaySummaryState.refresh]
  );

  const loadRoster = useCallback(
    async (which: "home" | "away", _teamId?: number) => {
      if (which === "home") {
        homeRosterState.refresh();
      } else {
        awayRosterState.refresh();
      }
    },
    [homeRosterState.refresh, awayRosterState.refresh]
  );

  const loadStarterStats = useCallback(
    async (
      which: "home" | "away",
      personId: number,
      _forSeason: number = season
    ) => {
      const roster = which === "home" ? homeRoster : awayRoster;
      const player = roster.find((p) => p.id === personId);
      if (!player) return;
      if (which === "home") {
        setHomeStarterName(player.fullName ?? null);
      } else {
        setAwayStarterName(player.fullName ?? null);
      }
    },
    [awayRoster, homeRoster, season]
  );

  useEffect(() => {
    if (typeof homeStarterId !== "number") {
      setHomeStarterName(null);
    }
  }, [homeStarterId]);
  useEffect(() => {
    if (typeof awayStarterId !== "number") {
      setAwayStarterName(null);
    }
  }, [awayStarterId]);
  // Refrescar stats al cambiar selección o temporada.
  useEffect(() => {
    if (homeTeamId && typeof homeTeamId === "number") {
      // Reset: los hooks de summary/roster/probable se encargan del fetch
      setHomeStarterId("");
      setHomeStarterERA(null);
      setHomeStarterWHIP(null);
      setHomeStarterIPOuts(null);
      setHomeProbableMsg(null);
    }
  }, [homeTeamId, season]);

  useEffect(() => {
    if (awayTeamId && typeof awayTeamId === "number") {
      setAwayStarterId("");
      setAwayStarterERA(null);
      setAwayStarterWHIP(null);
      setAwayStarterIPOuts(null);
      setAwayProbableMsg(null);
    }
  }, [awayTeamId, season]);

  // Anclar automáticamente si ambos próximos gamePk coinciden.
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

  // Armoniza mensajes cuando se usa predicción, pero el anclaje deja un mensaje genérico de no-disponible.
  useEffect(() => {
    if (
      awayLineupInfo &&
      awayLineupInfo.includes("Predicción") &&
      errLineupAway &&
      errLineupAway.startsWith("Lineup no disponible")
    ) {
      setErrLineupAway(
        "Lineup no disponible; usando predicción basada en juegos recientes."
      );
    }
    if (
      homeLineupInfo &&
      homeLineupInfo.includes("Predicción") &&
      errLineupHome &&
      errLineupHome.startsWith("Lineup no disponible")
    ) {
      setErrLineupHome(
        "Lineup no disponible; usando predicción basada en juegos recientes."
      );
    }
  }, [awayLineupInfo, errLineupAway, homeLineupInfo, errLineupHome]);

  // Aplicar lineup del próximo juego (si no hay anclaje).
  useEffect(() => {
    if (anchorGamePk) return;
    const st = homeNextLineupState;
    if (st?.data) {
      setHomeBatRoster(st.data.roster);
      setIdxHome(0);
      setHomeLineupInfo(
        (
          (st.predicted ? "Predicción" : "") +
          " vs próximo juego " +
          new Date(st.data.gameDate).toLocaleString()
        ).trim()
      );
      setErrLineupHome(
        st.predicted
          ? "Lineup no disponible; usando predicción basada en juegos recientes."
          : null
      );
      setHomeGamePk(st.data.gamePk ?? null);
    }
  }, [homeNextLineupState.data, homeNextLineupState.predicted, anchorGamePk]);

  useEffect(() => {
    if (anchorGamePk) return;
    const st = awayNextLineupState;
    if (st?.data) {
      setAwayBatRoster(st.data.roster);
      setIdxAway(0);
      setAwayLineupInfo(
        (
          (st.predicted ? "Predicción" : "") +
          " vs próximo juego " +
          new Date(st.data.gameDate).toLocaleString()
        ).trim()
      );
      setErrLineupAway(
        st.predicted
          ? "Lineup no disponible; usando predicción basada en juegos recientes."
          : null
      );
      setAwayGamePk(st.data.gamePk ?? null);
    }
  }, [awayNextLineupState.data, awayNextLineupState.predicted, anchorGamePk]);

  // Loading flags cuando no hay anclaje (para botones)
  useEffect(() => {
    if (!anchorGamePk) setLoadingLineupHome(!!homeNextLineupState.loading);
  }, [homeNextLineupState.loading, anchorGamePk]);
  useEffect(() => {
    if (!anchorGamePk) setLoadingLineupAway(!!awayNextLineupState.loading);
  }, [awayNextLineupState.loading, anchorGamePk]);

  // Aplicar resultados de lineups anclados
  useEffect(() => {
    if (!anchorGamePk) return;
    setLoadingLineupHome(!!anchoredState.loading);
    setLoadingLineupAway(!!anchoredState.loading);
    const d = anchoredState.data;
    if (d) {
      if (d.home?.roster) {
        setHomeBatRoster(d.home.roster);
        setIdxHome(0);
        setHomeLineupInfo(d.home.info ?? `Anclado a gamePk ${anchorGamePk}`);
        setErrLineupHome(
          d.home.predicted
            ? "Lineup no disponible; usando predicción basada en juegos recientes."
            : null
        );
      } else {
        setErrLineupHome(
          "Lineup no disponible aún; usando predicción para el próximo juego (HOME)"
        );
      }
      if (d.away?.roster) {
        setAwayBatRoster(d.away.roster);
        setIdxAway(0);
        setAwayLineupInfo(d.away.info ?? `Anclado a gamePk ${anchorGamePk}`);
        setErrLineupAway(
          d.away.predicted
            ? "Lineup no disponible; usando predicción basada en juegos recientes."
            : null
        );
      } else {
        setErrLineupAway(
          "Lineup no disponible aún para el próximo juego (AWAY)"
        );
      }
      if (d.hands?.home) setHomePitcherHand(d.hands.home);
      if (d.hands?.away) setAwayPitcherHand(d.hands.away);
    }
    if (anchoredState.error) {
      setErrLineupHome(anchoredState.error);
      setErrLineupAway(anchoredState.error);
    }
  }, [
    anchoredState.data,
    anchoredState.loading,
    anchoredState.error,
    anchorGamePk,
  ]);
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
        // Buff por tendencia (reutilizamos cálculo de abajo en computeStep)
        // Usaremos pfBuff con base en logs ya calculados en computeStep, pero aquí simplificamos a neutro (0).
        const pfBuffTop = 1; // si quisiéramos, podríamos exponer el buff actual aquí.
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
      return {
        OUT: 0.7,
        BB: 0.08,
        HBP: 0.01,
        "1B": 0.16,
        "2B": 0.04,
        "3B": 0.005,
        HR: 0.005,
      } as const;
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
        return {
          OUT: 0.7,
          BB: 0.08,
          HBP: 0.01,
          "1B": 0.16,
          "2B": 0.04,
          "3B": 0.005,
          HR: 0.005,
        } as const;
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
    // Avanzar automï¿½ticamente mientras no termine el juego
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
    setGs(next);
    setLog((l) => [logLine, ...l].slice(0, 120));
  }

  function resetGame() {
    const nextState = { ...initialState, rules: { ...rules } };
    setGs(nextState);
    gsRef.current = nextState;
    setLog([]);
    setAuto(false);
    setIdxHome(0);
    setIdxAway(0);
  }

  const startAuto = useCallback(
    (nextMode: "free" | "half" | "game") => {
      setMode(nextMode);
      setAuto(true);
    },
    [setMode, setAuto]
  );

  const handleAutoFree = useCallback(() => startAuto("free"), [startAuto]);
  const handleAutoHalf = useCallback(() => startAuto("half"), [startAuto]);
  const handleAutoGame = useCallback(() => startAuto("game"), [startAuto]);
  const handleStopAuto = useCallback(() => setAuto(false), [setAuto]);
  const handleDelayChange = useCallback(
    (value: number) => {
      setDelay(value);
    },
    [setDelay]
  );

  const handleRunMonteCarlo = useCallback(() => {
    try {
      if (useLineup) {
        const mkSeasonPoint = (
          era: number | null,
          ipOuts: number | null
        ) => {
          if (era == null || !Number.isFinite(era)) return null as any;
          if (
            ipOuts == null ||
            !Number.isFinite(ipOuts) ||
            ipOuts <= 0
          )
            return null as any;
          const ip = ipOuts / 3;
          const er = (era * ip) / 9;
          return { er, outs: ipOuts } as GameERIP;
        };
        const homeSeries =
          homeStarterLog && homeStarterLog.length
            ? homeStarterLog
            : (() => {
                const p = mkSeasonPoint(
                  homeStarterERA,
                  homeStarterIPOuts
                );
                return p ? [p] : [];
              })();
        const awaySeries =
          awayStarterLog && awayStarterLog.length
            ? awayStarterLog
            : (() => {
                const p = mkSeasonPoint(
                  awayStarterERA,
                  awayStarterIPOuts
                );
                return p ? [p] : [];
              })();
        const homeBuff = homeSeries.length
          ? currentBuff(homeSeries, { leagueERA: 4.3 }).buff
          : 0;
        const awayBuff = awaySeries.length
          ? currentBuff(awaySeries, { leagueERA: 4.3 }).buff
          : 0;
        const adjustTop = {
          runsPF: buffToRunsPF(homeBuff) * 1,
          hrPF: 1,
        };
        const adjustBottom = {
          runsPF: buffToRunsPF(awayBuff) * parkRunsPF,
          hrPF: parkHRPF,
        };
        const hands = {
          homePitcher: homePitcherHand,
          awayPitcher: awayPitcherHand,
        } as const;
        const r = monteCarloLineup(
          homeBatRoster,
          awayBatRoster,
          mcRuns,
          hands,
          rules,
          adjustTop,
          adjustBottom
        );
        setMcResult({
          runs: r.runs,
          homeWinPct: r.homeWinPct,
          awayWinPct: r.awayWinPct,
          tiePct: r.tiePct,
          avgHomeRuns: r.avgHomeRuns,
          avgAwayRuns: r.avgAwayRuns,
        });
      } else {
        const IP0 = 50;
        const regressERA = (
          era: number | null,
          ipOuts: number | null,
          baseline: number,
          ip0: number
        ) => {
          if (era == null || !Number.isFinite(era)) return baseline;
          const ip =
            typeof ipOuts === "number" && Number.isFinite(ipOuts)
              ? ipOuts / 3
              : 0;
          const w = ip <= 0 ? 0 : ip / (ip + ip0);
          const adj = w * (era as number) + (1 - w) * baseline;
          return Number.isFinite(adj) ? adj : baseline;
        };
        const starterHome =
          homeStarterERA != null
            ? {
                ERA: regressERA(
                  homeStarterERA,
                  homeStarterIPOuts,
                  eraHome,
                  IP0
                ),
                WHIP: homeStarterWHIP ?? undefined,
              }
            : undefined;
        const starterAway =
          awayStarterERA != null
            ? {
                ERA: regressERA(
                  awayStarterERA,
                  awayStarterIPOuts,
                  eraAway,
                  IP0
                ),
                WHIP: awayStarterWHIP ?? undefined,
              }
            : undefined;
        const mkSeasonPoint2 = (
          era: number | null,
          ipOuts: number | null
        ) => {
          if (era == null || !Number.isFinite(era)) return null as any;
          if (
            ipOuts == null ||
            !Number.isFinite(ipOuts) ||
            ipOuts <= 0
          )
            return null as any;
          const ip = ipOuts / 3;
          const er = (era * ip) / 9;
          return { er, outs: ipOuts } as GameERIP;
        };
        const homeSeries =
          homeStarterLog && homeStarterLog.length
            ? homeStarterLog
            : (() => {
                const p = mkSeasonPoint2(
                  homeStarterERA,
                  homeStarterIPOuts
                );
                return p ? [p] : [];
              })();
        const awaySeries =
          awayStarterLog && awayStarterLog.length
            ? awayStarterLog
            : (() => {
                const p = mkSeasonPoint2(
                  awayStarterERA,
                  awayStarterIPOuts
                );
                return p ? [p] : [];
              })();
        const homeBuff = starterHome
          ? homeSeries.length
            ? currentBuff(homeSeries, { leagueERA: 4.3 }).buff
            : 0
          : 0;
        const awayBuff = starterAway
          ? awaySeries.length
            ? currentBuff(awaySeries, { leagueERA: 4.3 }).buff
            : 0
          : 0;
        const starters = {
          starterInnings: 6,
          starterHome: starterHome
            ? withBuffedPitch(starterHome, homeBuff)
            : undefined,
          starterAway: starterAway
            ? withBuffedPitch(starterAway, awayBuff)
            : undefined,
          park: {
            runsPF: parkRunsPF,
            hrPF: parkHRPF,
            homeAdvOnly: true,
          },
        } as const;
        const r = monteCarlo(
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
          starters
        );
        setMcResult({
          runs: r.runs,
          homeWinPct: r.homeWinPct,
          awayWinPct: r.awayWinPct,
          tiePct: r.tiePct,
          avgHomeRuns: r.avgHomeRuns,
          avgAwayRuns: r.avgAwayRuns,
        });
      }
    } catch (e) {
      console.error(e);
    }
  }, [
    useLineup,
    homeStarterLog,
    awayStarterLog,
    homeStarterERA,
    homeStarterIPOuts,
    homeStarterWHIP,
    awayStarterERA,
    awayStarterIPOuts,
    awayStarterWHIP,
    parkRunsPF,
    parkHRPF,
    homePitcherHand,
    awayPitcherHand,
    homeBatRoster,
    awayBatRoster,
    mcRuns,
    rules,
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

  // ------------------ Auto-simulaciï¿½n ------------------
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
      gsRef.current = next; //   avanzamos la ref inmediatamente
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

  // ------------------ Helpers (UI strings) ------------------
  const battingTeamName =
    gs.half === "top"
      ? awayTeam?.name ?? "Away"
      : homeTeam?.name ?? "Home";
  const statusLine = `Inning ${gs.inning} - ${
    gs.half === "top" ? "Alta" : "Baja"
  } - Outs: ${gs.outs} - Al bate: ${battingTeamName}`;
  const pitchLine = (() => {
    const starterInnings = 6;
    const isTop = gs.half === "top";
    const teamLbl = isTop
      ? homeTeam?.name ?? "Home"
      : awayTeam?.name ?? "Away";
    const useStarter = isTop
      ? gs.inning <= starterInnings && homeStarterERA != null
      : gs.inning <= starterInnings && awayStarterERA != null;
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
    const era = isTop
      ? useStarter
        ? regressERA(homeStarterERA as number, homeStarterIPOuts, eraHome, IP0)
        : eraHome
      : useStarter
      ? regressERA(awayStarterERA as number, awayStarterIPOuts, eraAway, IP0)
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
    const who = useStarter ? `Abridor${name ? `: ${name}` : ""}` : "Equipo";
    const eraTxt =
      era == null
        ? "-"
        : typeof era === "number"
        ? era.toFixed(2)
        : String(era);
    const whipTxt =
      whip == null
        ? "-"
        : typeof whip === "number"
        ? whip.toFixed(2)
        : String(whip);
    return `Pitcheo vigente: ${teamLbl} - ${who} - ERA ${eraTxt} / WHIP ${whipTxt}`;
  })();

  const teamModelStats = useMemo(() => {
    const formatValue = (value: number | null | undefined, digits: number) => {
      if (typeof value !== "number" || !Number.isFinite(value)) return "-";
      return value.toFixed(digits);
    };

    const entries = [
      {
        key: "AVG",
        label: "AVG",
        min: 0.15,
        max: 0.4,
        digits: 3,
        awayValue: avgAway,
        homeValue: avgHome,
      },
      {
        key: "OBP",
        label: "OBP",
        min: 0.25,
        max: 0.5,
        digits: 3,
        awayValue: obpAway,
        homeValue: obpHome,
      },
      {
        key: "SLG",
        label: "SLG",
        min: 0.3,
        max: 0.7,
        digits: 3,
        awayValue: slgAway,
        homeValue: slgHome,
      },
      {
        key: "ERA",
        label: "ERA",
        min: 1,
        max: 8,
        digits: 2,
        awayValue: eraAway,
        homeValue: eraHome,
      },
      {
        key: "WHIP",
        label: "WHIP",
        min: 0.8,
        max: 1.8,
        digits: 2,
        awayValue: whipAway,
        homeValue: whipHome,
      },
    ] as const;

    return entries.map(({ key, label, min, max, digits, awayValue, homeValue }) => ({
      key,
      label,
      rangeText: `${min.toFixed(digits)} - ${max.toFixed(digits)}`,
      away: formatValue(awayValue, digits),
      home: formatValue(homeValue, digits),
    }));
  }, [
    avgAway,
    avgHome,
    obpAway,
    obpHome,
    slgAway,
    slgHome,
    eraAway,
    eraHome,
    whipAway,
    whipHome,
  ]);


  // ------------------ Render ------------------
  return (
    <main className="main">
      <div className="container grid">
        {/* IZQ: marcador */}
        <section style={{ display: "grid", gap: 24 }}>
          <h1 className="h-hero">Simulador de Béisbol</h1>

          <ScoreboardPanel
            statusLine={statusLine}
            pitchLine={pitchLine}
            awayScore={gs.scoreAway}
            homeScore={gs.scoreHome}
            bases={gs.bases}
            awayLabel={awayTeam?.name ?? "Away"}
            homeLabel={homeTeam?.name ?? "Home"}
          >
            <div style={{ display: "grid", gap: 8 }}>
              <GameControls
                auto={auto}
                onStep={stepOnce}
                onAutoFree={handleAutoFree}
                onAutoHalf={handleAutoHalf}
                onAutoGame={handleAutoGame}
                onStopAuto={handleStopAuto}
                onReset={resetGame}
                delay={delay}
                onDelayChange={handleDelayChange}
              />
              <LineupPanel
                useLineup={useLineup}
                setUseLineup={setUseLineup}
                anchorGamePk={anchorGamePk}
                anchorInfo={anchorInfo}
                homePitcherHand={homePitcherHand}
                setHomePitcherHand={setHomePitcherHand}
                awayPitcherHand={awayPitcherHand}
                setAwayPitcherHand={setAwayPitcherHand}
                isTop={gs.half === "top"}
                awayBatRoster={awayBatRoster}
                homeBatRoster={homeBatRoster}
                idxAway={idxAway}
                idxHome={idxHome}
                awayTeamId={awayTeamId}
                homeTeamId={homeTeamId}
                loadingLineupAway={loadingLineupAway}
                loadingLineupHome={loadingLineupHome}
                loadRealLineup={loadRealLineup}
                awayLineupInfo={awayLineupInfo}
                homeLineupInfo={homeLineupInfo}
                errLineupAway={errLineupAway}
                errLineupHome={errLineupHome}
              />
            </div>
          </ScoreboardPanel>
          <StartersCard
            away={{
              label: "AWAY",
              name: awayStarterName,
              era: awayStarterERA,
              whip: awayStarterWHIP,
            }}
            home={{
              label: "HOME",
              name: homeStarterName,
              era: homeStarterERA,
              whip: homeStarterWHIP,
            }}
          />
          <EraTrendsPanel
            awayTitle={`Tendencia ERA abridor AWAY${
              awayStarterName ? ` - ${awayStarterName}` : ""
            }`}
            homeTitle={`Tendencia ERA abridor HOME${
              homeStarterName ? ` - ${homeStarterName}` : ""
            }`}
            away={{
              seasonEra: awayStarterERA,
              seasonIPOuts: awayStarterIPOuts,
              teamEra: eraAway,
              series: awayStarterLog,
            }}
            home={{
              seasonEra: homeStarterERA,
              seasonIPOuts: homeStarterIPOuts,
              teamEra: eraHome,
              series: homeStarterLog,
            }}
          />
        </section>

        {/* DER: reglas + modelo + log */}
        <aside className="panel">
          {/* Monte Carlo */}
          <MonteCarloPanel
            mcRuns={mcRuns}
            setMcRuns={setMcRuns}
            onRun={handleRunMonteCarlo}
            mcResult={mcResult}
            rules={rules}
            homeLabel={
              (typeof homeTeamId === "number"
                ? teams.find((t) => t.id === homeTeamId)?.abbreviation
                  ? `${
                      teams.find((t) => t.id === homeTeamId)?.abbreviation
                    } - ${teams.find((t) => t.id === homeTeamId)?.name}`
                  : teams.find((t) => t.id === homeTeamId)?.name
                : "(HOME manual)") || "(HOME)"
            }
            awayLabel={
              (typeof awayTeamId === "number"
                ? teams.find((t) => t.id === awayTeamId)?.abbreviation
                  ? `${
                      teams.find((t) => t.id === awayTeamId)?.abbreviation
                    } - ${teams.find((t) => t.id === awayTeamId)?.name}`
                  : teams.find((t) => t.id === awayTeamId)?.name
                : "(AWAY manual)") || "(AWAY)"
            }
          />

          {/* Log */}
          <LogPanel log={log} />

          <div className="statsPreview">
            <h2 className="h2">Estadisticas del modelo (API)</h2>
            <div className="statsPreviewGrid">
              {teamModelStats.map((stat) => (
                <div className="statsPreviewRow" key={stat.key}>
                  <div className="statsPreviewLabel">
                    {stat.label} ({stat.rangeText})
                  </div>
                  <div className="statsPreviewValues">
                    <div className="statsPreviewTeamLine">
                      <span className="statsPreviewTeam">AWAY</span>
                      <span className="statsPreviewValue">{stat.away}</span>
                    </div>
                    <div className="statsPreviewTeamLine">
                      <span className="statsPreviewTeam">HOME</span>
                      <span className="statsPreviewValue">{stat.home}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Reglas */}
          <RulesPanel rules={rules} setRules={setRules} syncRules={syncRules} />

          {/* (LineupPanel se muestra bajo el marcador) */}

          {/* Modelo AVG + ERA + OBP + SLG + por equipo */}
          <TeamModelPanel
            season={season}
            setSeason={setSeason}
            teams={teams}
            awayTeamId={awayTeamId}
            setAwayTeamId={setAwayTeamId}
            homeTeamId={homeTeamId}
            setHomeTeamId={setHomeTeamId}
            loadingAway={awaySummaryState.loading}
            loadingHome={homeSummaryState.loading}
            errAway={awaySummaryState.error}
            errHome={homeSummaryState.error}
            loadTeamStats={loadTeamStats}
            loadRoster={loadRoster}
            awayRoster={awayRoster}
            homeRoster={homeRoster}
            loadingRosterAway={awayRosterState.loading}
            loadingRosterHome={homeRosterState.loading}
            errRosterAway={awayRosterState.error}
            errRosterHome={homeRosterState.error}
            awayStarterId={awayStarterId}
            setAwayStarterId={setAwayStarterId}
            homeStarterId={homeStarterId}
            setHomeStarterId={setHomeStarterId}
            loadStarterStats={loadStarterStats}
            awayStarterERA={awayStarterERA}
            awayStarterWHIP={awayStarterWHIP}
            awayStarterIPOuts={awayStarterIPOuts}
            homeStarterERA={homeStarterERA}
            homeStarterWHIP={homeStarterWHIP}
            homeStarterIPOuts={homeStarterIPOuts}
            awayStarterName={awayStarterName}
            homeStarterName={homeStarterName}
            awayProbableMsg={awayProbableMsg}
            homeProbableMsg={homeProbableMsg}
            parkRunsPF={parkRunsPF}
            setParkRunsPF={setParkRunsPF}
            parkHRPF={parkHRPF}
            setParkHRPF={setParkHRPF}
            avgAway={avgAway}
            setAvgAway={setAvgAway}
            obpAway={obpAway}
            setObpAway={setObpAway}
            slgAway={slgAway}
            setSlgAway={setSlgAway}
            eraAway={eraAway}
            setEraAway={setEraAway}
            whipAway={whipAway}
            setWhipAway={setWhipAway}
            avgHome={avgHome}
            setAvgHome={setAvgHome}
            obpHome={obpHome}
            setObpHome={setObpHome}
            slgHome={slgHome}
            setSlgHome={setSlgHome}
            eraHome={eraHome}
            setEraHome={setEraHome}
            whipHome={whipHome}
            setWhipHome={setWhipHome}
            currentProbs={currentProbs}
          />
        </aside>
      </div>
    </main>
  );
}
function narratePlay(
  before: GameState,
  evDesc: string,
  after: GameState
): string {
  // Inning/mitad antes de la jugada
  const inningTxt = `${before.inning} - ${
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

  // Bases despues de la jugada
  const b = after.bases;
  const basesTxt =
    b.first || b.second || b.third
      ? [b.first && "1B", b.second && "2B", b.third && "3B"]
          .filter(Boolean)
          .join(", ")
      : "bases vacias";

  // Marcador
  const scoreTxt = `Home ${after.scoreHome}  -  Away ${after.scoreAway}`;

  // Texto base
  let line = `${inningTxt}: ${team} al bate. ${evDesc}. ${outsTxt}, ${basesTxt}, marcador ${scoreTxt}.`;

  // anadir nota de cambio de mitad
  if (halfChanged) {
    const nextInningTxt = `${after.inning} - ${
      after.half === "top" ? "Alta" : "Baja"
    }`;
    line += ` Cambio de mitad: ${nextInningTxt}.`;
  }

  // Deteccion de walk-off (Home gana en baja)
  if (
    after.status.over &&
    after.status.winner === "home" &&
    before.half === "bottom"
  ) {
    line += " Walk-off! Se acaba el juego.";
  }

  return line;
}
