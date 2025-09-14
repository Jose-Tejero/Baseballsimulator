/**
 * ERA trend-based buff/nerf module.
 *
 * Dado un historial por juego de ER e IP de un lanzador, calcula:
 *  - ERA acumulado por juego
 *  - Suavizado de 2º orden (Holt: nivel + tendencia) sobreamortiguado
 *  - buff dinámico: Bmax * tanh(a*(leagueERA - nivel) - b * tendencia)
 * y lo mapea a un factor para ajustar las probabilidades ofensivas rivales
 * sin penalizar por pocos innings mediante una compuerta en función del IP acumulado.
 */

import type { TeamPitch } from "./baseball";

export type GameERIP = {
  /** Earned Runs del juego */
  er: number;
  /** Innings pitched del juego. Puede ser 5, 6.1 (1/3), 6.2 (2/3). */
  ip?: number;
  /** Alternativa: outs del juego (IP * 3). Si se provee, tiene prioridad. */
  outs?: number;
};

export type EraBuffParams = {
  /** ERA de la liga (p.ej. 4.30 MLB). Default: 4.3 */
  leagueERA?: number;
  /** Máximo absoluto del buff en valor |buff| <= Bmax. Default: 0.18 */
  Bmax?: number;
  /** Sensibilidad a la desviación de nivel respecto a la liga. Default: 0.7 */
  a?: number;
  /** Sensibilidad a la tendencia (negativa = mejorando). Default: 1.8 */
  b?: number;
  /** Suavizado nivel (Holt). 0<alpha<=1. Default: 0.25 */
  alpha?: number;
  /** Suavizado tendencia (Holt). 0<beta<=1. Default: 0.06 */
  beta?: number;
  /** Escala de saturación de IP para no penalizar muestras pequeñas (en innings). Default: 20 */
  ipSaturation?: number;
};

export type EraBuffPoint = {
  index: number;
  er: number;
  ipOuts: number; // outs del juego
  cumER: number; // ER acumuladas
  cumOuts: number; // outs acumulados
  cumIP: number; // innings acumulados (outs/3)
  eraCum: number | null; // ERA acumulado (9*ER/IP) o null si IP=0
  level: number; // nivel filtrado (ERA)
  trend: number; // tendencia (ERA por juego)
  gate: number; // compuerta [0..1] por IP acumulado
  buffRaw: number; // buff sin compuerta
  buff: number; // buff tras compuerta
  runsPF: number; // factor multiplicativo para FP ofensivo (1 - buff)
};

export type EraBuffSeries = {
  params: Required<EraBuffParams>;
  series: EraBuffPoint[];
  latest: EraBuffPoint | null;
};

// ---------- Helpers ----------

function clamp(x: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, x));
}

/**
 * Convierte IP (como 6.1 ó 6.2) a outs. Si se detecta un decimal distinto de .1 o .2,
 * se aproxima a tercios: round((frac)*3).
 */
export function ipToOuts(ip: number): number {
  if (!Number.isFinite(ip) || ip <= 0) return 0;
  const w = Math.trunc(ip);
  const frac = Math.abs(ip - w);
  // Interpretación MLB: .1 = 1/3, .2 = 2/3
  let decOuts = 0;
  const tenths = Math.round(frac * 10);
  if (tenths === 1) decOuts = 1;
  else if (tenths === 2) decOuts = 2;
  else {
    // fallback: aproximar a tercios
    decOuts = Math.round(frac * 3);
    decOuts = clamp(decOuts, 0, 2);
  }
  return w * 3 + decOuts;
}

/**
 * Compuerta por IP acumulado para no penalizar muestras pequeñas.
 * g(IP) = 1 - exp(-IP / ipSaturation)
 */
export function ipGate(ip: number, ipSaturation: number): number {
  const s = Math.max(1e-6, ipSaturation);
  const g = 1 - Math.exp(-ip / s);
  return clamp(g, 0, 1);
}

