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

/**
 * The date every "days to renewal" counts from.
 *
 * Defaults to the snapshot stated in the brief. Overridable by environment so
 * this can be pointed at a live extract without a code change; when the data
 * becomes live, set it to today's date at ingest and nothing else moves.
 */
export const SNAPSHOT_DATE = process.env.NEXT_PUBLIC_SNAPSHOT_DATE?.trim() || '2026-07-21';

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
    'People voting with their feet. The clearest leading indicator of a renewal in trouble, and synced within a day of the snapshot for 36 of the 40 accounts in this book.',
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
    'Deliberately the second-lightest weight. NPS is the most-quoted CS metric and the least trustworthy column in this file: 3 accounts have no response at all, and 36 of the 37 that do are more than a week old.',
  discountPressure:
    'A heavily discounted last renewal is a standing signal of price pressure and weak perceived value.',
};

/**
 * RESPONSE CURVES.
 *
 * Piecewise-linear control points, read as [input, risk] where risk runs 0 (fine)
 * to 1 (worst). They live here rather than in the engine because they are the
 * most company-specific judgement in the whole model: what counts as a steep
 * usage decline, or a long silence, is a property of the book being worked, not
 * of renewals in general.
 *
 * Every one is a considered guess. There are no historical renewal outcomes in
 * this dataset, so none has been fitted to or validated against an outcome.
 */
export const CURVES = {
  /** Month-on-month change in active users. A 25% drop is worth ~two thirds of the weight. */
  adoptionTrend: [
    [-0.4, 1],
    [-0.25, 0.65],
    [-0.1, 0.3],
    [0, 0.05],
    [0.1, 0],
  ] as [number, number][],

  /** Share of purchased seats in active use. */
  seatUtilisation: [
    [0.15, 1],
    [0.35, 0.75],
    [0.5, 0.45],
    [0.75, 0.05],
    [0.9, 0],
  ] as [number, number][],

  /** Days since the last recorded customer contact. */
  engagementRecency: [
    [7, 0],
    [21, 0.2],
    [45, 0.6],
    [75, 0.9],
    [110, 1],
  ] as [number, number][],

  /**
   * How far along the renewal process *ought* to be, given days remaining.
   * Compared against the stage actually reached; only being behind counts.
   */
  expectedStageProgress: [
    [20, 1],
    [45, 0.75],
    [75, 0.5],
    [110, 0.25],
  ] as [number, number][],

  /** Critical tickets in 90 days. */
  criticalTickets: [
    [0, 0],
    [1, 0.35],
    [2, 0.65],
    [4, 1],
  ] as [number, number][],

  /** All support tickets in 90 days, per 100 purchased seats. */
  ticketsPer100Seats: [
    [0.5, 0],
    [2, 0.4],
    [5, 0.8],
    [10, 1],
  ] as [number, number][],

  /** Discount given at the last renewal, as a percentage. */
  discountPressure: [
    [0, 0],
    [10, 0.35],
    [20, 0.8],
    [25, 1],
  ] as [number, number][],

  /**
   * How much a renewal's distance discounts its priority. Extends past a year
   * so a book with long horizons does not flatten into a single urgency.
   */
  urgency: [
    [0, 1],
    [30, 1],
    [60, 0.8],
    [90, 0.6],
    [180, 0.4],
    [365, 0.25],
  ] as [number, number][],
} as const;

/** How the two support-strain components combine. Severity outweighs volume. */
export const SUPPORT_STRAIN_MIX = { critical: 0.7, volume: 0.3 } as const;

/**
 * The largest process gap that can occur (`Not started` at under 20 days), used
 * to put the stage-readiness signal on the same 0..1 scale as the others.
 */
export const MAX_STAGE_GAP = 0.75;

/** NPS runs -100..100; this maps it onto 0..1 risk. */
export const NPS_RISK = { midpoint: 50, divisor: 2, scale: 100 } as const;

/** Weight multiplier applied to an NPS response that is fresh vs merely usable. */
export const NPS_AGE_WEIGHTING = { fresh: 1, aging: 0.5 } as const;

/** Model coverage below these fractions costs a confidence penalty each. */
export const CONFIDENCE_COVERAGE_THRESHOLDS = [0.95, 0.9] as const;

/** Penalty points mapping onto a confidence level. */
export const CONFIDENCE_LEVEL_CUTOFFS = { high: 0, medium: 2 } as const;

/** An NPS at or above this is "users are happy", for contradiction detection. */
export const HEALTHY_NPS_THRESHOLD = 30;

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
  /**
   * Usage sync older than this excludes the usage-derived signals entirely.
   * A "last 30 days" window synced 33 days ago describes a period that closed a
   * month before the snapshot. Treated the same way as a stale NPS, so the model
   * has one rule for stale inputs rather than a special case for sentiment.
   */
  usageExcludeDays: 30,
} as const;

/**
 * Reference point for the value axis.
 *
 * Derived from the portfolio at load time, never hard-coded — a constant tuned
 * to this file's largest account (£260k) would silently flatten every account in
 * a book whose top account is £5m.
 *
 * The 90th percentile rather than the maximum, so a single outlier cannot
 * compress the rest of the book into the value floor. Accounts above it clamp
 * to the top of the range, which is the correct behaviour: past a point, "very
 * large" is one category.
 */
export function deriveArrReference(arrValues: number[]): number {
  const override = Number(process.env.NEXT_PUBLIC_ARR_REFERENCE ?? process.env.ARR_REFERENCE);
  if (Number.isFinite(override) && override > 0) return override;

  const sorted = [...arrValues].filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 1;
  // Zero-based percentile index. `floor(n * 0.9)` returns the maximum on small
  // books — with five accounts it picks index 4, i.e. the outlier the percentile
  // exists to exclude. Caught by lib/scoring.test.ts.
  const idx = Math.floor((sorted.length - 1) * 0.9);
  return sorted[idx] || sorted[sorted.length - 1];
}

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
