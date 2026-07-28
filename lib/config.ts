/**
 * THE ADAPTER SEAM.
 *
 * Everything in this file is a judgement about *this* portfolio: what the
 * columns are called, what counts as stale, how much each signal is worth. The
 * scoring engine in `scoring.ts` contains no numbers at all — drop a different
 * B2B SaaS book in and you rewrite this file, not the engine.
 *
 * Every weight below is a considered guess, not a fitted parameter. There are no
 * historical renewal outcomes in this dataset, so nothing here has been
 * validated against reality and it would be dishonest to imply otherwise. They
 * encode a point of view: the *commercial process* signals (is the renewal
 * actually moving, is money stuck, is there still a human sponsor) are worth
 * more than sentiment, because they are closer to the decision and they are
 * measured more reliably.
 */

/** The snapshot the supplied file was taken at. Stated in the brief. */
export const SNAPSHOT_DATE = '2026-07-21';

/**
 * Weights sum to 100 so a risk score reads as "points of concern out of 100".
 * When a signal is unusable its weight is removed and the rest re-normalise, so
 * the scale survives missing data.
 */
export const SIGNAL_WEIGHTS = {
  adoptionTrend: 18,
  stageReadiness: 16,
  engagementRecency: 14,
  seatUtilisation: 12,
  sponsorStatus: 12,
  invoiceStatus: 12,
  supportStrain: 8,
  sentiment: 5,
  discountPressure: 3,
} as const;

export type SignalKey = keyof typeof SIGNAL_WEIGHTS;

export const SIGNAL_LABELS: Record<SignalKey, string> = {
  adoptionTrend: 'Adoption trend',
  stageReadiness: 'Renewal process readiness',
  engagementRecency: 'Engagement recency',
  seatUtilisation: 'Seat utilisation',
  sponsorStatus: 'Executive sponsor',
  invoiceStatus: 'Billing status',
  supportStrain: 'Support strain',
  sentiment: 'Sentiment (NPS)',
  discountPressure: 'Prior discount pressure',
};

/** Why each signal is in the model at all. Surfaced in the UI on hover. */
export const SIGNAL_RATIONALE: Record<SignalKey, string> = {
  adoptionTrend:
    'People voting with their feet. The clearest leading indicator of a renewal in trouble, and measured fresh for 36 of 40 accounts.',
  stageReadiness:
    'A renewal 18 days out that has not started is a process failure you can still fix. Compares stage reached against days remaining.',
  engagementRecency:
    'Silence is a signal. Long gaps precede surprises, and unlike sentiment it is recorded for every account.',
  seatUtilisation:
    'Distinguishes a small account using everything it bought from a large one that never deployed.',
  sponsorStatus:
    'Renewals are signed by people. A departed or inactive sponsor is the single most common reason a healthy-looking account stalls.',
  invoiceStatus:
    'Disputed or overdue money is a commercial conversation already going wrong, independent of how happy the users are.',
  supportStrain:
    'Weighted toward critical tickets and normalised per 100 seats, so a large account is not penalised for having more users.',
  sentiment:
    'Deliberately the second-lightest weight. NPS is the most-quoted CS metric and the least trustworthy column in this file: 36 of 40 responses are more than a week old.',
  discountPressure:
    'A heavily discounted last renewal is a standing signal of price pressure and weak perceived value.',
};

/** A signal older than this contributes nothing and reduces confidence instead. */
export const STALENESS = {
  /** NPS at full weight up to here. */
  npsFreshDays: 45,
  /** NPS at half weight up to here; beyond it, excluded entirely. */
  npsUsableDays: 120,
  /** Usage sync older than this starts costing confidence. */
  usageWarnDays: 7,
  /** Usage sync older than this costs confidence twice. */
  usageStaleDays: 20,
} as const;

/** Reference point for the value axis — the largest ARR in this book. */
export const ARR_REFERENCE = 260_000;

/**
 * How much a small account is allowed to matter. At 0 the ranking is pure ARR
 * and every SMB disappears; at 1 the value axis does nothing. 0.45 keeps a
 * severely distressed small account visible without letting it outrank an
 * enterprise renewal in the same state.
 */
export const VALUE_FLOOR = 0.45;

export const RISK_BANDS = [
  { min: 65, band: 'Critical' as const },
  { min: 45, band: 'Elevated' as const },
  { min: 25, band: 'Watch' as const },
  { min: 0, band: 'Stable' as const },
];

export const STAGE_PROGRESS: Record<string, number> = {
  'Not started': 0,
  'Outreach scheduled': 0.25,
  'In discussion': 0.5,
  'Commercial review': 0.75,
  'Verbal commitment': 1,
};

export const SPONSOR_RISK: Record<string, number> = {
  'Left company': 1,
  Inactive: 0.7,
  Unknown: 0.5,
  Active: 0,
};

export const INVOICE_RISK: Record<string, number> = {
  Disputed: 1,
  Overdue: 0.6,
  Current: 0,
};
