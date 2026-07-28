/**
 * THE SCORING ENGINE.
 *
 * Deliberately contains no magic numbers — every threshold, weight and label
 * lives in `config.ts`. That split is the point: this file is the logic that
 * holds for any B2B renewal book, `config.ts` is the part you rewrite per
 * company.
 *
 * Three outputs, kept separate on purpose:
 *
 *   RISK       is this account in trouble?           0-100, additive, inspectable
 *   PRIORITY   where does the next CSM hour go?      risk x value x urgency
 *   CONFIDENCE how much of this do we actually know? never folded into the above
 *
 * None of the three is a probability. There are no historical renewal outcomes
 * in the dataset, so nothing here has been or could be validated against
 * observed churn, and presenting any of it as a likelihood would be inventing
 * precision the data cannot support.
 */

import {
  CONFIDENCE_COVERAGE_THRESHOLDS,
  CONFIDENCE_LEVEL_CUTOFFS,
  CURVES,
  deriveArrReference,
  HEALTHY_NPS_THRESHOLD,
  MAX_STAGE_GAP,
  NPS_AGE_WEIGHTING,
  NPS_RISK,
  SUPPORT_STRAIN_MIX,
  INVOICE_RISK,
  RISK_BANDS,
  SIGNAL_LABELS,
  SIGNAL_WEIGHTS,
  SPONSOR_RISK,
  STAGE_PROGRESS,
  STALENESS,
  VALUE_FLOOR,
  type SignalKey,
} from './config';
import { scanNotes } from './noteScan';
import { selectPlaybook } from './playbook';
import type {
  Contradiction,
  Customer,
  ConfidenceLevel,
  RiskBand,
  ScoredCustomer,
  SignalResult,
} from './types';

