import { useEffect, useState } from "react";
import { getNextGameLineup, predictNextGameLineup } from "../../services/mlb";
import type { Roster } from "../../engine/baseball";
import { AsyncCache, keyOf, type LoadStateWithMeta } from "../types";
import { buildRosterFromLineup } from "./utils";

type Data = {
  roster: Roster;
  side: "home" | "away";
  gamePk: number;
  gameDate: string;
};
type Meta = { predicted?: boolean; basedOnGames?: number };

const cache = new AsyncCache<Data | null>();

export function useNextGameLineup(teamId?: number | "", season?: number) {
  const [state, setState] = useState<LoadStateWithMeta<Data, Meta>>({ data: null, loading: false, error: null });

  useEffect(() => {
    if (!teamId || typeof teamId !== "number" || !season) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const key = keyOf("nextLineup", teamId, season);
    const cached = cache.get(key);
    if (cached) {
      setState({ data: cached, loading: false, error: null });
      return;
    }
    let aborted = false;
    setState({ data: null, loading: true, error: null });
    (async () => {
      try {
        const info = await getNextGameLineup(teamId, { daysAhead: 10, gameType: "R" });
        let predicted = false;
        let basedOnGames: number | undefined = undefined;
        let lineup = info.lineup;
        if (!Array.isArray(lineup) || lineup.length === 0) {
          // Predict
          const pred = await predictNextGameLineup(teamId, { recentLimit: 3, daysBack: 14, gameType: "R" });
          lineup = pred.lineup;
          predicted = true;
          basedOnGames = pred.basedOnGames;
        }
        const roster = await buildRosterFromLineup(lineup, season);
        const data: Data = { roster, side: info.side, gamePk: info.gamePk, gameDate: info.gameDate };
        if (!aborted) {
          cache.set(key, data);
          setState({ data, loading: false, error: null, predicted, basedOnGames });
        }
      } catch (e) {
        if (!aborted)
          setState({ data: null, loading: false, error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      aborted = true;
    };
  }, [teamId, season]);

  return state;
}

