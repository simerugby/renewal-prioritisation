/**
 * THE DETERMINISTIC NOTE SCANNER — and the control group for the AI feature.
 *
 * `customer_notes` is the only column no arithmetic can read, and it carries
 * facts that change the answer. On CUST-1025 (Quantum Public Sector, the largest
 * account in the book) the risk score is 14.9, which reaches nobody's queue, while
 * the note says the sponsor moves roles on 1 August with no replacement recorded.
 * `executive_sponsor_status` does read Inactive and carries 8.6 of that 14.9. What
 * no column carries is the date, or the fact that no replacement was named.
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
/**
 * A note on how these are written, because it is the difference between a rule
 * that is merely weak and one that is dangerous.
 *
 * A false NEGATIVE costs a missed flag. The score is unaffected, the account
 * keeps its rank, and the AI brief catches it when a key is configured. That is
 * a degradation.
 *
 * A false POSITIVE puts a confident, wrong statement in front of a CSM — and can
 * fire a playbook rule. That is the only way anything in this system can assert
 * something untrue, so the patterns are written to fail toward silence:
 *
 *  - No bare stem matches. `/\bterminat/i` hits "terminate the trial period"
 *    and "termination of the pilot", neither of which is a renewal exit signal.
 *  - No direction-ambiguous phrases. "above target" was matching as an expansion
 *    cue and appears just as naturally in "churn is above target".
 *  - Negations are anchored to a subject. "has not started" alone matches "the
 *    seasonal decline has not started", which means the opposite of a blocker.
 *
 * Every flag also renders the sentence that triggered it, so a wrong match is
 * visible to the reader rather than hidden behind a label.
 */
const RULES: Rule[] = [
  {
    key: 'exit-signal',
    label: 'Exit signal',
    patterns: [
      /cancellation clause/i,
      /break (clause|option)/i,
      /terminat(e|ing|ion)[^.]{0,25}(contract|agreement|subscription|service|renewal)/i,
      /(will |do |does )?not (be )?renew(ing)?\b/i,
      /wind[- ]down/i,
      /notice of (cancellation|termination)/i,
    ],
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
      /(purchase order|\bPO\b)[^.]{0,30}\b(missing|not arrived|outstanding|not issued|still awaited)/i,
      // Grammatical, not proximity-based. A window of "document … unsigned"
      // happily matched "the contract is signed; the unsigned draft copies were
      // destroyed" — the two words were close together and the meaning was the
      // opposite. Requiring the document to BE the subject of "is unsigned"
      // fixes that specific case; it does not make the approach sound, which is
      // the point lib/noteScan.test.ts is there to keep visible.
      /(order form|contract|agreement|paperwork)s?\s+(is|are|was|were|remains?)\s+(still\s+)?unsigned/i,
      /\bunsigned\s+(order form|contract|agreement)/i,
      /(buyer|customer|contact|they)[^.]{0,20}has not replied/i,
      /awaiting signature/i,
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
    // "No named owner" was false of half the notes this rule catches. Atlas
    // Manufacturing (priority #4) reads "the internal owner has not confirmed
    // which tools will remain" — there is an owner, the decision is missing —
    // and the old label rendered directly above that quote. The patterns catch
    // two things, an unowned blocker and an undecided one, so the label says so.
    label: 'Unowned or undecided blocker',
    patterns: [
      /no named owner/i,
      /(has|have) not (named|confirmed|nominated)/i,
      // Anchored to a thing that ought to have happened. Unanchored, "has not
      // started" matches "the seasonal decline has not started", which is good news.
      /(review|process|rollout|migration|onboarding|evaluation|conversation|assessment)[^.]{0,25}(has|have) not (started|begun)/i,
      /(has|have) not (been )?(agreed|recorded|confirmed)/i,
      /(counsel|legal|owner|sponsor|lead)[^.]{0,25}unavailable until/i,
      /do(es)? not say whether/i,
    ],
  },
  {
    key: 'expansion',
    label: 'Expansion opportunity',
    patterns: [
      /expansion (workshop|opportunity|discussion)|product expansion/i,
      /more (licences|licenses|seats|users|clinicians)/i,
      /additional (depots|seats|sites|licences|licenses|users)/i,
      /(second|new) site (is )?(due|opening|to open)/i,
      /company-wide rollout/i,
      /(pilot|trial)[^.]{0,25}above target/i,
      /joined discovery/i,
      /supports \d+ more/i,
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
