/**
 * SCHEMA AND VALIDATION.
 *
 * The supplied file is 40 clean-ish rows. This layer exists because the next
 * file will not be: a renamed column, a new `invoice_status` value, a negative
 * seat count, a date in the wrong format, a row for a customer that renewed
 * last year.
 *
 * Two principles, both learned from the shape of the supplied data:
 *
 *  1. NEVER SILENTLY DEFAULT. The original implementation wrote
 *     `INVOICE_RISK[status] ?? 0`, which scores an unrecognised billing state as
 *     *perfectly healthy* — the safest-looking number and the most dangerous
 *     one. Unknown values now raise a warning, are excluded from scoring, and
 *     are surfaced in the UI.
 *  2. DISTINGUISH FATAL FROM DEGRADED. A missing `arr_gbp` column means the
 *     product cannot function and should say so loudly. One row with a bad date
 *     means one row is quarantined and the other 39 still work.
 */

import type { Customer, InvoiceStatus, RenewalStage, Segment, SponsorStatus } from './types';

export type IssueLevel = 'error' | 'warning';

export interface DataIssue {
  level: IssueLevel;
  /** Customer id where known, else the 1-based row number. */
  scope: string;
  column?: string;
  message: string;
}

/** Columns the product cannot run without. */
export const REQUIRED_COLUMNS = [
  'customer_id',
  'customer_name',
  'renewal_date',
  'arr_gbp',
  'seats_purchased',
  'active_users_30d',
  'active_users_previous_30d',
  'support_tickets_90d',
  'critical_support_tickets_90d',
  'invoice_status',
  'renewal_stage',
  'executive_sponsor_status',
  'usage_data_last_synced_at',
] as const;

/** Columns that improve the score when present and are tolerated when absent. */
export const OPTIONAL_COLUMNS = [
  'segment',
  'region',
  'industry',
  'csm_name',
  'contract_term_months',
  'products_owned',
  'weekly_active_users_30d',
  'days_since_last_customer_engagement',
  'nps_score',
  'nps_response_date',
  'last_renewal_discount_pct',
  'customer_notes',
] as const;

export const KNOWN_INVOICE_STATUSES: InvoiceStatus[] = ['Current', 'Overdue', 'Disputed'];
export const KNOWN_RENEWAL_STAGES: RenewalStage[] = [
  'Not started',
  'Outreach scheduled',
  'In discussion',
  'Commercial review',
  'Verbal commitment',
];
export const KNOWN_SPONSOR_STATUSES: SponsorStatus[] = ['Active', 'Inactive', 'Unknown', 'Left company'];
export const KNOWN_SEGMENTS: Segment[] = ['Enterprise', 'Mid-market', 'SMB'];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class SchemaError extends Error {
  constructor(
    message: string,
    readonly issues: DataIssue[],
  ) {
    super(message);
    this.name = 'SchemaError';
  }
}

export interface ValidationResult {
  customers: Customer[];
  issues: DataIssue[];
  /** Rows dropped because they could not be parsed at all. */
  quarantined: number;
}

function isValidDate(v: string): boolean {
  if (!ISO_DATE.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t);
}

/**
 * Parse and validate a batch of raw CSV records.
 *
 * Throws `SchemaError` only when the file is structurally unusable. Everything
 * else is reported as an issue and the good rows still load.
 */
