import { useEffect, useRef, useState } from "react";
import { getTeams, type Team } from "../../services/mlb";
import { AsyncCache, keyOf, type LoadState } from "../types";

const cache = new AsyncCache<Team[] | null>();

export function useTeams(season?: number) {
  const [state, setState] = useState<LoadState<Team[]>>({
    data: null,
    loading: !!season,
    error: null,
  });
  const seasonRef = useRef(season);

  useEffect(() => {
    seasonRef.current = season;
    const key = keyOf("teams", season ?? "");
    const cached = cache.get(key);
    if (cached) {
      setState({ data: cached ?? null, loading: false, error: null });
      return;
    }
    let aborted = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    const inflight = cache.getInflight(key);
    const promise = inflight ?? getTeams(season).then((res) => res ?? []);
    if (!inflight) cache.setInflight(key, promise);
    promise
      .then((data) => {
        if (aborted) return;
        cache.set(key, data);
        setState({ data, loading: false, error: null });
      })
      .catch((e) => {
        if (aborted) return;
        setState({ data: null, loading: false, error: (e instanceof Error ? e.message : String(e)) });
      });
    return () => {
      aborted = true;
    };
  }, [season]);

  return state;
}

