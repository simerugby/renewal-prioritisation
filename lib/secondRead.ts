/**
 * SECOND READ — the one place this product calls a model.
 *
 * The scoring engine reads nine structured columns. It cannot read
 * `customer_notes`, and that column routinely contains the thing that decides
 * the renewal. Second Read asks one question per account:
 *
 *     does the note add risk the score cannot see, explain a weak signal the
 *     score is penalising, add an opportunity, or add nothing?
 *
 * Three design choices carry the whole defence, and each is enforced by code
 * rather than promised in a prompt:
 *
 *  1. THE MODEL RETURNS A CLAUSE INDEX, NOT A QUOTE. Code splits the note into
 *     clauses, the model points at one by number, and code renders the text. A
 *     fabricated quote is not "checked and rejected" — it is unrepresentable.
 *
 *  2. THE SCORE IS NOT IN THE PROMPT. The model sees which signals fired and
 *     their evidence, never the risk number, the band or the rank. If it knew
 *     the account scored 15/100 it would reason toward that number instead of
 *     reading the note, and "the note disagrees with the score" would stop being
 *     an independent judgement.
 *
 *  3. A SIGNAL ATTRIBUTION MUST NAME A SIGNAL THAT ACTUALLY FIRED. You cannot
 *     contest a signal that scored nothing. Attributions that fail this are
 *     dropped and the finding is kept without one.
 *
 * The model produces no number, changes no rank, and applies nothing. It reads
 * prose and points at a clause; everything downstream is arithmetic.
 */

import { SIGNAL_LABELS, type SignalKey } from './config';
import { proposeCorrectionsByRule, validateCorrections, type Correction, type RawCorrection } from './corrections';
import type { Customer, ScoredCustomer } from './types';

/**
 * TWO BINARIES, NOT A FOUR-WAY LABEL — and this is the most evidence-driven
 * decision in the file.
 *
 * The first version asked the model to pick one of four directions. It failed on
 * the account the feature exists for: Quantum Public Sector, the largest in the
 * book, whose note says the sponsor leaves on 1 August, came back
 * "adds-nothing". A competitor trial came back "adds-opportunity".
 *
 * I should have predicted that. `npm run eval` measures this model at 92-93% on
 * DETECTION and 45% on picking a label from a taxonomy — and I had built the
 * feature on the second number. Two independent yes/no questions sit much closer
 * to the task that was actually measured, and each maps to something a CSM does:
 * one puts the account on the list, the other takes an unfair penalty off it.
 */
export type Direction = 'adds-risk' | 'explains-a-weak-signal' | 'adds-opportunity' | 'adds-nothing';

export const DIRECTIONS: Direction[] = [
  'adds-risk',
  'explains-a-weak-signal',
  'adds-opportunity',
  'adds-nothing',
];

export const DIRECTION_LABELS: Record<Direction, string> = {
  'adds-risk': 'Adds risk the score cannot see',
  'explains-a-weak-signal': 'Explains a signal the score is penalising',
  'adds-opportunity': 'Adds an opportunity',
  'adds-nothing': 'Adds nothing the signals do not already show',
};

/** The direction is DERIVED from the two binaries, in code, not chosen by the model. */
export function deriveDirection(addsRisk: boolean, explainsWeakSignal: boolean, addsOpportunity: boolean): Direction {
  if (addsRisk) return 'adds-risk';
  if (explainsWeakSignal) return 'explains-a-weak-signal';
  if (addsOpportunity) return 'adds-opportunity';
  return 'adds-nothing';
}

export interface Finding {
  /** Index into the code-produced clause list. */
  clauseIndex: number;
  /** Rendered by code from the index. The model never supplies this text. */
  quote: string;
  /** A signal this bears on, only when that signal actually fired. */
  signalKey: SignalKey | null;
  signalLabel: string | null;
  whatItMeans: string;
}

export interface SecondReadResult {
  direction: Direction;
  addsRiskBeyondSignals: boolean;
  explainsAWeakSignal: boolean;
  addsOpportunity: boolean;
  findings: Finding[];
  /** A proposed change to a structured field, already validated. */
  fieldChallenge: Correction | null;
  source: 'llm' | 'fallback' | 'precomputed';
  model?: string;
  generatedAt?: string;
  fallbackReason?: string;
  /** Validation work the code did on the model's output. Shown in the UI. */
  dropped: string[];
}

/**
 * Split a note into clauses.
 *
 * Deliberately simple and deterministic: semicolons and sentence ends, then
 * long clauses split once more on " and " so a two-fact sentence can be pointed
 * at precisely. The exact rule matters less than it being the SAME rule at
 * prompt time and at render time, which is what makes the index meaningful.
 */
export function splitClauses(note: string): string[] {
  if (!note?.trim()) return [];
  return note
    .split(/(?<=[.;])\s+|;\s*/)
    .flatMap((part) => (part.length > 110 ? part.split(/\s+and\s+(?=[a-z])/i) : [part]))
    .map((c) => c.trim().replace(/^[,;]\s*/, ''))
    .filter((c) => c.length > 0);
}

