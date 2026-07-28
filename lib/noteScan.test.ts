import { describe, expect, it } from 'vitest';
import { scanNotes } from './noteScan';

const keys = (note: string) => scanNotes(note).map((f) => f.key);

/**
 * FALSE POSITIVES ARE THE DANGEROUS FAILURE.
 *
 * A missed flag costs a flag. A wrong flag puts a confident, false statement in
 * front of a CSM and can fire a playbook rule. Each case below is a sentence
 * that an earlier version of these patterns matched incorrectly — usually
 * because a stem or a negation was left unanchored and the meaning could
 * reverse under it.
 */
describe('note scanner — false positives', () => {
  it('does not read a trial ending as a contract exit', () => {
    expect(keys('We will terminate the trial period at the end of the month.')).not.toContain('exit-signal');
  });

  it('does not read destroyed draft copies as unsigned paperwork', () => {
    expect(keys('The contract is signed; the unsigned draft copies were destroyed.')).not.toContain('paperwork-stuck');
  });

  it('does not read "the decline has not started" as a blocker', () => {
    expect(keys('The seasonal decline has not started yet, so usage is still strong.')).not.toContain(
      'ownerless-blocker',
    );
  });

  it('does not read churn above target as an expansion opportunity', () => {
    expect(keys('Churn in this segment is above target this quarter.')).not.toContain('expansion');
  });

  it('does not flag an ordinary healthy note at all', () => {
    expect(keys('Quarterly business review went well and the sponsor is engaged.')).toEqual([]);
  });

  it('does not flag an empty or whitespace note', () => {
    expect(keys('')).toEqual([]);
    expect(keys('   ')).toEqual([]);
  });
});

describe('note scanner — true positives it must not lose', () => {
  it('catches a cancellation clause', () => {
    expect(keys('The customer has paused 2 locations and requested a cancellation clause')).toContain('exit-signal');
  });

  it('catches a departing sponsor', () => {
    expect(
      keys('Funding is approved; the original sponsor moves roles on 1 August and no replacement is recorded'),
    ).toContain('sponsor-loss');
  });

  it('catches an unsigned order form', () => {
    expect(keys('Finance disputes a professional-services charge and the order form is unsigned')).toContain(
      'paperwork-stuck',
    );
  });

  it('catches a missing purchase order', () => {
    expect(keys('The final PO has not arrived and the buyer has not replied for 9 days')).toContain('paperwork-stuck');
  });

  it('catches a competing evaluation', () => {
    expect(keys('A competing workflow tool is being trialled by the finance team')).toContain('competitive-threat');
  });

  it('catches a review that has genuinely not started', () => {
    expect(keys('Data-protection review for the added cohort has not started')).toContain('ownerless-blocker');
  });
});

describe('note scanner — evidence', () => {
  it('quotes the sentence that triggered the flag, never a paraphrase', () => {
    const note = 'Usage is stable across teams. The customer has requested a cancellation clause. Renewal is in July.';
    const flag = scanNotes(note).find((f) => f.key === 'exit-signal')!;
    expect(flag.quote).toContain('cancellation clause');
    expect(flag.quote).not.toContain('Usage is stable');
  });
});
