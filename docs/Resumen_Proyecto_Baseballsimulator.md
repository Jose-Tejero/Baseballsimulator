# Baseballsimulator a Resumen del proyecto

Fecha: (actualizar segAn necesidad)

## PropAsito y alcance
Baseballsimulator es un simulador interactivo de bAisbol con interfaz web (React) y motor de reglas en TypeScript. Permite representar y manipular el estado de un juego (inning, mitad, outs, bases, marcador) y modela la resoluciAn de jugadas con heurAsticas estocAsticas. AdemAs integra datos de la MLB (StatsAPI) para obtener equipos, rosters, lineups y estadAsticas, habilitando anAlisis y futuras automatizaciones.

## TecnologAas clave
- Frontend: React 19 + TypeScript, Vite 7.
- Calidad: ESLint (config TS moderna).
- Herramientas: scripts auxiliares en TypeScript/JS para simulaciones y trazas.

## Estructura principal
- `src/engine/baseball.ts`: motor del juego. Define tipos (estado, eventos), reglas por defecto, normalizaciAn de reglas (extras vs empates), avance de corredores, outs y anotaciones con probabilidades calibrables (K, GB, FB, LD; doble jugada DP, fly de sacrificio SF).
- `src/components/Scoreboard.tsx`: marcador interactivo para ajustar carreras, outs, bases y mitad de inning; incluye desglose de outs (K/GB/FB/LD), DP y SF.
- `src/services/mlb.ts`: integraciAn con MLB StatsAPI. Endpoints para equipos, estadAsticas de bateo y pitcheo, roster, probables, boxscore/lineups, game logs de pitchers y predicciAn de lineups basada en histAricos recientes y roster.
- `src/App.tsx`, `src/Game.tsx`, estilos (`src/App.css`, `src/index.css`) y bootstrap (`src/main.tsx`).
- `scripts/`: utilidades de simulaciAn/depuraciAn (`sim-trace`, `quick-mc`, etc.).

## Motor de simulaciAn (resumen)
- Estado: inning, mitad (alta/baja), outs, ocupaciAn de bases, marcador, reglas y estado de fin de juego.
- Reglas: entradas reglamentarias, empates permitidos, entradas extra, walk-off, y opciAn de mercy rule. Se normalizan para evitar estados sin salida (si no hay extras y no hay empates, se habilitan extras).
- Eventos y avances: modelado probabilAstico de sencillos/dobles/triples y outs con desagregado en K/GB/FB/LD; avance de corredores con tablas heurAsticas dependientes de outs; manejo de DP y SF; anotaciAn y cambio de mitad/entrada.
- FinalizaciAn: ganador por marcador, soporte de extras, walk-off, tope de entradas.

## Interfaz de usuario
- Marcador con controles para sumar carreras (home/away), alternar bases (1B, 2B, 3B), registrar outs y pasar de inning.
- Panel de detalle para contabilizar K, GB, FB, LD, DP y SF, afectando los outs.

## Integraciones MLB (StatsAPI)
- Equipos y estadAsticas de temporada (bateo/pitcheo).
- Roster del equipo (activo, 40-man o completo de respaldo).
- PrAximos partidos y probables; obtenciAn de lineups del boxscore; juego siguiente y oponente.
- Game logs de pitchers (ER y outs) y utilidades de parseo de innings pitched a outs.
- PredicciAn de lineup (9 bateadores) a partir de recientes finales, con desempates por frecuencia/recencia y respaldo por roster.

## CAmo ejecutar
1. Instalar dependencias:
   ```bash
   npm ci
   ```
2. Desarrollo:
   ```bash
   npm run dev
   ```
3. Build de producciAn:
   ```bash
   npm run build
   ```

## Estado del repositorio
- Rama principal: `main`
- Remoto: `origin` a https://github.com/Jose-Tejero/Baseballsimulator.git
- Commit inicial: `chore: initial commit` (estructura base, motor, UI y servicios).

## PrAximos pasos sugeridos
- CI en GitHub Actions (lint + build).
- Pruebas unitarias del motor (reglas y avances).
- ParametrizaciAn/calibraciAn de probabilidades y reglas (mercy, extras).
- InternacionalizaciAn (ES/EN) y accesibilidad.
- Persistencia del estado de juego/sesiones y escenarios preconfigurados.

> Nota: este Markdown facilita revisiones con diffs en Git. Existe tambiAn una versiAn RTF en `docs/Resumen_Proyecto_Baseballsimulator.rtf` para ediciAn en Microsoft Word.



