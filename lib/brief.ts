/**
 * Prompt construction and the deterministic fallback.
 *
 * Kept out of the route handler so both can be unit-read: what exactly the model
 * is told, and exactly what the user gets when the model is unavailable.
 */

import type { ScoredCustomer } from './types';

export type BriefSource = 'llm' | 'fallback';
export type FallbackReason = 'no-key' | 'timeout' | 'rate-limited' | 'error' | 'empty-response';

export interface BriefResponse {
  headline: string;
  reading: string;
  noteRiskPresent: boolean;
  noteRiskSummary: string;
  openingLine: string;
  source: BriefSource;
  model?: string;
  fallbackReason?: FallbackReason;
  cached?: boolean;
}

const gbp = (n: number) => `£${n.toLocaleString('en-GB')}`;
const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** Note categories that change what a CSM should do, as opposed to context. */
export const MATERIAL_NOTE_FLAGS = [
  'exit-signal',
  'sponsor-loss',
  'competitive-threat',
  'budget-freeze',
  'paperwork-stuck',
  'unresolved-issue',
];

/**
 * Everything the model is allowed to see. The score arrives as a stated fact, in
 * words, alongside the evidence that produced it — the model is a reader here,
 * not a calculator.
 */
export function buildPrompt(row: ScoredCustomer, portfolioSize?: number): string {
  const c = row.customer;
  const scored = row.signals.filter((s) => s.normalised !== null).sort((a, b) => b.contribution - a.contribution);
  const excluded = row.signals.filter((s) => s.normalised === null);

  return [
    `ACCOUNT: ${c.customerName} (${c.customerId})`,
    `${c.segment}, ${c.industry}, ${c.region}. CSM: ${c.csmName}.`,
    `${gbp(c.arrGbp)} ARR on a ${c.contractTermMonths}-month term. Products: ${c.productsOwned.join(', ')}.`,
    `Renews ${c.renewalDate} — ${row.daysToRenewal} days from the portfolio snapshot.`,
    ``,
    `ALREADY COMPUTED — treat these as given:`,
    `Risk score ${row.riskScore.toFixed(0)}/100 (${row.riskBand}). Priority rank ${row.priorityRank}${portfolioSize ? ` of ${portfolioSize}` : ''}.`,
    `Confidence ${row.confidence}; ${Math.round(row.modelCoverage * 100)}% of the model's weight could be applied.`,
    `Suggested next action (chosen by rule): ${row.playbook.action} — ${row.playbook.urgency}, owner ${row.playbook.owner}.`,
    ``,
    `EVIDENCE BEHIND THE SCORE, largest contribution first:`,
    ...scored.map((s) => `- ${s.label} (+${s.contribution.toFixed(1)} points): ${s.evidence}`),
    ...(excluded.length
      ? ['', 'SIGNALS THAT COULD NOT BE SCORED:', ...excluded.map((s) => `- ${s.label}: ${s.evidence} ${s.excludedReason ?? ''}`)]
      : []),
    ...(row.contradictions.length
      ? ['', 'SIGNALS THAT CONTRADICT EACH OTHER:', ...row.contradictions.map((x) => `- ${x.summary}: ${x.detail}`)]
      : []),
    ``,
    `FREE-TEXT ACCOUNT NOTE — no rule in this system can read this, which is why you are here:`,
    `"${c.customerNotes}"`,
    ``,
    `Tell the CSM what they need to understand before they make contact. If the note carries a material`,
    `risk the structured signals above do not capture, say what it is and why the signals missed it.`,
  ].join('\n');
}

/**
 * The deterministic brief. Assembled from the same evidence by rule, so a
 * missing key costs polish rather than function.
 */
export function buildFallbackBrief(row: ScoredCustomer, reason: FallbackReason): BriefResponse {
  const c = row.customer;
  const top = row.signals
    .filter((s) => s.normalised !== null && s.contribution >= 1)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3);

  const material = row.noteFlags.filter((f) => MATERIAL_NOTE_FLAGS.includes(f.key));

  // The interesting case, and the one this product exists for: the structured
  // signals are calm and the note is not. Saying "looks steady" there would be
  // technically true of the score and actively misleading about the account.
  const quietButFlagged = row.riskBand === 'Stable' && material.length > 0;

  const headline = quietButFlagged
    ? `${c.customerName} scores as stable, but the account note says otherwise — ${gbp(c.arrGbp)} renewing in ${row.daysToRenewal} days.`
    : row.riskBand === 'Stable'
      ? `${c.customerName} looks steady — ${gbp(c.arrGbp)} renewing in ${row.daysToRenewal} days with no signal outside its normal range.`
      : `${c.customerName} is ${row.riskBand.toLowerCase()} risk on ${gbp(c.arrGbp)}, renewing in ${row.daysToRenewal} days.`;

  const reading = [
    top.length
      ? `The score is driven by ${top.map((s) => s.label.toLowerCase()).join(', ')}. ${top[0].evidence}`
      : 'No individual signal is outside its normal range.',
    row.contradictions.length
      ? `Two records disagree here: ${row.contradictions[0].detail}`
      : '',
    row.confidence !== 'High'
      ? `Confidence is ${row.confidence.toLowerCase()}: ${lowerFirst(row.confidenceReasons[0])}`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    headline,
    reading,
    noteRiskPresent: material.length > 0,
    noteRiskSummary: material.length
      ? `The account note flags ${material.map((f) => f.label.toLowerCase()).join(' and ')}: "${material[0].quote}"`
      : '',
    openingLine: row.playbook.action,
    source: 'fallback',
    fallbackReason: reason,
  };
}
