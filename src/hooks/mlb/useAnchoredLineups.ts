import { useEffect, useState } from "react";
import {
  getGameLineup,
  getGameTeams,
  getRecentLineupsForTeam,
  predictLineupFromRecent,
  getGameProbables,
  getPlayerInfo,
  type PlayerInfo,
} from "../../services/mlb";
import type { Roster } from "../../engine/baseball";
import { AsyncCache, keyOf, type LoadStateWithMeta } from "../types";
import { buildRosterFromLineup } from "./utils";

type SideData = { roster: Roster; info?: string; predicted?: boolean };
type Data = { home?: SideData; away?: SideData; hands?: { home?: "L" | "R"; away?: "L" | "R" } };
type Meta = { gamePk?: number };

const cache = new AsyncCache<Data | null>();

export function useAnchoredLineups(gamePk?: number | null, season?: number) {
  const [state, setState] = useState<LoadStateWithMeta<Data, Meta>>({ data: null, loading: false, error: null });

  useEffect(() => {
    if (!gamePk || !Number.isFinite(gamePk) || !season) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const key = keyOf("anchoredLineups", gamePk, season);
    const cached = cache.get(key);
    if (cached) {
      setState({ data: cached, loading: false, error: null, gamePk });
      return;
    }
    let aborted = false;
    setState({ data: null, loading: true, error: null, gamePk });
    (async () => {
      try {
        const [lhRaw, laRaw] = await Promise.all([
          getGameLineup(gamePk, "home").catch(() => [] as any[]),
          getGameLineup(gamePk, "away").catch(() => [] as any[]),
        ]);
        let lhome: any[] = lhRaw;
        let laway: any[] = laRaw;
        let usedPredHome = false;
        let usedPredAway = false;

        let homeTid: number | undefined;
        let awayTid: number | undefined;
        try {
          const teams = await getGameTeams(gamePk);
          homeTid = typeof teams?.homeTeamId === "number" ? teams.homeTeamId : undefined;
          awayTid = typeof teams?.awayTeamId === "number" ? teams.awayTeamId : undefined;
        } catch {}

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

        const data: Data = {};
        if (Array.isArray(lhome) && lhome.length > 0) {
          const roster = await buildRosterFromLineup(lhome, season);
          data.home = {
            roster,
            info: usedPredHome ? `Predicción anclada a gamePk ${gamePk}` : `Anclado a gamePk ${gamePk}`,
            predicted: usedPredHome,
          };
        }
        if (Array.isArray(laway) && laway.length > 0) {
          const roster = await buildRosterFromLineup(laway, season);
          data.away = {
            roster,
            info: usedPredAway ? `Predicción anclada a gamePk ${gamePk}` : `Anclado a gamePk ${gamePk}`,
            predicted: usedPredAway,
          };
        }

        // Probables hands (if available)
        try {
          const gp = await getGameProbables(gamePk);
          const out: { home?: "L" | "R"; away?: "L" | "R" } = {};
          if (gp?.home?.id) {
            const pi: PlayerInfo | undefined = await getPlayerInfo(gp.home.id).catch(() => undefined);
            if (pi?.pitchHand === "L" || pi?.pitchHand === "R") out.home = pi.pitchHand;
          }
          if (gp?.away?.id) {
            const pi: PlayerInfo | undefined = await getPlayerInfo(gp.away.id).catch(() => undefined);
            if (pi?.pitchHand === "L" || pi?.pitchHand === "R") out.away = pi.pitchHand;
          }
          if (out.home || out.away) data.hands = out;
        } catch {}

        if (!aborted) {
          cache.set(key, data);
          setState({ data, loading: false, error: null, gamePk });
        }
      } catch (e) {
        if (!aborted) setState({ data: null, loading: false, error: e instanceof Error ? e.message : String(e), gamePk });
      }
    })();
    return () => {
      aborted = true;
    };
  }, [gamePk, season]);

  return state;
}

