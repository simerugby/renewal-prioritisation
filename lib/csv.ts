/**
 * A small RFC-4180 CSV parser.
 *
 * Deliberately not a dependency: the file is 40 rows of known shape, and a
 * parser is 40 lines. It handles quoted fields and embedded commas/newlines
 * because the notes column is free text and will eventually contain both — the
 * supplied file happens not to, and relying on that is how a data refresh
 * breaks the app silently.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  // Strip a UTF-8 byte order mark. Excel writes one by default, and without this
  // the first header becomes "﻿customer_id", which does not match
  // "customer_id" — so the single most common real-world export would fail
  // validation on its most important column.
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  // Normalise line endings so a CRLF file from Windows parses identically.
  const src = withoutBom.replace(/\r\n?/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];

    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }

  // Trailing field/row when the file does not end in a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  if (nonEmpty.length < 2) return [];

  const header = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((cells) => {
    const rec: Record<string, string> = {};
    header.forEach((h, idx) => {
      rec[h] = (cells[idx] ?? '').trim();
    });
    return rec;
  });
}
