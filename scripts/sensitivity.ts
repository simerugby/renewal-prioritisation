/**
 * `npm run sensitivity` — how much does the answer depend on my arbitrary numbers?
 *
 * The weights in `lib/config.ts` are a judgement. There are no historical
 * outcomes to fit them to, so "adoption is worth 18 and sentiment is worth 5" is
 * my opinion, and the obvious objection is that the whole ranking is an artefact
 * of numbers I made up.
 *
 * That objection is testable without any outcome data. Two experiments:
 *
 *   PERTURBATION  randomly jitter every weight by up to +/-40% and re-rank, a
 *                 thousand times. If the accounts at the top stay at the top, the
 *                 ranking is a property of the data, not of my arithmetic. If it
 *                 churns, the precision is fake and I should say so.
 *
 *   ABLATION      delete each signal entirely and re-rank. This says which
 *                 signals the answer actually rests on, and which are decoration.
 *
 * Deterministic seed, so the numbers reproduce.
 */

import { loadPortfolio } from '../lib/data';
import { CURVES, SIGNAL_WEIGHTS, SNAPSHOT_DATE, VALUE_FLOOR, deriveArrReference, type SignalKey } from '../lib/config';
import { band, scoreAll } from '../lib/scoring';
import type { Customer } from '../lib/types';

/** Mulberry32. A seeded PRNG so this run is byte-identical to the next. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KEYS = Object.keys(SIGNAL_WEIGHTS) as SignalKey[];

/**
 * Re-score with a modified weight map.
 *
 * `SIGNAL_WEIGHTS` is a frozen module constant, so this mutates it for the
 * duration of one run and restores it afterwards. Ugly, and the alternative was
 * threading a weight map through every signature in the engine for the benefit
 * of one script.
 */
function withWeights(weights: Record<SignalKey, number>, customers: Customer[]) {
  const original = { ...SIGNAL_WEIGHTS } as Record<SignalKey, number>;
  const target = SIGNAL_WEIGHTS as unknown as Record<SignalKey, number>;
  Object.assign(target, weights);
  try {
    return scoreAll(customers, SNAPSHOT_DATE).map((r) => r.customer.customerId);
  } finally {
    Object.assign(target, original);
  }
}

const overlap = (a: string[], b: string[], n: number) => {
  const top = new Set(a.slice(0, n));
  return b.slice(0, n).filter((id) => top.has(id)).length;
};

