import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('parses a simple file', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([{ a: '1', b: '2' }]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([{ a: '1', b: '2' }]);
  });

  it('handles a missing trailing newline', () => {
    expect(parseCsv('a,b\n1,2')).toHaveLength(1);
  });

  // The supplied notes contain no commas. Relying on that is how a data refresh
  // silently shifts every column right.
  it('keeps commas inside quoted fields', () => {
    const rows = parseCsv('id,note\n1,"Sponsor left, no replacement"');
    expect(rows[0].note).toBe('Sponsor left, no replacement');
    expect(Object.keys(rows[0])).toHaveLength(2);
  });

  it('handles escaped quotes inside quoted fields', () => {
    const rows = parseCsv('id,note\n1,"They said ""no"" twice"');
    expect(rows[0].note).toBe('They said "no" twice');
  });

  it('handles newlines inside quoted fields', () => {
    const rows = parseCsv('id,note\n1,"line one\nline two"');
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toBe('line one\nline two');
  });

  it('trims whitespace around values', () => {
    expect(parseCsv('a,b\n  1 , 2 ')[0]).toEqual({ a: '1', b: '2' });
  });

  it('pads short rows rather than throwing', () => {
    expect(parseCsv('a,b,c\n1,2')[0]).toEqual({ a: '1', b: '2', c: '' });
  });

  it('skips blank lines', () => {
    expect(parseCsv('a,b\n1,2\n\n3,4\n')).toHaveLength(2);
  });

  it('returns an empty array for a header-only file', () => {
    expect(parseCsv('a,b\n')).toEqual([]);
  });

  it('returns an empty array for an empty file', () => {
    expect(parseCsv('')).toEqual([]);
  });
});
