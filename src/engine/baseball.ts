// Tipos y motor (Nivel 2: AVGAOBPASLGAERA)

export type Bases = { first: boolean; second: boolean; third: boolean };
export type Half = "top" | "bottom";
export type EventType = "OUT" | "BB" | "HBP" | "1B" | "2B" | "3B" | "HR";
export type OutType = "K" | "GB" | "FB" | "LD";
type GameEndReason =
  | "regulation" // terminA en 9 entradas con ganador / regla general
  | "walkoff" // home toma la ventaja definitiva en la baja
  | "mercy" // regla de nocaut
  | "maxInnings" // alcanzA tope de entradas
  | "tieAllowed" // reglas permiten empate
  | "forfeit";

export type GameStatus =
  | { over: false; winner: null; reason?: undefined }
  | { over: true; winner: "home" | "away" | "tie"; reason?: GameEndReason };

export type Rules = {
  regulationInnings: number; // Entradas areglamentariasa (normalmente 9; en ligas menores/softball puede ser 7)
  allowTies: boolean; // ASe permite terminar empatado?
  enableExtraInnings: boolean; // ASe habilitan entradas extra si hay empate tras las reglamentarias?
  maxInnings: number | null; // Tope duro de entradas (p.ej. 12). Null = sin tope.
  walkoff: boolean; // ASe permite awalk-offa en la baja cuando el home toma ventaja definitiva?
  mercyDiff?: number; // Diferencia para amercy rulea (nocaut), p.ej. 10
  mercyInning?: number; // A partir de quA entrada aplica la mercy, p.ej. 7
};

export const DEFAULT_RULES: Rules = {
  regulationInnings: 9,
  allowTies: false,
  enableExtraInnings: true,
  maxInnings: null,
  walkoff: true,
  // mercyDiff: 10, mercyInning: 7,
};

export type GameState = {
  inning: number;
  half: Half;
  outs: number;
  bases: Bases;
  scoreHome: number;
  scoreAway: number;
  status: GameStatus;
  rules?: Rules;
};

export const initialState: GameState = {
  inning: 1,
  half: "top",
  outs: 0,
  bases: { first: false, second: false, third: false },
  scoreHome: 0,
  scoreAway: 0,
  status: { over: false, winner: null },
  rules: DEFAULT_RULES,
};

// ---------- Utilidades comunes ----------
const R9_REF = 4.3;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Normaliza reglas para evitar configuraciAn sin salida:
 *  - Si NO hay extras y NO se permiten empates a habilita extras.
 */
function normalizeRules(r: Rules): Rules {
  if (!r.enableExtraInnings && !r.allowTies) {
    return { ...r, enableExtraInnings: true };
  }
  return r;
}

function rulesOf(gs: GameState): Rules {
  const base = gs.rules ?? DEFAULT_RULES;
  return normalizeRules(base);
}

function winnerByScore(gs: GameState): "home" | "away" | "tie" {
  if (gs.scoreHome > gs.scoreAway) return "home";
  if (gs.scoreAway > gs.scoreHome) return "away";
  return "tie";
}

// ---------- Avances / outs ----------
function scoreRun(gs: GameState, by: number) {
  if (gs.half === "top") gs.scoreAway += by;
  else gs.scoreHome += by;
}

// --- Helpers estocAsticos (Paso 1 realismo) ---
function rnd() {
  return Math.random();
}

function bernoulli(p: number): boolean {
  return rnd() < clamp(p, 0, 1);
}

// ----------------- Desagregado de OUTs (K/GB/FB/LD) -----------------
// Mezcla base simple para tipos de out (condicionada a que el evento sea OUT)
// NAtese que esto es un modelo heurAstico y calibrable.
const OUT_TYPE_WEIGHTS: Record<OutType, number> = {
  K: 0.28,
  GB: 0.44,
  FB: 0.22,
  LD: 0.06,
};

function rollOutType(): OutType {
  const entries: [OutType, number][] = Object.entries(OUT_TYPE_WEIGHTS) as any;
  const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
  let r = rnd() * (total > 0 ? total : 1);
  for (const [t, w] of entries) {
    r -= Math.max(0, w);
    if (r <= 0) return t;
  }
  return "GB"; // fallback razonable
}

function dpProbByOuts(outs: number) {
  // Prob. de DP sAlo aplicable a GB con 1B ocupado y <2 outs
  return outs === 0 ? 0.12 : outs === 1 ? 0.14 : 0;
}

function sfProbByOuts(outs: number) {
  // Prob. de SF sAlo aplicable a FB con 3B ocupado y <2 outs
  return outs === 0 ? 0.04 : outs === 1 ? 0.08 : 0;
}