export function validatePortfolio(records: Record<string, string>[]): ValidationResult {
  const issues: DataIssue[] = [];

  if (records.length === 0) {
    throw new SchemaError('The portfolio file contains no data rows.', [
      { level: 'error', scope: 'file', message: 'Parsed zero rows. The file may be empty or missing its header.' },
    ]);
  }

  const present = new Set(Object.keys(records[0]));
  const missing = REQUIRED_COLUMNS.filter((c) => !present.has(c));
  if (missing.length > 0) {
    const detail = missing.map((c) => `"${c}"`).join(', ');
    throw new SchemaError(
      `The portfolio file is missing ${missing.length} required column${missing.length > 1 ? 's' : ''}: ${detail}.`,
      missing.map((c) => ({ level: 'error' as const, scope: 'file', column: c, message: 'Required column not found.' })),
    );
  }

  for (const c of OPTIONAL_COLUMNS) {
    if (!present.has(c)) {
      issues.push({
        level: 'warning',
        scope: 'file',
        column: c,
        message: `Optional column not present. Signals that depend on it will be excluded and confidence reduced.`,
      });
    }
  }

  const customers: Customer[] = [];
  const seenIds = new Set<string>();
  let quarantined = 0;

  records.forEach((r, i) => {
    const scope = r.customer_id?.trim() || `row ${i + 2}`;
    const rowIssues: DataIssue[] = [];

    const num = (col: string, opts: { required?: boolean; min?: number } = {}): number | null => {
      const raw = (r[col] ?? '').trim();
      if (!raw) {
        if (opts.required) rowIssues.push({ level: 'error', scope, column: col, message: 'Required value is blank.' });
        return null;
      }
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        rowIssues.push({ level: 'error', scope, column: col, message: `"${raw}" is not a number.` });
        return null;
      }
      if (opts.min !== undefined && n < opts.min) {
        rowIssues.push({ level: 'warning', scope, column: col, message: `Value ${n} is below the expected minimum of ${opts.min}.` });
      }
      return n;
    };

    const date = (col: string, required = false): string | null => {
      const raw = (r[col] ?? '').trim();
      if (!raw) {
        if (required) rowIssues.push({ level: 'error', scope, column: col, message: 'Required date is blank.' });
        return null;
      }
      if (!isValidDate(raw)) {
        rowIssues.push({ level: 'error', scope, column: col, message: `"${raw}" is not an ISO (YYYY-MM-DD) date.` });
        return null;
      }
      return raw;
    };

    const enumOf = <T extends string>(col: string, known: T[], fallback: T): T => {
      const raw = (r[col] ?? '').trim();
      if (!raw) {
        rowIssues.push({ level: 'warning', scope, column: col, message: 'Blank. Treated as unknown and excluded from scoring.' });
        return fallback;
      }
      if (!known.includes(raw as T)) {
        // The important case. An unrecognised value must never inherit the
        // best-case score by falling through a `?? 0`.
        rowIssues.push({
          level: 'warning',
          scope,
          column: col,
          message: `"${raw}" is not a recognised value. Expected one of: ${known.join(', ')}. Excluded from scoring rather than assumed healthy.`,
        });
        return fallback;
      }
      return raw as T;
    };

    const id = r.customer_id?.trim();
    if (!id) {
      rowIssues.push({ level: 'error', scope, column: 'customer_id', message: 'Missing customer id.' });
    } else if (seenIds.has(id)) {
      rowIssues.push({ level: 'error', scope, column: 'customer_id', message: 'Duplicate customer id — the later row was dropped.' });
    }

    const arr = num('arr_gbp', { required: true, min: 0 });
    const seats = num('seats_purchased', { required: true, min: 0 });
    const active = num('active_users_30d', { required: true, min: 0 });
    const activePrev = num('active_users_previous_30d', { required: true, min: 0 });
    const tickets = num('support_tickets_90d', { required: true, min: 0 });
    const critical = num('critical_support_tickets_90d', { required: true, min: 0 });
    const renewalDate = date('renewal_date', true);
    const syncedAt = date('usage_data_last_synced_at', true);

    if (active !== null && seats !== null && seats > 0 && active > seats) {
      rowIssues.push({
        level: 'warning',
        scope,
        column: 'active_users_30d',
        message: `${active} active users against ${seats} purchased seats. Utilisation is capped at 100% for scoring.`,
      });
    }

    const fatal = rowIssues.some((x) => x.level === 'error');
    if (fatal || !id || seenIds.has(id)) {
      issues.push(...rowIssues);
      quarantined++;
      return;
    }
    seenIds.add(id);

    // Built BEFORE the issue list is flushed: `enumOf` appends to `rowIssues`,
    // so constructing the customer afterwards silently dropped every
    // unrecognised-value warning — the exact class of problem this file exists
    // to catch. Caught by lib/schema.test.ts.
    const parsed: Customer = {
      customerId: id,
      customerName: r.customer_name?.trim() || id,
      segment: enumOf('segment', KNOWN_SEGMENTS, 'Mid-market' as Segment),
      region: r.region?.trim() || 'Unknown',
      industry: r.industry?.trim() || 'Unknown',
      csmName: r.csm_name?.trim() || 'Unassigned',
      renewalDate: renewalDate!,
      arrGbp: arr!,
      // No `?? 12`. A blank term is not a twelve-month term, and the README
      // claims blanks are never coerced — that has to be true in the code, not
      // just true of this particular file.
      contractTermMonths: num('contract_term_months'),
      productsOwned: r.products_owned ? r.products_owned.split(';').map((s) => s.trim()).filter(Boolean) : [],
      seatsPurchased: seats!,
      activeUsers30d: active!,
      activeUsersPrevious30d: activePrev!,
      weeklyActiveUsers30d: num('weekly_active_users_30d'),
      daysSinceLastCustomerEngagement: num('days_since_last_customer_engagement'),
      supportTickets90d: tickets!,
      criticalSupportTickets90d: critical!,
      npsScore: num('nps_score'),
      invoiceStatus: enumOf('invoice_status', KNOWN_INVOICE_STATUSES, 'Unknown' as unknown as InvoiceStatus),
      renewalStage: enumOf('renewal_stage', KNOWN_RENEWAL_STAGES, 'Unknown' as unknown as RenewalStage),
      executiveSponsorStatus: enumOf('executive_sponsor_status', KNOWN_SPONSOR_STATUSES, 'Unknown'),
      // No `?? 0`. Zero is the BEST value on the discount-pressure curve, so
      // coercing a blank to it scores a missing measurement as a healthy one.
      // Null instead, and the signal is excluded and re-normalised like a stale
      // NPS. No row in the supplied file is blank here, so no score moves.
      lastRenewalDiscountPct: num('last_renewal_discount_pct'),
      usageDataLastSyncedAt: syncedAt!,
      npsResponseDate: date('nps_response_date'),
      customerNotes: r.customer_notes ?? '',
    };

    issues.push(...rowIssues);
    customers.push(parsed);
  });

  if (customers.length === 0) {
    throw new SchemaError(
      `All ${records.length} rows failed validation. The file may not be a renewal portfolio export.`,
      issues.filter((x) => x.level === 'error').slice(0, 10),
    );
  }

  return { customers, issues, quarantined };
}
