/**
 * Verification harness. Run with `npm run verify`.
 *
 * Prints the ranking the app will show, plus the checks that matter:
 *  - every row parses and scores
 *  - risk-only rank vs priority rank, which is the whole product argument
 *  - confidence spread
 *  - the note-scanner eval against a hand-labelled set
 *
 * This is the file that lets someone challenge the model without opening the UI,
 * and the source of every number quoted in the README.
 */
import { loadPortfolio } from '../lib/data';
import { SNAPSHOT_DATE } from '../lib/config';
import { runNoteScanEval } from '../eval/noteScanEval';

const gbp = (n: number) => `£${n.toLocaleString('en-GB')}`;

async function main() {
  const rows = await loadPortfolio(SNAPSHOT_DATE);
  console.log(`Loaded ${rows.length} accounts. Snapshot ${SNAPSHOT_DATE}.\n`);

  const totalArr = rows.reduce((s, r) => s + r.customer.arrGbp, 0);
  console.log(`Total ARR under management: ${gbp(totalArr)}`);
  console.log(`Renewing within 30 days: ${rows.filter((r) => r.daysToRenewal <= 30).length} accounts, ` +
    `${gbp(rows.filter((r) => r.daysToRenewal <= 30).reduce((s, r) => s + r.customer.arrGbp, 0))}\n`);

  console.log('RANK  CUSTOMER                       PRI   RISK   (risk-only)      ARR   days  conf  cover');
  for (const r of rows) {
    const moved = r.riskOnlyRank !== r.priorityRank ? `#${r.riskOnlyRank}` : '  =';
    console.log(
      `${String(r.priorityRank).padStart(4)}  ${r.customer.customerName.padEnd(28)} ` +
        `${r.priorityScore.toFixed(1).padStart(5)}  ${r.riskScore.toFixed(1).padStart(5)}   ${moved.padStart(10)} ` +
        `${gbp(r.customer.arrGbp).padStart(9)} ${String(r.daysToRenewal).padStart(5)}  ${r.confidence.padStart(6)} ` +
        `${Math.round(r.modelCoverage * 100)}%`,
    );
  }

  console.log('\n--- The product argument, in one table ---');
  const byRisk = [...rows].sort((a, b) => a.riskOnlyRank - b.riskOnlyRank).slice(0, 5);
  for (const r of byRisk) {
    console.log(
      `risk #${r.riskOnlyRank} ${r.customer.customerName.padEnd(26)} ${gbp(r.customer.arrGbp).padStart(9)} ` +
        `-> priority #${r.priorityRank}`,
    );
  }

  console.log('\n--- Confidence ---');
  for (const level of ['High', 'Medium', 'Low'] as const) {
    const set = rows.filter((r) => r.confidence === level);
    console.log(`${level}: ${set.length}${set.length && level !== 'High' ? ' (' + set.map((r) => r.customer.customerName).join(', ') + ')' : ''}`);
  }

  console.log('\n--- Accounts where the notes carry risk the score cannot see ---');
  const blind = rows.filter((r) => r.riskScore < 30 && r.noteFlags.some((f) => ['sponsor-loss', 'exit-signal', 'competitive-threat', 'budget-freeze', 'paperwork-stuck'].includes(f.key)));
  for (const r of blind) {
    console.log(`  ${r.customer.customerName} — risk ${r.riskScore.toFixed(1)}, ${gbp(r.customer.arrGbp)}, flags: ${r.noteFlags.map((f) => f.key).join(', ')}`);
  }

  console.log('\n--- Note-scanner eval (the control group for the AI feature) ---');
  const evalResult = runNoteScanEval();
  console.log(`Hand-labelled accounts: ${evalResult.total}`);
  console.log(`Material note-risks labelled: ${evalResult.expectedCount}`);
  console.log(`Caught by rules: ${evalResult.caught} (${Math.round((evalResult.caught / evalResult.expectedCount) * 100)}%)`);
  console.log(`Missed by rules: ${evalResult.missed.length}`);
  for (const m of evalResult.missed) console.log(`  MISS ${m.id} [${m.label}] "${m.note}"`);
  console.log(`False positives: ${evalResult.falsePositives.length}`);
  for (const f of evalResult.falsePositives) console.log(`  FP   ${f.id} [${f.key}]`);

  // Sanity assertions — these fail the build if the model degrades.
  const errors: string[] = [];
  if (rows.length !== 40) errors.push(`expected 40 rows, got ${rows.length}`);
  if (rows[0].customer.customerId !== 'CUST-1001') errors.push(`expected Northstar at priority #1, got ${rows[0].customer.customerName}`);
  const oakwell = rows.find((r) => r.customer.customerId === 'CUST-1004')!;
  if (oakwell.riskOnlyRank !== 1) errors.push(`expected Oakwell at risk rank 1, got ${oakwell.riskOnlyRank}`);
  if (oakwell.priorityRank <= 3) errors.push(`expected Oakwell to fall below priority #3, got #${oakwell.priorityRank}`);
  if (rows.some((r) => Number.isNaN(r.riskScore))) errors.push('NaN risk score present');

  if (errors.length) {
    console.error('\nFAILED:\n' + errors.map((e) => '  - ' + e).join('\n'));
    process.exit(1);
  }
  console.log('\nAll checks passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
