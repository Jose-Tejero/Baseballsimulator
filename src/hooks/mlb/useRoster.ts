import { useCallback, useEffect, useState } from "react";
import { getTeamRoster, type RosterPlayer } from "../../services/mlb";
import { AsyncCache, keyOf, type LoadStateWithMeta } from "../types";

type Meta = { count: number };
const cache = new AsyncCache<RosterPlayer[] | null>();

export function useRoster(teamId?: number | "", season?: number) {
  const [state, setState] = useState<LoadStateWithMeta<RosterPlayer[], Meta>>({
    data: null,
    loading: false,
    error: null,
    count: 0,
  });
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    if (!teamId || typeof teamId !== "number" || !season) {
      setState({ data: null, loading: false, error: null, count: 0 });
      return;
    }
    const key = keyOf("roster", teamId, season);
    const cached = cache.get(key);
    if (cached) {
      setState({ data: cached ?? null, loading: false, error: null, count: cached?.length ?? 0 });
      return;
    }
    let aborted = false;
    setState({ data: null, loading: true, error: null, count: 0 });
    const inflight = cache.getInflight(key);
    const promise = inflight ?? getTeamRoster(teamId, season).then((r) => r ?? []);
    if (!inflight) cache.setInflight(key, promise);
    promise
      .then((data) => {
        if (aborted) return;
        cache.set(key, data);
        setState({ data, loading: false, error: null, count: data?.length ?? 0 });
      })
      .catch((e) => {
        if (aborted) return;
        setState({ data: null, loading: false, error: e instanceof Error ? e.message : String(e), count: 0 });
      });
    return () => {
      aborted = true;
    };
  }, [teamId, season, refreshIndex]);

  const refresh = useCallback(() => {
    if (!teamId || typeof teamId !== "number" || !season) return;
    const key = keyOf("roster", teamId, season);
    cache.delete(key);
    setState((prev) => ({ ...prev, loading: true, error: null }));
    setRefreshIndex((idx) => idx + 1);
  }, [teamId, season]);

  return { ...state, refresh };
}
