import { monteCarlo, type TeamPitch, type TeamBatSlash } from "../src/engine/baseball";

function run(label: string, home: { bat: TeamBatSlash; pitch: TeamPitch }, away: { bat: TeamBatSlash; pitch: TeamPitch }) {
  const res = monteCarlo(home, away, 2000);
  console.log(`\n== ${label} ==`);
  console.log(`Home win%: ${(res.homeWinPct * 100).toFixed(1)}%`);
  console.log(`Away win%: ${(res.awayWinPct * 100).toFixed(1)}%`);
  console.log(`Home runs: ${res.avgHomeRuns.toFixed(2)}  Away runs: ${res.avgAwayRuns.toFixed(2)}`);
}

// Symmetric test (should be ~50/50 with slight home edge)
const bat: TeamBatSlash = { AVG: 0.260, OBP: 0.325, SLG: 0.410 };
const pit: TeamPitch = { ERA: 4.20, WHIP: 1.30 };
run("Symmetric", { bat, pitch: pit }, { bat, pitch: pit });

// Stronger HOME (better bat and pitch)
run(
  "Home stronger",
  { bat: { AVG: 0.270, OBP: 0.335, SLG: 0.430 }, pitch: { ERA: 3.80, WHIP: 1.20 } },
  { bat: { AVG: 0.250, OBP: 0.315, SLG: 0.390 }, pitch: { ERA: 4.60, WHIP: 1.35 } }
);

// Stronger AWAY (invert)
run(
  "Away stronger",
  { bat: { AVG: 0.250, OBP: 0.315, SLG: 0.390 }, pitch: { ERA: 4.60, WHIP: 1.35 } },
  { bat: { AVG: 0.270, OBP: 0.335, SLG: 0.430 }, pitch: { ERA: 3.80, WHIP: 1.20 } }
);