/** Avance estocAstico segAn estado base/outs y tipo de hit. */
function advanceRunnersStochastic(gs: GameState, basesToAdvance: number) {
  const outs = gs.outs;
  const b0 = { ...gs.bases };
  let runs = 0;
  const nb: Bases = { first: false, second: false, third: false };

  // Tablas heurAsticas (aprox MLB) dependientes de outs
  const P = {
    single: {
      scoreFrom3B: [0.92, 0.95, 0.98][outs] ?? 0.95,
      scoreFrom2B: [0.55, 0.65, 0.75][outs] ?? 0.65,
      from1B_to3B: [0.25, 0.30, 0.40][outs] ?? 0.3,
      from1B_score: [0.02, 0.04, 0.08][outs] ?? 0.04,
    },
    double: {
      scoreFrom3B: 1.0,
      scoreFrom2B: [0.90, 0.93, 0.96][outs] ?? 0.92,
      from1B_score: [0.20, 0.28, 0.35][outs] ?? 0.28,
      from1B_to3B: [0.60, 0.55, 0.45][outs] ?? 0.55,
    },
    triple: {
      everyoneScores: true,
    },
  } as const;

  function placeOrScore(_target: keyof Bases, scoreProb: number, elseStayAt?: keyof Bases) {
    if (bernoulli(scoreProb)) runs++;
    else if (elseStayAt) nb[elseStayAt] = true;
    // si anota, no ocupamos base
  }

  if (basesToAdvance === 1) {
    // Corredores existentes
    if (b0.third) placeOrScore("third", P.single.scoreFrom3B, "third");
    if (b0.second) {
      if (bernoulli(P.single.scoreFrom2B)) runs++;
      else nb.third = true;
    }
    if (b0.first) {
      // Decide entre 3B / anotar / 2B
      if (bernoulli(P.single.from1B_score)) runs++;
      else if (bernoulli(P.single.from1B_to3B)) nb.third = true;
      else nb.second = true;
    }
    // Bateador a 1B (si bases estaban llenas y nadie anotA de 3B, puede empujar carrera)
    if (b0.first && b0.second && b0.third && !nb.third) {
      // bases llenas & sencillo con retenciAn: empuja 1
      runs++;
      nb.third = true; // 2B->3B
      nb.second = true; // 1B->2B
    }
    nb.first = true;
  } else if (basesToAdvance === 2) {
    if (b0.third) runs++; // 3B siempre anota
    if (b0.second) {
      if (bernoulli(P.double.scoreFrom2B)) runs++;
      else nb.third = true;
    }
    if (b0.first) {
      if (bernoulli(P.double.from1B_score)) runs++;
      else if (bernoulli(P.double.from1B_to3B)) nb.third = true;
      else nb.third = true; // en doble, el corredor de 1B al menos alcanza 3B
    }
    nb.second = true; // bateador a 2B
  } else if (basesToAdvance === 3) {
    // triple: todos anotan, bateador a 3B
    if (b0.third) runs++;
    if (b0.second) runs++;
    if (b0.first) runs++;
    nb.third = true;
  } else if (basesToAdvance >= 4) {
    // HR (aquA no deberAa entrar; HR se maneja aparte)
    runs += (b0.first ? 1 : 0) + (b0.second ? 1 : 0) + (b0.third ? 1 : 0) + 1;
  }

  // Aplicar a estado
  gs.bases = nb;
  if (runs > 0) scoreRun(gs, runs);

  // chequeos tras cambio de marcador
  checkWalkoff(gs);
  checkMercy(gs);
}

/** Avance determinista original (fallback / modo A/B) */
function advanceRunnersDeterministic(gs: GameState, basesToAdvance: number) {
  let runs = 0;
  const b = gs.bases;

  if (b.third) {
    if (basesToAdvance >= 1) {
      runs++;
      b.third = false;
    }
  }
  if (b.second) {
    if (basesToAdvance === 1) {
      b.third = true;
      b.second = false;
    }
    if (basesToAdvance === 2) {
      runs++;
      b.second = false;
    }
    if (basesToAdvance >= 3) {
      runs++;
      b.second = false;
    }
  }
  if (b.first) {
    if (basesToAdvance === 1) {
      b.second = true;
      b.first = false;
    }
    if (basesToAdvance === 2) {
      b.third = true;
      b.first = false;
    }
    if (basesToAdvance >= 3) {
      runs++;
      b.first = false;
    }
  }

  if (basesToAdvance === 1) {
    if (!b.first) b.first = true;
    else if (!b.second) b.second = true;
    else if (!b.third) b.third = true;
    else runs++;
  } else if (basesToAdvance === 2) {
    if (!b.second) b.second = true;
    else if (!b.third) b.third = true;
    else runs++;
  } else if (basesToAdvance === 3) {
    if (!b.third) b.third = true;
    else runs++;
  } else if (basesToAdvance >= 4) {
    runs++;
  }

  if (runs > 0) scoreRun(gs, runs);
  checkWalkoff(gs);
  checkMercy(gs);
}

