import { useCallback, useEffect, useState } from "react";
import { getTeamSummary, type TeamHitting, type TeamPitching } from "../../services/mlb";
import { AsyncCache, keyOf, type LoadState } from "../types";

type Summary = { hitting: TeamHitting; pitching: TeamPitching };
const cache = new AsyncCache<Summary | null>();

export function useTeamSummary(teamId?: number | "", season?: number) {
  const [state, setState] = useState<LoadState<Summary>>({ data: null, loading: false, error: null });
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    if (!teamId || typeof teamId !== "number" || !season) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const key = keyOf("teamSummary", teamId, season);
    const cached = cache.get(key);
    if (cached) {
      setState({ data: cached, loading: false, error: null });
      return;
    }
    let aborted = false;
    setState({ data: null, loading: true, error: null });
    const inflight = cache.getInflight(key);
    const promise = inflight ?? getTeamSummary(teamId, season, "R");
    if (!inflight) cache.setInflight(key, promise);
    promise
      .then((data) => {
        if (aborted) return;
        cache.set(key, data);
        setState({ data, loading: false, error: null });
      })
      .catch((e) => {
        if (aborted) return;
        setState({ data: null, loading: false, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      aborted = true;
    };
  }, [teamId, season, refreshIndex]);

  const refresh = useCallback(() => {
    if (!teamId || typeof teamId !== "number" || !season) return;
    const key = keyOf("teamSummary", teamId, season);
    cache.delete(key);
    setState((prev) => ({ ...prev, loading: true, error: null }));
    setRefreshIndex((idx) => idx + 1);
  }, [teamId, season]);

  return { ...state, refresh };
}
