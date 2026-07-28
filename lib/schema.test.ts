import { describe, expect, it } from 'vitest';
import { SchemaError, validatePortfolio } from './schema';

/** A minimally valid row. Tests override single fields to isolate one failure. */
function row(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    customer_id: 'CUST-9001',
    customer_name: 'Test Account',
    segment: 'Enterprise',
    region: 'UK & Ireland',
    industry: 'Software',
    csm_name: 'A Person',
    renewal_date: '2026-09-01',
    arr_gbp: '100000',
    contract_term_months: '12',
    products_owned: 'Workflow Pro;Secure Connect',
    seats_purchased: '100',
    active_users_30d: '80',
    active_users_previous_30d: '90',
    weekly_active_users_30d: '60',
    days_since_last_customer_engagement: '10',
    support_tickets_90d: '3',
    critical_support_tickets_90d: '0',
    nps_score: '40',
    invoice_status: 'Current',
    renewal_stage: 'In discussion',
    executive_sponsor_status: 'Active',
    last_renewal_discount_pct: '5',
    usage_data_last_synced_at: '2026-07-20',
    nps_response_date: '2026-07-01',
    customer_notes: 'Nothing of note.',
    ...overrides,
  };
}

describe('validatePortfolio', () => {
  it('accepts a well-formed row', () => {
    const r = validatePortfolio([row()]);
    expect(r.customers).toHaveLength(1);
    expect(r.quarantined).toBe(0);
    expect(r.issues.filter((i) => i.level === 'error')).toHaveLength(0);
  });

  it('throws when a required column is absent', () => {
    const bad = row();
    delete bad.arr_gbp;
    expect(() => validatePortfolio([bad])).toThrow(SchemaError);
  });

  it('throws on an empty record set', () => {
    expect(() => validatePortfolio([])).toThrow(SchemaError);
  });

  it('tolerates a missing optional column and warns', () => {
    const r = row();
    delete r.nps_score;
    const result = validatePortfolio([r]);
    expect(result.customers).toHaveLength(1);
    expect(result.issues.some((i) => i.column === 'nps_score' && i.level === 'warning')).toBe(true);
  });

  // The bug this whole layer exists to prevent: a value the schema has never
  // seen must never inherit the healthiest score by falling through a `?? 0`.
  it('warns on an unrecognised enum value instead of silently defaulting', () => {
    const result = validatePortfolio([row({ invoice_status: 'Partially paid' })]);
    expect(result.customers).toHaveLength(1);
    const issue = result.issues.find((i) => i.column === 'invoice_status');
    expect(issue?.level).toBe('warning');
    expect(issue?.message).toContain('not a recognised value');
    expect(result.customers[0].invoiceStatus).not.toBe('Current');
  });

  it('quarantines a row with an unparseable date rather than failing the file', () => {
    const result = validatePortfolio([row(), row({ customer_id: 'CUST-9002', renewal_date: '01/09/2026' })]);
    expect(result.customers).toHaveLength(1);
    expect(result.quarantined).toBe(1);
  });

  it('quarantines a row whose required number is not numeric', () => {
    const result = validatePortfolio([row(), row({ customer_id: 'CUST-9002', arr_gbp: 'n/a' })]);
    expect(result.quarantined).toBe(1);
  });

  it('drops a duplicate customer id and reports it', () => {
    const result = validatePortfolio([row(), row()]);
    expect(result.customers).toHaveLength(1);
    expect(result.issues.some((i) => i.message.includes('Duplicate'))).toBe(true);
  });

  it('warns when active users exceed purchased seats', () => {
    const result = validatePortfolio([row({ active_users_30d: '150', seats_purchased: '100' })]);
    expect(result.issues.some((i) => i.column === 'active_users_30d')).toBe(true);
  });

  it('throws when every row fails', () => {
    expect(() => validatePortfolio([row({ arr_gbp: 'x' }), row({ customer_id: 'C2', arr_gbp: 'y' })])).toThrow(
      SchemaError,
    );
  });

  it('defaults optional descriptive fields rather than quarantining', () => {
    const result = validatePortfolio([row({ region: '', industry: '', csm_name: '' })]);
    expect(result.customers[0].region).toBe('Unknown');
    expect(result.customers[0].csmName).toBe('Unassigned');
  });
});
