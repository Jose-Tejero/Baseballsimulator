# Hooks de datos MLB (Fase 3)

Ubicación: `src/hooks/mlb/`

## LoadState

`src/hooks/types.ts` exporta `LoadState<T>` y utilidades (`keyOf`, `AsyncCache`).

## Hooks

- `useTeams(season) -> { data, loading, error }`
  - Lista de equipos para la temporada.
  - Cache por `season` y deduplicación en vuelo.

- `useTeamSummary(teamId, season) -> { data: { hitting, pitching }, loading, error }`
  - Resumen de AVG/OBP/SLG y ERA/WHIP del equipo.

- `useRoster(teamId, season) -> { data: RosterPlayer[], loading, error, count }`
  - Roster (intenta active → 40-man → full). Devuelve también `count`.

- `useProbable(teamId, opts?) -> { data: { id, fullName, gamePk, gameDate, side }, loading, error, hand?, info? }`
  - Probable pitcher próximo (si existe) y su mano (`L`/`R`).

- `useNextGameLineup(teamId, season) -> { data: { roster, side, gamePk, gameDate }, loading, error, predicted?, basedOnGames? }`
  - Intenta lineup oficial del próximo juego; si no hay, predice a partir de recientes.
  - Construye `Roster` con rates por PA (splits vs L/R con fallback a overall).

- `useAnchoredLineups(gamePk, season) -> { data: { home, away, hands }, loading, error, gamePk }`
  - Carga lineups HOME/AWAY para un mismo `gamePk`; si falta alguno, predice desde recientes.
  - `home/away` incluyen `{ roster, info, predicted }` y `hands` expone manos de abridores si se conocen.

## Ejemplo de uso mínimo en `Game.tsx`

```ts
import { useTeams } from "./hooks/mlb";

export default function Game() {
  const [season, setSeason] = useState(2025);
  const [teams, setTeams] = useState<Team[]>([]);
  const teamsState = useTeams(season);
  useEffect(() => {
    if (teamsState.data) setTeams(teamsState.data);
  }, [teamsState.data]);
  // ... resto de la UI
}
```

Siguientes sustituciones recomendadas (incremental):
- Reemplazar `useEffect` de resumen de equipo por `useTeamSummary` (actualiza AVG/OBP/SLG/ERA/WHIP).
- Reemplazar carga de `Roster` por `useRoster` (con ordenado y filtro de pitchers en la vista si se desea).
- Centralizar cargas de probables con `useProbable` (y fijar mano automáticamente).
- Mover `loadRealLineup` y `loadAnchoredLineups` a `useNextGameLineup` y `useAnchoredLineups`.

