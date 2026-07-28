/**
 * GROUND TRUTH FOR THE QUESTION THE SHIPPED FEATURE ACTUALLY ASKS.
 *
 * I got this wrong twice before writing this file, and both times the same way:
 * I measured a model on one task and quoted the number for another.
 *
 *   - `noteScanEval.ts` labels answer "does this note contain a material risk
 *     category?" Good for comparing keyword rules against a model on detection.
 *   - Second Read asks something narrower: "does this note add risk the nine
 *     structured signals do NOT already capture?"
 *
 * Those differ on exactly the accounts you would expect. Greenway Bank's note
 * says finance disputes a charge — and `invoice_status` already reads Disputed,
 * so the note adds nothing. Scoring the model against the first label set marks
 * that a miss when it is the correct answer.
 *
 * So: labelled by hand, against the second question, with the reason recorded.
 * The reasons matter more than the verdicts — a reviewer who disagrees with a
 * line can see precisely what I was weighing.
 *
 * ONE THING TO KNOW BEFORE DISAGREEING WITH A LINE. "The structured signals"
 * here means everything the app derives without a model: the nine scored
 * signals AND the contradiction detector. That is why Greenway Bank and
 * BluePeak Software are `false` — the unsigned order form and the missing PO
 * each sit next to a "Verbal commitment, unresolved billing" contradiction the
 * app already puts on the page — while Mosaic Foods, the same fact pattern, is
 * `true`, because its invoice reads Current and no contradiction fires.
 *
 * The prompt in lib/secondRead.ts describes only the nine signals and tells the
 * model to answer yes to a stalled PO. So on those two accounts the model is
 * marked wrong for following its instructions. I found that after the batch was
 * frozen and left it rather than widening the prompt and regenerating, because
 * the disagreement is real and a reviewer should see it: `npm run eval:beyond`
 * prints it under the false-positive list.
 */

export interface BeyondLabel {
  /** True when the note names a renewal threat no scored signal captures. */
  addsRisk: boolean;
  why: string;
}

