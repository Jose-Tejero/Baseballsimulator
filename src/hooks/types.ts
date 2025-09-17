export type LoadState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

export type LoadStateWithMeta<T, M extends object = {}> = LoadState<T> & M;

/** Build a stable cache key from parts. Undefined/null parts are skipped. */
export function keyOf(...parts: Array<string | number | null | undefined>) {
  return parts.filter((p) => p !== null && p !== undefined && String(p) !== "").join("|");
}

/** Simple in-memory cache with in-flight dedupe. */
export class AsyncCache<T = unknown> {
  private data = new Map<string, T>();
  private inflight = new Map<string, Promise<T>>();

  get(key: string): T | undefined {
    return this.data.get(key);
  }

  set(key: string, val: T) {
    this.data.set(key, val);
  }

  getInflight(key: string): Promise<T> | undefined {
    return this.inflight.get(key);
  }

  setInflight(key: string, p: Promise<T>) {
    this.inflight.set(key, p);
    p.finally(() => this.inflight.delete(key));
  }

  delete(key: string) {
    this.data.delete(key);
    this.inflight.delete(key);
  }
}
