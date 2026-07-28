/**
 * THE DETERMINISTIC NOTE SCANNER — and the control group for the AI feature.
 *
 * `customer_notes` is the only column no arithmetic can read, and it carries
 * facts that change the answer. On CUST-1025 (Quantum Public Sector, the largest
 * account in the book) every one of the nine structured signals is healthy and
 * the risk score is 14.9 — while the note says the sponsor moves roles on
 * 1 August with no replacement recorded.
 *
 * That gap is the entire justification for spending an LLM call. But "an LLM
 * would be better here" is an assertion until it is measured, so this file
 * exists: a keyword-and-pattern scanner that attacks the same problem with
 * rules. `eval/noteScanEval.ts` scores it against a hand-labelled set, and the
 * README reports the gap honestly. If the rules had matched the model, the
 * correct engineering decision would have been to delete the API call.
 *
 * It is also the runtime fallback: no key, a timeout, a rate limit, or a
 * malformed response and the UI falls back to these flags rather than showing
 * the user nothing.
 */

import type { NoteFlag } from './types';

interface Rule {
  key: string;
  label: string;
  patterns: RegExp[];
}

/**
 * Ordered most- to least-severe. Patterns are written against the phrasing that
 * actually appears in this book, which is exactly the brittleness the eval is
 * designed to expose: a CRM with different note conventions breaks these rules
 * and does not break the LLM.
 */
const RULES: Rule[] = [
  {
    key: 'exit-signal',
    label: 'Exit signal',
    patterns: [/cancellation clause/i, /\bterminat/i, /\bnot renew/i, /wind[- ]down/i],
  },
  {
    key: 'sponsor-loss',
    label: 'Sponsor or champion loss',
    patterns: [
      /(sponsor|champion|owner|contact)[^.]{0,40}\b(left|leaving|departed|moved roles|moves roles|changed)/i,
      /(former|previous|original)\s+(champion|sponsor|contact)/i,
      /no replacement/i,
    ],
  },
  {
    key: 'competitive-threat',
    label: 'Competitive threat',
    patterns: [/competing|competitor/i, /consolidated vendor|vendor list|vendor consolidation/i, /being trialled|evaluating an alternative/i],
  },
  {
    key: 'budget-freeze',
    label: 'Budget or procurement freeze',
    patterns: [/budget review/i, /paused new commitments/i, /budget freeze|frozen budget/i, /spend (review|freeze)/i],
  },
  {
    key: 'paperwork-stuck',
    label: 'Paperwork stalled',
    patterns: [
      /(purchase order|PO)[^.]{0,30}\b(missing|not arrived|outstanding)/i,
      /order form[^.]{0,20}unsigned/i,
      /\bunsigned\b/i,
      /has not replied/i,
    ],
  },
  {
    key: 'price-pressure',
    label: 'Price pressure',
    patterns: [
      /\d+%\s*(reduction|discount)/i,
      /requested a (reduction|discount)/i,
      /revisit[^.]{0,30}pricing/i,
      /flexible pricing/i,
      /pricing exception/i,
      /flat renewal/i,
    ],
  },
  {
    key: 'unresolved-issue',
    label: 'Unresolved product or service issue',
    patterns: [
      /\bdefect\b/i,
      /(migration|data)[^.]{0,20}issue[^.]{0,20}(remains )?open/i,
      /service[- ]credit/i,
      /remediation plan/i,
      /rollout delays/i,
      /incidents? (remains?|is|are) (open|unresolved)/i,
    ],
  },
  {
    key: 'ownerless-blocker',
    label: 'Blocker with no named owner',
    patterns: [
      /no named owner/i,
      /has not (named|confirmed)/i,
      /not (been )?(agreed|recorded|confirmed)/i,
      /unavailable until/i,
      /has not started/i,
    ],
  },
  {
    key: 'expansion',
    label: 'Expansion opportunity',
    patterns: [
      /expansion/i,
      /more (licences|licenses|seats|clinicians)/i,
      /additional (depots|seats|sites)/i,
      /second site/i,
      /company-wide rollout/i,
      /above target/i,
      /joined discovery/i,
    ],
  },
  {
    key: 'mitigating-context',
    label: 'Mitigating context for a weak signal',
    patterns: [
      /seasonal/i,
      /store closures/i,
      /headcount reductions?/i,
      /during onboarding/i,
      /baseline is unavailable/i,
    ],
  },
];

/** Return the sentence containing the match, so the UI never paraphrases the source. */
function quoteFor(note: string, re: RegExp): string {
  const sentences = note.split(/(?<=[.;])\s+/);
  const hit = sentences.find((s) => re.test(s));
  return (hit ?? note).trim();
}

export function scanNotes(note: string): NoteFlag[] {
  if (!note || !note.trim()) return [];
  const flags: NoteFlag[] = [];
  for (const rule of RULES) {
    const matched = rule.patterns.find((p) => p.test(note));
    if (matched) {
      flags.push({ key: rule.key, label: rule.label, quote: quoteFor(note, matched) });
    }
  }
  return flags;
}

export const NOTE_RULE_KEYS = RULES.map((r) => r.key);