export const BEYOND_SIGNALS_LABELS: Record<string, BeyondLabel> = {
  'CUST-1001': { addsRisk: true, why: 'A new CFO opening a budget review is a decision-maker change no column records. Sponsor departure is already in the field.' },
  'CUST-1002': { addsRisk: true, why: 'Procurement demanding a revised value case is a commercial condition; the signals only see usage and tickets.' },
  'CUST-1003': { addsRisk: true, why: 'Vendor consolidation. No signal in the model can see a competitive review.' },
  'CUST-1004': { addsRisk: false, why: 'Champion gone is already in the sponsor field; 120 days of silence is already in engagement recency. The note restates both.' },
  'CUST-1005': { addsRisk: true, why: 'The QBR deck contradicts the seat count. A data-integrity conflict no signal can detect.' },
  'CUST-1006': { addsRisk: true, why: 'Store closures explain the decline, and I first labelled this false on that clause alone. The note also says finance requested flexible pricing — the same kind of demand I called additive on CUST-1007, CUST-1010 and CUST-1028, and the discountPressure signal reads last renewal\'s discount rather than a live request. Mitigating and additive at once, and addsRisk is the question this file asks.' },
  'CUST-1007': { addsRisk: true, why: 'Procurement expecting a flat renewal is a commercial ceiling nothing else records.' },
  'CUST-1008': { addsRisk: true, why: '"Faster than expected" is the operative phrase, and no QBR is scheduled. Seasonality alone would be mitigating.' },
  'CUST-1009': { addsRisk: false, why: 'Unsigned order form and a disputed charge are both already visible: invoice_status is Disputed and the app flags the verbal-commitment contradiction.' },
  'CUST-1010': { addsRisk: true, why: 'A 15% reduction demand and a sponsor missing calls. Neither price pressure nor meeting attendance is a column.' },
  'CUST-1011': { addsRisk: false, why: 'Onboarding tickets explain the support volume. Mitigating, not additive.' },
  'CUST-1012': { addsRisk: true, why: 'Counsel unavailable until late August against a 2026-10-14 renewal is a timeline dependency no signal sees.' },
  'CUST-1013': { addsRisk: true, why: 'PO missing and the buyer silent nine days, while invoice_status reads Current — so the contradiction detector does not fire here.' },
  'CUST-1014': { addsRisk: true, why: 'Whether the Analytics Hub evaluation is a condition of the core renewal is unknown and material.' },
  'CUST-1015': { addsRisk: false, why: 'Procurement timing is ordinary friction and the stage-readiness signal already covers pace.' },
  'CUST-1016': { addsRisk: false, why: 'An expansion workshop. Opportunity, not risk.' },
  'CUST-1017': { addsRisk: true, why: 'A specific unresolved defect is the cause behind the sentiment; the NPS signal sees the symptom at half weight.' },
  'CUST-1018': { addsRisk: true, why: 'A requested cancellation clause is the strongest exit signal in the file and no column carries it.' },
  'CUST-1019': { addsRisk: true, why: 'Legal redlines with no owner on either side. Ownerless blockers do not appear in any signal.' },
  'CUST-1020': { addsRisk: true, why: 'The original project ended with no agreed new use case. That is the renewal rationale disappearing.' },
  'CUST-1021': { addsRisk: false, why: 'Depot expansion. Opportunity.' },
  'CUST-1022': { addsRisk: true, why: 'Engineering closed the incidents while the sponsor wants a written remediation plan. The disagreement is the risk, and support strain only counts tickets.' },
  'CUST-1023': { addsRisk: false, why: 'A second site opening. Opportunity.' },
  'CUST-1024': { addsRisk: true, why: 'The commercial contact changed in July and sponsor status still reads Unknown, so the change itself is uncaptured.' },
  'CUST-1025': { addsRisk: true, why: 'THE case. Largest account in the book. executive_sponsor_status does read Inactive and carries 8.6 of the 14.9, but no column carries the 1 August date or the fact that no replacement was named, and at 14.9 it ranks #15 of 40.' },
  'CUST-1026': { addsRisk: false, why: 'PO missing against a verbal commitment with an overdue invoice — the contradiction detector already surfaces this pair.' },
  'CUST-1027': { addsRisk: true, why: 'A competitor being trialled by the finance team. No signal sees competition.' },
  'CUST-1028': { addsRisk: true, why: 'The renewal depends on a non-profit pricing exception being granted. A commercial precondition.' },
  'CUST-1029': { addsRisk: false, why: 'Open migration issue and disputed invoice are both already scored: 13 tickets, 2 critical, invoice Disputed.' },
  'CUST-1030': { addsRisk: true, why: 'The expansion is real but gated on a data-protection review that has not started. The gate is the risk.' },
  'CUST-1031': { addsRisk: false, why: 'Budget planning underway with stable usage. Nothing beyond the signals.' },
  'CUST-1032': { addsRisk: false, why: 'Enterprise reporting and more licences. Opportunity.' },
  'CUST-1033': { addsRisk: false, why: 'Seasonal shutdown with a responsive sponsor explains the decline. Mitigating.' },
  'CUST-1034': { addsRisk: true, why: 'A recorded approval that the buyer has since reopened over pricing. The stage field still shows the old state.' },
  'CUST-1035': { addsRisk: true, why: 'An open service-credit request is a live commercial claim against us, distinct from the ticket counts the signals see.' },
  'CUST-1036': { addsRisk: false, why: 'Headcount reductions shrank the user base. Explains the decline rather than adding to it.' },
  'CUST-1037': { addsRisk: true, why: 'Finance has paused new commitments until Q4. A budget freeze appears in no column.' },
  'CUST-1038': { addsRisk: false, why: 'Champion moved and usage declining are both already scored — sponsor Inactive, adoption down 28%.' },
  'CUST-1039': { addsRisk: false, why: 'Usage grew; the note only warns that the NPS predates the ticket spike, which the staleness layer already handles.' },
  'CUST-1040': { addsRisk: true, why: 'Procurement has not named a commercial lead. An ownerless renewal with no column to record it.' },
};
