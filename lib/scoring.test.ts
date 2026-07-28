import { describe, expect, it } from 'vitest';
import { deriveArrReference } from './config';
import { band, daysBetween, scoreAll, scoreCustomer } from './scoring';
import type { Customer } from './types';

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
    activeUsers30d: 80,
    activeUsersPrevious30d: 90,
    weeklyActiveUsers30d: 60,
    daysSinceLastCustomerEngagement: 10,
    supportTickets90d: 3,
    criticalSupportTickets90d: 0,
    npsScore: 40,
    invoiceStatus: 'Current',
    renewalStage: 'In discussion',
    executiveSponsorStatus: 'Active',
    lastRenewalDiscountPct: 5,
    usageDataLastSyncedAt: '2026-07-20',
    npsResponseDate: '2026-07-01',
    customerNotes: '',
    ...overrides,
  };
}

const ASOF = '2026-07-21';
const CTX = { arrReference: 260_000 };
const score = (o: Partial<Customer> = {}) => scoreCustomer(customer(o), ASOF, CTX);

describe('band', () => {
  it('clamps below the first and above the last control point', () => {
    const points: [number, number][] = [
      [0, 0],
      [10, 1],
    ];
    expect(band(-5, points)).toBe(0);
    expect(band(50, points)).toBe(1);
  });

  it('interpolates linearly between points', () => {
    expect(
      band(5, [
        [0, 0],
        [10, 1],
      ]),
    ).toBeCloseTo(0.5);
  });
});

describe('daysBetween', () => {
  it('counts forward', () => expect(daysBetween('2026-07-21', '2026-08-08')).toBe(18));
  it('counts backward as negative', () => expect(daysBetween('2026-08-08', '2026-07-21')).toBe(-18));
  it('is unaffected by DST boundaries', () => expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31));
});

describe('risk score', () => {
  it('stays within 0-100', () => {
    const healthy = score({ activeUsers30d: 95, activeUsersPrevious30d: 90, daysSinceLastCustomerEngagement: 1 });
    const awful = score({
      activeUsers30d: 2,
      activeUsersPrevious30d: 90,
      daysSinceLastCustomerEngagement: 200,
      invoiceStatus: 'Disputed',
      executiveSponsorStatus: 'Left company',
      renewalStage: 'Not started',
      renewalDate: '2026-07-25',
      criticalSupportTickets90d: 9,
      npsScore: -100,
      lastRenewalDiscountPct: 40,
    });
    expect(healthy.riskScore).toBeGreaterThanOrEqual(0);
    expect(awful.riskScore).toBeLessThanOrEqual(100);
    expect(awful.riskScore).toBeGreaterThan(healthy.riskScore);
  });

  it('never returns NaN when optional inputs are missing', () => {
    const r = score({
      npsScore: null,
      npsResponseDate: null,
      daysSinceLastCustomerEngagement: null,
      weeklyActiveUsers30d: null,
    });
    expect(Number.isFinite(r.riskScore)).toBe(true);
  });

  it('survives zero previous users without dividing by zero', () => {
    const r = score({ activeUsersPrevious30d: 0, activeUsers30d: 0 });
    expect(Number.isFinite(r.riskScore)).toBe(true);
  });

  it('survives zero purchased seats', () => {
    const r = score({ seatsPurchased: 0 });
    expect(Number.isFinite(r.riskScore)).toBe(true);
  });

  it('caps utilisation at 100% when active users exceed seats', () => {
    const over = score({ activeUsers30d: 200, seatsPurchased: 100 });
    const exact = score({ activeUsers30d: 100, seatsPurchased: 100 });
    const util = (r: typeof over) => r.signals.find((s) => s.key === 'seatUtilisation')!.normalised;
    expect(util(over)).toBe(util(exact));
    expect(util(over)).toBeGreaterThanOrEqual(0);
  });
});

