/**
 * PROPOSED CORRECTIONS — the one place this product calls a model.
 *
 * The brief says the data is "missing, stale, or contradictory". Every other
 * feature in this app works *around* that: it excludes what it cannot trust and
 * tells you how much of the picture is missing. This one tries to fix it.
 *
 * The mechanism, and the reason it is defensible:
 *
 *   1. A model reads `customer_notes` — the only column no rule generalises over
 *      (measured: keyword rules score 95% on this file and 7% once the wording
 *      changes) — and proposes a change to a STRUCTURED FIELD.
 *   2. Every proposal is validated here, deterministically, against the same
 *      enum lists that validate the CSV. A proposal naming an unknown field or
 *      an unrecognised value is dropped before it reaches the UI. The model
 *      cannot invent a state the schema does not have.
 *   3. A human approves or dismisses it.
 *   4. Only then is the correction applied — as an INPUT to the scoring engine,
 *      which recomputes the score in ordinary arithmetic.
 *
 * So the model never produces a number, never changes a rank, and never has the
 * last word. It reads prose and suggests a fact; the schema polices the
 * suggestion; a person decides; the deterministic engine does the maths.
 */

import {
  KNOWN_INVOICE_STATUSES,
  KNOWN_RENEWAL_STAGES,
  KNOWN_SPONSOR_STATUSES,
} from './schema';
import type { Customer } from './types';

/**
 * The only fields a correction may touch.
 *
 * Deliberately short. These are the four the account notes actually contradict,
 * and each is a field a human records by hand and therefore lets go stale.
 * Usage counts, ticket counts and NPS are excluded on purpose: those come from
 * systems, and a note is not evidence about them.
 */
export const CORRECTABLE_FIELDS = {
  executiveSponsorStatus: {
    label: 'Executive sponsor',
    values: KNOWN_SPONSOR_STATUSES as readonly string[],
    why: 'Recorded by hand, and the single most common thing a note contradicts.',
  },
  invoiceStatus: {
    label: 'Billing status',
    values: KNOWN_INVOICE_STATUSES as readonly string[],
    why: 'Finance and CS often update different systems at different times.',
  },
  renewalStage: {
    label: 'Renewal stage',
    values: KNOWN_RENEWAL_STAGES as readonly string[],
    why: 'The stage a rep last set, not necessarily the stage the deal is in.',
  },
  renewalDate: {
    label: 'Renewal date',
    values: null, // free date, validated by format
    why: 'Shifts when a customer asks for an extension and nobody re-keys it.',
  },
} as const;

export type CorrectableField = keyof typeof CORRECTABLE_FIELDS;

/** What the model is asked to produce, before validation. */
export interface RawCorrection {
  field: string;
  proposedValue: string;
  effectiveDate?: string | null;
  evidence: string;
  reasoning: string;
}

/** A proposal that survived validation and can be shown to a human. */
export interface Correction {
  field: CorrectableField;
  label: string;
  currentValue: string;
  proposedValue: string;
  effectiveDate: string | null;
  /** Verbatim from the note. Never paraphrased — the user checks the source. */
  evidence: string;
  reasoning: string;
}