/** Everything the model is allowed to see. Note the absence of the score. */
export function buildSecondReadPrompt(row: ScoredCustomer): string {
  const clauses = splitClauses(row.customer.customerNotes);
  const fired = row.signals.filter((s) => s.normalised !== null && s.contribution >= 1);
  const excluded = row.signals.filter((s) => s.normalised === null);

  return [
    `ACCOUNT NOTE, split into numbered clauses. Refer to a clause by its number only.`,
    ...clauses.map((c, i) => `[${i}] ${c}`),
    ``,
    `SIGNALS THE SCORING MODEL ALREADY COUNTED (you cannot tell it anything it knows here):`,
    ...(fired.length ? fired.map((s) => `- ${s.label}: ${s.evidence}`) : ['- none of note']),
    ...(excluded.length
      ? ['', `SIGNALS IT COULD NOT USE (missing or too stale):`, ...excluded.map((s) => `- ${s.label}: ${s.excludedReason ?? 'unavailable'}`)]
      : []),
    ``,
    `Signal keys you may reference: ${fired.map((s) => s.key).join(', ') || '(none)'}`,
    ``,
    `Answer three independent yes/no questions. They are not exclusive; more than one can be true.`,
    ``,
    `addsRiskBeyondSignals: does any clause name a threat to this renewal that the counted signals above do NOT already capture?`,
    `  Answer YES for anything the columns cannot hold: a competitor or vendor review, a budget freeze or spending pause, a decision-maker changing, a pricing demand, a cancellation or break request, paperwork or a PO that has stalled, a blocker with nobody named on it, a dependency on a review or an exception being granted, a dispute about whether something is resolved.`,
    `  Answer NO only when the clause simply restates a signal listed above, or when it is good news.`,
    `  The counted signals are numeric. They cannot see intentions, competitors, decisions, owners or conditions. If a clause carries one of those and it threatens the renewal, that is a yes.`,
    ``,
    `explainsAWeakSignal: does any clause give an innocent explanation for a signal that is being penalised? Seasonality, a site closure, a restructure, an onboarding spike. This is how an account gets an unfair penalty taken off it.`,
    ``,
    `addsOpportunity: does any clause name expansion, more seats, more sites, or a growth conversation?`,
    ``,
    `Then list findings. Each cites ONE clause by number and says in one sentence what a customer success manager should take from it. Only set signalKey when the finding directly bears on one of the keys listed above; otherwise leave it null.`,
    ``,
    `If a clause shows a structured field is out of date, set fieldChallenge. Allowed fields: executiveSponsorStatus, invoiceStatus, renewalStage, renewalDate. If the clause names a future date for the change, put that date in effectiveDate as YYYY-MM-DD.`,
  ].join('\n');
}

export const SECOND_READ_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['addsRiskBeyondSignals', 'explainsAWeakSignal', 'addsOpportunity', 'findings', 'fieldChallenge'],
  properties: {
    addsRiskBeyondSignals: { type: 'boolean' },
    explainsAWeakSignal: { type: 'boolean' },
    addsOpportunity: { type: 'boolean' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['clauseIndex', 'signalKey', 'whatItMeans'],
        properties: {
          clauseIndex: { type: 'integer', description: 'The number of the clause this finding cites.' },
          signalKey: { type: ['string', 'null'], description: 'One of the listed signal keys, or null.' },
          whatItMeans: { type: 'string', description: 'One sentence for a CSM. No preamble.' },
        },
      },
    },
    fieldChallenge: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['field', 'proposedValue', 'clauseIndex', 'effectiveDate'],
      properties: {
        field: { type: 'string' },
        proposedValue: { type: 'string' },
        clauseIndex: { type: 'integer' },
        effectiveDate: { type: ['string', 'null'] },
      },
    },
  },
} as const;

interface RawSecondRead {
  addsRiskBeyondSignals?: boolean;
  explainsAWeakSignal?: boolean;
  addsOpportunity?: boolean;
  findings?: { clauseIndex?: number; signalKey?: string | null; whatItMeans?: string }[];
  fieldChallenge?: { field?: string; proposedValue?: string; clauseIndex?: number; effectiveDate?: string | null } | null;
}

/**
 * Turn model output into something renderable, dropping anything that does not
 * survive a check. Every drop is recorded and shown, so the validation is
 * visible rather than silent.
 */
