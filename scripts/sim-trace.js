// Play-by-play simulation for 3 innings using engine-equivalent logic (no imports)
// Deterministic via seeded PRNG so results are reproducible.

// ---------- PRNG (deterministic) ----------
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Types (JS objects) ----------
const DEFAULT_RULES = {
  regulationInnings: 3, // limit to 3 for brevity
  allowTies: true, // no extras; allow tie if still tied after 3
  enableExtraInnings: false,
  maxInnings: null,
  walkoff: true,
  // mercy optional
};

const R9_REF = 4.3;
const REACH_OFF_WEIGHT = 0.4;
const REACH_DEF_WEIGHT = 0.6;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function normalizeRules(r) {
  if (!r.enableExtraInnings && !r.allowTies) return { ...r, enableExtraInnings: true };
  return r;
}
function rulesOf(gs) {
  const base = gs.rules ?? DEFAULT_RULES;
  return normalizeRules(base);
}
function winnerByScore(gs) {
  if (gs.scoreHome > gs.scoreAway) return "home";
  if (gs.scoreAway > gs.scoreHome) return "away";
  return "tie";
}

// ---------- Advancement / outs ----------
function scoreRun(gs, by) {
  if (gs.half === "top") gs.scoreAway += by;
  else gs.scoreHome += by;
}

function advanceRunners(gs, basesToAdvance) {
  let runs = 0;
  const b = gs.bases;

  // third to home
  if (basesToAdvance >= 1) {
    if (b.third) {
      runs++;
      b.third = false;
    }
  }
  if (basesToAdvance >= 2) {
    if (b.second) {
      // from second to home if advancing 2 or more and third now empty
      if (!b.third) {
        b.third = true;
        b.second = false;
      } else {
        runs++;
        b.second = false;
      }
    }
  }
  if (basesToAdvance >= 3) {
    if (b.first) {
      // from first to home via third if chain advances and third empty
      if (!b.third) {
        b.third = true;
        b.first = false;
      } else {
        runs++;
        b.first = false;
      }
    }
  }
  if (basesToAdvance === 1) {
    // shift second to third if possible
    if (b.second && !b.third) {
      b.third = true;
      b.second = false;
    }
    // shift first to second
    if (b.first && !b.second) {
      b.second = true;
      b.first = false;
    }
    // batter to first
    if (!b.first) b.first = true;
  } else if (basesToAdvance === 2) {
    // batter to second; shift first to third if free
    if (b.first) {
      if (!b.third) {
        b.third = true;
        b.first = false;
      } else {
        // third occupied a†’ that runner already scored in earlier branch
        b.first = false;
      }
    }
    // ensure batter reaches second
    if (!b.second) b.second = true;
  } else if (basesToAdvance === 3) {
    // batter to third
    if (!b.third) b.third = true;
    else runs++;
  } else if (basesToAdvance >= 4) {
    runs++; // batter HR
  }

  if (runs > 0) scoreRun(gs, runs);

  // walkoff / mercy checks
  checkWalkoff(gs);
  checkMercy(gs);
}

function registerOut(gs) {
  gs.outs += 1;
  if (gs.outs >= 3) {
    gs.outs = 0;
    gs.bases = { first: false, second: false, third: false };
    gs.half = gs.half === "top" ? "bottom" : "top";
    if (gs.half === "top") gs.inning += 1;
    checkEndOfHalf(gs);
  }
}

function reachFromWHIP(whip) {
  const r = whip / (3 + whip);
  return clamp(r, 0.12, 0.48);
}

function checkMercy(gs) {
  const r = rulesOf(gs);
  if (!r.mercyDiff || !r.mercyInning) return;
  if (gs.inning < r.mercyInning) return;
  const diff = Math.abs(gs.scoreHome - gs.scoreAway);
  if (diff >= r.mercyDiff) {
    gs.status = { over: true, winner: winnerByScore(gs), reason: "mercy" };
  }
}

function checkWalkoff(gs) {
  const r = rulesOf(gs);
  if (!r.walkoff) return;
  if (gs.half !== "bottom") return;
  const afterReg = gs.inning >= r.regulationInnings;
  const leader = winnerByScore(gs);
  if (afterReg && leader === "home") {
    gs.status = { over: true, winner: "home", reason: "walkoff" };
  }
}

function checkEndOfHalf(gs) {
  const r = rulesOf(gs);
  if (gs.half === "bottom") {
    const afterRegTop = gs.inning >= r.regulationInnings;
    if (afterRegTop && gs.scoreHome > gs.scoreAway) {
      gs.status = { over: true, winner: "home", reason: "regulation" };
    }
    return;
  }
  const completedInning = gs.inning - 1;
  const afterRegComplete = completedInning >= r.regulationInnings;
  if (afterRegComplete) {
    const leader = winnerByScore(gs);
    if (leader !== "tie") {
      gs.status = { over: true, winner: leader, reason: "regulation" };
      return;
    }
    if (!r.enableExtraInnings) {
      gs.status = { over: true, winner: "tie", reason: "tieAllowed" };
      return;
    }
    if (r.maxInnings && completedInning >= r.maxInnings) {
      gs.status = { over: true, winner: "tie", reason: "maxInnings" };
    }
  }
}

function forceAdvanceOneBase(gs) {
  const b = gs.bases;
  if (b.first && b.second && b.third) {
    scoreRun(gs, 1);
    b.third = true;
    b.second = true;
    b.first = true;
    return;
  }
  if (b.second && !b.third) {
    b.third = true;
    b.second = false;
  }
  if (b.first && !b.second) {
    b.second = true;
    b.first = false;
  }
  if (!b.first) b.first = true;
}

