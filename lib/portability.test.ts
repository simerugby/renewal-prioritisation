import { describe, expect, it } from 'vitest';
import { parseCsvDetailed } from './csv';
import { validatePortfolio } from './schema';
import { scoreAll } from './scoring';
import { deriveArrReference } from './config';

/**
 * THE SECOND COMPANY.
 *
 * Everything else in this repo is validated against one synthetic file of forty
 * rows. That proves the app works on the data it was written for, which is the
 * weakest possible claim. This file is a different company's export, written to
 * be awkward in the ways a real one is:
 *
 *   - a UTF-8 BOM, because Excel writes one
 *   - CRLF line endings, because Windows
 *   - a trailing comma on every line, producing an unnamed column
 *   - two optional columns absent entirely (no NPS at all)
 *   - enum values this model has never seen ("Part-paid", "Legal review")
 *   - a commercial book two orders of magnitude smaller (SMB, £1.8k–£46k)
 *   - a duplicate customer id
 *   - one row with an unparseable date
 *   - a renewal already in the past
 *   - a note written in a completely different voice
 *
 * The assertions below are the promises the README makes about new data. If one
 * of them breaks, the portability claim is false and should be removed from the
 * README rather than defended.
 */

const SECOND_COMPANY_CSV =
  '﻿' +
  [
    'customer_id,customer_name,segment,region,industry,csm_name,renewal_date,arr_gbp,contract_term_months,products_owned,seats_purchased,active_users_30d,active_users_previous_30d,days_since_last_customer_engagement,support_tickets_90d,critical_support_tickets_90d,invoice_status,renewal_stage,executive_sponsor_status,last_renewal_discount_pct,usage_data_last_synced_at,customer_notes,',
    'ACME-01,Pinewood Dental,SMB,South West,Healthcare,J Okafor,2026-08-30,4200,12,Bookings,12,4,11,54,3,1,Part-paid,Legal review,Active,10,2026-07-19,practice manager retiring in sept, no handover planned yet,',
    'ACME-02,Halberd Signage,SMB,Midlands,Manufacturing,J Okafor,2026-09-14,1800,12,Bookings,6,5,5,9,0,0,Current,In discussion,Active,0,2026-07-19,happy - asked about adding a second branch,',
    'ACME-03,Vale Physio,SMB,North,Healthcare,R Mensah,2026-08-02,9600,24,Bookings;Reports,30,9,26,71,7,2,Disputed,Not started,Left company,22,2026-07-19,they are trialling a competitor and the owner has stopped replying,',
    'ACME-04,Kestrel Tutors,SMB,London,Education,R Mensah,2026-11-02,46000,12,Reports,140,131,126,4,2,0,Current,Verbal commitment,Active,5,2026-07-19,renewal agreed verbally; paperwork with their accountant,',
    'ACME-05,Bramble Cafe Group,SMB,South East,Hospitality,R Mensah,2026-06-15,3100,12,Bookings,10,2,9,120,1,0,Overdue,Not started,Unknown,15,2026-06-02,site closed in may; unclear if they are continuing,',
    'ACME-04,Kestrel Tutors,SMB,London,Education,R Mensah,2026-11-02,46000,12,Reports,140,131,126,4,2,0,Current,Verbal commitment,Active,5,2026-07-19,duplicate row from a bad export,',
    'ACME-06,Thistle Vets,SMB,Scotland,Healthcare,J Okafor,15/09/2026,7400,12,Bookings,22,18,19,12,1,0,Current,In discussion,Active,0,2026-07-19,date written the british way on purpose,',
  ].join('\r\n');

const ASOF = '2026-07-21';