/** Enrutador: elige estocstico o determinista segn reglas */
function advanceRunners(gs: GameState, basesToAdvance: number) {
  const useStoch = ((gs.rules as any)?.stochasticBaseRunning ?? true) !== false;
  if (useStoch) return advanceRunnersStochastic(gs, basesToAdvance);
  return advanceRunnersDeterministic(gs, basesToAdvance);
}

function registerOut(gs: GameState) {
  gs.outs += 1;
  if (gs.outs >= 3) {
    gs.outs = 0;
    gs.bases = { first: false, second: false, third: false };
    gs.half = gs.half === "top" ? "bottom" : "top";
    if (gs.half === "top") gs.inning += 1;
    checkEndOfHalf(gs);
  }
}

function reachFromWHIP(whip: number) {
  // WHIP tApico MLB ~0.8a1.6 a reach ~0.21a0.35
  const r = whip / (3 + whip);
  return clamp(r, 0.12, 0.48); // lAmites de seguridad
}

// Peso del alado bateadora vs alado pitchera
const REACH_OFF_WEIGHT = 0.4; // 40% bateador
const REACH_DEF_WEIGHT = 0.6; // 60% pitcher (WHIP)

// ---------- Reglas de final ----------
function checkMercy(gs: GameState) {
  const r = rulesOf(gs);
  if (!r.mercyDiff || !r.mercyInning) return;
  if (gs.inning < r.mercyInning) return;
  const diff = Math.abs(gs.scoreHome - gs.scoreAway);
  if (diff >= r.mercyDiff) {
    gs.status = {
      over: true,
      winner: winnerByScore(gs),
      reason: "mercy",
    };
  }
}

/** Llamar cuando CAMBIA el marcador en la BAJA (posible walk-off) */
function checkWalkoff(gs: GameState) {
  const r = rulesOf(gs);
  if (!r.walkoff) return;
  if (gs.half !== "bottom") return;
  const afterReg = gs.inning >= r.regulationInnings;
  const leader = winnerByScore(gs);
  if (afterReg && leader === "home") {
    gs.status = { over: true, winner: "home", reason: "walkoff" };
  }
}

function checkEndOfHalf(gs: GameState) {
  const r = rulesOf(gs);

  // Estamos en 'bottom' a terminA la ALTA del inning actual (gs.inning).
  if (gs.half === "bottom") {
    const afterRegTop = gs.inning >= r.regulationInnings;
    if (afterRegTop && gs.scoreHome > gs.scoreAway) {
      gs.status = {
        over: true,
        winner: "home",
        reason: "regulation",
      };
    }
    return;
  }

  // Estamos en 'top' a terminA la BAJA del inning anterior (gs.inning - 1).
  const completedInning = gs.inning - 1;
  const afterRegComplete = completedInning >= r.regulationInnings;

  if (afterRegComplete) {
    const leader = winnerByScore(gs);
    if (leader !== "tie") {
      gs.status = {
        over: true,
        winner: leader,
        reason: "regulation",
      };
      return;
    }
    // Empate despuAs de 9 completas:
    if (!r.enableExtraInnings) {
      // Con normalizaciAn, si no hay extras entonces allowTies es true.
      gs.status = { over: true, winner: "tie", reason: "tieAllowed" };
      return;
    }
    // Revisar lAmite de entradas extra, si lo hay:
    if (r.maxInnings && completedInning >= r.maxInnings) {
      gs.status = { over: true, winner: "tie", reason: "maxInnings" };
    }
  }
}

function forceAdvanceOneBase(gs: GameState) {
  // Avance forzado 1 base; si bases llenas, anota 1
  const b = gs.bases;

  if (b.first && b.second && b.third) {
    // Bases llenas a entra 1
    scoreRun(gs, 1);
    // Desplaza (se mantienen llenas: el anotador sale, los demAs avanzan uno)
    b.third = true;
    b.second = true;
    b.first = true;
    return;
  }

  // Desplaza en orden inverso para no pisarnos
  if (b.second && !b.third) {
    b.third = true;
    b.second = false;
  }
  if (b.first && !b.second) {
    b.second = true;
    b.first = false;
  }
  // Bateador a 1B
  if (!b.first) b.first = true;
}