/** Piecewise-linear interpolation between (input, risk) control points. */
export function band(x: number, points: [number, number][]): number {
  if (x <= points[0][0]) return points[0][1];
  if (x >= points[points.length - 1][0]) return points[points.length - 1][1];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    if (x >= x0 && x <= x1) {
      if (x1 === x0) return y1;
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;

function computeSignals(
  c: Customer,
  asOf: string,
  daysToRenewal: number,
  usageAgeDays: number,
): SignalResult[] {
  const out: SignalResult[] = [];
  const push = (
    key: SignalKey,
    normalised: number | null,
    evidence: string,
    excludedReason?: string,
    weightScale = 1,
  ) => {
    const weightBase = SIGNAL_WEIGHTS[key];
    const weightApplied = normalised === null ? 0 : weightBase * weightScale;
    out.push({
      key,
      label: SIGNAL_LABELS[key],
      normalised,
      weightApplied,
      weightBase,
      contribution: 0, // filled in after re-normalisation
      evidence,
      excludedReason,
    });
  };

  // Both usage signals come from the same feed, so they age together. A "last 30
  // days" window that was last synced 33 days ago describes a period that ended
  // a month before the snapshot — that is not evidence about today, for the same
  // reason a 238-day-old NPS is not. Excluding it keeps the treatment of stale
  // inputs consistent instead of special-casing sentiment.
  const usageStale = usageAgeDays > STALENESS.usageExcludeDays;
  const staleNote = `Usage feed last synced ${usageAgeDays} days before the snapshot, so this describes a window that had already closed.`;

  // --- Adoption trend -------------------------------------------------------
  const trend =
    c.activeUsersPrevious30d > 0
      ? (c.activeUsers30d - c.activeUsersPrevious30d) / c.activeUsersPrevious30d
      : 0;
  if (usageStale) {
    push('adoptionTrend', null, `Active users ${pct(trend * 100)} versus the prior 30 days, as of the last sync.`, staleNote);
  } else {
    push(
      'adoptionTrend',
      band(trend, CURVES.adoptionTrend),
      `Active users ${pct(trend * 100)} versus the prior 30 days (${c.activeUsersPrevious30d} to ${c.activeUsers30d}).`,
    );
  }

  // --- Renewal process readiness -------------------------------------------
  // Compares how far the renewal has actually progressed against how far it
  // ought to have, given the time left. "Not started" is benign at 120 days and
  // an emergency at 18.
  const actual = STAGE_PROGRESS[c.renewalStage];
  if (actual === undefined) {
    push(
      'stageReadiness',
      null,
      `Renewal stage "${c.renewalStage}" is not a recognised value.`,
      'Unrecognised stage — cannot be placed on the process timeline.',
    );
  } else {
    const expected = band(daysToRenewal, CURVES.expectedStageProgress);
    const gap = Math.max(0, expected - actual);
    push(
      'stageReadiness',
      Math.min(1, gap / MAX_STAGE_GAP),
      `Stage is "${c.renewalStage}" with ${daysToRenewal} days to renewal; at this range the process would normally be ${Math.round(expected * 100)}% advanced.`,
    );
  }

  // --- Engagement recency ---------------------------------------------------
  if (c.daysSinceLastCustomerEngagement === null) {
    push('engagementRecency', null, 'No engagement date recorded.', 'Field blank in source data.');
  } else {
    push(
      'engagementRecency',
      band(c.daysSinceLastCustomerEngagement, CURVES.engagementRecency),
      `${c.daysSinceLastCustomerEngagement} days since the last recorded customer contact.`,
    );
  }

  // --- Seat utilisation -----------------------------------------------------
  // Clamped: an export where active users exceed purchased seats (a mid-term
  // seat expansion not yet reflected in billing) must not produce a utilisation
  // above 100% and a nonsensical negative risk.
  const util = c.seatsPurchased > 0 ? Math.min(1, c.activeUsers30d / c.seatsPurchased) : 0;
  if (usageStale) {
    push('seatUtilisation', null, `${c.activeUsers30d} of ${c.seatsPurchased} seats active at the last sync.`, staleNote);
  } else {
    push(
      'seatUtilisation',
      band(util, CURVES.seatUtilisation),
      `${c.activeUsers30d} of ${c.seatsPurchased} purchased seats active (${Math.round(util * 100)}%).`,
    );
  }

  // --- Executive sponsor ----------------------------------------------------
  // "Unknown" is a real value in this schema and carries real risk, so it scores.
  // A value the schema has never seen does not — see the billing note below.
  const sponsorRisk = SPONSOR_RISK[c.executiveSponsorStatus];
  if (sponsorRisk === undefined) {
    push('sponsorStatus', null, `Sponsor status "${c.executiveSponsorStatus}" is not a recognised value.`, 'Unrecognised value — excluded rather than assumed healthy.');
  } else {
    push('sponsorStatus', sponsorRisk, `Executive sponsor is ${c.executiveSponsorStatus.toLowerCase()}.`);
  }

  // --- Billing --------------------------------------------------------------
  // This was `INVOICE_RISK[status] ?? 0` and that was a real bug waiting for a
  // real dataset: an unrecognised billing state would have scored as *perfectly
  // current*, the healthiest possible value. Unknown now means excluded.
  const invoiceRisk = INVOICE_RISK[c.invoiceStatus];
  if (invoiceRisk === undefined) {
    push('invoiceStatus', null, `Invoice status "${c.invoiceStatus}" is not a recognised value.`, 'Unrecognised value — excluded rather than assumed current.');
  } else {
    push('invoiceStatus', invoiceRisk, `Invoice status is ${c.invoiceStatus.toLowerCase()}.`);
  }

  // --- Support strain -------------------------------------------------------
  const per100 = c.seatsPurchased > 0 ? (c.supportTickets90d / c.seatsPurchased) * 100 : 0;
  const strain =
    SUPPORT_STRAIN_MIX.critical * band(c.criticalSupportTickets90d, CURVES.criticalTickets) +
    SUPPORT_STRAIN_MIX.volume * band(per100, CURVES.ticketsPer100Seats);
  push(
    'supportStrain',
    strain,
    `${c.supportTickets90d} support tickets in 90 days, ${c.criticalSupportTickets90d} critical (${per100.toFixed(1)} per 100 seats).`,
  );

  // --- Sentiment, age-discounted -------------------------------------------
  // This is the sharpest rule in the model. An NPS response from 238 days ago is
  // not evidence about today, so it is excluded outright rather than quietly
  // averaged in. Its weight leaves the model instead of scoring zero. Sentiment
  // is 5 of the 100 points, so on its own that drop leaves coverage at exactly
  // 95%, which is not below the coverage threshold — the confidence level does
  // not move, and the account page names the exclusion instead.
  const npsAge = c.npsResponseDate ? daysBetween(c.npsResponseDate, asOf) : null;
  if (c.npsScore === null || npsAge === null) {
    push(
      'sentiment',
      null,
      c.npsScore === null ? 'No NPS score recorded.' : `NPS ${c.npsScore} recorded with no response date.`,
      c.npsScore === null ? 'No NPS response on file.' : 'Response date missing, so the score cannot be aged.',
    );
  } else if (npsAge > STALENESS.npsUsableDays) {
    push(
      'sentiment',
      null,
      `NPS ${c.npsScore}, but the response is ${npsAge} days old.`,
      `Older than the ${STALENESS.npsUsableDays}-day limit, so it is excluded from the score.`,
    );
  } else {
    const scale = npsAge <= STALENESS.npsFreshDays ? NPS_AGE_WEIGHTING.fresh : NPS_AGE_WEIGHTING.aging;
    push(
      'sentiment',
      (NPS_RISK.midpoint - c.npsScore / NPS_RISK.divisor) / NPS_RISK.scale,
      `NPS ${c.npsScore}, responded ${npsAge} days ago${scale < 1 ? ' — counted at half weight for age' : ''}.`,
      undefined,
      scale,
    );
  }

  // --- Prior discount pressure ---------------------------------------------
  push(
    'discountPressure',
    band(c.lastRenewalDiscountPct, CURVES.discountPressure),
    `Last renewal closed at a ${c.lastRenewalDiscountPct}% discount.`,
  );

  return out;
}

function detectContradictions(c: Customer, signals: SignalResult[]): Contradiction[] {
  const found: Contradiction[] = [];
  const trend =
    c.activeUsersPrevious30d > 0
      ? (c.activeUsers30d - c.activeUsersPrevious30d) / c.activeUsersPrevious30d
      : 0;

  if (c.renewalStage === 'Verbal commitment' && c.invoiceStatus !== 'Current') {
    found.push({
      key: 'verbal-vs-billing',
      summary: 'Verbal commitment, unresolved billing',
      detail: `The renewal is recorded at "Verbal commitment" while the invoice is ${c.invoiceStatus.toLowerCase()}. One of those two records is out of date, and which one it is changes the next action completely.`,
    });
  }

  if (
    c.npsScore !== null &&
    c.npsScore >= HEALTHY_NPS_THRESHOLD &&
    (c.executiveSponsorStatus === 'Left company' || c.executiveSponsorStatus === 'Inactive')
  ) {
    found.push({
      key: 'sentiment-vs-sponsor',
      summary: 'Users are happy, the sponsor is not there',
      detail: `NPS of ${c.npsScore} says the people using it are satisfied, but the executive sponsor is ${c.executiveSponsorStatus.toLowerCase()}. Satisfaction does not sign contracts.`,
    });
  }

  if (trend > 0 && c.npsScore !== null && c.npsScore < 0) {
    found.push({
      key: 'usage-vs-sentiment',
      summary: 'Usage is up, sentiment is negative',
      detail: `Active users grew ${pct(trend * 100)} while NPS sits at ${c.npsScore}. Typically means the product is embedded but something specific is making it painful.`,
    });
  }

  if (c.npsScore !== null && !c.npsResponseDate) {
    found.push({
      key: 'nps-undated',
      summary: 'NPS score with no response date',
      detail: `An NPS of ${c.npsScore} is on file with no date against it, so there is no way to tell whether it reflects today or last year. It has been excluded from the score.`,
    });
  }

  const excluded = signals.filter((s) => s.normalised === null);
  if (excluded.length >= 2) {
    found.push({
      key: 'multiple-gaps',
      summary: `${excluded.length} signals unusable`,
      detail: `${excluded.map((s) => s.label).join(' and ')} could not be scored. The risk number here rests on a materially smaller evidence base than the rest of the book.`,
    });
  }

  return found;
}

function computeConfidence(
  coverage: number,
  usageAgeDays: number,
  contradictions: Contradiction[],
  excludedLabels: string[],
): { level: ConfidenceLevel; reasons: string[] } {
  const reasons: string[] = [];
  let penalty = 0;

  if (coverage < CONFIDENCE_COVERAGE_THRESHOLDS[0]) {
    penalty += 1;
    reasons.push(`Only ${Math.round(coverage * 100)}% of the model's weight could be applied.`);
  }
  if (coverage < CONFIDENCE_COVERAGE_THRESHOLDS[1]) penalty += 1;

  if (usageAgeDays > STALENESS.usageWarnDays) {
    penalty += 1;
    reasons.push(`Usage data was last synced ${usageAgeDays} days before the snapshot.`);
  }
  if (usageAgeDays > STALENESS.usageStaleDays) {
    penalty += 1;
    reasons.push('That is stale enough that the adoption trend may not reflect reality.');
  }

  // Contradictions cost confidence. They never move the risk score — resolving
  // one silently, in either direction, would be inventing a fact.
  const hard = contradictions.filter((c) => c.key !== 'multiple-gaps');
  if (hard.length > 0) {
    penalty += 1;
    reasons.push(
      hard.length === 1
        ? 'Two signals on this account contradict each other.'
        : `${hard.length} pairs of signals contradict each other.`,
    );
  }

  // The no-penalty case still has to say something true. Sentiment is 5 of the
  // 100 points, so an account whose only gap is a stale NPS sits at exactly 95%
  // coverage and takes no penalty under the strict `<` above. This line used to
  // read "All signals present" on six accounts whose evidence panel listed the
  // exclusion. It now reports the coverage and names what was dropped. Nothing
  // here changes the penalty, the level or the score.
  if (reasons.length === 0) {
    const applied = `${Math.round(coverage * 100)}% of the model's weight was applied`;
    const synced =
      usageAgeDays > 0
        ? `synced ${usageAgeDays} day${usageAgeDays === 1 ? '' : 's'} before the snapshot`
        : 'synced on the snapshot date or later';
    reasons.push(
      excludedLabels.length > 0
        ? `${excludedLabels.join(' and ')} could not be scored, so ${applied} — a gap too small to lower the confidence level. The usage feed was ${synced}.`
        : `${applied}, and the usage feed was ${synced}.`,
    );
  }

  const level: ConfidenceLevel =
    penalty <= CONFIDENCE_LEVEL_CUTOFFS.high ? 'High' : penalty <= CONFIDENCE_LEVEL_CUTOFFS.medium ? 'Medium' : 'Low';
  return { level, reasons };
}

function toBand(risk: number): RiskBand {
  return (RISK_BANDS.find((b) => risk >= b.min)?.band ?? 'Stable') as RiskBand;
}

/**
 * Portfolio-level context. Derived once per book at load time, so the same
 * customer scores differently in a book of SMBs than in a book of enterprises —
 * which is correct, because "large account" is relative to the book being worked.
 */
export interface ScoringContext {
  arrReference: number;
}

export function scoreCustomer(
  c: Customer,
  asOf: string,
  ctx: ScoringContext,
): Omit<ScoredCustomer, 'priorityRank' | 'riskOnlyRank'> {
  const daysToRenewal = daysBetween(asOf, c.renewalDate);
  const usageDataAgeDays = daysBetween(c.usageDataLastSyncedAt, asOf);
  const signals = computeSignals(c, asOf, daysToRenewal, usageDataAgeDays);

  // Re-normalise over the weight we could actually apply, so an account missing
  // a signal is still scored on the same 0-100 scale as one that has everything.
  const appliedWeight = signals.reduce((s, x) => s + x.weightApplied, 0);
  const totalWeight = Object.values(SIGNAL_WEIGHTS).reduce((a, b) => a + b, 0);
  const weighted = signals.reduce((s, x) => s + (x.normalised ?? 0) * x.weightApplied, 0);
  const riskScore = appliedWeight > 0 ? (weighted / appliedWeight) * 100 : 0;

  for (const s of signals) {
    s.contribution = appliedWeight > 0 ? ((s.normalised ?? 0) * s.weightApplied * 100) / appliedWeight : 0;
  }

  const modelCoverage = appliedWeight / totalWeight;
  const npsAgeDays = c.npsResponseDate ? daysBetween(c.npsResponseDate, asOf) : null;

  const contradictions = detectContradictions(c, signals);
  const { level: confidence, reasons: confidenceReasons } = computeConfidence(
    modelCoverage,
    usageDataAgeDays,
    contradictions,
    signals.filter((s) => s.normalised === null).map((s) => s.label),
  );

  // PRIORITY. Risk answers "is this bad"; priority answers "where does the next
  // hour go". A 90-risk account worth GBP 12k does not outrank a 60-risk account
  // worth GBP 210k, and the value floor stops small accounts vanishing entirely.
  // Clamped at both ends. A credit note or a data error can put a negative ARR
  // in an export; unclamped that produces a value weight below the floor and a
  // negative priority score, which sorts an account to the bottom of the queue
  // for being *expensive*.
  const valueRatio = Math.max(0, Math.min(1, c.arrGbp / Math.max(1, ctx.arrReference)));
  const valueWeight = VALUE_FLOOR + (1 - VALUE_FLOOR) * valueRatio;

  // Urgency is unbounded on the right: a book with renewals two years out must
  // not have them treated the same as one 130 days out, which a fixed final
  // control point would do.
  const urgency = band(daysToRenewal, CURVES.urgency);
  const priorityScore = riskScore * valueWeight * urgency;

  const noteFlags = scanNotes(c.customerNotes);
  const riskBand = toBand(riskScore);

  return {
    customer: c,
    daysToRenewal,
    riskScore,
    riskBand,
    priorityScore,
    signals,
    confidence,
    modelCoverage,
    confidenceReasons,
    contradictions,
    noteFlags,
    playbook: selectPlaybook(c, {
      riskBand,
      daysToRenewal,
      signals,
      contradictions,
      noteFlags,
      confidenceLow: confidence === 'Low',
    }),
    usageDataAgeDays,
    npsAgeDays,
  };
}

export function scoreAll(customers: Customer[], asOf: string, ctx?: Partial<ScoringContext>): ScoredCustomer[] {
  const context: ScoringContext = {
    arrReference: ctx?.arrReference ?? deriveArrReference(customers.map((c) => c.arrGbp)),
  };
  const scored = customers.map((c) => scoreCustomer(c, asOf, context));

  // Keyed by object identity, not by customer id. Keying by id meant two rows
  // sharing an id collapsed to one map entry and both received the same
  // riskOnlyRank, so the ranks were no longer a permutation of 1..n. The loader
  // de-duplicates before it gets here, but a scoring function should not depend
  // on its caller having done that. Found by the rank-permutation property.
  const riskRank = new Map<(typeof scored)[number], number>();
  [...scored]
    .sort((a, b) => b.riskScore - a.riskScore)
    .forEach((s, i) => riskRank.set(s, i + 1));

  return scored
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .map((s, i) => ({
      ...s,
      priorityRank: i + 1,
      riskOnlyRank: riskRank.get(s) ?? 0,
    }));
}
