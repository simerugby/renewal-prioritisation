/**
 * Data loading.
 *
 * The CSV is committed to the repo and read from disk on the server. It is a
 * static snapshot, so it is parsed once per process and cached — but the parse
 * is still fallible and still reports its failures, because "the file moved" is
 * the most likely way this app breaks in someone else's hands.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { parseCsv } from './csv';
import { SNAPSHOT_DATE } from './config';
import { scoreAll } from './scoring';
import type {
  Customer,
  InvoiceStatus,
  RenewalStage,
  ScoredCustomer,
  Segment,
  SponsorStatus,
} from './types';

export class DataLoadError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'DataLoadError';
  }
}

const numOrNull = (v: string): number | null => {
  const t = v?.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Required numeric field. Throws rather than defaulting to 0 — a silent zero here would score as a real measurement. */
const numOrThrow = (v: string, field: string, id: string): number => {
  const n = numOrNull(v);
  if (n === null) throw new DataLoadError(`${id}: required numeric field "${field}" is missing or non-numeric`);
  return n;
};

const strOrNull = (v: string): string | null => (v?.trim() ? v.trim() : null);

export function parseCustomer(r: Record<string, string>): Customer {
  const id = r.customer_id || '(no id)';
  return {
    customerId: id,
    customerName: r.customer_name,
    segment: r.segment as Segment,
    region: r.region,
    industry: r.industry,
    csmName: r.csm_name,
    renewalDate: r.renewal_date,
    arrGbp: numOrThrow(r.arr_gbp, 'arr_gbp', id),
    contractTermMonths: numOrThrow(r.contract_term_months, 'contract_term_months', id),
    productsOwned: r.products_owned ? r.products_owned.split(';').map((s) => s.trim()) : [],
    seatsPurchased: numOrThrow(r.seats_purchased, 'seats_purchased', id),
    activeUsers30d: numOrThrow(r.active_users_30d, 'active_users_30d', id),
    activeUsersPrevious30d: numOrThrow(r.active_users_previous_30d, 'active_users_previous_30d', id),
    weeklyActiveUsers30d: numOrNull(r.weekly_active_users_30d),
    daysSinceLastCustomerEngagement: numOrNull(r.days_since_last_customer_engagement),
    supportTickets90d: numOrThrow(r.support_tickets_90d, 'support_tickets_90d', id),
    criticalSupportTickets90d: numOrThrow(r.critical_support_tickets_90d, 'critical_support_tickets_90d', id),
    npsScore: numOrNull(r.nps_score),
    invoiceStatus: r.invoice_status as InvoiceStatus,
    renewalStage: r.renewal_stage as RenewalStage,
    executiveSponsorStatus: r.executive_sponsor_status as SponsorStatus,
    lastRenewalDiscountPct: numOrNull(r.last_renewal_discount_pct) ?? 0,
    usageDataLastSyncedAt: r.usage_data_last_synced_at,
    npsResponseDate: strOrNull(r.nps_response_date),
    customerNotes: r.customer_notes ?? '',
  };
}

const CSV_PATH = path.join(process.cwd(), 'data', 'renewal_customers.csv');

let cache: { asOf: string; rows: ScoredCustomer[] } | null = null;

export async function loadPortfolio(asOf: string = SNAPSHOT_DATE): Promise<ScoredCustomer[]> {
  if (cache && cache.asOf === asOf) return cache.rows;

  let text: string;
  try {
    text = await fs.readFile(CSV_PATH, 'utf8');
  } catch (err) {
    throw new DataLoadError(
      `Could not read the portfolio file at data/renewal_customers.csv. Confirm it is present in the repository.`,
      err,
    );
  }

  const records = parseCsv(text);
  if (records.length === 0) {
    throw new DataLoadError('The portfolio file parsed to zero rows. It may be empty or missing its header.');
  }

  const customers: Customer[] = records.map(parseCustomer);
  const rows = scoreAll(customers, asOf);
  cache = { asOf, rows };
  return rows;
}

export async function loadCustomer(id: string, asOf: string = SNAPSHOT_DATE): Promise<ScoredCustomer | null> {
  const all = await loadPortfolio(asOf);
  return all.find((r) => r.customer.customerId === id) ?? null;
}