// ---------- Aplicar evento ----------
export function applyEvent(gs: GameState, ev: EventType): string {
  switch (ev) {
    case "OUT":
      // OUT estocAstico: posible SF o DP simplificado
      {
        const b = gs.bases;
        const outs = gs.outs;
        const _use = ((gs.rules as any)?.stochasticBaseRunning ?? true) !== false;
        const ot = rollOutType();
        if (_use) {
        // Sacrifice fly en FB con corredor en 3B y <2 outs
        const sfProb = sfProbByOuts(outs);
        if (ot === "FB" && b.third && outs < 2 && bernoulli(sfProb)) {
          // Anota 3B, 1 out, bateador out
          b.third = false;
          scoreRun(gs, 1);
          registerOut(gs);
          checkWalkoff(gs);
          checkMercy(gs);
          return "Elevado de sacrificio (SF)";
        }
        // Doble play en GB con corredor en 1B y <2 outs
        const dpProb = dpProbByOuts(outs);
        if (ot === "GB" && b.first && outs < 2 && bernoulli(dpProb)) {
          b.first = false; // corredor eliminado en 2B
          // bateador eliminado en 1B
          registerOut(gs);
          registerOut(gs);
          return "Rodado (GB) a Doble play";
        }
        }
        // Out normal
        registerOut(gs);
        // Describir el tipo de out (K/GB/FB/LD)
        return ot === "K"
          ? "Ponche (K)"
          : ot === "GB"
          ? "Rodado (GB)"
          : ot === "FB"
          ? "Elevado (FB)"
          : "LAnea (LD)";
      }
    case "1B":
      advanceRunners(gs, 1);
      return "Sencillo (1B)";
    case "2B":
      advanceRunners(gs, 2);
      return "Doble (2B)";
    case "3B":
      advanceRunners(gs, 3);
      return "Triple (3B)";
    case "HR": {
      // Home run: limpia bases + bateador
      const prev = { ...gs.bases };
      const runners =
        (prev.first ? 1 : 0) + (prev.second ? 1 : 0) + (prev.third ? 1 : 0);
      gs.bases = { first: false, second: false, third: false };
      scoreRun(gs, runners + 1);
      // importante: chequeos tras anotar
      checkWalkoff(gs);
      checkMercy(gs);
      return "Home run (HR)";
    }
    case "BB":
      forceAdvanceOneBase(gs);
      checkWalkoff(gs);
      checkMercy(gs);
      return "Base por bolas (BB)";

    case "HBP":
      forceAdvanceOneBase(gs);
      checkWalkoff(gs);
      checkMercy(gs);
      return "Golpeado (HBP)";
  }
}

// ---------- Motor (AVGAOBPASLG vs ERA) ----------
export type TeamBatSlash = { AVG: number; OBP: number; SLG: number };
export type TeamPitch = { ERA: number; WHIP?: number };
export type EventProbs = {
  OUT: number;
  BB: number;
  HBP: number;
  "1B": number;
  "2B": number;
  "3B": number;
  HR: number;
};

export type ParkOpts = {
  /** Factor de carreras del parque (1.00 = neutro). */
  runsPF?: number;
  /** Factor de HR del parque (1.00 = neutro). */
  hrPF?: number;
  /** Si true, solo aplica cuando batea el home (baja). */
  homeAdvOnly?: boolean;
};

// Mezcla base MLB por hit (si SLG/H no calza, reajustamos desde aquA)
const BASE_MIX = { s1B: 0.65, s2B: 0.2, s3B: 0.02, sHR: 0.13 };

function normalize4(a: number, b: number, c: number, d: number) {
  const s = a + b + c + d;
  return s > 0 ? [a / s, b / s, c / s, d / s] : [0.65, 0.2, 0.02, 0.13];
}

