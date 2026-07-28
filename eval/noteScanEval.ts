/**
 * THE EVAL. This is the file that decides whether the AI feature deserves to exist.
 *
 * Claim under test: `customer_notes` carries material renewal risk that the nine
 * structured signals cannot see, and rules cannot reliably extract it.
 *
 * Method. I read all 40 notes and labelled, by hand, every one that contains a
 * fact which would change a CSM's next action and which is NOT already visible
 * in a structured column. "Invoice disputed" in a note is not a label — the
 * `invoice_status` column already says so. "The sponsor moves roles on 1 August"
 * is a label: nothing else in the row knows it.
 *
 * The labels are a judgement and I would defend them one by one, but they are
 * mine and a reasonable reviewer could move two or three. That is why the raw
 * notes are printed next to every miss in `npm run verify` — so the labelling
 * can be argued with rather than taken on trust.
 *
 * The rule scanner is then scored against them. Whatever it misses is the
 * measured value of the LLM call, and if it had missed nothing the honest
 * decision would have been to delete the call and ship the rules.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { parseCsv } from '../lib/csv';
import { scanNotes } from '../lib/noteScan';

/**
 * Hand-labelled ground truth: accounts whose note contains material risk beyond
 * the structured signals, with the category I would expect a competent reader to
 * assign. `null` means "nothing here the structured data does not already know".
 */
export const LABELS: Record<string, string | null> = {
  'CUST-1001': 'budget-freeze', // new CFO opened a budget review — no column carries this
  'CUST-1002': 'unresolved-issue', // rollout delays unresolved + value case demanded
  'CUST-1003': 'competitive-threat', // consolidated vendor list, tools may be cut
  'CUST-1004': 'sponsor-loss', // former champion left; no response to 3 emails
  'CUST-1005': 'ownerless-blocker', // QBR deck says 240 users, the file says otherwise
  'CUST-1006': 'mitigating-context', // decline is store closures, pilot above target
  'CUST-1007': 'price-pressure', // procurement expects a flat renewal
  'CUST-1008': 'mitigating-context', // seasonal — but "faster than expected"
  'CUST-1009': 'paperwork-stuck', // order form unsigned
  'CUST-1010': 'price-pressure', // 15% reduction requested, sponsor missed 2 calls
  'CUST-1011': 'mitigating-context', // tickets are onboarding volume, not failure
  'CUST-1012': 'ownerless-blocker', // counsel unavailable until late August
  'CUST-1013': 'paperwork-stuck', // PO not arrived, buyer silent 9 days
  'CUST-1014': 'ownerless-blocker', // unclear if Analytics Hub is a renewal condition
  'CUST-1015': null, // "procurement timing may delay signature" — mild, stage covers it
  'CUST-1016': 'expansion',
  'CUST-1017': 'unresolved-issue', // reporting defect driving sentiment
  'CUST-1018': 'exit-signal', // requested a cancellation clause
  'CUST-1019': 'ownerless-blocker', // redlines with no named owner either side
  'CUST-1020': 'ownerless-blocker', // project ended, no new use case agreed
  'CUST-1021': 'expansion',
  'CUST-1022': 'unresolved-issue', // remediation plan requested, marked resolved internally
  'CUST-1023': 'expansion',
  'CUST-1024': 'sponsor-loss', // commercial contact changed in July
  'CUST-1025': 'sponsor-loss', // THE ONE. Sponsor moves roles 1 Aug, no replacement.
  'CUST-1026': 'paperwork-stuck', // PO still missing 18 days after verbal
  'CUST-1027': 'competitive-threat', // competing tool trialled by finance
  'CUST-1028': 'price-pressure', // non-profit pricing exception needed
  'CUST-1029': 'unresolved-issue', // data migration issue open
  'CUST-1030': 'expansion', // 40 more clinicians, DPIA not started
  'CUST-1031': null,
  'CUST-1032': 'expansion',
  'CUST-1033': 'mitigating-context', // seasonal, no prior-year baseline
  'CUST-1034': 'price-pressure', // reopened warehouse-seat pricing
  'CUST-1035': 'unresolved-issue', // service credit open, adoption not recovered
  'CUST-1036': 'mitigating-context', // headcount reductions shrank the user base
  'CUST-1037': 'budget-freeze', // finance paused new commitments until Q4
  'CUST-1038': 'sponsor-loss', // champion moved roles
  'CUST-1039': 'mitigating-context', // NPS predates the ticket spike
  'CUST-1040': 'ownerless-blocker', // procurement has not named a commercial lead
};

export interface EvalResult {
  total: number;
  expectedCount: number;
  caught: number;
  missed: { id: string; label: string; note: string }[];
  /**
   * Only measurable on the notes labelled `null`. There are two of them, so a
   * clean false-positive count here is a weak result, not a strong one.
   */
  falsePositives: { id: string; key: string }[];
  /**
   * Flags raised on a labelled note beyond its one label. The eval cannot call
   * these right or wrong — a note can honestly carry two categories — so they
   * are counted rather than scored. Without this line the only false positives
   * the scanner can record are on those two null notes, which makes "zero false
   * positives" a fact about the label set rather than about the scanner.
   */
  extraFlags: { id: string; label: string; extra: string[] }[];
}

let cachedRows: Record<string, string>[] | null = null;

function loadRowsSync(): Record<string, string>[] {
  if (cachedRows) return cachedRows;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fsSync = require('fs') as typeof import('fs');
  const text = fsSync.readFileSync(path.join(process.cwd(), 'data', 'renewal_customers.csv'), 'utf8');
  cachedRows = parseCsv(text);
  return cachedRows;
}

export function runNoteScanEval(): EvalResult {
  const rows = loadRowsSync();
  const missed: EvalResult['missed'] = [];
  const falsePositives: EvalResult['falsePositives'] = [];
  const extraFlags: EvalResult['extraFlags'] = [];
  let caught = 0;
  let expectedCount = 0;

  for (const r of rows) {
    const id = r.customer_id;
    const expected = LABELS[id];
    const flags = scanNotes(r.customer_notes).map((f) => f.key);

    if (expected) {
      expectedCount++;
      if (flags.includes(expected)) caught++;
      else missed.push({ id, label: expected, note: r.customer_notes });
      const extra = flags.filter((f) => f !== expected);
      if (extra.length) extraFlags.push({ id, label: expected, extra });
    } else if (flags.length > 0) {
      falsePositives.push({ id, key: flags.join('+') });
    }
  }

  return { total: rows.length, expectedCount, caught, missed, falsePositives, extraFlags };
}

/** Async variant for use inside the Next.js runtime. */
export async function runNoteScanEvalAsync(): Promise<EvalResult> {
  const text = await fs.readFile(path.join(process.cwd(), 'data', 'renewal_customers.csv'), 'utf8');
  cachedRows = parseCsv(text);
  return runNoteScanEval();
}
