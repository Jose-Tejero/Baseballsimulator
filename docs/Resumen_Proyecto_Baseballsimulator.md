# Baseballsimulator — Resumen del proyecto

Fecha: (actualizar según necesidad)

## Propósito y alcance
Baseballsimulator es un simulador interactivo de béisbol con interfaz web (React) y motor de reglas en TypeScript. Permite representar y manipular el estado de un juego (inning, mitad, outs, bases, marcador) y modela la resolución de jugadas con heurísticas estocásticas. Además integra datos de la MLB (StatsAPI) para obtener equipos, rosters, lineups y estadísticas, habilitando análisis y futuras automatizaciones.

## Tecnologías clave
- Frontend: React 19 + TypeScript, Vite 7.
- Calidad: ESLint (config TS moderna).
- Herramientas: scripts auxiliares en TypeScript/JS para simulaciones y trazas.

## Estructura principal
- `src/engine/baseball.ts`: motor del juego. Define tipos (estado, eventos), reglas por defecto, normalización de reglas (extras vs empates), avance de corredores, outs y anotaciones con probabilidades calibrables (K, GB, FB, LD; doble jugada DP, fly de sacrificio SF).
- `src/components/Scoreboard.tsx`: marcador interactivo para ajustar carreras, outs, bases y mitad de inning; incluye desglose de outs (K/GB/FB/LD), DP y SF.
- `src/services/mlb.ts`: integración con MLB StatsAPI. Endpoints para equipos, estadísticas de bateo y pitcheo, roster, probables, boxscore/lineups, game logs de pitchers y predicción de lineups basada en históricos recientes y roster.
- `src/App.tsx`, `src/Game.tsx`, estilos (`src/App.css`, `src/index.css`) y bootstrap (`src/main.tsx`).
- `scripts/`: utilidades de simulación/depuración (`sim-trace`, `quick-mc`, etc.).

## Motor de simulación (resumen)
- Estado: inning, mitad (alta/baja), outs, ocupación de bases, marcador, reglas y estado de fin de juego.
- Reglas: entradas reglamentarias, empates permitidos, entradas extra, walk-off, y opción de mercy rule. Se normalizan para evitar estados sin salida (si no hay extras y no hay empates, se habilitan extras).
- Eventos y avances: modelado probabilístico de sencillos/dobles/triples y outs con desagregado en K/GB/FB/LD; avance de corredores con tablas heurísticas dependientes de outs; manejo de DP y SF; anotación y cambio de mitad/entrada.
- Finalización: ganador por marcador, soporte de extras, walk-off, tope de entradas.

## Interfaz de usuario
- Marcador con controles para sumar carreras (home/away), alternar bases (1B, 2B, 3B), registrar outs y pasar de inning.
- Panel de detalle para contabilizar K, GB, FB, LD, DP y SF, afectando los outs.

## Integraciones MLB (StatsAPI)
- Equipos y estadísticas de temporada (bateo/pitcheo).
- Roster del equipo (activo, 40-man o completo de respaldo).
- Próximos partidos y probables; obtención de lineups del boxscore; juego siguiente y oponente.
- Game logs de pitchers (ER y outs) y utilidades de parseo de innings pitched a outs.
- Predicción de lineup (9 bateadores) a partir de recientes finales, con desempates por frecuencia/recencia y respaldo por roster.

## Cómo ejecutar
1. Instalar dependencias:
   ```bash
   npm ci
   ```
2. Desarrollo:
   ```bash
   npm run dev
   ```
3. Build de producción:
   ```bash
   npm run build
   ```

## Estado del repositorio
- Rama principal: `main`
- Remoto: `origin` → https://github.com/Jose-Tejero/Baseballsimulator.git
- Commit inicial: `chore: initial commit` (estructura base, motor, UI y servicios).

## Próximos pasos sugeridos
- CI en GitHub Actions (lint + build).
- Pruebas unitarias del motor (reglas y avances).
- Parametrización/calibración de probabilidades y reglas (mercy, extras).
- Internacionalización (ES/EN) y accesibilidad.
- Persistencia del estado de juego/sesiones y escenarios preconfigurados.

> Nota: este Markdown facilita revisiones con diffs en Git. Existe también una versión RTF en `docs/Resumen_Proyecto_Baseballsimulator.rtf` para edición en Microsoft Word.

