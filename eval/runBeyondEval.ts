/**
 * `npm run eval:beyond` — the eval that decides where the model goes.
 *
 * `npm run eval` measures DETECTION: does a note carry material risk at all.
 * This one measures the question the shipped product actually asks:
 *
 *     does this note add risk the nine structured signals do NOT already capture?
 *
 * The distinction is not academic. Greenway Bank's note says finance disputes a
 * charge, and `invoice_status` already reads Disputed — so the note adds nothing,
 * and a system that flags it is crying wolf. Measuring against the detection
 * labels marks that a miss when it is the right answer.
 *
 * Read the "operating point" section at the bottom before quoting any number.
 */

import fs from 'fs';
import { config as loadEnv } from 'dotenv';
import { loadPortfolio } from '../lib/data';
import { SNAPSHOT_DATE } from '../lib/config';
import { MATERIAL_NOTE_FLAGS } from '../lib/secondRead';
import { BEYOND_SIGNALS_LABELS } from './beyondSignalsLabels';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ quiet: true });

const BATCH = 'data/second-read.json';

interface Scored {
  precision: number;
  recall: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  fpIds: string[];
  fnIds: string[];
}

function score(ids: string[], predict: (id: string) => boolean): Scored {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  const fpIds: string[] = [];
  const fnIds: string[] = [];
  for (const id of ids) {
    const should = BEYOND_SIGNALS_LABELS[id]?.addsRisk === true;
    const said = predict(id);
    if (said && should) tp++;
    else if (said && !should) { fp++; fpIds.push(id); }
    else if (!said && should) { fn++; fnIds.push(id); }
    else tn++;
  }
  return {
    precision: tp + fp ? (tp / (tp + fp)) * 100 : 0,
    recall: tp + fn ? (tp / (tp + fn)) * 100 : 0,
    tp, fp, fn, tn, fpIds, fnIds,
  };
}

const row = (name: string, s: Scored) =>
  `  ${name.padEnd(20)} precision ${s.precision.toFixed(0).padStart(3)}%   recall ${s.recall.toFixed(0).padStart(3)}%   (tp ${s.tp}, fp ${s.fp}, fn ${s.fn}, tn ${s.tn})`;

async function main() {
  const { rows } = await loadPortfolio(SNAPSHOT_DATE);
  const ids = rows.map((r) => r.customer.customerId);
  const labelled = Object.values(BEYOND_SIGNALS_LABELS).filter((l) => l.addsRisk).length;

  console.log('Does the note add risk the structured signals do NOT already capture?');
  console.log(`Hand-labelled ground truth: ${labelled} of ${ids.length} accounts add risk.`);
  console.log('Labels and their reasons: eval/beyondSignalsLabels.ts\n');

  const ruleScore = score(ids, (id) => {
    const r = rows.find((x) => x.customer.customerId === id)!;
    return r.noteFlags.some((f) => MATERIAL_NOTE_FLAGS.includes(f.key));
  });
  console.log(row('keyword rules', ruleScore));

  let batch: Record<string, { addsRiskBeyondSignals?: boolean }> | null = null;
  try {
    batch = JSON.parse(fs.readFileSync(BATCH, 'utf8'));
  } catch {
    console.log('  (no data/second-read.json — run `npm run second-read:batch` for the model column)');
  }

  if (batch) {
    const modelScore = score(ids, (id) => batch![id]?.addsRiskBeyondSignals === true);
    console.log(row('gpt-4.1-nano', modelScore));
    console.log(`\n  model false positives: ${modelScore.fpIds.join(', ') || 'none'}`);
    console.log(`  model false negatives: ${modelScore.fnIds.join(', ') || 'none'}`);
  }

  // ---- The product surface -------------------------------------------------
  const calm = rows.filter((r) => r.riskBand === 'Stable' || r.riskBand === 'Watch');
  const gbp = (n: number) => `£${n.toLocaleString('en-GB')}`;
  const sum = (a: typeof rows) => a.reduce((s, r) => s + r.customer.arrGbp, 0);
  const ruleList = calm.filter((r) => r.noteFlags.some((f) => MATERIAL_NOTE_FLAGS.includes(f.key)));
  const modelList = batch ? calm.filter((r) => batch![r.customer.customerId]?.addsRiskBeyondSignals) : [];

  console.log('\nTHE TRIAGE LIST — calm score AND the note says otherwise');
  console.log(`  calm accounts in the book : ${calm.length}`);
  console.log(`  keyword rules select      : ${ruleList.length}  ${gbp(sum(ruleList))}`);
  if (batch) console.log(`  the model selects         : ${modelList.length}  ${gbp(sum(modelList))}`);

  console.log('\n--- OPERATING POINT, AND AN HONEST CAVEAT ---');
  console.log('I tuned the Second Read prompt twice against these 40 labels, which I also wrote.');
  console.log('The first version biased to "no" (recall 25%); the second to "yes" (recall 96%).');
  console.log('Those bracket the answer rather than find it, and both numbers are overfitted to a set of 40.');
  console.log('');
  console.log('So the shipped product splits the job by measured strength:');
  console.log('  - the TRIAGE LIST is deterministic, because the rules produce a usable short list here');
  console.log('    and the model, at the recall needed to catch the flagship account, flags most of the book;');
  console.log('  - the model reads the note on the account page, which is what it does reliably;');
  console.log('  - and `npm run eval` shows the roles swap once the wording changes: rules 7%, model 93%.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
