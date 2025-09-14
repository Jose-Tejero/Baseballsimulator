const BASE = "https://statsapi.mlb.com/api/v1";

export type Team = {
  id: number;
  name: string;
  abbreviation?: string;
};

export type TeamHitting = {
  avg?: number;
  obp?: number;
  slg?: number;
  ops?: number;
};

export type TeamPitching = {
  era?: number;
  whip?: number;
};

export type PlayerPitching = {
  era?: number;
  whip?: number;
  /** Total outs pitched in the season (IP * 3). */
  inningsPitchedOuts?: number;
  /** Games started (if available). */
  gamesStarted?: number;
};

function toNum(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const n = Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Parse MLB innings pitched representation (e.g., "6.1", "6.2") into total outs.
 * .1 = 1 out, .2 = 2 outs. Other decimals are approximated to thirds.
 */
export function parseIPToOuts(ip: unknown): number | undefined {
  if (ip == null) return undefined;
  const s = String(ip).trim();
  if (!s) return undefined;
  const parts = s.split(".");
  const whole = Number.parseInt(parts[0] ?? "0", 10);
  if (!Number.isFinite(whole)) return undefined;
  let dec = 0;
  if (parts.length > 1) {
    const d = parts[1];
    const digit = Number.parseInt(d[0] ?? "0", 10);
    if (digit === 1) dec = 1;
    else if (digit === 2) dec = 2;
    else dec = Math.max(0, Math.min(2, Math.round((Number("0." + d) || 0) * 3)));
  }
  return whole * 3 + dec;
}

export async function getTeams(season?: number): Promise<Team[]> {
  const url = new URL(`${BASE}/teams`);
  url.searchParams.set("sportId", "1");
  if (season) url.searchParams.set("season", String(season));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`MLB teams ${res.status}`);
  const json = await res.json();
  const teamsRaw: unknown[] = Array.isArray(json?.teams) ? (json.teams as unknown[]) : [];
  return teamsRaw.map((tRaw) => {
    const t = tRaw as { id: number; name: string; abbreviation?: string };
    return { id: t.id, name: t.name, abbreviation: t.abbreviation } as Team;
  });
}

export async function getTeamHittingStats(
  teamId: number,
  season: number,
  gameType: string = "R"
): Promise<TeamHitting> {
  const url = `${BASE}/teams/${teamId}/stats?stats=season&group=hitting&season=${season}&gameType=${gameType}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MLB team hitting ${res.status}`);
  const json = await res.json();
  const stat = json?.stats?.[0]?.splits?.[0]?.stat ?? {};
  return {
    avg: toNum(stat.avg),
    obp: toNum(stat.obp),
    slg: toNum(stat.slg),
    ops: toNum(stat.ops),
  };
}

export async function getTeamPitchingStats(
  teamId: number,
  season: number,
  gameType: string = "R"
): Promise<TeamPitching> {
  const url = `${BASE}/teams/${teamId}/stats?stats=season&group=pitching&season=${season}&gameType=${gameType}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MLB team pitching ${res.status}`);
  const json = await res.json();
  const stat = json?.stats?.[0]?.splits?.[0]?.stat ?? {};
  return {
    era: toNum(stat.era),
    whip: toNum(stat.whip),
  };
}

export async function getTeamSummary(
  teamId: number,
  season: number,
  gameType: string = "R"
): Promise<{ hitting: TeamHitting; pitching: TeamPitching }> {
  const [hitting, pitching] = await Promise.all([
    getTeamHittingStats(teamId, season, gameType),
    getTeamPitchingStats(teamId, season, gameType),
  ]);
  return { hitting, pitching };
}

// ---------------- Player & Roster helpers ----------------

export type RosterPlayer = {
  id: number;
  fullName: string;
  primaryNumber?: string;
  positionCode?: string; // e.g., 'P' for pitcher
};

