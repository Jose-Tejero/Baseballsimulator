# Baseballsimulator a€” Resumen del proyecto

Fecha: (actualizar segAºn necesidad)

## PropA³sito y alcance
Baseballsimulator es un simulador interactivo de bA©isbol con interfaz web (React) y motor de reglas en TypeScript. Permite representar y manipular el estado de un juego (inning, mitad, outs, bases, marcador) y modela la resoluciA³n de jugadas con heurA­sticas estocA¡sticas. AdemA¡s integra datos de la MLB (StatsAPI) para obtener equipos, rosters, lineups y estadA­sticas, habilitando anA¡lisis y futuras automatizaciones.

## TecnologA­as clave
- Frontend: React 19 + TypeScript, Vite 7.
- Calidad: ESLint (config TS moderna).
- Herramientas: scripts auxiliares en TypeScript/JS para simulaciones y trazas.

## Estructura principal
- `src/engine/baseball.ts`: motor del juego. Define tipos (estado, eventos), reglas por defecto, normalizaciA³n de reglas (extras vs empates), avance de corredores, outs y anotaciones con probabilidades calibrables (K, GB, FB, LD; doble jugada DP, fly de sacrificio SF).
- `src/components/Scoreboard.tsx`: marcador interactivo para ajustar carreras, outs, bases y mitad de inning; incluye desglose de outs (K/GB/FB/LD), DP y SF.
- `src/services/mlb.ts`: integraciA³n con MLB StatsAPI. Endpoints para equipos, estadA­sticas de bateo y pitcheo, roster, probables, boxscore/lineups, game logs de pitchers y predicciA³n de lineups basada en histA³ricos recientes y roster.
- `src/App.tsx`, `src/Game.tsx`, estilos (`src/App.css`, `src/index.css`) y bootstrap (`src/main.tsx`).
- `scripts/`: utilidades de simulaciA³n/depuraciA³n (`sim-trace`, `quick-mc`, etc.).

## Motor de simulaciA³n (resumen)
- Estado: inning, mitad (alta/baja), outs, ocupaciA³n de bases, marcador, reglas y estado de fin de juego.
- Reglas: entradas reglamentarias, empates permitidos, entradas extra, walk-off, y opciA³n de mercy rule. Se normalizan para evitar estados sin salida (si no hay extras y no hay empates, se habilitan extras).
- Eventos y avances: modelado probabilA­stico de sencillos/dobles/triples y outs con desagregado en K/GB/FB/LD; avance de corredores con tablas heurA­sticas dependientes de outs; manejo de DP y SF; anotaciA³n y cambio de mitad/entrada.
- FinalizaciA³n: ganador por marcador, soporte de extras, walk-off, tope de entradas.

## Interfaz de usuario
- Marcador con controles para sumar carreras (home/away), alternar bases (1B, 2B, 3B), registrar outs y pasar de inning.
- Panel de detalle para contabilizar K, GB, FB, LD, DP y SF, afectando los outs.

## Integraciones MLB (StatsAPI)
- Equipos y estadA­sticas de temporada (bateo/pitcheo).
- Roster del equipo (activo, 40-man o completo de respaldo).
- PrA³ximos partidos y probables; obtenciA³n de lineups del boxscore; juego siguiente y oponente.
- Game logs de pitchers (ER y outs) y utilidades de parseo de innings pitched a outs.
- PredicciA³n de lineup (9 bateadores) a partir de recientes finales, con desempates por frecuencia/recencia y respaldo por roster.

## CA³mo ejecutar
1. Instalar dependencias:
   ```bash
   npm ci
   ```
2. Desarrollo:
   ```bash
   npm run dev
   ```
3. Build de producciA³n:
   ```bash
   npm run build
   ```

## Estado del repositorio
- Rama principal: `main`
- Remoto: `origin` a†’ https://github.com/Jose-Tejero/Baseballsimulator.git
- Commit inicial: `chore: initial commit` (estructura base, motor, UI y servicios).

## PrA³ximos pasos sugeridos
- CI en GitHub Actions (lint + build).
- Pruebas unitarias del motor (reglas y avances).
- ParametrizaciA³n/calibraciA³n de probabilidades y reglas (mercy, extras).
- InternacionalizaciA³n (ES/EN) y accesibilidad.
- Persistencia del estado de juego/sesiones y escenarios preconfigurados.

> Nota: este Markdown facilita revisiones con diffs en Git. Existe tambiA©n una versiA³n RTF en `docs/Resumen_Proyecto_Baseballsimulator.rtf` para ediciA³n en Microsoft Word.


