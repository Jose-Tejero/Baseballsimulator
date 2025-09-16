import { useEffect, useState } from "react";
import {
  getPlayerPitchingStats,
  getPlayerPitchingGameLog,
  type PlayerPitching,
  type PlayerPitchingGameLog,
} from "../../services/mlb";
import { AsyncCache, keyOf, type LoadStateWithMeta } from "../types";
import type { GameERIP } from "../../engine/eraBuff";

export type PitcherSeasonSnapshot = {
  era: number | null;
  whip: number | null;
  inningsPitchedOuts: number | null;
  gamesStarted: number | null;
};

export type PitcherStatsData = {
  season: PitcherSeasonSnapshot | null;
  gameLog: GameERIP[] | null;
};

type PitcherMeta = {
  statsLoading: boolean;
  logLoading: boolean;
};

type PitcherState = LoadStateWithMeta<PitcherStatsData, PitcherMeta>;

const statsCache = new AsyncCache<PitcherSeasonSnapshot | null>();
const logCache = new AsyncCache<GameERIP[] | null>();

function sanitizeSeason(raw: PlayerPitching | null | undefined): PitcherSeasonSnapshot | null {
  if (!raw) return null;
  const era = typeof raw.era === "number" && Number.isFinite(raw.era) ? raw.era : null;
  const whip = typeof raw.whip === "number" && Number.isFinite(raw.whip) ? raw.whip : null;
  const outs =
    typeof raw.inningsPitchedOuts === "number" && Number.isFinite(raw.inningsPitchedOuts)
      ? raw.inningsPitchedOuts
      : null;
  const gs = typeof raw.gamesStarted === "number" && Number.isFinite(raw.gamesStarted) ? raw.gamesStarted : null;
  if (era === null && whip === null && outs === null && gs === null) return null;
  return {
    era,
    whip,
    inningsPitchedOuts: outs,
    gamesStarted: gs,
  };
}

function toGameERIP(entries: PlayerPitchingGameLog[] | null | undefined): GameERIP[] | null {
  if (!entries || !entries.length) return null;
  const mapped = entries
    .map((g) => {
      const er = typeof g.er === "number" && Number.isFinite(g.er) ? g.er : null;
      const outs = typeof g.outs === "number" && Number.isFinite(g.outs) ? g.outs : null;
      if (er == null || outs == null) return null;
      return { er, outs } as GameERIP;
    })
    .filter((g): g is GameERIP => !!g);
  return mapped.length ? mapped : null;
}

export function usePitcherStats(
  personId?: number | "",
  season?: number,
  opts?: {
    gameType?: string;
  }
): PitcherState {
  const gameType = opts?.gameType ?? "R";
  const [state, setState] = useState<PitcherState>({
    data: { season: null, gameLog: null },
    loading: false,
    error: null,
    statsLoading: false,
    logLoading: false,
  });

  useEffect(() => {
    if (!personId || typeof personId !== "number" || !season) {
      setState({
        data: { season: null, gameLog: null },
        loading: false,
        error: null,
        statsLoading: false,
        logLoading: false,
      });
      return;
    }

    const statsKey = keyOf("pitcherStats", personId, season, gameType);
    const logKey = keyOf("pitcherLog", personId, season, gameType);
    const cachedStats = statsCache.get(statsKey);
    const cachedLog = logCache.get(logKey);
    const needStats = typeof cachedStats === "undefined";
    const needLog = typeof cachedLog === "undefined";

    setState({
      data: {
        season: typeof cachedStats === "undefined" ? null : cachedStats,
        gameLog: typeof cachedLog === "undefined" ? null : cachedLog,
      },
      loading: needStats || needLog,
      error: null,
      statsLoading: needStats,
      logLoading: needLog,
    });

    let aborted = false;

    if (needStats) {
      const fetchStats = () =>
        getPlayerPitchingStats(personId, season, gameType).then((raw) => sanitizeSeason(raw));
      const inflight = statsCache.getInflight(statsKey);
      const promise = inflight ?? fetchStats();
      if (!inflight) statsCache.setInflight(statsKey, promise);
      promise
        .then((sanitized) => {
          if (aborted) return;
          statsCache.set(statsKey, sanitized ?? null);
          setState((prev) => {
            const nextSeason = sanitized ?? null;
            const nextStatsLoading = false;
            const nextLogLoading = prev.logLoading;
            return {
              ...prev,
              data: {
                season: nextSeason,
                gameLog: prev.data?.gameLog ?? null,
              },
              statsLoading: nextStatsLoading,
              loading: nextStatsLoading || nextLogLoading,
            };
          });
        })
        .catch((err) => {
          if (aborted) return;
          setState((prev) => {
            const nextLogLoading = prev.logLoading;
            return {
              ...prev,
              data: {
                season: null,
                gameLog: prev.data?.gameLog ?? null,
              },
              error: prev.error ?? (err instanceof Error ? err.message : String(err)),
              statsLoading: false,
              loading: nextLogLoading,
            };
          });
        });
    }

    if (needLog) {
      const fetchLog = () =>
        getPlayerPitchingGameLog(personId, season, gameType).then((raw) => toGameERIP(raw));
      const inflight = logCache.getInflight(logKey);
      const promise = inflight ?? fetchLog();
      if (!inflight) logCache.setInflight(logKey, promise);
      promise
        .then((mapped) => {
          if (aborted) return;
          logCache.set(logKey, mapped ?? null);
          setState((prev) => {
            const nextLogLoading = false;
            const nextStatsLoading = prev.statsLoading;
            return {
              ...prev,
              data: {
                season: prev.data?.season ?? null,
                gameLog: mapped ?? null,
              },
              logLoading: nextLogLoading,
              loading: nextStatsLoading || nextLogLoading,
            };
          });
        })
        .catch((err) => {
          if (aborted) return;
          setState((prev) => {
            const nextStatsLoading = prev.statsLoading;
            return {
              ...prev,
              data: {
                season: prev.data?.season ?? null,
                gameLog: null,
              },
              error: prev.error ?? (err instanceof Error ? err.message : String(err)),
              logLoading: false,
              loading: nextStatsLoading,
            };
          });
        });
    }

    return () => {
      aborted = true;
    };
  }, [personId, season, gameType]);

  return state;
}