/** Ajusta la mezcla para que el promedio de bases por hit sea ~ targetB (a1 y a~2.6). */
function mixFromSlugPerHit(targetB: number) {
  let w1 = BASE_MIX.s1B,
    w2 = BASE_MIX.s2B,
    w3 = BASE_MIX.s3B,
    wHR = BASE_MIX.sHR;
  const mean0 = 1 * w1 + 2 * w2 + 3 * w3 + 4 * wHR;
  const up = targetB - mean0;

  if (Math.abs(up) < 1e-4) return { w1, w2, w3, wHR };

  if (up > 0) {
    const xbh = w2 + w3 + wHR;
    if (xbh <= 0) return { w1, w2, w3, wHR };
    const need = Math.min(
      w1 * 0.8,
      up / ((2 - 1) * (w2 / xbh) + (3 - 1) * (w3 / xbh) + (4 - 1) * (wHR / xbh))
    );
    const m2 = need * (w2 / xbh);
    const m3 = need * (w3 / xbh);
    const mHR = need * (wHR / xbh);
    w1 -= m2 + m3 + mHR;
    w2 += m2;
    w3 += m3;
    wHR += mHR;
  } else {
    const xbh = w2 + w3 + wHR;
    if (xbh > 0) {
      const give = Math.min(
        xbh * 0.8,
        -up /
          ((2 - 1) * (w2 / xbh) + (3 - 1) * (w3 / xbh) + (4 - 1) * (wHR / xbh))
      );
      const m2 = give * (w2 / xbh);
      const m3 = give * (w3 / xbh);
      const mHR = give * (wHR / xbh);
      w2 -= m2;
      w3 -= m3;
      wHR -= mHR;
      w1 += m2 + m3 + mHR;
    }
  }

  [w1, w2, w3, wHR] = normalize4(w1, w2, w3, wHR);
  return { w1, w2, w3, wHR };
}

/** Probabilidades OUT/1B/2B/3B/HR dadas las slash del bateador y ERA rival. */
function computeEventProbsFromSlash(
  batter: TeamBatSlash,
  oppPitch: TeamPitch,
  adjust?: { runsPF?: number; hrPF?: number }
): EventProbs {
  const AVG = clamp(batter.AVG, 0.15, 0.4);
  const OBP = clamp(batter.OBP, 0.25, 0.5);
  const SLG = clamp(batter.SLG, 0.3, 0.7);
  const ERA = clamp(oppPitch.ERA, 1.0, 10.0);

  // --- Lado bateador (como ya tenAas) ---
  let FP = ERA / R9_REF;
  if (adjust?.runsPF != null && isFinite(adjust.runsPF)) {
    const pf = Math.max(0.5, Math.min(1.5, adjust.runsPF));
    FP *= pf;
  }
  const H_raw = clamp(AVG * FP, 0.08, 0.45);
  const OBP_eff = clamp(OBP * (0.85 + 0.3 * (FP - 1)), 0.18, 0.52);
  const BB_raw = Math.max(0, OBP_eff - H_raw); // "BB" implAcito (no emitimos evento)
  const reach_off = H_raw + BB_raw;

  // --- Lado pitcher desde WHIP (nuevo) ---
  let H = H_raw,
    BB = BB_raw;
  if (
    typeof oppPitch.WHIP === "number" &&
    isFinite(oppPitch.WHIP) &&
    oppPitch.WHIP > 0
  ) {
    const reach_def = reachFromWHIP(oppPitch.WHIP);
    const reach_blend =
      REACH_OFF_WEIGHT * reach_off + REACH_DEF_WEIGHT * reach_def;
    const scale = reach_off > 1e-9 ? reach_blend / reach_off : 1;
    H = clamp(H_raw * scale, 0, 0.6);
    BB = clamp(BB_raw * scale, 0, 0.4);
  }

  const P_HBP = BB * 0.1; // 10% golpeados (ajustable)
  const P_BB = BB * 0.9;

  // --- Poder: usa SLG / AVG para mezclar 1B/2B/3B/HR ---
  // Importante: anclar a AVG (tal como TB/H = SLG/AVG) para que el reparto de extra bases
  // refleje el poder intrA-nseco del equipo y no se distorsione por el ajuste de ERA.
  const H_base = Math.max(AVG, 1e-6);
  const basesPerHit = clamp(SLG / H_base, 1.0, 2.6);
  let { w1, w2, w3, wHR } = mixFromSlugPerHit(basesPerHit);
  if (adjust?.hrPF != null && isFinite(adjust.hrPF)) {
    const hrScaled = Math.max(0, wHR * Math.max(0.5, Math.min(1.5, adjust.hrPF)));
    [w1, w2, w3, wHR] = normalize4(w1, w2, w3, hrScaled);
  }

  // --- Probabilidades finales ---
  const p1B = H * w1;
  const p2B = H * w2;
  const p3B = H * w3;
  const pHR = H * wHR;
  const pOUT = clamp(1 - (p1B + p2B + p3B + pHR + P_BB + P_HBP), 0, 1);

  return {
    OUT: pOUT,
    BB: P_BB,
    HBP: P_HBP,
    "1B": p1B,
    "2B": p2B,
    "3B": p3B,
    HR: pHR,
  };
}

