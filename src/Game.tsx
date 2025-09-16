import { useEffect, useMemo, useState, useRef, useCallback } from "react";
// UI helpers now used via panels
// import { EraTrendCard } from "./components/ui/EraTrendCard";
import { LogPanel } from "./components/LogPanel";
import { RulesPanel } from "./components/RulesPanel";
import { EraTrendsPanel } from "./components/EraTrendsPanel";
import { TeamModelPanel } from "./components/TeamModelPanel";
import { MonteCarloPanel } from "./components/MonteCarloPanel";
import { LineupPanel } from "./components/LineupPanel";
import { ScoreboardPanel } from "./components/ScoreboardPanel";
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
import {
  getTeamSummary,
  getTeamRoster,
  getPlayerPitchingStats,
  getPlayerPitchingGameLog,
  type Team,
  type RosterPlayer,
} from "./services/mlb";
import {
  useTeams,
  useTeamSummary,
  useRoster as useTeamRosterHook,
  useProbable as useProbableHook,
  useNextGameLineup as useNextGameLineupHook,
  useAnchoredLineups as useAnchoredLineupsHook,
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
    setLoadingHome(!!homeSummaryState.loading);
    setErrHome(homeSummaryState.error ?? null);
    const s = homeSummaryState.data;
    if (s) {
      if (s.hitting.avg != null) setAvgHome(s.hitting.avg);
      if (s.hitting.obp != null) setObpHome(s.hitting.obp);
      if (s.hitting.slg != null) setSlgHome(s.hitting.slg);
      if (s.pitching.era != null) setEraHome(s.pitching.era);
      if (s.pitching.whip != null) setWhipHome(s.pitching.whip);
    }
  }, [homeSummaryState.data, homeSummaryState.loading, homeSummaryState.error]);
  useEffect(() => {
    setLoadingAway(!!awaySummaryState.loading);
    setErrAway(awaySummaryState.error ?? null);
    const s = awaySummaryState.data;
    if (s) {
      if (s.hitting.avg != null) setAvgAway(s.hitting.avg);
      if (s.hitting.obp != null) setObpAway(s.hitting.obp);
      if (s.hitting.slg != null) setSlgAway(s.hitting.slg);
      if (s.pitching.era != null) setEraAway(s.pitching.era);
      if (s.pitching.whip != null) setWhipAway(s.pitching.whip);
    }
  }, [awaySummaryState.data, awaySummaryState.loading, awaySummaryState.error]);

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
    setLoadingRosterHome(!!homeRosterState.loading);
    setErrRosterHome(homeRosterState.error ?? null);
    const r = homeRosterState.data;
    if (Array.isArray(r)) {
      const byName = [...r].sort((a, b) => a.fullName.localeCompare(b.fullName));
      const pitchers = byName.filter((p) => (p.positionCode ?? "").toUpperCase() === "P");
      setHomeRoster(pitchers.length ? pitchers : byName);
    }
  }, [homeRosterState.data, homeRosterState.loading, homeRosterState.error]);
  useEffect(() => {
    setLoadingRosterAway(!!awayRosterState.loading);
    setErrRosterAway(awayRosterState.error ?? null);
    const r = awayRosterState.data;
    if (Array.isArray(r)) {
      const byName = [...r].sort((a, b) => a.fullName.localeCompare(b.fullName));
      const pitchers = byName.filter((p) => (p.positionCode ?? "").toUpperCase() === "P");
      setAwayRoster(pitchers.length ? pitchers : byName);
    }
  }, [awayRosterState.data, awayRosterState.loading, awayRosterState.error]);

  // Hooks: probables (auto)
  const homeProbableState = useProbableHook(
    typeof homeTeamId === "number" ? homeTeamId : undefined,
    { daysAhead: 10, gameType: "R" }
  );
  const awayProbableState = useProbableHook(
    typeof awayTeamId === "number" ? awayTeamId : undefined,
    { daysAhead: 10, gameType: "R" }
  );
  useEffect(() => {
    if (homeProbableState.error) setHomeProbableMsg("No se pudo obtener probable");
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
  }, [homeProbableState.data, homeProbableState.loading, homeProbableState.error, homeProbableState.hand, season]);
  useEffect(() => {
    if (awayProbableState.error) setAwayProbableMsg("No se pudo obtener probable");
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
  }, [awayProbableState.data, awayProbableState.loading, awayProbableState.error, awayProbableState.hand, season]);

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

  // Hooks de lineups (prÃ³ximo juego y anclado)
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
      const infoTxt = ((st.predicted ? "Predicción" : "") +
        " vs próximo juego " + new Date(st.data.gameDate).toLocaleString()).trim();
      if (which === "home") {
        setHomeBatRoster(st.data.roster);
        setHomeLineupInfo(infoTxt);
        setErrLineupHome(st.predicted ? "Lineup no disponible; usando predicción basada en juegos recientes." : null);
        setHomeGamePk(st.data.gamePk ?? null);
      } else {
        setAwayBatRoster(st.data.roster);
        setAwayLineupInfo(infoTxt);
        setErrLineupAway(st.predicted ? "Lineup no disponible; usando predicción basada en juegos recientes." : null);
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

  // Armoniza mensajes cuando se usa predicciÃ³n pero el anclaje deja un mensaje genÃ©rico de no-disponible
  useEffect(() => {
    if (
      awayLineupInfo &&
      awayLineupInfo.includes("PredicciÃ³n") &&
      errLineupAway &&
      errLineupAway.startsWith("Lineup no disponible")
    ) {
      setErrLineupAway(
        "Lineup no disponible; usando predicciÃ³n basada en juegos recientes."
      );
    }
    if (
      homeLineupInfo &&
      homeLineupInfo.includes("PredicciÃ³n") &&
      errLineupHome &&
      errLineupHome.startsWith("Lineup no disponible")
    ) {
      setErrLineupHome(
        "Lineup no disponible; usando predicciÃ³n basada en juegos recientes."
      );
    }
  }, [awayLineupInfo, errLineupAway, homeLineupInfo, errLineupHome]);

  // Aplicar lineup del próximo juego (si no hay anclaje)
  useEffect(() => {
    if (anchorGamePk) return;
    const st = homeNextLineupState;
    if (st?.data) {
      setHomeBatRoster(st.data.roster);
      setHomeLineupInfo(((st.predicted ? "Predicción" : "") + " vs próximo juego " + new Date(st.data.gameDate).toLocaleString()).trim());
      setErrLineupHome(st.predicted ? "Lineup no disponible; usando predicción basada en juegos recientes." : null);
      setHomeGamePk(st.data.gamePk ?? null);
    }
  }, [homeNextLineupState.data, homeNextLineupState.predicted, anchorGamePk]);

  useEffect(() => {
    if (anchorGamePk) return;
    const st = awayNextLineupState;
    if (st?.data) {
      setAwayBatRoster(st.data.roster);
      setAwayLineupInfo(((st.predicted ? "Predicción" : "") + " vs próximo juego " + new Date(st.data.gameDate).toLocaleString()).trim());
      setErrLineupAway(st.predicted ? "Lineup no disponible; usando predicción basada en juegos recientes." : null);
      setAwayGamePk(st.data.gamePk ?? null);
    }
  }, [awayNextLineupState.data, awayNextLineupState.predicted, anchorGamePk]);

  // Loading flags cuando no hay anclaje (para botones)
  useEffect(() => { if (!anchorGamePk) setLoadingLineupHome(!!homeNextLineupState.loading); }, [homeNextLineupState.loading, anchorGamePk]);
  useEffect(() => { if (!anchorGamePk) setLoadingLineupAway(!!awayNextLineupState.loading); }, [awayNextLineupState.loading, anchorGamePk]);

  // Aplicar resultados de lineups anclados
  useEffect(() => {
    if (!anchorGamePk) return;
    setLoadingLineupHome(!!anchoredState.loading);
    setLoadingLineupAway(!!anchoredState.loading);
    const d = anchoredState.data;
    if (d) {
      if (d.home?.roster) {
        setHomeBatRoster(d.home.roster);
        setHomeLineupInfo(d.home.info ?? `Anclado a gamePk ${anchorGamePk}`);
        setErrLineupHome(d.home.predicted ? "Lineup no disponible; usando predicción basada en juegos recientes." : null);
      } else {
        setErrLineupHome("Lineup no disponible aún para el próximo juego (HOME)");
      }
      if (d.away?.roster) {
        setAwayBatRoster(d.away.roster);
        setAwayLineupInfo(d.away.info ?? `Anclado a gamePk ${anchorGamePk}`);
        setErrLineupAway(d.away.predicted ? "Lineup no disponible; usando predicción basada en juegos recientes." : null);
      } else {
        setErrLineupAway("Lineup no disponible aún para el próximo juego (AWAY)");
      }
      if (d.hands?.home) setHomePitcherHand(d.hands.home);
      if (d.hands?.away) setAwayPitcherHand(d.hands.away);
    }
    if (anchoredState.error) {
      setErrLineupHome(anchoredState.error);
      setErrLineupAway(anchoredState.error);
    }
  }, [anchoredState.data, anchoredState.loading, anchoredState.error, anchorGamePk]);
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
    // Avanzar Ã­ndice de lineup del lado que batea
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
  const statusLine = `Inning ${gs.inning} - ${
    gs.half === "top" ? "Alta" : "Baja"
  } - Outs: ${gs.outs} - Al bate: ${gs.half === "top" ? "Away" : "Home"}`;
  const pitchLine = (() => {
    const starterInnings = 6;
    const isTop = gs.half === "top";
    const teamLbl = isTop ? "Home" : "Away";
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

  // ------------------ Render ------------------
  return (
    <main className="main">
      <div className="container grid">
        {/* IZQ: marcador */}
        <section style={{ display: "grid", gap: 24 }}>
          <h1 className="h-hero">Simulador de BÃ©isbol</h1>

          <ScoreboardPanel
            statusLine={statusLine}
            pitchLine={pitchLine}
            awayScore={gs.scoreAway}
            homeScore={gs.scoreHome}
            bases={gs.bases}
          >
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="button" onClick={stepOnce}>
                  Jugar 1 turno
                </button>
                {!auto ? (
                  <>
                    <button
                      className="button secondary"
                      onClick={() => {
                        setMode("free");
                        setAuto(true);
                      }}
                    >
                      Auto (libre)
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => {
                        setMode("half");
                        setAuto(true);
                      }}
                    >
                      Auto (media)
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => {
                        setMode("game");
                        setAuto(true);
                      }}
                    >
                      Auto (juego)
                    </button>
                  </>
                ) : (
                  <button className="button" onClick={() => setAuto(false)}>
                    Detener auto
                  </button>
                )}
                <button className="button" onClick={resetGame}>
                  Reset
                </button>
              </div>
              <div className="field">
                <label>
                  <strong>Velocidad auto (ms por turno): {delay}</strong>
                </label>
                <input
                  type="range"
                  min={50}
                  max={1500}
                  step={50}
                  value={delay}
                  onChange={(e) => setDelay(Number(e.target.value))}
                />
              </div>

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
          <div className="card" style={{ padding: 12 }}>
            <div className="h2">Abridores</div>
            <div className="muted" style={{ display: "grid", gap: 6 }}>
              <div>
                <strong>AWAY</strong>: {awayStarterName ?? "-"} â€” ERA{" "}
                {awayStarterERA != null ? awayStarterERA.toFixed(2) : "-"} /
                WHIP{" "}
                {awayStarterWHIP != null ? awayStarterWHIP.toFixed(2) : "-"}
              </div>
              <div>
                <strong>HOME</strong>: {homeStarterName ?? "-"} â€” ERA{" "}
                {homeStarterERA != null ? homeStarterERA.toFixed(2) : "-"} /
                WHIP{" "}
                {homeStarterWHIP != null ? homeStarterWHIP.toFixed(2) : "-"}
              </div>
            </div>
          </div>
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
          {/* Log */}
          <LogPanel log={log} />

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
            loadingAway={loadingAway}
            loadingHome={loadingHome}
            errAway={errAway}
            errHome={errHome}
            loadTeamStats={loadTeamStats}
            loadRoster={loadRoster}
            awayRoster={awayRoster}
            homeRoster={homeRoster}
            loadingRosterAway={loadingRosterAway}
            loadingRosterHome={loadingRosterHome}
            errRosterAway={errRosterAway}
            errRosterHome={errRosterHome}
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
          <MonteCarloPanel
            mcRuns={mcRuns}
            setMcRuns={setMcRuns}
            onRun={() => {
              try {
                if (useLineup) {
                  const mkSeasonPoint = (
                    era: number | null,
                    ipOuts: number | null
                  ) => {
                    if (era == null || !Number.isFinite(era))
                      return null as any;
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
                    if (era == null || !Number.isFinite(era))
                      return null as any;
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
            }}
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
            Nivel (Holt): {buff.latest.level.toFixed(2)} - Tendencia:{" "}
            {buff.latest.trend.toFixed(2)} - Buff: {buff.latest.buff.toFixed(3)}
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
        {Number.isFinite(teamEra) ? teamEra.toFixed(2) : " - "}
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

/* UI helpers */

/* moved to components/ui/SteppedNumber */
/* function SteppedNumber({
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
    <div
      style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8 }}
    >
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
} */


