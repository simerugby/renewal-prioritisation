/**
 * NEXT ACTION — chosen by rule, not by model.
 *
 * The brief asks for "a suggested next action". That is a routing problem with a
 * small, knowable answer space, so it is a decision table: the same account
 * always yields the same play, the CSM can see which rule fired, and they can
 * argue with the rule rather than with a black box.
 *
 * Rules are evaluated in order and the first match wins. Order encodes triage:
 * money and people problems outrank usage problems, because a disputed invoice
 * blocks a renewal that a healthy usage graph cannot unblock.
 */

import type { Contradiction, Customer, NoteFlag, Playbook, RiskBand, SignalResult } from './types';

interface Ctx {
  riskBand: RiskBand;
  daysToRenewal: number;
  signals: SignalResult[];
  contradictions: Contradiction[];
  noteFlags: NoteFlag[];
  confidenceLow: boolean;
}

const sig = (s: SignalResult[], key: string) => s.find((x) => x.key === key);
const flagged = (f: NoteFlag[], key: string) => f.some((x) => x.key === key);

type Rule = { when: (c: Customer, ctx: Ctx) => boolean; play: (c: Customer, ctx: Ctx) => Playbook };

const RULES: Rule[] = [
  {
    when: (_c, ctx) => flagged(ctx.noteFlags, 'exit-signal'),
    play: (_c, ctx) => ({
      action: 'Escalate today — the customer has asked for an exit route',
      urgency: 'Today',
      rationale: `The account notes contain an explicit exit signal: "${ctx.noteFlags.find((f) => f.key === 'exit-signal')?.quote}". Nothing else on this account matters until that is understood.`,
      owner: 'CSM + Head of CS',
    }),
  },
  {
    when: (c) => c.invoiceStatus === 'Disputed',
    play: (c) => ({
      action: 'Resolve the billing dispute before any commercial conversation',
      urgency: 'Today',
      rationale: `An invoice is disputed at ${c.customerName}. A disputed invoice blocks a renewal regardless of how healthy usage looks, and it needs finance in the room, not the CSM alone.`,
      owner: 'CSM + Finance',
    }),
  },
  {
    when: (c) => c.executiveSponsorStatus === 'Left company',
    play: () => ({
      action: 'Find and qualify a new executive sponsor this week',
      urgency: 'Today',
      rationale: 'The executive sponsor has left. Renewals are signed by people, and right now nobody on the customer side owns this one.',
      owner: 'CSM + AE',
    }),
  },
  {
    when: (c, ctx) => c.renewalStage === 'Not started' && ctx.daysToRenewal <= 35,
    play: (_c, ctx) => ({
      action: 'Open the renewal conversation today',
      urgency: 'Today',
      rationale: `${ctx.daysToRenewal} days to renewal and the process has not started. This is the one failure mode on the list that is entirely within our control.`,
      owner: 'CSM',
    }),
  },
  {
    when: (_c, ctx) => flagged(ctx.noteFlags, 'sponsor-loss') && ctx.daysToRenewal <= 60,
    play: (_c, ctx) => ({
      action: 'Map the new decision-maker before the renewal window closes',
      urgency: 'Today',
      rationale: `The notes flag a change of sponsor or champion — "${ctx.noteFlags.find((f) => f.key === 'sponsor-loss')?.quote}" — with only ${ctx.daysToRenewal} days left. The structured fields have not caught up with this yet.`,
      owner: 'CSM + AE',
    }),
  },
  {
    when: (c, ctx) =>
      c.renewalStage === 'Verbal commitment' && c.invoiceStatus !== 'Current' && ctx.daysToRenewal <= 90,
    play: (c) => ({
      action: 'Chase the paperwork and the invoice in the same conversation',
      urgency: 'This week',
      rationale: `Recorded as a verbal commitment while the invoice is ${c.invoiceStatus.toLowerCase()}. Either the commitment is softer than the CRM believes or the billing record is stale — one call settles which.`,
      owner: 'CSM + Finance',
    }),
  },
  {
    when: (_c, ctx) => (sig(ctx.signals, 'adoptionTrend')?.normalised ?? 0) >= 0.65,
    play: (c, ctx) => ({
      action: 'Run a usage review with the account team',
      urgency: 'This week',
      rationale: `${sig(ctx.signals, 'adoptionTrend')?.evidence} A decline this steep is either a deployment problem you can fix or a decision that has already been taken elsewhere, and the difference is worth one call.`,
      owner: 'CSM',
    }),
  },
  {
    when: (_c, ctx) => (sig(ctx.signals, 'engagementRecency')?.normalised ?? 0) >= 0.6,
    play: (_c, ctx) => ({
      action: 'Break the silence — book a call this week',
      urgency: 'This week',
      rationale: `${sig(ctx.signals, 'engagementRecency')?.evidence} Long silences before a renewal rarely resolve themselves in our favour.`,
      owner: 'CSM',
    }),
  },
  {
    when: (c) => c.criticalSupportTickets90d >= 2,
    play: (c) => ({
      action: 'Put a written remediation plan in front of the sponsor',
      urgency: 'This week',
      rationale: `${c.criticalSupportTickets90d} critical tickets in 90 days. At renewal time an unresolved service history becomes a negotiating position unless we get ahead of it in writing.`,
      owner: 'CSM + Support lead',
    }),
  },
  {
    when: (c) => c.invoiceStatus === 'Overdue',
    play: () => ({
      action: 'Clear the overdue invoice before the renewal lands',
      urgency: 'This week',
      rationale: 'An overdue invoice going into a renewal conversation hands the customer a reason to delay. Cheap to fix now, expensive later.',
      owner: 'CSM + Finance',
    }),
  },
  /*
   * Three flags that MATERIAL_NOTE_FLAGS already treats as material and that no
   * rule acted on. Until this block existed they could raise the "the score is
   * calm; the note is not" banner and leave the action underneath it reading
   * "No intervention needed" — Mosaic Foods scored 3.6 with a missing PO and a
   * buyer silent for 9 days, 27 days from renewal.
   *
   * They sit below the scored signals on purpose: a note is the tie-breaker when
   * nothing measured has fired, not an override of something that has. Meridian
   * and Ironwood both carry unresolved-issue and both keep the usage and billing
   * plays that outrank it.
   */
  {
    when: (_c, ctx) => flagged(ctx.noteFlags, 'budget-freeze'),
    play: (_c, ctx) => ({
      action: 'Confirm what the spending freeze covers before the renewal conversation',
      urgency: 'This week',
      rationale: `The notes record a spending or procurement freeze — "${ctx.noteFlags.find((f) => f.key === 'budget-freeze')?.quote}". No column in the file records a freeze, so the score cannot see it. Whether it stops the renewal or only new spend is the difference between a re-forecast and a paused upsell.`,
      owner: 'CSM + AE',
    }),
  },
  {
    when: (_c, ctx) => flagged(ctx.noteFlags, 'paperwork-stuck') && ctx.daysToRenewal <= 60,
    play: (_c, ctx) => ({
      action: 'Chase the named missing document and put a date on it',
      urgency: 'This week',
      rationale: `The notes say the paperwork has stalled — "${ctx.noteFlags.find((f) => f.key === 'paperwork-stuck')?.quote}" — with ${ctx.daysToRenewal} days to renewal. Nothing higher in the table fired, so the note is the only thing on this account asking for action.`,
      owner: 'CSM',
    }),
  },
  {
    when: (_c, ctx) => flagged(ctx.noteFlags, 'unresolved-issue'),
    play: (_c, ctx) => ({
      action: 'Get a written status on the open issue before the renewal conversation',
      urgency: 'This week',
      rationale: `The notes carry an unresolved product or service issue — "${ctx.noteFlags.find((f) => f.key === 'unresolved-issue')?.quote}". Nothing higher in the table fired, and an open issue with no written status becomes a negotiating position at renewal.`,
      owner: 'CSM + Support lead',
    }),
  },
  {
    when: (_c, ctx) => ctx.confidenceLow,
    play: (_c, ctx) => ({
      action: 'Refresh the account data before deciding anything',
      urgency: 'This week',
      rationale: `This account is scored on a materially incomplete picture — ${ctx.contradictions[0]?.summary.toLowerCase() ?? 'several signals are missing or stale'}. Acting on it now risks acting on a number rather than on the account.`,
      owner: 'CSM + Ops',
    }),
  },
  {
    when: (c, ctx) => flagged(ctx.noteFlags, 'expansion') && ctx.riskBand === 'Stable' && c.arrGbp > 0,
    play: (_c, ctx) => ({
      action: 'Scope the expansion ahead of the renewal',
      urgency: 'This month',
      rationale: `Signals are stable and the notes carry a growth cue — "${ctx.noteFlags.find((f) => f.key === 'expansion')?.quote}". A renewal conversation that opens with more value is a different conversation.`,
      owner: 'CSM + AE',
    }),
  },
  {
    when: (_c, ctx) => flagged(ctx.noteFlags, 'competitive-threat'),
    play: (_c, ctx) => ({
      action: 'Run a competitive displacement check',
      urgency: 'This month',
      rationale: `The notes mention a competing evaluation — "${ctx.noteFlags.find((f) => f.key === 'competitive-threat')?.quote}". Worth knowing where that stands before the commercial discussion, not during it.`,
      owner: 'CSM + AE',
    }),
  },
  {
    when: (_c, ctx) => ctx.riskBand === 'Watch',
    play: (_c, ctx) => ({
      action: 'Keep on the standard renewal cadence and re-check in two weeks',
      urgency: 'This month',
      rationale: `Nothing higher in the table fired, but ${ctx.daysToRenewal} days out with a moderate risk profile is worth a scheduled look rather than a reactive one.`,
      owner: 'CSM',
    }),
  },
];