async function main() {
  const { rows } = await loadPortfolio(SNAPSHOT_DATE);
  const customers = rows.map((r) => r.customer);
  const baseline = rows.map((r) => r.customer.customerId);
  const nameOf = new Map(rows.map((r) => [r.customer.customerId, r.customer.customerName]));

  console.log('SENSITIVITY: does the ranking survive its own weights?\n');

  // ---- 1. Perturbation ------------------------------------------------------
  const TRIALS = 1000;
  const JITTER = 0.4;
  const rand = rng(20260721);
  const holds = { 1: 0, 3: 0, 5: 0, 10: 0 };
  const everInTop5 = new Map<string, number>();
  let rank1Changes = 0;

  for (let t = 0; t < TRIALS; t++) {
    const w = {} as Record<SignalKey, number>;
    for (const k of KEYS) w[k] = SIGNAL_WEIGHTS[k] * (1 + (rand() * 2 - 1) * JITTER);
    const ranked = withWeights(w, customers);
    for (const n of [1, 3, 5, 10] as const) {
      if (overlap(baseline, ranked, n) === n) holds[n]++;
    }
    if (ranked[0] !== baseline[0]) rank1Changes++;
    for (const id of ranked.slice(0, 5)) everInTop5.set(id, (everInTop5.get(id) ?? 0) + 1);
  }

  console.log(`Perturbation: every weight jittered by up to +/-${JITTER * 100}%, ${TRIALS} trials`);
  for (const n of [1, 3, 5, 10] as const) {
    console.log(`  the same accounts hold the top ${String(n).padEnd(2)} in ${((holds[n] / TRIALS) * 100).toFixed(1)}% of trials`);
  }
  console.log(`  the account ranked #1 changed in ${((rank1Changes / TRIALS) * 100).toFixed(1)}% of trials`);
  console.log('\n  how often each account appeared in the top 5:');
  [...everInTop5.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .forEach(([id, n]) => console.log(`    ${(nameOf.get(id) ?? id).padEnd(26)} ${((n / TRIALS) * 100).toFixed(0)}%`));

  // A stable top is not the same as a stable ranking, and reporting only the
  // top would be the flattering half of the result. This measures how far every
  // account moves, by where it started.
  const rand2 = rng(20260721);
  const movement = new Map<string, number[]>();
  for (let t = 0; t < TRIALS; t++) {
    const w = {} as Record<SignalKey, number>;
    for (const k of KEYS) w[k] = SIGNAL_WEIGHTS[k] * (1 + (rand2() * 2 - 1) * JITTER);
    const ranked = withWeights(w, customers);
    ranked.forEach((id, i) => {
      const from = baseline.indexOf(id);
      (movement.get(id) ?? movement.set(id, []).get(id)!).push(Math.abs(i - from));
    });
  }

  const bandStats = (lo: number, hi: number) => {
    const ids = baseline.slice(lo, hi);
    const all = ids.flatMap((id) => movement.get(id) ?? []);
    const avg = all.reduce((s, x) => s + x, 0) / (all.length || 1);
    return { avg, max: Math.max(...all, 0) };
  };

  console.log('\n  how far accounts move under the same jitter, by where they start:');
  for (const [lo, hi, label] of [
    [0, 5, 'ranks 1-5'],
    [5, 15, 'ranks 6-15'],
    [15, 30, 'ranks 16-30'],
    [30, 40, 'ranks 31-40'],
  ] as const) {
    const s = bandStats(lo, hi);
    console.log(`    ${label.padEnd(12)} mean ${s.avg.toFixed(2)} places, worst ${s.max}`);
  }

  // ---- 1b. The two multipliers the weight jitter never touches --------------
  //
  // priorityScore = riskScore * valueWeight * urgency, and the nine weights
  // above move only the first term. VALUE_FLOOR sets how flat the value axis is:
  // the ARR reaching the multiplier runs from GBP 12,000 to the GBP 210,000
  // reference, 17.5x, and a floor of 0.45 delivers that as a 2.08x spread. The
  // urgency curve sets how fast a distant renewal is discounted. Neither was
  // perturbed until this block existed.
  //
  // Priority is recomputed here rather than re-scored, because neither parameter
  // enters riskScore. The expression below is the priority line from
  // lib/scoring.ts with a different floor and a different curve, so it can drift
  // from it. The assertion checks that at the shipped values it still reproduces
  // the shipped order exactly. Do not delete it to make a refactor pass.
  const arrReference = deriveArrReference(customers.map((c) => c.arrGbp));
  const rankedBy = (floor: number, urgencyPts: [number, number][]) =>
    rows
      .map((r) => ({
        id: r.customer.customerId,
        p:
          r.riskScore *
          (floor + (1 - floor) * Math.max(0, Math.min(1, r.customer.arrGbp / Math.max(1, arrReference)))) *
          band(r.daysToRenewal, urgencyPts),
      }))
      .sort((a, b) => b.p - a.p)
      .map((x) => x.id);

  // Oakwell Design: risk #1, priority #5. The account the two-axis split is
  // argued on, and the one whose position the floor actually decides.
  const WATCH = 'CUST-1004';
  const watchName = nameOf.get(WATCH) ?? WATCH;
  const rankOf = (ids: string[], id: string) => ids.indexOf(id) + 1;

  if (rankedBy(VALUE_FLOOR, CURVES.urgency).join() !== baseline.join()) {
    throw new Error('the floor sweep does not reproduce the shipped ranking at the shipped parameters');
  }

  console.log(`\nValue floor: shipped at ${VALUE_FLOOR}, swept end to end`);
  for (const f of [0, 0.27, 0.35, 0.45, 0.55, 0.63, 1]) {
    const ranked = rankedBy(f, CURVES.urgency);
    console.log(
      `  floor ${f.toFixed(2)}   ${watchName} #${String(rankOf(ranked, WATCH)).padStart(2)}   top-5 kept ${overlap(baseline, ranked, 5)}/5   top-10 kept ${String(overlap(baseline, ranked, 10)).padStart(2)}/10   #1 ${nameOf.get(ranked[0]) ?? ranked[0]}`,
    );
  }

  const rand3 = rng(20260721);
  const floorRanks: number[] = [];
  const jointRanks: number[] = [];
  for (let t = 0; t < TRIALS; t++) {
    const floor = VALUE_FLOOR * (1 + (rand3() * 2 - 1) * JITTER);
    // Each urgency control point is jittered too, then clamped to [0, the point
    // before it] so the result is still a discount curve rather than noise.
    let prev = Infinity;
    const pts = CURVES.urgency.map(([d, u]) => {
      const y = Math.min(prev, Math.max(0, Math.min(1, u * (1 + (rand3() * 2 - 1) * JITTER))));
      prev = y;
      return [d, y] as [number, number];
    });
    floorRanks.push(rankOf(rankedBy(floor, CURVES.urgency), WATCH));
    jointRanks.push(rankOf(rankedBy(floor, pts), WATCH));
  }

  const span = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return { best: s[0], median: s[Math.floor(s.length / 2)], worst: s[s.length - 1] };
  };
  const fOnly = span(floorRanks);
  const fBoth = span(jointRanks);
  console.log(`\n  floor jittered +/-${JITTER * 100}%, ${TRIALS} trials`);
  console.log(`    ${watchName} ranks #${fOnly.best} to #${fOnly.worst}, median #${fOnly.median}`);
  console.log(`  floor and every urgency control point jittered +/-${JITTER * 100}%, ${TRIALS} trials`);
  console.log(
    `    ${watchName} ranks #${fBoth.best} to #${fBoth.worst}, median #${fBoth.median}, in the top 5 in ${((jointRanks.filter((r) => r <= 5).length / TRIALS) * 100).toFixed(0)}% of trials`,
  );

  // The limiting case, stated so nobody has to ask for it. Removing the floor
  // AND the clamp at the reference makes priority straight expected loss,
  // risk x ARR x urgency. That is a defensible ranking and it is not this one.
  const expectedLoss = rows
    .map((r) => ({ id: r.customer.customerId, p: (r.riskScore / 100) * r.customer.arrGbp * band(r.daysToRenewal, CURVES.urgency) }))
    .sort((a, b) => b.p - a.p)
    .map((x) => x.id);
  console.log(`\n  Straight expected loss (no floor, no clamp): ${watchName} #${rankOf(baseline, WATCH)} -> #${rankOf(expectedLoss, WATCH)}`);
  console.log('  accounts it promotes into the top 10:');
  for (const id of expectedLoss.slice(0, 10)) {
    const from = rankOf(baseline, id);
    if (from > 10) console.log(`    ${(nameOf.get(id) ?? id).padEnd(26)} #${from} -> #${rankOf(expectedLoss, id)}`);
  }

  // ---- 2. Ablation ----------------------------------------------------------
  console.log('\nAblation: remove one signal entirely and re-rank');
  console.log('  signal                     top-5 kept   top-10 kept   new #1');
  for (const k of KEYS) {
    const w = { ...SIGNAL_WEIGHTS } as Record<SignalKey, number>;
    w[k] = 0;
    const ranked = withWeights(w, customers);
    const changed = ranked[0] !== baseline[0] ? (nameOf.get(ranked[0]) ?? ranked[0]) : '—';
    console.log(
      `  ${k.padEnd(24)} ${String(overlap(baseline, ranked, 5)).padStart(4)}/5   ${String(overlap(baseline, ranked, 10)).padStart(8)}/10   ${changed}`,
    );
  }

  console.log('\n--- HOW TO READ THIS ---');
  console.log('A ranking that survives a 40% jitter on every weight is telling you about the accounts,');
  console.log('not about the arithmetic. Where it does not survive, the honest response is that those');
  console.log('positions are not distinguishable and should not be presented as if they were.');
  console.log('The value floor is the exception, and it is why this script now sweeps it: no weighting');
  console.log('moves Oakwell Design out of the top 5, and the floor alone moves it between #2 and #6.');
  console.log('That number is a commercial judgement about how much a small account is allowed to matter.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