async function fetchRosterOnce(
  teamId: number,
  season: number,
  rosterType: "active" | "40Man" | "fullRoster"
): Promise<RosterPlayer[]> {
  const url = `${BASE}/teams/${teamId}/roster?season=${season}&rosterType=${rosterType}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MLB roster ${res.status}`);
  const json = await res.json();
  const roster: unknown[] = Array.isArray(json?.roster) ? (json.roster as unknown[]) : [];
  return roster
    .map((r) => {
      const p = r as {
        person?: { id?: number; fullName?: string };
        jerseyNumber?: string;
        position?: { code?: string };
      };
      const id = p?.person?.id;
      const fullName = p?.person?.fullName;
      if (!id || !fullName) return null;
      return {
        id,
        fullName,
        primaryNumber: p?.jerseyNumber,
        positionCode: p?.position?.code,
      } as RosterPlayer;
    })
    .filter((x): x is RosterPlayer => !!x);
}

export async function getTeamRoster(
  teamId: number,
  season: number
): Promise<RosterPlayer[]> {
  // Try active roster first, then fall back to 40-man, then full roster
  try {
    const active = await fetchRosterOnce(teamId, season, "active");
    if (active.length) return active;
  } catch {
    // ignore and try next
  }
  try {
    const forty = await fetchRosterOnce(teamId, season, "40Man");
    if (forty.length) return forty;
  } catch {
    // ignore and try next
  }
  try {
    const full = await fetchRosterOnce(teamId, season, "fullRoster");
    return full;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`MLB roster fetch failed: ${msg}`);
  }
}

export async function getPlayerPitchingStats(
  personId: number,
  season: number,
  gameType: string = "R"
): Promise<PlayerPitching> {
  const url = `${BASE}/people/${personId}/stats?stats=season&group=pitching&season=${season}&gameType=${gameType}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MLB player pitching ${res.status}`);
  const json = await res.json();
  const stat = json?.stats?.[0]?.splits?.[0]?.stat ?? {};
  const ipOuts =
    // prefer outsPitched/outs if provided, else parse inningsPitched
    (typeof stat.outsPitched === "number" && Number.isFinite(stat.outsPitched)
      ? (stat.outsPitched as number)
      : typeof stat.outs === "number" && Number.isFinite(stat.outs)
      ? (stat.outs as number)
      : parseIPToOuts(stat.inningsPitched)) ?? undefined;

  const gs = toNum(stat.gamesStarted);

  return {
    era: toNum(stat.era),
    whip: toNum(stat.whip),
    inningsPitchedOuts: typeof ipOuts === "number" && Number.isFinite(ipOuts) ? ipOuts : undefined,
    gamesStarted: gs,
  } as PlayerPitching;
}

// ---------------- Player game logs (pitching) ----------------

export type PlayerPitchingGameLog = {
  date?: string; // ISO or YYYY-MM-DD
  gamePk?: number;
  opponentId?: number;
  er?: number;
  outs?: number;
};

export async function getPlayerPitchingGameLog(
  personId: number,
  season: number,
  gameType: string = "R"
): Promise<PlayerPitchingGameLog[]> {
  const url = `${BASE}/people/${personId}/stats?stats=gameLog&group=pitching&season=${season}&gameType=${gameType}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MLB player game log ${res.status}`);
  const json = await res.json();
  const splits: any[] = Array.isArray(json?.stats?.[0]?.splits) ? json.stats[0].splits : [];
  const items: PlayerPitchingGameLog[] = splits.map((sp) => {
    const stat = sp?.stat ?? {};
    const er = toNum(stat.earnedRuns);
    const outs =
      typeof stat.outsPitched === "number" && Number.isFinite(stat.outsPitched)
        ? (stat.outsPitched as number)
        : typeof stat.outs === "number" && Number.isFinite(stat.outs)
        ? (stat.outs as number)
        : parseIPToOuts(stat.inningsPitched);
    const date = sp?.date ?? sp?.game?.gameDate ?? undefined;
    const gamePk = sp?.game?.gamePk ?? undefined;
    const opponentId = sp?.team?.id ?? sp?.opponent?.id ?? undefined;
    return {
      date: typeof date === "string" ? date : undefined,
      gamePk: typeof gamePk === "number" ? gamePk : undefined,
      opponentId: typeof opponentId === "number" ? opponentId : undefined,
      er: typeof er === "number" ? er : undefined,
      outs: typeof outs === "number" ? outs : undefined,
    } as PlayerPitchingGameLog;
  });
  // keep only entries with ER and outs
  const filtered = items.filter((g) => typeof g.er === "number" && typeof g.outs === "number") as PlayerPitchingGameLog[];
  // sort ascending by date if available
  filtered.sort((a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime());
  return filtered;
}