/**
 * The last resort, and the only entry in the table that asserts an absence. That
 * assertion has to be computed. "Every scored signal is in a healthy range"
 * printed on Pivotal Legal, whose renewal-readiness signal sat at 65% of its
 * range, and on Foxglove Charity at 80% on prior discount pressure — nothing
 * checked before saying it. Now the highest signal is named with its value when
 * it is above half its range, and a note tag no rule acted on is named rather
 * than implied absent.
 */
const DEFAULT_PLAY = (_c: Customer, ctx: Ctx): Playbook => {
  const worst = ctx.signals
    .filter((s) => s.normalised !== null)
    .sort((a, b) => (b.normalised ?? 0) - (a.normalised ?? 0))[0];
  const signalText =
    worst && (worst.normalised ?? 0) >= 0.5
      ? `The highest scored signal is ${worst.label} at ${Math.round((worst.normalised ?? 0) * 100)}% of its range`
      : 'No scored signal is above half its range';
  const noteText = ctx.noteFlags.length
    ? `The note is tagged ${ctx.noteFlags.map((f) => f.label.toLowerCase()).join(' and ')}; read it before you close the tab.`
    : 'The most valuable thing a CSM can do with this account is spend the hour on a different one.';
  return {
    action: ctx.noteFlags.length
      ? 'Read the note, then confirm the renewal on the normal cadence'
      : 'No intervention needed — confirm the renewal on the normal cadence',
    urgency: 'Scheduled',
    rationale: `No rule in the table fired. ${signalText}, and the renewal is ${ctx.daysToRenewal} days out. ${noteText}`,
    owner: 'CSM',
  };
};

export function selectPlaybook(
  c: Customer,
  ctx: Omit<Ctx, 'noteFlags' | 'confidenceLow'> & { noteFlags: NoteFlag[]; confidenceLow: boolean },
): Playbook {
  const rule = RULES.find((r) => r.when(c, ctx));
  return rule ? rule.play(c, ctx) : DEFAULT_PLAY(c, ctx);
}