/** Probabilidades para la mitad actual (ALTA: Away batea; BAJA: Home batea). */
export function eventProbsForHalf(
  half: Half,
  home: { bat: TeamBatSlash; pitch: TeamPitch },
  away: { bat: TeamBatSlash; pitch: TeamPitch },
  park?: ParkOpts
): EventProbs {
  const batting = half === "top" ? away.bat : home.bat;
  const pitching = half === "top" ? home.pitch : away.pitch;
  const apply = park
    ? {
        runsPF:
          park.runsPF != null && (!park.homeAdvOnly || half === "bottom")
            ? park.runsPF
            : undefined,
        hrPF:
          park.hrPF != null && (!park.homeAdvOnly || half === "bottom")
            ? park.hrPF
            : undefined,
      }
    : undefined;
  return computeEventProbsFromSlash(batting, pitching, apply);
}

/** Sorteo del evento a partir de las probabilidades. */
export function rollEventFromProbs(probs: EventProbs): EventType {
  const entries: [EventType, number][] = [
    ["OUT", probs.OUT],
    ["BB", probs.BB],
    ["HBP", probs.HBP],
    ["1B", probs["1B"]],
    ["2B", probs["2B"]],
    ["3B", probs["3B"]],
    ["HR", probs.HR],
  ];
  const total = entries.reduce((s, [, v]) => s + Math.max(0, v), 0);
  if (total <= 0) return "OUT";
  let r = Math.random() * total;
  for (const [ev, weight] of entries) {
    r -= Math.max(0, weight);
    if (r <= 0) return ev;
  }
  return "OUT";
}

// ---------- Lineup y rates por PA (Paso 3) ----------
// Mano de bateo/pitcheo
export type Hand = "L" | "R" | "S"; // S = ambidiestro (switch)

// Rates por apariciAn al plato (por-PA)
export type RateLine = {
  bb: number; // BB%
  k: number; // K%
  hbp: number; // HBP por PA
  hr: number; // HR por PA
  double: number; // 2B por PA
  triple: number; // 3B por PA
  h: number; // H por PA (incluye 1B+2B+3B+HR)
};

export type BatterRates = { vsL: RateLine; vsR: RateLine };
export type Batter = {
  id: string; // identificador Anico en el roster
  name: string;
  hand: Hand; // mano natural del bateador (informativa)
  rates: BatterRates;
};

export type Roster = {
  players: Record<string, Batter>;
  lineupVsL: string[]; // ids en orden de bateo vs pitcher zurdo
  lineupVsR: string[]; // ids en orden de bateo vs pitcher derecho
};

/**
 * Convierte una RateLine por-PA en EventProbs del motor.
 * Nota: K% se integra dentro de OUT global (aAn no distinguimos tipos de OUT aquA).
 */
export function eventProbsFromRateLine(rate: RateLine): EventProbs {
  // Robustez ante valores negativos/ruido
  const bb = Math.max(0, rate.bb || 0);
  const k = Math.max(0, rate.k || 0);
  const hbp = Math.max(0, rate.hbp || 0);
  const hr = Math.max(0, rate.hr || 0);
  const d2 = Math.max(0, rate.double || 0);
  const d3 = Math.max(0, rate.triple || 0);
  const h = Math.max(0, rate.h || 0);
  const s1_raw = Math.max(0, h - hr - d2 - d3); // 1B implAcitos

  let sumKnown = bb + k + hbp + hr + d2 + d3 + s1_raw;
  let bb2 = bb,
    k2 = k,
    hbp2 = hbp,
    hr2 = hr,
    d22 = d2,
    d32 = d3,
    s12 = s1_raw;
  if (sumKnown > 1) {
    // Escalar proporcionalmente para evitar overflow >1
    const f = 1 / sumKnown;
    bb2 *= f;
    k2 *= f;
    hbp2 *= f;
    hr2 *= f;
    d22 *= f;
    d32 *= f;
    s12 *= f;
    sumKnown = 1;
  }
  const pOUT = Math.max(0, 1 - (bb2 + hbp2 + hr2 + d22 + d32 + s12 + k2));

  // Mapear a EventProbs (sin K explAcito; OUT los incluye)
  return {
    OUT: pOUT + k2, // K% tambiAn termina en OUT del motor
    BB: bb2,
    HBP: hbp2,
    "1B": s12,
    "2B": d22,
    "3B": d32,
    HR: hr2,
  };
}

/** Devuelve la RateLine adecuada para el bateador segAn mano del pitcher. */
export function pickRateLine(b: Batter, pitcherHand: Hand): RateLine {
  return pitcherHand === "L" ? b.rates.vsL : b.rates.vsR;
}