export interface RejectedCorrection {
  raw: RawCorrection;
  reason: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function currentValueOf(c: Customer, field: CorrectableField): string {
  return String(c[field] ?? '');
}

/**
 * Validate model output against the schema. This function is why a hallucinated
 * proposal cannot reach the user: an unknown field, an unrecognised enum value,
 * a malformed date or a no-op are all rejected here, in code, with a reason.
 */
export function validateCorrections(
  customer: Customer,
  raw: RawCorrection[],
): { accepted: Correction[]; rejected: RejectedCorrection[] } {
  const accepted: Correction[] = [];
  const rejected: RejectedCorrection[] = [];
  const seen = new Set<string>();

  for (const r of raw ?? []) {
    const field = r?.field as CorrectableField;
    const spec = CORRECTABLE_FIELDS[field];

    if (!spec) {
      rejected.push({ raw: r, reason: `"${r?.field}" is not a correctable field.` });
      continue;
    }
    if (seen.has(field)) {
      rejected.push({ raw: r, reason: `More than one proposal for ${field}; only the first is kept.` });
      continue;
    }
    if (spec.values && !spec.values.includes(r.proposedValue)) {
      rejected.push({
        raw: r,
        reason: `"${r.proposedValue}" is not a recognised value for ${field}. Expected one of: ${spec.values.join(', ')}.`,
      });
      continue;
    }
    if (!spec.values && !ISO_DATE.test(r.proposedValue)) {
      rejected.push({ raw: r, reason: `"${r.proposedValue}" is not an ISO (YYYY-MM-DD) date.` });
      continue;
    }

    const currentValue = currentValueOf(customer, field);
    if (currentValue === r.proposedValue) {
      rejected.push({ raw: r, reason: `${field} is already "${currentValue}".` });
      continue;
    }
    // The evidence must actually appear in the note. This is the cheapest
    // available guard against a fabricated quote, and it is deterministic.
    if (!r.evidence || !customer.customerNotes.toLowerCase().includes(r.evidence.trim().toLowerCase().slice(0, 25))) {
      rejected.push({ raw: r, reason: 'The quoted evidence does not appear in the account note.' });
      continue;
    }

    seen.add(field);
    accepted.push({
      field,
      label: spec.label,
      currentValue: currentValue || '(not recorded)',
      proposedValue: r.proposedValue,
      effectiveDate: r.effectiveDate && ISO_DATE.test(r.effectiveDate) ? r.effectiveDate : null,
      evidence: r.evidence.trim(),
      reasoning: r.reasoning?.trim() ?? '',
    });
  }

  return { accepted, rejected };
}

/** Apply approved corrections to produce the customer the engine will score. */
export function applyCorrections(customer: Customer, corrections: Correction[]): Customer {
  if (corrections.length === 0) return customer;
  const next = { ...customer };
  for (const c of corrections) {
    // Narrow, field by field, so this cannot write an arbitrary key.
    if (c.field === 'executiveSponsorStatus') next.executiveSponsorStatus = c.proposedValue as Customer['executiveSponsorStatus'];
    else if (c.field === 'invoiceStatus') next.invoiceStatus = c.proposedValue as Customer['invoiceStatus'];
    else if (c.field === 'renewalStage') next.renewalStage = c.proposedValue as Customer['renewalStage'];
    else if (c.field === 'renewalDate') next.renewalDate = c.proposedValue;
  }
  return next;
}

/**
 * The deterministic fallback: propose corrections by rule.
 *
 * It fires on the small set of note patterns the keyword scanner already
 * recognises, so it catches the obvious cases on this file and — by the same 7%
 * measurement — almost nothing once another company writes its notes
 * differently. That gap is the whole argument for the model, and shipping this
 * alongside it is what makes the argument checkable rather than asserted.
 */
export function proposeCorrectionsByRule(customer: Customer): RawCorrection[] {
  const note = customer.customerNotes ?? '';
  const out: RawCorrection[] = [];
  const sentence = (re: RegExp) =>
    note.split(/(?<=[.;])\s+/).find((s) => re.test(s))?.trim() ?? note.trim();

  const sponsorGone = /(sponsor|champion)[^.]{0,40}\b(left|leaving|departed|moved roles|moves roles)/i;
  if (sponsorGone.test(note) && customer.executiveSponsorStatus !== 'Left company') {
    out.push({
      field: 'executiveSponsorStatus',
      proposedValue: 'Left company',
      evidence: sentence(sponsorGone),
      reasoning: 'The note reports the sponsor leaving or changing role, but the field does not say so.',
    });
  }

  const unsigned = /(order form|contract|agreement|paperwork)s?\s+(is|are|was|were|remains?)\s+(still\s+)?unsigned|(purchase order|\bPO\b)[^.]{0,30}\b(missing|not arrived|not issued)/i;
  if (unsigned.test(note) && customer.renewalStage === 'Verbal commitment') {
    out.push({
      field: 'renewalStage',
      proposedValue: 'Commercial review',
      evidence: sentence(unsigned),
      reasoning: 'Recorded as a verbal commitment while the paperwork is outstanding, which overstates how far the deal has progressed.',
    });
  }

  return out;
}