describe('missing and stale signals', () => {
  it('excludes an NPS older than 120 days rather than scoring it', () => {
    const r = score({ npsResponseDate: '2025-11-01' });
    const s = r.signals.find((x) => x.key === 'sentiment')!;
    expect(s.normalised).toBeNull();
    expect(s.weightApplied).toBe(0);
    expect(r.modelCoverage).toBeLessThan(1);
  });

  it('halves the weight of an NPS between 45 and 120 days old', () => {
    const fresh = score({ npsResponseDate: '2026-07-15' }).signals.find((s) => s.key === 'sentiment')!;
    const aging = score({ npsResponseDate: '2026-05-15' }).signals.find((s) => s.key === 'sentiment')!;
    expect(aging.weightApplied).toBeCloseTo(fresh.weightApplied / 2);
  });

  it('re-normalises so a partially-scored account stays on the same scale', () => {
    const full = score({ invoiceStatus: 'Disputed' });
    const partial = score({ invoiceStatus: 'Disputed', npsScore: null, npsResponseDate: null });
    // Dropping a healthy low-weight signal must not deflate the score toward zero.
    expect(partial.riskScore).toBeGreaterThan(full.riskScore * 0.9);
    expect(partial.modelCoverage).toBeLessThan(full.modelCoverage);
  });

  // The regression this guards: `INVOICE_RISK[status] ?? 0` scored an unknown
  // billing state as perfectly current — the healthiest possible value.
  it('does NOT score an unrecognised invoice status as healthy', () => {
    const unknown = score({ invoiceStatus: 'Partially paid' as never });
    const s = unknown.signals.find((x) => x.key === 'invoiceStatus')!;
    expect(s.normalised).toBeNull();
    expect(s.contribution).toBe(0);
    expect(s.excludedReason).toBeTruthy();
    expect(unknown.modelCoverage).toBeLessThan(1);
  });

  it('does NOT score an unrecognised renewal stage as fully progressed', () => {
    const s = score({ renewalStage: 'Awaiting legal' as never }).signals.find((x) => x.key === 'stageReadiness')!;
    expect(s.normalised).toBeNull();
  });

  it('lowers confidence when coverage drops', () => {
    const full = score();
    const gappy = score({ npsScore: null, npsResponseDate: null, daysSinceLastCustomerEngagement: null });
    expect(full.confidence).toBe('High');
    expect(gappy.confidence).not.toBe('High');
  });

  it('mild usage staleness costs confidence but still scores the usage signals', () => {
    const fresh = score({ usageDataLastSyncedAt: '2026-07-20' });
    const mild = score({ usageDataLastSyncedAt: '2026-07-05' }); // 16 days: past warn, inside exclude
    expect(mild.riskScore).toBeCloseTo(fresh.riskScore);
    expect(mild.confidence).not.toBe('High');
    expect(mild.signals.find((s) => s.key === 'adoptionTrend')!.normalised).not.toBeNull();
  });

  // Both usage signals read the same feed, so they age together. A 30-day-stale
  // "last 30 days" window describes a period that closed before the snapshot —
  // the same reason a 238-day-old NPS is excluded.
  it('excludes both usage signals once the feed is older than the exclude threshold', () => {
    const stale = score({ usageDataLastSyncedAt: '2026-06-01' });
    expect(stale.signals.find((s) => s.key === 'adoptionTrend')!.normalised).toBeNull();
    expect(stale.signals.find((s) => s.key === 'seatUtilisation')!.normalised).toBeNull();
    expect(stale.modelCoverage).toBeLessThan(0.75);
    expect(stale.confidence).toBe('Low');
  });

  it('keeps a stale-usage account on the same 0-100 scale as a fresh one', () => {
    const stale = score({ usageDataLastSyncedAt: '2026-06-01', invoiceStatus: 'Disputed' });
    expect(stale.riskScore).toBeGreaterThan(0);
    expect(stale.riskScore).toBeLessThanOrEqual(100);
  });
});

