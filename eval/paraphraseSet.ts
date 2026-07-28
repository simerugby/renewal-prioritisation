/**
 * THE HELD-OUT SET — and the reason the 92% figure from the in-corpus eval
 * cannot be taken at face value.
 *
 * The rule scanner in `lib/noteScan.ts` catches 35 of 38 hand-labelled note
 * risks in the supplied file. That number is contaminated, and I would rather
 * say so than quote it: I wrote those regular expressions *after* reading all
 * forty notes. Scoring them on the same notes measures how well I transcribed a
 * corpus I had already read, not whether the rules work.
 *
 * So: the same facts, rewritten the way a different CRM, a different team or a
 * different week would phrase them. No new information, no harder judgements —
 * a competent human reads these identically to the originals. If the rules are
 * capturing meaning they hold up. If they are pattern-matching my own reading of
 * one file, they collapse.
 *
 * The honest caveat in the other direction, stated because the first caveat is
 * worthless without it: I wrote these paraphrases knowing what the rules match
 * on, so this set is biased *against* the scanner exactly as the first set is
 * biased *for* it. The truth is somewhere between the two numbers. What both
 * agree on is the thing that actually matters — the rules are specific to one
 * company's writing conventions, and that is a transfer problem, not a tuning
 * problem.
 *
 * This is also the concrete answer to "what breaks when you point this at the
 * next company in the portfolio?"
 */

export interface ParaphraseCase {
  id: string;
  label: string;
  /** The original wording from the supplied file. */
  original: string;
  /** The same fact, phrased as another team would write it. */
  paraphrase: string;
}

export const PARAPHRASES: ParaphraseCase[] = [
  {
    id: 'CUST-1025',
    label: 'sponsor-loss',
    original: 'the original sponsor moves roles on 1 August and no replacement is recorded',
    paraphrase:
      'Funding is signed off and purchasing are engaged. Heads up that Dana shifts into a different function at the start of next month and nobody has been lined up to pick this up.',
  },
  {
    id: 'CUST-1018',
    label: 'exit-signal',
    original: 'The customer has paused 2 locations and requested a cancellation clause',
    paraphrase:
      'Two sites are on hold. They have asked us to write a break option into the next agreement.',
  },
  {
    id: 'CUST-1027',
    label: 'competitive-threat',
    original: 'A competing workflow tool is being trialled by the finance team',
    paraphrase: 'Finance have kicked off a bake-off with another supplier.',
  },
  {
    id: 'CUST-1009',
    label: 'paperwork-stuck',
    original: 'the order form is unsigned',
    paraphrase:
      'Seat pricing went over in May. Finance are contesting a services line, and we are still waiting on signature for the paperwork.',
  },
  {
    id: 'CUST-1013',
    label: 'paperwork-stuck',
    original: 'the final PO has not arrived and the buyer has not replied for 9 days',
    paraphrase:
      'Sign-off is logged in the CRM. Procurement have not issued the number yet and the buyer has gone quiet for over a week.',
  },
  {
    id: 'CUST-1037',
    label: 'budget-freeze',
    original: 'finance has paused new commitments until Q4',
    paraphrase:
      'There is appetite for a group-wide deployment, though spend is on ice until the new fiscal year.',
  },
  {
    id: 'CUST-1001',
    label: 'budget-freeze',
    original: 'New CFO has opened a budget review',
    paraphrase:
      'The incoming finance chief is running the ruler over every supplier line, and our main advocate stepped down in June.',
  },
  {
    id: 'CUST-1004',
    label: 'sponsor-loss',
    original: 'the former champion has left',
    paraphrase: 'Three emails with no reply. Our main advocate is no longer with the business.',
  },
  {
    id: 'CUST-1010',
    label: 'price-pressure',
    original: 'procurement separately requested a 15% reduction',
    paraphrase:
      'Two more departments have joined the evaluation. Purchasing want double digits off the number, and the sponsor has skipped a couple of calls.',
  },
  {
    id: 'CUST-1003',
    label: 'competitive-threat',
    original: 'Procurement requested a consolidated vendor list',
    paraphrase:
      'They are rationalising their supplier base and the internal owner will not say which tools survive.',
  },
  {
    id: 'CUST-1017',
    label: 'unresolved-issue',
    original: 'an unresolved reporting defect is driving poor sentiment',
    paraphrase:
      'Take-up is strong, but there is a bug in the reports that nobody has picked up and it is colouring how they talk about us.',
  },
  {
    id: 'CUST-1035',
    label: 'unresolved-issue',
    original: 'the service-credit request remains open',
    paraphrase:
      'The outage is closed out on our side. They are still chasing compensation for it and usage has not come back to where it was.',
  },
  {
    id: 'CUST-1038',
    label: 'sponsor-loss',
    original: 'The champion moved roles and usage is declining across 2 divisions',
    paraphrase:
      'Our main contact has taken a different job internally, and take-up is sliding in a couple of business units.',
  },
  {
    id: 'CUST-1006',
    label: 'mitigating-context',
    original: 'Store closures reduced the user population',
    paraphrase:
      'They shut a number of branches, which is what took the headcount down. The trial running in the two that remain is ahead of plan.',
  },
];