describe('a different company export', () => {
  const { rows: records, raggedRows } = parseCsvDetailed(SECOND_COMPANY_CSV);
  const result = validatePortfolio(records);

  it('parses despite the BOM, CRLF and trailing commas', () => {
    expect(records.length).toBe(7);
    expect(Object.keys(records[0])).toContain('customer_id');
    expect(records[0].customer_id).toBe('ACME-01');
  });

  /*
   * Every note in this fixture contains an unquoted comma, which is what a lot
   * of real systems emit for a free-text field. The surplus cells are dropped,
   * so the note is truncated — and without the ragged-row check that truncation
   * is completely silent. Writing this fixture is how I found it.
   */
  it('flags rows whose free text contained an unquoted delimiter', () => {
    expect(raggedRows.length).toBeGreaterThan(0);
    expect(records[0].customer_notes).toBe('practice manager retiring in sept');
    expect(records[0].customer_notes).not.toContain('handover');
  });

  it('loads the good rows and quarantines only the bad ones', () => {
    // The duplicate and the d/m/y date are dropped; the other five survive.
    expect(result.customers).toHaveLength(5);
    expect(result.quarantined).toBe(2);
    expect(result.customers.map((c) => c.customerId)).toEqual([
      'ACME-01',
      'ACME-02',
      'ACME-03',
      'ACME-04',
      'ACME-05',
    ]);
  });

  it('reports the missing optional columns rather than silently scoring without them', () => {
    const cols = result.issues.filter((i) => i.scope === 'file').map((i) => i.column);
    expect(cols).toContain('nps_score');
    expect(cols).toContain('nps_response_date');
  });

  it('reports the unrecognised enum values by name', () => {
    const messages = result.issues.filter((i) => i.scope === 'ACME-01').map((i) => i.message);
    expect(messages.join(' ')).toContain('Part-paid');
    expect(messages.join(' ')).toContain('Legal review');
  });

  it('does not let an unrecognised billing state score as healthy', () => {
    const rows = scoreAll(result.customers, ASOF);
    const partPaid = rows.find((r) => r.customer.customerId === 'ACME-01')!;
    const billing = partPaid.signals.find((s) => s.key === 'invoiceStatus')!;
    expect(billing.normalised).toBeNull();
    expect(billing.contribution).toBe(0);
    expect(partPaid.modelCoverage).toBeLessThan(1);
    expect(partPaid.confidence).not.toBe('High');
  });

  // The value axis must scale to the book. Against a hard-coded £260k reference
  // every account here would sit on the floor and the axis would do nothing.
  it('rescales the value axis to an SMB book', () => {
    const reference = deriveArrReference(result.customers.map((c) => c.arrGbp));
    expect(reference).toBeLessThan(50_000);
    expect(reference).toBeGreaterThan(1_000);
  });

  it('still ranks the obviously worst account first', () => {
    const rows = scoreAll(result.customers, ASOF);
    // Vale Physio: disputed invoice, sponsor gone, not started, 71 days silent,
    // usage down two thirds, and the largest ARR of the troubled accounts.
    expect(rows[0].customer.customerId).toBe('ACME-03');
    expect(rows[0].riskBand === 'Critical' || rows[0].riskBand === 'Elevated').toBe(true);
  });

  it('handles a renewal that has already passed', () => {
    const rows = scoreAll(result.customers, ASOF);
    const overdue = rows.find((r) => r.customer.customerId === 'ACME-05')!;
    expect(overdue.daysToRenewal).toBeLessThan(0);
    expect(Number.isFinite(overdue.priorityScore)).toBe(true);
    expect(overdue.priorityScore).toBeGreaterThanOrEqual(0);
  });

  it('gives every surviving account a score, a band, a confidence and an action', () => {
    for (const r of scoreAll(result.customers, ASOF)) {
      expect(r.riskScore).toBeGreaterThanOrEqual(0);
      expect(r.riskScore).toBeLessThanOrEqual(100);
      expect(r.playbook.action.length).toBeGreaterThan(0);
      expect(['High', 'Medium', 'Low']).toContain(r.confidence);
    }
  });

  // The measured limitation, asserted so it cannot quietly stop being true.
  // These notes carry real risk in a different voice, and the rules miss it.
  it('demonstrates the note scanner failing on another company\'s phrasing', () => {
    const rows = scoreAll(result.customers, ASOF);
    const retiring = rows.find((r) => r.customer.customerId === 'ACME-01')!;
    expect(retiring.customer.customerNotes).toContain('retiring');
    // "practice manager retiring in sept, no handover planned yet" is a sponsor
    // loss by any reading, and no pattern written for the first company sees it.
    expect(retiring.noteFlags.map((f) => f.key)).not.toContain('sponsor-loss');
  });
});
