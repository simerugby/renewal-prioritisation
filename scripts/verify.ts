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
  const portfolio = await loadPortfolio(SNAPSHOT_DATE);
  const { rows } = portfolio;
  console.log(`Loaded ${rows.length} accounts from ${portfolio.sourceName}. Snapshot ${SNAPSHOT_DATE}.`);
  if (portfolio.quarantined > 0) console.log(`${portfolio.quarantined} rows quarantined as unparseable.`);
  if (portfolio.issues.length > 0) {
    console.log(`\n${portfolio.issues.length} data quality issue(s):`);
    for (const i of portfolio.issues.slice(0, 12)) {
      console.log(`  [${i.level}] ${i.scope}${i.column ? ` · ${i.column}` : ''} — ${i.message}`);
    }
    if (portfolio.issues.length > 12) console.log(`  …and ${portfolio.issues.length - 12} more.`);
  }
  console.log('');

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

  // Every figure quoted in the README, computed here from the CSV. The README
  // says nothing is estimated or recalled; this block is what makes that
  // checkable rather than a claim.
  console.log('\n=== README FIGURES ===');

  const npsAges = rows.map((r) => r.npsAgeDays).filter((a): a is number => a !== null).sort((a, b) => a - b);
  const median = (xs: number[]) => (xs.length ? xs[Math.floor(xs.length / 2)] : 0);
  console.log('Finding 3 — sentiment is stale, behaviour is not');
  console.log(`  accounts with no NPS response at all      ${rows.filter((r) => r.npsAgeDays === null).length}`);
  console.log(`  of the ${npsAges.length} dated, older than a week        ${npsAges.filter((a) => a > 7).length}`);
  console.log(`  median NPS response age                   ${median(npsAges)} days`);
  console.log(`  oldest NPS response                        ${npsAges[npsAges.length - 1]} days`);
  console.log(`  NPS excluded from scoring (>120d)         ${rows.filter((r) => r.signals.find((s) => s.key === 'sentiment')?.normalised === null && r.npsAgeDays !== null).length}`);
  console.log(`  usage feeds more than a week stale        ${rows.filter((r) => r.usageDataAgeDays > 7).length}`);
  console.log(`  median usage sync age                     ${median(rows.map((r) => r.usageDataAgeDays).sort((a, b) => a - b))} day(s)`);
  const usageExcluded = rows.filter((r) => r.signals.find((s) => s.key === 'adoptionTrend')?.normalised === null);
  console.log(`  usage signals excluded as stale           ${usageExcluded.length} (${usageExcluded.map((r) => `${r.customer.customerName} @ ${Math.round(r.modelCoverage * 100)}% coverage`).join(', ') || 'none'})`);

  console.log('\nFinding 1 — near-term process risk');
  const notStartedSoon = rows.filter((r) => r.customer.renewalStage === 'Not started' && r.daysToRenewal <= 45);
  console.log(`  "Not started" renewing within 45 days     ${notStartedSoon.length} accounts, ${gbp(notStartedSoon.reduce((s, r) => s + r.customer.arrGbp, 0))}`);

  console.log('\nFinding 2 — risk rank is not priority rank');
  const oakwell = rows.find((r) => r.customer.customerId === 'CUST-1004')!;
  const northstar = rows.find((r) => r.customer.customerId === 'CUST-1001')!;
  console.log(`  ${oakwell.customer.customerName.padEnd(22)} risk #${oakwell.riskOnlyRank}, priority #${oakwell.priorityRank}, ${gbp(oakwell.customer.arrGbp)}`);
  console.log(`  ${northstar.customer.customerName.padEnd(22)} risk #${northstar.riskOnlyRank}, priority #${northstar.priorityRank}, ${gbp(northstar.customer.arrGbp)}`);
  console.log(`  value ratio                               ${(northstar.customer.arrGbp / oakwell.customer.arrGbp).toFixed(1)}x`);

  console.log('\nFinding 4 — "Verbal commitment" is not a safe stage');
  const verbal = rows.filter((r) => r.customer.renewalStage === 'Verbal commitment');
  const verbalStuck = verbal.filter((r) => r.customer.invoiceStatus !== 'Current');
  for (const r of verbal) {
    console.log(`  ${r.customer.customerName.padEnd(22)} ${gbp(r.customer.arrGbp).padStart(9)}  invoice ${r.customer.invoiceStatus}`);
  }
  console.log(`  ${verbalStuck.length} of ${verbal.length} carry unresolved billing, ${gbp(verbalStuck.reduce((s, r) => s + r.customer.arrGbp, 0))}`);

  console.log('\nFinding 5 — the account the structured signals miss');
  const quantum = rows.find((r) => r.customer.customerId === 'CUST-1025')!;
  console.log(`  ${quantum.customer.customerName} — ${gbp(quantum.customer.arrGbp)} (largest in book: ${gbp(Math.max(...rows.map((r) => r.customer.arrGbp)))})`);
  console.log(`  risk ${quantum.riskScore.toFixed(1)}, priority #${quantum.priorityRank}, renews in ${quantum.daysToRenewal} days`);
  console.log(`  note: "${quantum.customer.customerNotes}"`);

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
