import { describe, expect, it } from 'vitest';
import { scoreCustomer } from './scoring';
import { buildSecondReadPrompt, splitClauses, validateSecondRead, deriveDirection } from './secondRead';
import type { Customer, ScoredCustomer } from './types';

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    customerId: 'CUST-9001',
    customerName: 'Test Account',
    segment: 'Enterprise',
    region: 'UK & Ireland',
    industry: 'Software',
    csmName: 'A Person',
    renewalDate: '2026-09-01',
    arrGbp: 100_000,
    contractTermMonths: 12,
    productsOwned: ['Workflow Pro'],
    seatsPurchased: 100,
    activeUsers30d: 60,
    activeUsersPrevious30d: 90,
    weeklyActiveUsers30d: 40,
    daysSinceLastCustomerEngagement: 40,
    supportTickets90d: 3,
    criticalSupportTickets90d: 0,
    npsScore: 20,
    invoiceStatus: 'Current',
    renewalStage: 'In discussion',
    executiveSponsorStatus: 'Active',
    lastRenewalDiscountPct: 5,
    usageDataLastSyncedAt: '2026-07-20',
    npsResponseDate: '2026-07-01',
    customerNotes: 'Funding is approved and procurement is active; the sponsor moves roles on 1 August and no replacement is recorded',
    ...overrides,
  };
}

const ASOF = '2026-07-21';
const scored = (o: Partial<Customer> = {}): ScoredCustomer =>
  ({ ...scoreCustomer(customer(o), ASOF, { arrReference: 260_000 }), priorityRank: 1, riskOnlyRank: 1 }) as ScoredCustomer;

describe('splitClauses', () => {
  it('splits on semicolons and sentence ends', () => {
    expect(splitClauses('One thing happened; another thing did too. A third.')).toEqual([
      'One thing happened',
      'another thing did too.',
      'A third.',
    ]);
  });

  it('returns an empty list for an empty note', () => {
    expect(splitClauses('')).toEqual([]);
    expect(splitClauses('   ')).toEqual([]);
  });

  it('is stable — the same note always yields the same indices', () => {
    const note = 'Alpha happened; beta did not. Gamma is pending.';
    expect(splitClauses(note)).toEqual(splitClauses(note));
  });
});

describe('the prompt', () => {
  it('numbers clauses from 1, because that is how a model counts', () => {
    const p = buildSecondReadPrompt(scored());
    expect(p).toContain('[1]');
    expect(p).toContain('[2]');
    expect(p).not.toContain('[0]');
  });

  // Independence: if the model knew the account scored 15/100 it would reason
  // toward that number instead of reading the note.
  it('never puts the score, band or rank in front of the model', () => {
    const row = scored();
    const p = buildSecondReadPrompt(row);
    expect(p).not.toContain(row.riskScore.toFixed(0));
    expect(p.toLowerCase()).not.toContain('risk score');
    expect(p.toLowerCase()).not.toContain('priority rank');
    expect(p).not.toContain(row.riskBand);
  });

  it('lists the signals that fired so the model can tell new from known', () => {
    expect(buildSecondReadPrompt(scored())).toContain('SIGNALS THE SCORING MODEL ALREADY COUNTED');
  });
});

describe('validateSecondRead', () => {
  const row = scored();

  it('renders the quote from the index, so a quote cannot be fabricated', () => {
    const out = validateSecondRead(row, {
      addsRiskBeyondSignals: true,
      findings: [{ clauseIndex: 2, signalKey: null, whatItMeans: 'The sponsor is leaving.' }],
    });
    const clauses = splitClauses(row.customer.customerNotes);
    expect(out.findings[0].quote).toBe(clauses[1]);
    expect(row.customer.customerNotes).toContain(out.findings[0].quote);
  });

  it('drops a finding citing a clause that does not exist', () => {
    const out = validateSecondRead(row, {
      addsRiskBeyondSignals: true,
      findings: [{ clauseIndex: 99, signalKey: null, whatItMeans: 'Invented.' }],
    });
    expect(out.findings).toHaveLength(0);
    expect(out.dropped.join(' ')).toContain('does not exist');
  });

  it('drops a finding with no explanation', () => {
    const out = validateSecondRead(row, {
      addsRiskBeyondSignals: true,
      findings: [{ clauseIndex: 1, signalKey: null, whatItMeans: '  ' }],
    });
    expect(out.findings).toHaveLength(0);
  });

  // The firing-signal gate: you cannot contest a signal that scored nothing.
  it('drops an attribution to a signal that did not fire, and keeps the finding', () => {
    const out = validateSecondRead(row, {
      addsRiskBeyondSignals: true,
      findings: [{ clauseIndex: 1, signalKey: 'invoiceStatus', whatItMeans: 'Something.' }],
    });
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].signalKey).toBeNull();
    expect(out.dropped.join(' ')).toContain('did not contribute');
  });




  // Nineteen of forty-two rejections in the first full batch were this: clauses
  // were numbered from 0 in the prompt and the model answered 1 for the first one.
  it('accepts 1-based clause numbers, which is how the prompt presents them', () => {
    const clauses = splitClauses(row.customer.customerNotes);
    const out = validateSecondRead(row, {
      addsRiskBeyondSignals: true,
      findings: [{ clauseIndex: 1, signalKey: null, whatItMeans: 'First clause.' }],
    });
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].quote).toBe(clauses[0]);
    expect(out.dropped).toHaveLength(0);
  });

  it('rejects clause 0, which no longer exists in a 1-based scheme', () => {
    const out = validateSecondRead(row, {
      addsRiskBeyondSignals: true,
      findings: [{ clauseIndex: 0, signalKey: null, whatItMeans: 'Off the start.' }],
    });
    expect(out.findings).toHaveLength(0);
  });

  it('never throws on malformed model output', () => {
    expect(() => validateSecondRead(row, {} as never)).not.toThrow();
    expect(() => validateSecondRead(row, { findings: null } as never)).not.toThrow();
    expect(() => validateSecondRead(row, { findings: [{}] } as never)).not.toThrow();
  });

  it('defaults to adds-nothing when the model says nothing', () => {
    expect(validateSecondRead(row, {}).direction).toBe('adds-nothing');
  });
});

describe('deriveDirection', () => {
  it('is computed in code, with risk taking precedence', () => {
    expect(deriveDirection(true, true, true)).toBe('adds-risk');
    expect(deriveDirection(false, true, true)).toBe('explains-a-weak-signal');
    expect(deriveDirection(false, false, true)).toBe('adds-opportunity');
    expect(deriveDirection(false, false, false)).toBe('adds-nothing');
  });
});
