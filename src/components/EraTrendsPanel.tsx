import { EraTrendCard } from "./ui/EraTrendCard";
import type { GameERIP } from "../engine/eraBuff";

export function EraTrendsPanel({
  awayTitle,
  homeTitle,
  away,
  home,
}: {
  awayTitle: string;
  homeTitle: string;
  away: { seasonEra: number | null; seasonIPOuts: number | null; teamEra: number; series: GameERIP[] | null };
  home: { seasonEra: number | null; seasonIPOuts: number | null; teamEra: number; series: GameERIP[] | null };
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <EraTrendCard
        title={awayTitle}
        seasonEra={away.seasonEra}
        seasonIPOuts={away.seasonIPOuts}
        teamEra={away.teamEra}
        series={away.series}
      />
      <EraTrendCard
        title={homeTitle}
        seasonEra={home.seasonEra}
        seasonIPOuts={home.seasonIPOuts}
        teamEra={home.teamEra}
        series={home.series}
      />
    </div>
  );
}

