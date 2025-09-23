import { Row } from "./ui/Row";
import { Diamond } from "./ui/Diamond";

export function ScoreboardPanel({
  title = "Baseball Simulator",
  statusLine,
  pitchLine,
  awayScore,
  homeScore,
  bases,
  awayLabel = "Away",
  homeLabel = "Home",
  children,
}: {
  title?: string;
  statusLine: string;
  pitchLine: string;
  awayScore: number;
  homeScore: number;
  bases: { first: boolean; second: boolean; third: boolean };
  awayLabel?: string;
  homeLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="card scoreboard">
      <header>
        <h2 className="h1">{title}</h2>
        <p className="muted">{statusLine}</p>
        <p className="muted">{pitchLine}</p>
      </header>

      <Row name={awayLabel} value={awayScore} />
      <Row name={homeLabel} value={homeScore} />

      <div>
        <h3 className="h2">Bases</h3>
        <Diamond bases={bases} />
      </div>

      {children}
    </div>
  );
}