export function validateSecondRead(row: ScoredCustomer, raw: RawSecondRead): Omit<SecondReadResult, 'source'> {
  const clauses = splitClauses(row.customer.customerNotes);
  const firedKeys = new Set(row.signals.filter((s) => s.normalised !== null && s.contribution >= 1).map((s) => s.key));
  const dropped: string[] = [];

  const addsRisk = raw?.addsRiskBeyondSignals === true;
  const explains = raw?.explainsAWeakSignal === true;
  const opportunity = raw?.addsOpportunity === true;
  const direction = deriveDirection(addsRisk, explains, opportunity);

  const findings: Finding[] = [];
  for (const f of raw?.findings ?? []) {
    const idx = Number(f?.clauseIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= clauses.length) {
      dropped.push(`A finding cited clause ${f?.clauseIndex}, which does not exist in this note.`);
      continue;
    }
    if (!f?.whatItMeans?.trim()) {
      dropped.push(`A finding on clause ${idx} had no explanation.`);
      continue;
    }
    // The firing-signal gate: you cannot contest a signal that scored nothing.
    let signalKey: SignalKey | null = null;
    if (f.signalKey && firedKeys.has(f.signalKey)) {
      signalKey = f.signalKey as SignalKey;
    } else if (f.signalKey) {
      dropped.push(`Attribution to "${f.signalKey}" dropped: that signal did not contribute to this score.`);
    }
    findings.push({
      clauseIndex: idx,
      // Rendered from the index by code. This is why a quote cannot be invented.
      quote: clauses[idx],
      signalKey,
      signalLabel: signalKey ? SIGNAL_LABELS[signalKey] : null,
      whatItMeans: f.whatItMeans.trim(),
    });
  }

  let fieldChallenge: Correction | null = null;
  const fc = raw?.fieldChallenge;
  if (fc?.field && fc?.proposedValue) {
    const idx = Number(fc.clauseIndex);
    const evidence = Number.isInteger(idx) && idx >= 0 && idx < clauses.length ? clauses[idx] : '';
    if (!evidence) {
      dropped.push(`A field challenge cited clause ${fc.clauseIndex}, which does not exist.`);
    } else {
      const rawCorrection: RawCorrection = {
        field: fc.field,
        proposedValue: fc.proposedValue,
        effectiveDate: fc.effectiveDate ?? null,
        evidence,
        reasoning: 'Proposed from the account note.',
      };
      const { accepted, rejected } = validateCorrections(row.customer, [rawCorrection]);
      fieldChallenge = accepted[0] ?? null;
      for (const r of rejected) dropped.push(`Field challenge rejected: ${r.reason}`);
    }
  }

  return {
    direction,
    addsRiskBeyondSignals: addsRisk,
    explainsAWeakSignal: explains,
    addsOpportunity: opportunity,
    findings,
    fieldChallenge,
    dropped,
  };
}

/**
 * The deterministic fallback, built from the keyword scanner.
 *
 * It exists so the app works without a key, and so the model has a control
 * group. It is materially worse the moment the phrasing changes — measured at
 * 7% against the model's 93% on reworded notes — and that gap is the argument
 * for the call.
 */
/**
 * Note categories that change what a CSM does, as opposed to context.
 *
 * These drive the DETERMINISTIC portfolio filter, and that is deliberate. On
 * this dataset the keyword scanner produces a usable 9-account list at 71%
 * precision; the model, at the recall needed to catch the flagship account,
 * flags 22 of 27 calm accounts, which is not a triage list. Measured, not assumed
 * — see `npm run eval:beyond`.
 */
export const MATERIAL_NOTE_FLAGS = ['exit-signal', 'sponsor-loss', 'competitive-threat', 'budget-freeze', 'paperwork-stuck', 'unresolved-issue'];
const RISK_FLAGS = MATERIAL_NOTE_FLAGS;

export function buildFallbackSecondRead(row: ScoredCustomer, reason: string): SecondReadResult {
  const clauses = splitClauses(row.customer.customerNotes);
  const findings: Finding[] = [];

  for (const flag of row.noteFlags) {
    const idx = clauses.findIndex((c) => c.toLowerCase().includes(flag.quote.toLowerCase().slice(0, 20)));
    if (idx === -1) continue;
    findings.push({
      clauseIndex: idx,
      quote: clauses[idx],
      signalKey: null,
      signalLabel: null,
      whatItMeans: `Keyword match: ${flag.label.toLowerCase()}.`,
    });
  }

  const hasRisk = row.noteFlags.some((f) => RISK_FLAGS.includes(f.key));
  const mitigating = row.noteFlags.some((f) => f.key === 'mitigating-context');
  const expansion = row.noteFlags.some((f) => f.key === 'expansion');

  const direction: Direction = hasRisk
    ? 'adds-risk'
    : mitigating
      ? 'explains-a-weak-signal'
      : expansion
        ? 'adds-opportunity'
        : 'adds-nothing';

  const { accepted } = validateCorrections(row.customer, proposeCorrectionsByRule(row.customer));

  const finalDirection = findings.length ? direction : 'adds-nothing';
  return {
    direction: finalDirection,
    addsRiskBeyondSignals: finalDirection === 'adds-risk',
    explainsAWeakSignal: finalDirection === 'explains-a-weak-signal',
    addsOpportunity: finalDirection === 'adds-opportunity',
    findings,
    fieldChallenge: accepted[0] ?? null,
    source: 'fallback',
    fallbackReason: reason,
    dropped: [],
  };
}


/** Accounts whose score is calm and whose note is not. The portfolio-level view. */
export function isQuietButFlagged(row: ScoredCustomer): boolean {
  if (row.riskBand !== 'Stable' && row.riskBand !== 'Watch') return false;
  return row.noteFlags.some((f) => RISK_FLAGS.includes(f.key));
}

export type { Customer };