/** Devuelve el id del bateador actual dado el lineup y un Andice. */
export function currentBatterId(
  roster: Roster,
  pitcherHand: Hand,
  lineupIndex: number
): string | null {
  const lineup = pitcherHand === "L" ? roster.lineupVsL : roster.lineupVsR;
  if (!Array.isArray(lineup) || lineup.length === 0) return null;
  const idx = ((lineupIndex % lineup.length) + lineup.length) % lineup.length;
  return lineup[idx] ?? null;
}

// Ajuste simple de probabilidades por parque y entorno (runsPF) sin romper la suma.
export function adjustEventProbsWithPF(
  probs: EventProbs,
  adjust?: { runsPF?: number; hrPF?: number }
): EventProbs {
  if (!adjust) return probs;
  const rp = typeof adjust.runsPF === "number" && isFinite(adjust.runsPF) ? Math.max(0.5, Math.min(1.5, adjust.runsPF)) : 1;
  const hp = typeof adjust.hrPF === "number" && isFinite(adjust.hrPF) ? Math.max(0.5, Math.min(1.5, adjust.hrPF)) : 1;

  // 1) Escalar no-OUT por runsPF
  let BB = Math.max(0, probs.BB) * rp;
  let HBP = Math.max(0, probs.HBP) * rp;
  let S1 = Math.max(0, probs["1B"]) * rp;
  let S2 = Math.max(0, probs["2B"]) * rp;
  let S3 = Math.max(0, probs["3B"]) * rp;
  let HR = Math.max(0, probs.HR) * rp;

  // 2) Ajustar mezcla de hits con hrPF conservando suma de hits
  const hitSum = S1 + S2 + S3 + HR;
  if (hitSum > 0) {
    const HR2 = Math.max(0, HR * hp);
    const oth = S1 + S2 + S3;
    const total2 = oth + HR2;
    if (total2 > 1e-12) {
      const scale = hitSum / total2;
      HR = HR2 * scale;
      // mantener proporciones de S1,S2,S3 entre sA
      const w1 = S1 / Math.max(1e-12, oth);
      const w2 = S2 / Math.max(1e-12, oth);
      const w3 = S3 / Math.max(1e-12, oth);
      const othScaled = (oth) * scale;
      S1 = othScaled * w1;
      S2 = othScaled * w2;
      S3 = othScaled * w3;
    }
  }

  // 3) Recalcular OUT para mantener suma a1
  const OUT = clamp(1 - (BB + HBP + S1 + S2 + S3 + HR), 0, 1);
  return { OUT, BB, HBP, "1B": S1, "2B": S2, "3B": S3, HR };
}

// -------- SimulaciAn por lineup (para juegos y Monte Carlo) --------
export type LineupHands = { homePitcher: Hand; awayPitcher: Hand };
export type LineupAdjust = { runsPF?: number; hrPF?: number };

export function simulateGameOnceLineup(
  home: Roster,
  away: Roster,
  hands: LineupHands,
  rules: Rules = DEFAULT_RULES,
  maxPlays = 10000,
  adjustTop?: LineupAdjust, // ALTAS: batea AWAY vs pitcher HOME
  adjustBottom?: LineupAdjust, // BAJAS: batea HOME vs pitcher AWAY
  startIdxHome = 0,
  startIdxAway = 0
) {
  const r = normalizeRules(rules);
  const gs: GameState = {
    inning: 1,
    half: "top",
    outs: 0,
    bases: { first: false, second: false, third: false },
    scoreHome: 0,
    scoreAway: 0,
    status: { over: false, winner: null },
    rules: r,
  };

  let idxHome = startIdxHome | 0;
  let idxAway = startIdxAway | 0;

  let plays = 0;
  while (!gs.status.over && plays++ < maxPlays) {
    const battingTop = gs.half === "top";
    const roster = battingTop ? away : home;
    const pHand = battingTop ? hands.homePitcher : hands.awayPitcher;
    const idx = battingTop ? idxAway : idxHome;
    const bid = currentBatterId(roster, pHand, idx);
    const batter = bid ? roster.players[bid] : undefined;
    let probs: EventProbs;
    if (batter) {
      const rate = pickRateLine(batter, pHand);
      const baseProbs = eventProbsFromRateLine(rate);
      const adj = battingTop ? adjustTop : adjustBottom;
      probs = adjustEventProbsWithPF(baseProbs, adj);
    } else {
      // Fallback neutro
      probs = { OUT: 0.7, BB: 0.08, HBP: 0.01, "1B": 0.16, "2B": 0.04, "3B": 0.005, HR: 0.005 };
    }
    const ev = rollEventFromProbs(probs);
    applyEvent(gs, ev);
    if (battingTop) idxAway++; else idxHome++;
  }

  return {
    scoreHome: gs.scoreHome,
    scoreAway: gs.scoreAway,
    winner: gs.status.winner,
    reason: gs.status.reason,
    innings:
      gs.inning - (gs.half === "top" ? 1 : 0) + (gs.half === "bottom" ? 0.5 : 0),
    plays,
  };
}