export type ProbablePitcher = {
  id: number;
  fullName: string;
  gamePk: number;
  gameDate: string; // ISO
  side: "home" | "away";
};

function fmtDate(d: Date): string {
  // YYYY-MM-DD in local time
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export async function getNextProbablePitcher(
  teamId: number,
  opts?: { from?: Date; daysAhead?: number; gameType?: string }
): Promise<ProbablePitcher | null> {
  const from = opts?.from ?? new Date();
  const daysAhead = Math.max(1, opts?.daysAhead ?? 7);
  const end = new Date(from.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const gameType = opts?.gameType ?? "R";

  const url = new URL(`${BASE}/schedule`);
  url.searchParams.set("sportId", "1");
  url.searchParams.set("teamId", String(teamId));
  url.searchParams.set("startDate", fmtDate(from));
  url.searchParams.set("endDate", fmtDate(end));
  url.searchParams.set("gameType", gameType);
  url.searchParams.set("hydrate", "probablePitcher");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`MLB schedule ${res.status}`);
  const json = await res.json();
  const dates: any[] = Array.isArray(json?.dates) ? json.dates : [];
  const games: any[] = dates.flatMap((d: any) => (Array.isArray(d.games) ? d.games : []));
  // Filter upcoming or not-final games
  const upcoming = games
    .filter((g) => (g?.status?.abstractGameState ?? "").toLowerCase() !== "final")
    .sort((a, b) => (new Date(a.gameDate).getTime() || 0) - (new Date(b.gameDate).getTime() || 0));
  for (const g of upcoming) {
    const home = g?.teams?.home?.team?.id;
    const away = g?.teams?.away?.team?.id;
    const side: "home" | "away" | null = home === teamId ? "home" : away === teamId ? "away" : null;
    if (!side) continue;
    const prob = g?.teams?.[side]?.probablePitcher;
    const id = prob?.id;
    const name = prob?.fullName;
    if (id && name) {
      return {
        id,
        fullName: name,
        gamePk: g?.gamePk,
        gameDate: g?.gameDate,
        side,
      } as ProbablePitcher;
    }
  }
  return null;
}

// ---------------- Hitting stats & Lineups (batters) ----------------

export type PlayerHitting = {
  pa?: number;
  h?: number;
  hr?: number;
  doubles?: number;
  triples?: number;
  bb?: number;
  so?: number;
  hbp?: number;
};

/** Season hitting stats, optionally split by opposing pitcher hand. */
export async function getPlayerHittingStats(
  personId: number,
  season: number,
  gameType: string = "R",
  opposingHand?: "L" | "R"
): Promise<PlayerHitting> {
  const url = new URL(`${BASE}/people/${personId}/stats`);
  url.searchParams.set("stats", "season");
  url.searchParams.set("group", "hitting");
  url.searchParams.set("season", String(season));
  url.searchParams.set("gameType", gameType);
  if (opposingHand === "L" || opposingHand === "R") {
    url.searchParams.set("opposingHand", opposingHand);
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`MLB player hitting ${res.status}`);
  const json = await res.json();
  const stat = json?.stats?.[0]?.splits?.[0]?.stat ?? {};
  return {
    pa: toNum(stat.plateAppearances),
    h: toNum(stat.hits),
    hr: toNum(stat.homeRuns),
    doubles: toNum(stat.doubles),
    triples: toNum(stat.triples),
    bb: toNum(stat.baseOnBalls),
    so: toNum(stat.strikeOuts),
    hbp: toNum(stat.hitByPitch),
  } as PlayerHitting;
}

export type LineupBatter = {
  id: number;
  fullName: string;
  batSide?: "L" | "R" | "S";
  order: number; // 1..9 (as parsed from battingOrder)
};

/** Get batting order for gamePk and side from boxscore. */
export async function getGameLineup(
  gamePk: number,
  side: "home" | "away"
): Promise<LineupBatter[]> {
  const url = `${BASE}/game/${gamePk}/boxscore`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MLB boxscore ${res.status}`);
  const json = await res.json();
  const team = json?.teams?.[side];
  const playersObj = team?.players ?? {};
  const raw: any[] = Object.values(playersObj);
  const items = raw
    .map((p: any) => {
      const bo = p?.battingOrder;
      if (bo == null) return null;
      const order = Number.parseInt(String(bo), 10);
      if (!Number.isFinite(order)) return null;
      const person = p?.person ?? {};
      const posCode = (p?.position?.code ?? p?.position?.abbreviation ?? "").toUpperCase();
      if (posCode === "P") return null; // skip pitchers in NL-like contexts
      const batSide = p?.batSide?.code ?? p?.person?.batSide?.code;
      return {
        id: person.id,
        fullName: person.fullName,
        batSide: typeof batSide === "string" ? (batSide as any) : undefined,
        order,
      } as LineupBatter;
    })
    .filter((x: any): x is LineupBatter => !!x)
    .sort((a: LineupBatter, b: LineupBatter) => a.order - b.order);

  // normalize dedup and keep first 9
  const out: LineupBatter[] = [];
  const seen = new Set<number>();
  for (const b of items) {
    if (seen.has(b.id)) continue;
    out.push(b);
    seen.add(b.id);
    if (out.length >= 9) break;
  }
  return out;
}

export type NextTeamGame = {
  teamId: number;
  side: "home" | "away";
  gamePk: number;
  gameDate: string; // ISO
  opponentId?: number;
};

/**
 * Find the next scheduled game for a team, regardless of probables.
 */
export async function getNextTeamGame(
  teamId: number,
  opts?: { from?: Date; daysAhead?: number; gameType?: string }
): Promise<NextTeamGame | null> {
  const from = opts?.from ?? new Date();
  const daysAhead = Math.max(1, opts?.daysAhead ?? 7);
  const end = new Date(from.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const gameType = opts?.gameType ?? "R";

  const url = new URL(`${BASE}/schedule`);
  url.searchParams.set("sportId", "1");
  url.searchParams.set("teamId", String(teamId));
  url.searchParams.set("startDate", fmtDate(from));
  url.searchParams.set("endDate", fmtDate(end));
  url.searchParams.set("gameType", gameType);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`MLB schedule ${res.status}`);
  const json = await res.json();
  const dates: any[] = Array.isArray(json?.dates) ? json.dates : [];
  const games: any[] = dates.flatMap((d: any) => (Array.isArray(d.games) ? d.games : []));
  const upcoming = games
    .filter((g) => (g?.status?.abstractGameState ?? "").toLowerCase() !== "final")
    .sort((a, b) => (new Date(a.gameDate).getTime() || 0) - (new Date(b.gameDate).getTime() || 0));
  for (const g of upcoming) {
    const home = g?.teams?.home?.team?.id;
    const away = g?.teams?.away?.team?.id;
    const side: "home" | "away" | null = home === teamId ? "home" : away === teamId ? "away" : null;
    if (!side) continue;
    const opponentId = side === "home" ? away : home;
    const gamePk = g?.gamePk;
    const gameDate = g?.gameDate;
    if (Number.isFinite(gamePk) && typeof gameDate === "string") {
      return {
        teamId,
        side,
        gamePk,
        gameDate,
        opponentId: typeof opponentId === "number" ? opponentId : undefined,
      } as NextTeamGame;
    }
  }
  return null;
}

export async function getNextGameLineup(
  teamId: number,
  opts?: { from?: Date; daysAhead?: number; gameType?: string }
): Promise<{
  teamId: number;
  side: "home" | "away";
  gamePk: number;
  gameDate: string;
  lineup: LineupBatter[];
}> {
  // Prefer schedule-based next game (works even if no probables yet)
  const ng = await getNextTeamGame(teamId, opts);
  if (!ng) throw new Error("Next game not found for team");
  const lineup = await getGameLineup(ng.gamePk, ng.side).catch(() => [] as LineupBatter[]);
  return { teamId, side: ng.side, gamePk: ng.gamePk, gameDate: ng.gameDate, lineup };
}

// -------- Predictive lineups (fallback when next game's lineup is not posted) --------

export type RecentLineup = { gamePk: number; gameDate: string; side: "home" | "away"; lineup: LineupBatter[] };

/** Fetch up to `limit` recent final-game lineups for a team. */
export async function getRecentLineupsForTeam(
  teamId: number,
  opts?: { from?: Date; daysBack?: number; limit?: number; gameType?: string }
): Promise<RecentLineup[]> {
  const from = opts?.from ?? new Date();
  const daysBack = Math.max(1, opts?.daysBack ?? 14);
  const start = new Date(from.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const end = from; // include today (will filter by status)
  const gameType = opts?.gameType ?? "R";
  const limit = Math.max(1, Math.min(10, opts?.limit ?? 3));

  const url = new URL(`${BASE}/schedule`);
  url.searchParams.set("sportId", "1");
  url.searchParams.set("teamId", String(teamId));
  url.searchParams.set("startDate", fmtDate(start));
  url.searchParams.set("endDate", fmtDate(end));
  url.searchParams.set("gameType", gameType);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`MLB schedule ${res.status}`);
  const json = await res.json();
  const dates: any[] = Array.isArray(json?.dates) ? json.dates : [];
  const games: any[] = dates.flatMap((d: any) => (Array.isArray(d.games) ? d.games : []));
  const finalsDesc = games
    .filter((g) => (g?.status?.abstractGameState ?? "").toLowerCase() === "final")
    .sort((a, b) => (new Date(b.gameDate).getTime() || 0) - (new Date(a.gameDate).getTime() || 0));

  const out: RecentLineup[] = [];
  for (const g of finalsDesc) {
    if (out.length >= limit) break;
    const home = g?.teams?.home?.team?.id;
    const away = g?.teams?.away?.team?.id;
    const side: "home" | "away" | null = home === teamId ? "home" : away === teamId ? "away" : null;
    if (!side) continue;
    const gamePk = g?.gamePk;
    const gameDate = g?.gameDate;
    try {
      const lu = await getGameLineup(gamePk, side);
      if (lu.length) out.push({ gamePk, gameDate, side, lineup: lu });
    } catch {
      // ignore
    }
  }
  return out;
}

/**
 * Predict a 9-man batting order from recent lineups.
 * Strategy: for each spot 1..9, pick the most frequent (breaking ties by recency)
 * without duplicating players; then fill remaining with overall frequency; then roster fallback.
 */
export function predictLineupFromRecent(
  recent: RecentLineup[],
  roster?: RosterPlayer[]
): LineupBatter[] {
  if (!Array.isArray(recent) || recent.length === 0) return [];
  type Cand = { id: number; fullName: string; batSide?: "L" | "R" | "S"; count: number; lastSeenIdx: number };

  // Per-order candidate maps
  const orderCands: Map<number, Map<number, Cand>> = new Map();
  const overall: Map<number, Cand> = new Map();

  recent.forEach((r, idx) => {
    const recencyIdx = idx; // 0 = most recent because recent sorted desc when assembled
    r.lineup.forEach((b, i) => {
      const ord = Math.max(1, Math.min(9, (b.order || (i + 1))));
      const byOrd = orderCands.get(ord) ?? new Map<number, Cand>();
      const prev = byOrd.get(b.id) ?? { id: b.id, fullName: b.fullName, batSide: b.batSide, count: 0, lastSeenIdx: recencyIdx };
      const cand = { ...prev, count: prev.count + 1, lastSeenIdx: Math.min(prev.lastSeenIdx, recencyIdx) };
      byOrd.set(b.id, cand);
      orderCands.set(ord, byOrd);

      const prevAll = overall.get(b.id) ?? { id: b.id, fullName: b.fullName, batSide: b.batSide, count: 0, lastSeenIdx: recencyIdx };
      const candAll = { ...prevAll, count: prevAll.count + 1, lastSeenIdx: Math.min(prevAll.lastSeenIdx, recencyIdx) };
      overall.set(b.id, candAll);
    });
  });

  const chosen = new Set<number>();
  const pickBest = (cmap: Map<number, Cand>): Cand | null => {
    const arr = Array.from(cmap.values());
    arr.sort((a, b) =>
      b.count - a.count ||
      a.lastSeenIdx - b.lastSeenIdx ||
      a.fullName.localeCompare(b.fullName)
    );
    for (const c of arr) {
      if (!chosen.has(c.id)) return c;
    }
    return null;
  };

  const result: LineupBatter[] = [];
  // First pass: per-order best
  for (let ord = 1; ord <= 9; ord++) {
    const cmap = orderCands.get(ord);
    const pick = cmap ? pickBest(cmap) : null;
    if (pick) {
      chosen.add(pick.id);
      result.push({ id: pick.id, fullName: pick.fullName, batSide: pick.batSide, order: ord });
    }
  }

  // Fill remaining with overall frequency
  if (result.length < 9 && overall.size) {
    const needed = 9 - result.length;
    const arr = Array.from(overall.values())
      .filter((c) => !chosen.has(c.id))
      .sort((a, b) => b.count - a.count || a.lastSeenIdx - b.lastSeenIdx || a.fullName.localeCompare(b.fullName))
      .slice(0, needed);
    for (const [i, c] of arr.entries()) {
      const ord = result.length + i + 1;
      chosen.add(c.id);
      result.push({ id: c.id, fullName: c.fullName, batSide: c.batSide, order: ord });
    }
  }

  // Final fallback: roster non-pitchers (if provided)
  if (result.length < 9 && Array.isArray(roster) && roster.length) {
    const hitters = roster.filter((p) => (p.positionCode ?? "").toUpperCase() !== "P");
    for (const p of hitters) {
      if (result.length >= 9) break;
      if (chosen.has(p.id)) continue;
      chosen.add(p.id);
      result.push({ id: p.id, fullName: p.fullName, order: result.length + 1 });
    }
  }

  // Normalize orders 1..9
  return result
    .slice(0, 9)
    .map((b, i) => ({ ...b, order: i + 1 }));
}

export async function predictNextGameLineup(
  teamId: number,
  opts?: { from?: Date; daysAhead?: number; daysBack?: number; recentLimit?: number; gameType?: string }
): Promise<{
  teamId: number;
  side: "home" | "away";
  gamePk: number;
  gameDate: string;
  lineup: LineupBatter[];
  predicted: boolean;
  basedOnGames: number;
}> {
  const ng = await getNextTeamGame(teamId, { from: opts?.from, daysAhead: opts?.daysAhead, gameType: opts?.gameType });
  if (!ng) throw new Error("Next game not found for team");
  const recent = await getRecentLineupsForTeam(teamId, {
    from: opts?.from,
    daysBack: opts?.daysBack ?? 14,
    limit: Math.max(1, Math.min(10, opts?.recentLimit ?? 3)),
    gameType: opts?.gameType ?? "R",
  });
  let roster: RosterPlayer[] | undefined;
  try {
    roster = await getTeamRoster(teamId, new Date(ng.gameDate).getFullYear());
  } catch {
    roster = undefined;
  }
  const lineup = predictLineupFromRecent(recent, roster);
  return {
    teamId,
    side: ng.side,
    gamePk: ng.gamePk,
    gameDate: ng.gameDate,
    lineup,
    predicted: true,
    basedOnGames: recent.length,
  };
}

// ---------------- Player info (handedness) ----------------

export type PlayerInfo = {
  id: number;
  fullName?: string;
  pitchHand?: "L" | "R";
  batSide?: "L" | "R" | "S";
};

export async function getPlayerInfo(personId: number): Promise<PlayerInfo> {
  const url = `${BASE}/people/${personId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MLB people ${res.status}`);
  const json = await res.json();
  const p = Array.isArray(json?.people) && json.people[0] ? json.people[0] : {};
  const pitch = p?.pitchHand?.code;
  const bat = p?.batSide?.code;
  return {
    id: Number(p?.id) || personId,
    fullName: p?.fullName,
    pitchHand: typeof pitch === "string" ? (pitch as any) : undefined,
    batSide: typeof bat === "string" ? (bat as any) : undefined,
  } as PlayerInfo;
}

// ---------------- Game probables from gamePk ----------------

export type GameProbables = {
  home?: { id?: number; fullName?: string };
  away?: { id?: number; fullName?: string };
};

export async function getGameProbables(gamePk: number): Promise<GameProbables> {
  // Use schedule API with hydrate=probablePitcher for a specific gamePk
  const url = new URL(`${BASE}/schedule`);
  url.searchParams.set("sportId", "1");
  url.searchParams.set("gamePk", String(gamePk));
  url.searchParams.set("hydrate", "probablePitcher");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`MLB schedule (probables) ${res.status}`);
  const json = await res.json();
  const dates: any[] = Array.isArray(json?.dates) ? json.dates : [];
  const games: any[] = dates.flatMap((d: any) => (Array.isArray(d.games) ? d.games : []));
  const g = games.find((x: any) => Number(x?.gamePk) === Number(gamePk));
  if (!g) return {} as GameProbables;
  const homePP = g?.teams?.home?.probablePitcher ?? g?.probablePitchers?.home ?? null;
  const awayPP = g?.teams?.away?.probablePitcher ?? g?.probablePitchers?.away ?? null;
  const home = homePP && (homePP.id || homePP.person?.id)
    ? { id: homePP.id ?? homePP.person?.id, fullName: homePP.fullName ?? homePP.person?.fullName }
    : undefined;
  const away = awayPP && (awayPP.id || awayPP.person?.id)
    ? { id: awayPP.id ?? awayPP.person?.id, fullName: awayPP.fullName ?? awayPP.person?.fullName }
    : undefined;
  return { home, away } as GameProbables;
}

// ---------------- Game teams (ids) from gamePk ----------------

export async function getGameTeams(
  gamePk: number
): Promise<{ homeTeamId?: number; awayTeamId?: number; gameDate?: string }> {
  const url = new URL(`${BASE}/schedule`);
  url.searchParams.set("sportId", "1");
  url.searchParams.set("gamePk", String(gamePk));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`MLB schedule (teams) ${res.status}`);
  const json = await res.json();
  const dates: any[] = Array.isArray(json?.dates) ? json.dates : [];
  const games: any[] = dates.flatMap((d: any) => (Array.isArray(d.games) ? d.games : []));
  const g = games.find((x: any) => Number(x?.gamePk) === Number(gamePk));
  if (!g) return {};
  const homeTeamId = g?.teams?.home?.team?.id;
  const awayTeamId = g?.teams?.away?.team?.id;
  const gameDate = g?.gameDate;
  return {
    homeTeamId: typeof homeTeamId === "number" ? homeTeamId : undefined,
    awayTeamId: typeof awayTeamId === "number" ? awayTeamId : undefined,
    gameDate: typeof gameDate === "string" ? gameDate : undefined,
  };
}
