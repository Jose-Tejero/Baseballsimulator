import type { Batter, BatterRates, Hand, RateLine, Roster } from "../../engine/baseball";
import type { PlayerHitting, PlayerInfo } from "../../services/mlb";
import { getPlayerHittingStats, getPlayerInfo } from "../../services/mlb";

export function toRateLineFromHitting(s: PlayerHitting): RateLine {
  const pa = Math.max(0, Number((s as any)?.pa ?? 0));
  const safe = pa > 0 ? pa : 1;
  const h = Math.max(0, Number((s as any)?.h ?? 0)) / safe;
  const hr = Math.max(0, Number((s as any)?.hr ?? 0)) / safe;
  const doubles = Math.max(0, Number((s as any)?.doubles ?? 0)) / safe;
  const triples = Math.max(0, Number((s as any)?.triples ?? 0)) / safe;
  const bb = Math.max(0, Number((s as any)?.bb ?? 0)) / safe;
  const k = Math.max(0, Number((s as any)?.so ?? 0)) / safe;
  const hbp = Math.max(0, Number((s as any)?.hbp ?? 0)) / safe;
  return { h, hr, double: doubles, triple: triples, bb, k, hbp } as RateLine;
}

/** Fetch splits vs L/R with fallback to season overall; also enrich hand. */
export async function buildBatterRates(
  personId: number,
  season: number
): Promise<{ rates: BatterRates; hand: Hand; info?: PlayerInfo }>
{
  const [vsL, vsR] = await Promise.all([
    getPlayerHittingStats(personId, season, "R", "L").catch(() => ({} as PlayerHitting)),
    getPlayerHittingStats(personId, season, "R", "R").catch(() => ({} as PlayerHitting)),
  ]);
  const pinfo = await getPlayerInfo(personId).catch(() => null);
  let overall: PlayerHitting | null = null;
  if (!(vsL as any).pa || !(vsR as any).pa) {
    overall = await getPlayerHittingStats(personId, season, "R").catch(() => ({} as PlayerHitting));
  }
  const mk = (s: PlayerHitting | null | undefined) =>
    toRateLineFromHitting(s && (s as any).pa ? s : overall ?? ({} as PlayerHitting));
  const rates = { vsL: mk(vsL), vsR: mk(vsR) } as BatterRates;
  const handRaw = (pinfo?.batSide as Hand) ?? ("R" as Hand);
  const hand: Hand = handRaw === "L" || handRaw === "R" || handRaw === "S" ? handRaw : "R";
  return { rates, hand, info: pinfo ?? undefined };
}

/** Build roster from a lineup array of { id, fullName, batSide? } */
export async function buildRosterFromLineup(
  lineup: { id: number; fullName: string; batSide?: string }[],
  season: number
): Promise<Roster> {
  const batters: Batter[] = await Promise.all(
    lineup.slice(0, 9).map(async (b) => {
      const { rates, hand } = await buildBatterRates(b.id, season);
      return { id: String(b.id), name: b.fullName, hand, rates } as Batter;
    })
  );
  const players: Record<string, Batter> = {};
  batters.forEach((p) => (players[p.id] = p));
  const orderIds = lineup.slice(0, 9).map((b) => String(b.id));
  return { players, lineupVsL: orderIds, lineupVsR: orderIds } as Roster;
}