function applyEvent(gs, ev) {
  switch (ev) {
    case "OUT":
      registerOut(gs);
      return "Out";
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
      const prev = { ...gs.bases };
      const runners = (prev.first ? 1 : 0) + (prev.second ? 1 : 0) + (prev.third ? 1 : 0);
      gs.bases = { first: false, second: false, third: false };
      scoreRun(gs, runners + 1);
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

// ---------- Probabilities engine ----------
const BASE_MIX = { s1B: 0.65, s2B: 0.2, s3B: 0.02, sHR: 0.13 };
function normalize4(a, b, c, d) {
  const s = a + b + c + d;
  return s > 0 ? [a / s, b / s, c / s, d / s] : [0.65, 0.2, 0.02, 0.13];
}
function mixFromSlugPerHit(targetB) {
  let w1 = BASE_MIX.s1B, w2 = BASE_MIX.s2B, w3 = BASE_MIX.s3B, wHR = BASE_MIX.sHR;
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
    const give = Math.min(xbh * 0.8, -up / (((2 - 1) * w2 + (3 - 1) * w3 + (4 - 1) * wHR) / Math.max(1e-9, xbh)));
    if (give > 0) {
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

function computeEventProbsFromSlash(batter, oppPitch) {
  const AVG = clamp(batter.AVG, 0.15, 0.4);
  const OBP = clamp(batter.OBP, 0.25, 0.5);
  const SLG = clamp(batter.SLG, 0.3, 0.7);
  const ERA = clamp(oppPitch.ERA, 1.5, 10.0);

  const FP = ERA / R9_REF;
  const H_raw = clamp(AVG * FP, 0.08, 0.45);
  const OBP_eff = clamp(OBP * (0.85 + 0.3 * (FP - 1)), 0.18, 0.52);
  const BB_raw = Math.max(0, OBP_eff - H_raw);
  const reach_off = H_raw + BB_raw;

  let H = H_raw, BB = BB_raw;
  if (typeof oppPitch.WHIP === "number" && isFinite(oppPitch.WHIP) && oppPitch.WHIP > 0) {
    const reach_def = reachFromWHIP(oppPitch.WHIP);
    const reach_blend = REACH_OFF_WEIGHT * reach_off + REACH_DEF_WEIGHT * reach_def;
    const scale = reach_off > 1e-9 ? reach_blend / reach_off : 1;
    H = clamp(H_raw * scale, 0, 0.6);
    BB = clamp(BB_raw * scale, 0, 0.4);
  }

  const P_HBP = BB * 0.1;
  const P_BB = BB * 0.9;

  const H_base = Math.max(H_raw, 1e-6);
  const basesPerHit = clamp(SLG / H_base, 1.0, 2.6);
  const { w1, w2, w3, wHR } = mixFromSlugPerHit(basesPerHit);

  const p1B = H * w1;
  const p2B = H * w2;
  const p3B = H * w3;
  const pHR = H * wHR;
  const pOUT = clamp(1 - (p1B + p2B + p3B + pHR + P_BB + P_HBP), 0, 1);

  return { OUT: pOUT, BB: P_BB, HBP: P_HBP, "1B": p1B, "2B": p2B, "3B": p3B, HR: pHR };
}

function eventProbsForHalf(half, home, away) {
  const batting = half === "top" ? away.bat : home.bat;
  const pitching = half === "top" ? home.pitch : away.pitch;
  return computeEventProbsFromSlash(batting, pitching);
}

function rollEventFromProbs(probs, rng) {
  const entries = [
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
  let r = rng() * total;
  for (const [ev, weight] of entries) {
    r -= Math.max(0, weight);
    if (r <= 0) return ev;
  }
  return "OUT";
}

// ---------- Trace runner ----------
function formatBases(b) {
  return `${b.first ? "1" : "-"}${b.second ? "2" : "-"}${b.third ? "3" : "-"}`;
}

function simulateWithTrace(home, away, rules = DEFAULT_RULES, seed = 12345) {
  const rng = mulberry32(seed);
  const gs = {
    inning: 1,
    half: "top",
    outs: 0,
    bases: { first: false, second: false, third: false },
    scoreHome: 0,
    scoreAway: 0,
    status: { over: false, winner: null },
    rules: normalizeRules(rules),
  };

  const log = [];
  let plays = 0;
  while (!gs.status.over && plays++ < 10000) {
    const probs = eventProbsForHalf(gs.half, home, away);
    const ev = rollEventFromProbs(probs, rng);
    const before = `Inning ${gs.inning} ${gs.half === "top" ? "alta" : "baja"} | Outs ${gs.outs} | Bases ${formatBases(gs.bases)}`;
    const desc = applyEvent(gs, ev);
    const after = `Marcador A:${gs.scoreAway} - H:${gs.scoreHome}`;
    log.push(`${before} a†’ ${desc}. ${after}`);
    if (gs.status.over) break;
    // optional: cap by regulation innings
    if (gs.inning > rules.regulationInnings + 1) break; // safety
  }
  return { log, gs };
}

// ---------- Predefined teams ----------
const home = {
  bat: { AVG: 0.252, OBP: 0.322, SLG: 0.415 },
  pitch: { ERA: 4.05, WHIP: 1.27 },
};
const away = {
  bat: { AVG: 0.246, OBP: 0.315, SLG: 0.405 },
  pitch: { ERA: 3.90, WHIP: 1.20 },
};

// Run and print trace
const { log, gs } = simulateWithTrace(home, away, DEFAULT_RULES, 20250908);
for (const line of log) console.log(line);
console.log(`Final: Away ${gs.scoreAway} - Home ${gs.scoreHome} | Winner: ${gs.status.winner ?? "pending"}${gs.status.reason ? " (" + gs.status.reason + ")" : ""}`);


