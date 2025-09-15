import { useEffect, useState } from "react";
import { getNextProbablePitcher, getPlayerInfo } from "../../services/mlb";
import type { PlayerInfo } from "../../services/mlb";
import { AsyncCache, keyOf, type LoadStateWithMeta } from "../types";

type ProbableData = { id: number; fullName: string; gamePk: number; gameDate: string; side: "home" | "away" };
type Meta = { hand?: "L" | "R"; info?: PlayerInfo };

const cache = new AsyncCache<ProbableData | null>();

export function useProbable(teamId?: number | "", opts?: { daysAhead?: number; gameType?: string }) {
  const [state, setState] = useState<LoadStateWithMeta<ProbableData, Meta>>({
    data: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!teamId || typeof teamId !== "number") {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const key = keyOf("probable", teamId, opts?.daysAhead ?? 7, opts?.gameType ?? "R");
    const cached = cache.get(key);
    if (cached) {
      // hydrate hand lazily but avoid blocking UI
      setState((s) => ({ ...s, data: cached, loading: false, error: null }));
      // Try to get hand in the background
      if (cached?.id) {
        getPlayerInfo(cached.id)
          .then((pi) => {
            setState((prev) => ({ ...prev, hand: pi?.pitchHand as any, info: pi }));
          })
          .catch(() => {});
      }
      return;
    }
    let aborted = false;
    setState({ data: null, loading: true, error: null });
    const inflight = cache.getInflight(key);
    const promise = inflight ?? getNextProbablePitcher(teamId, { daysAhead: opts?.daysAhead ?? 10, gameType: opts?.gameType ?? "R" });
    if (!inflight) cache.setInflight(key, promise as any);
    promise
      .then(async (res) => {
        if (aborted) return;
        const data = res ?? null;
        cache.set(key, data);
        if (!data) {
          setState({ data: null, loading: false, error: null });
          return;
        }
        let info: PlayerInfo | undefined;
        try {
          info = await getPlayerInfo(data.id);
        } catch {}
        setState({ data, loading: false, error: null, hand: info?.pitchHand as any, info });
      })
      .catch((e) => {
        if (aborted) return;
        setState({ data: null, loading: false, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      aborted = true;
    };
  }, [teamId, opts?.daysAhead, opts?.gameType]);

  return state;
}