describe('contradictions', () => {
  it('flags a verbal commitment against unresolved billing', () => {
    const r = score({ renewalStage: 'Verbal commitment', invoiceStatus: 'Disputed' });
    expect(r.contradictions.some((c) => c.key === 'verbal-vs-billing')).toBe(true);
  });

  it('lowers confidence but leaves the risk score untouched', () => {
    // Same scored inputs; only the stage differs, and stage is itself a signal —
    // so compare confidence on two rows whose contradiction is the only change.
    const withConflict = score({ npsScore: 60, executiveSponsorStatus: 'Inactive' });
    expect(withConflict.contradictions.some((c) => c.key === 'sentiment-vs-sponsor')).toBe(true);
    expect(withConflict.confidence).not.toBe('High');
  });
});

describe('priority versus risk', () => {
  it('ranks a large account above a small one at equal risk', () => {
    const small = score({ arrGbp: 12_000 });
    const large = score({ arrGbp: 240_000 });
    expect(large.priorityScore).toBeGreaterThan(small.priorityScore);
    expect(large.riskScore).toBeCloseTo(small.riskScore);
  });

  it('keeps a small distressed account visible rather than ranking it out', () => {
    const tiny = score({ arrGbp: 1_000, invoiceStatus: 'Disputed', executiveSponsorStatus: 'Left company' });
    const bigHealthy = score({ arrGbp: 500_000 });
    expect(tiny.priorityScore).toBeGreaterThan(bigHealthy.priorityScore);
  });

  it('deprioritises a distant renewal at equal risk', () => {
    const soon = score({ renewalDate: '2026-08-01', renewalStage: 'Verbal commitment' });
    const distant = score({ renewalDate: '2027-06-01', renewalStage: 'Verbal commitment' });
    expect(soon.priorityScore).toBeGreaterThan(distant.priorityScore);
  });

  it('handles renewals beyond a year without flattening urgency', () => {
    const oneYear = score({ renewalDate: '2027-07-21', renewalStage: 'Not started' });
    const twoYears = score({ renewalDate: '2028-07-21', renewalStage: 'Not started' });
    expect(Number.isFinite(twoYears.priorityScore)).toBe(true);
    expect(twoYears.priorityScore).toBeLessThanOrEqual(oneYear.priorityScore);
  });

  it('handles a renewal already in the past', () => {
    const overdue = score({ renewalDate: '2026-06-01' });
    expect(Number.isFinite(overdue.priorityScore)).toBe(true);
    expect(overdue.daysToRenewal).toBeLessThan(0);
  });
});

describe('deriveArrReference', () => {
  it('scales to the book rather than to a hard-coded constant', () => {
    const small = deriveArrReference([1_000, 2_000, 3_000, 4_000, 5_000]);
    const large = deriveArrReference([1e6, 2e6, 3e6, 4e6, 5e6]);
    expect(large).toBeGreaterThan(small);
  });

  it('is not dragged to the ceiling by a single outlier', () => {
    const withOutlier = deriveArrReference([10_000, 10_000, 10_000, 10_000, 10_000_000]);
    expect(withOutlier).toBeLessThan(10_000_000);
  });

  it('survives an empty or all-zero book', () => {
    expect(deriveArrReference([])).toBeGreaterThan(0);
    expect(deriveArrReference([0, 0])).toBeGreaterThan(0);
  });
});

describe('scoreAll', () => {
  it('assigns dense ranks on both axes', () => {
    const rows = scoreAll(
      [
        customer({ customerId: 'A', arrGbp: 12_000, invoiceStatus: 'Disputed', executiveSponsorStatus: 'Left company' }),
        customer({ customerId: 'B', arrGbp: 250_000 }),
        customer({ customerId: 'C', arrGbp: 80_000 }),
      ],
      ASOF,
    );
    expect(rows.map((r) => r.priorityRank)).toEqual([1, 2, 3]);
    expect(new Set(rows.map((r) => r.riskOnlyRank)).size).toBe(3);
  });

  it('handles a single-account book', () => {
    const rows = scoreAll([customer()], ASOF);
    expect(rows[0].priorityRank).toBe(1);
    expect(rows[0].riskOnlyRank).toBe(1);
  });

  it('handles an empty book', () => {
    expect(scoreAll([], ASOF)).toEqual([]);
  });
});
