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
import { SIGNAL_WEIGHTS, SNAPSHOT_DATE, type SignalKey } from '../lib/config';
import { scoreAll } from '../lib/scoring';
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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