export function monteCarloLineup(
  home: Roster,
  away: Roster,
  runs: number,
  hands: LineupHands,
  rules: Rules = DEFAULT_RULES,
  adjustTop?: LineupAdjust,
  adjustBottom?: LineupAdjust
) {
  const r = normalizeRules(rules);
  let hW = 0, aW = 0, t = 0, sumH = 0, sumA = 0;
  for (let i = 0; i < runs; i++) {
    const g = simulateGameOnceLineup(home, away, hands, r, 10000, adjustTop, adjustBottom);
    sumH += g.scoreHome;
    sumA += g.scoreAway;
    if (g.winner === "home") hW++; else if (g.winner === "away") aW++; else t++;
  }
  return {
    runs,
    homeWinPct: hW / runs,
    awayWinPct: aW / runs,
    tiePct: t / runs,
    avgHomeRuns: sumH / runs,
    avgAwayRuns: sumA / runs,
  };
}


export type StartersOpts = {
  // Nota: en MLB el equipo HOME lanza en las ALTAS (top) y AWAY lanza en las BAJAS (bottom).
  // Estos campos reflejan eso:
  starterHome?: TeamPitch; // Lanzador inicial de HOME (defiende en ALTAS)
  starterAway?: TeamPitch; // Lanzador inicial de AWAY (defiende en BAJAS)
  starterInnings?: number; // Entradas del abridor (default 6)
  park?: ParkOpts; // Factores de parque (aplican al home si homeAdvOnly=true)
};

export function simulateGameOnce(
  home: { bat: TeamBatSlash; pitch: TeamPitch },
  away: { bat: TeamBatSlash; pitch: TeamPitch },
  rules: Rules = DEFAULT_RULES,
  maxPlays = 10000,
  starters?: StartersOpts
) {
  const r = normalizeRules(rules);

  const gs: GameState = {
    inning: 1,
    half: "top",
    outs: 0,
    bases: { first: false, second: false, third: false },
    scoreHome: 0,
    scoreAway: 0,
    status: { over: false, winner: null },
    rules: r,
  };

  const starterInnings = starters?.starterInnings ?? 6;

  let plays = 0;
  while (!gs.status.over && plays++ < maxPlays) {
    // Seleccionar pitcheo efectivo por mitad/entrada con abridores opcionales
    const homePitchEff: TeamPitch =
      gs.half === "top" && gs.inning <= starterInnings && starters?.starterHome
        ? starters.starterHome
        : home.pitch;
    const awayPitchEff: TeamPitch =
      gs.half === "bottom" && gs.inning <= starterInnings && starters?.starterAway
        ? starters.starterAway
        : away.pitch;

    const probs = eventProbsForHalf(
      gs.half,
      { bat: home.bat, pitch: homePitchEff },
      { bat: away.bat, pitch: awayPitchEff },
      starters?.park
    );
    const ev = rollEventFromProbs(probs);
    applyEvent(gs, ev);
  }

  return {
    scoreHome: gs.scoreHome,
    scoreAway: gs.scoreAway,
    winner: gs.status.winner,
    reason: gs.status.reason,
    innings:
      gs.inning -
      (gs.half === "top" ? 1 : 0) +
      (gs.half === "bottom" ? 0.5 : 0),
    plays,
  };
}

export function monteCarlo(
  home: { bat: TeamBatSlash; pitch: TeamPitch },
  away: { bat: TeamBatSlash; pitch: TeamPitch },
  runs: number,
  rules: Rules = DEFAULT_RULES,
  starters?: StartersOpts
) {
  const r = normalizeRules(rules);

  let hW = 0,
    aW = 0,
    t = 0,
    sumH = 0,
    sumA = 0;
  for (let i = 0; i < runs; i++) {
    const g = simulateGameOnce(home, away, r, 10000, starters);
    sumH += g.scoreHome;
    sumA += g.scoreAway;
    if (g.winner === "home") hW++;
    else if (g.winner === "away") aW++;
    else t++;
  }
  return {
    runs,
    homeWinPct: hW / runs,
    awayWinPct: aW / runs,
    tiePct: t / runs,
    avgHomeRuns: sumH / runs,
    avgAwayRuns: sumA / runs,
  };
}


