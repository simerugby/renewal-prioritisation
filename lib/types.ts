/**
 * Domain types.
 *
 * `RawCustomer` mirrors the CSV exactly, including its blanks: every field is a
 * string, because "not recorded" is a real state in this file and coercing it to
 * 0 at the parse boundary is how a missing value silently becomes a measurement.
 * Nullability is resolved once, deliberately, in `parseCustomer`.
 */

export type RawCustomer = Record<string, string>;

export type InvoiceStatus = 'Current' | 'Overdue' | 'Disputed';
export type RenewalStage =
  | 'Not started'
  | 'Outreach scheduled'
  | 'In discussion'
  | 'Commercial review'
  | 'Verbal commitment';
export type SponsorStatus = 'Active' | 'Inactive' | 'Unknown' | 'Left company';
export type Segment = 'Enterprise' | 'Mid-market' | 'SMB';

export interface Customer {
  customerId: string;
  customerName: string;
  segment: Segment;
  region: string;
  industry: string;
  csmName: string;
  renewalDate: string;
  arrGbp: number;
  /** Null when the column is blank. Never defaulted — see lib/schema.ts. */
  contractTermMonths: number | null;
  productsOwned: string[];
  seatsPurchased: number;
  activeUsers30d: number;
  activeUsersPrevious30d: number;
  weeklyActiveUsers30d: number | null;
  daysSinceLastCustomerEngagement: number | null;
  supportTickets90d: number;
  criticalSupportTickets90d: number;
  npsScore: number | null;
  invoiceStatus: InvoiceStatus;
  renewalStage: RenewalStage;
  executiveSponsorStatus: SponsorStatus;
  /**
   * Null when the column is blank. This one matters most: a blank coerced to 0
   * would score as *no* discount pressure, the healthiest value on the curve, so
   * a missing measurement would read as a good one.
   */
  lastRenewalDiscountPct: number | null;
  usageDataLastSyncedAt: string;
  npsResponseDate: string | null;
  customerNotes: string;
}

/** One scored signal, carrying everything the UI needs to justify itself. */
export interface SignalResult {
  key: string;
  label: string;
  /** 0..1, where 1 is worst. `null` when the input was missing or too stale to use. */
  normalised: number | null;
  /** Weight actually applied. 0 when the signal was excluded. */
  weightApplied: number;
  /** Weight this signal carries when its input is usable. */
  weightBase: number;
  /** Points this signal contributed to the final 0-100 risk score. */
  contribution: number;
  /** Plain English, shown verbatim in the UI. Always states the underlying number. */
  evidence: string;
  /** Set when the signal was excluded, explaining why. */
  excludedReason?: string;
}

export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

export interface Contradiction {
  key: string;
  summary: string;
  detail: string;
}

export interface NoteFlag {
  key: string;
  label: string;
  /** The words in the note that triggered it. Never paraphrased. */
  quote: string;
}

export type RiskBand = 'Critical' | 'Elevated' | 'Watch' | 'Stable';
export type ActionUrgency = 'Today' | 'This week' | 'This month' | 'Scheduled';

export interface Playbook {
  action: string;
  urgency: ActionUrgency;
  /** Why this play and not another. Rule-derived, quotable in a QBR. */
  rationale: string;
  owner: string;
}

export interface ScoredCustomer {
  customer: Customer;
  daysToRenewal: number;
  /** 0-100. A rubric score and an ordering device. NOT a probability. */
  riskScore: number;
  riskBand: RiskBand;
  /** 0-100 ordering device combining risk, value and urgency. NOT a probability. */
  priorityScore: number;
  /**
   * The two multipliers that turn risk into priority, kept so the account page
   * can show the arithmetic rather than assert the result. priorityScore is
   * exactly riskScore * valueWeight * urgency.
   */
  valueWeight: number;
  urgency: number;
  /** The ARR the value weight is measured against: the book's 90th percentile. */
  arrReference: number;
  priorityRank: number;
  /** Rank this account would hold if we sorted on risk alone. */
  riskOnlyRank: number;
  signals: SignalResult[];
  confidence: ConfidenceLevel;
  /** Fraction of total model weight that could actually be applied, 0..1. */
  modelCoverage: number;
  confidenceReasons: string[];
  contradictions: Contradiction[];
  noteFlags: NoteFlag[];
  playbook: Playbook;
  usageDataAgeDays: number;
  npsAgeDays: number | null;
}