/**
 * Mapea buff -> factor de carreras (para multiplicar FP/ERA relativa ofensiva).
 * Por convenio: runsPF = 1 - buff (buff>0 reduce ofensiva; buff<0 la aumenta).
 */
export function buffToRunsPF(buff: number): number {
  const pf = 1 - buff;
  // límites de seguridad
  return clamp(pf, 0.6, 1.4);
}

/**
 * Devuelve una versión del pitcheo con ERA ajustado por buff (equivalente a runsPF).
 * ERA_eff = ERA * (1 - buff).
 */
export function withBuffedPitch(p: TeamPitch, buff: number): TeamPitch {
  const pf = buffToRunsPF(buff);
  return { ...p, ERA: clamp(p.ERA * pf, 0.5, 15) };
}

// ---------- Core: ERA acumulado + Holt (nivel+tendencia) + buff ----------

export function computeEraBuff(
  games: GameERIP[],
  params?: EraBuffParams
): EraBuffSeries {
  const P: Required<EraBuffParams> = {
    leagueERA: params?.leagueERA ?? 4.3,
    Bmax: params?.Bmax ?? 0.18,
    a: params?.a ?? 0.7,
    b: params?.b ?? 1.8,
    alpha: params?.alpha ?? 0.25,
    beta: params?.beta ?? 0.06,
    ipSaturation: params?.ipSaturation ?? 20,
  };

  let cumER = 0;
  let cumOuts = 0;

  // Holt inicializado sobreamortiguado en el ERA de liga.
  let L_prev = P.leagueERA;
  let T_prev = 0;
  let prevObs: number | null = null;

  const series: EraBuffPoint[] = [];

  games.forEach((g, i) => {
    const outs = Number.isFinite(g.outs) && g.outs! > 0
      ? Math.max(0, Math.trunc(g.outs!))
      : Number.isFinite(g.ip) && g.ip! > 0
      ? ipToOuts(g.ip!)
      : 0;
    const er = Number.isFinite(g.er) && g.er! > 0 ? g.er! : 0;

    cumER += er;
    cumOuts += outs;
    const cumIP = cumOuts / 3;
    const eraCum = cumIP > 0 ? (9 * cumER) / cumIP : null;

    // Observación para Holt: si no hay IP aún, usa el previo / liga
    const y = eraCum != null && Number.isFinite(eraCum) ? eraCum : (prevObs ?? P.leagueERA);

    // Holt's linear method (nivel + tendencia)
    const L = P.alpha * y + (1 - P.alpha) * (L_prev + T_prev);
    const T = P.beta * (L - L_prev) + (1 - P.beta) * T_prev;

    // Buff bruto por desviación respecto a liga y tendencia
    const s = P.a * (P.leagueERA - L) - P.b * T;
    const buffRaw = P.Bmax * Math.tanh(s);

    // Compuerta por IP acumulado (no penalizar por pocos innings)
    const gate = ipGate(cumIP, P.ipSaturation);
    const buff = gate * buffRaw;

    const runsPF = buffToRunsPF(buff);

    series.push({
      index: i,
      er,
      ipOuts: outs,
      cumER,
      cumOuts,
      cumIP,
      eraCum,
      level: L,
      trend: T,
      gate,
      buffRaw,
      buff,
      runsPF,
    });

    // avanzar estado
    L_prev = L;
    T_prev = T;
    prevObs = y;
  });

  return {
    params: P,
    series,
    latest: series.length ? series[series.length - 1] : null,
  };
}

/**
 * Atajo: devuelve el buff y runsPF vigentes con historial dado (o neutro si vacío).
 */
export function currentBuff(
  games: GameERIP[],
  params?: EraBuffParams
): { buff: number; runsPF: number; level: number; trend: number } {
  const r = computeEraBuff(games, params);
  if (!r.latest)
    return { buff: 0, runsPF: 1, level: r.params.leagueERA, trend: 0 };
  const { buff, runsPF, level, trend } = r.latest;
  return { buff, runsPF, level, trend };
}

