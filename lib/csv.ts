/**
 * A small RFC-4180 CSV parser.
 *
 * Deliberately not a dependency: the file is 40 rows of known shape, and a
 * parser is 40 lines. It handles quoted fields and embedded commas/newlines
 * because the notes column is free text and will eventually contain both — the
 * supplied file happens not to, and relying on that is how a data refresh
 * breaks the app silently.
 */
export interface CsvParseResult {
  rows: Record<string, string>[];
  /**
   * 1-based data-row numbers that produced more cells than the header has
   * columns. Almost always an unquoted delimiter inside a free-text field — the
   * classic "notes column ate the row" export bug. The surplus cells are
   * dropped, so without this the truncation is completely silent.
   */
  raggedRows: number[];
}

export function parseCsv(text: string): Record<string, string>[] {
  return parseCsvDetailed(text).rows;
}

export function parseCsvDetailed(text: string): CsvParseResult {
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

  // A row of nothing but empty cells carries no account and is dropped. The
  // schema layer would quarantine it anyway; dropping it here keeps blank
  // trailing lines from being reported as validation failures.
  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  if (nonEmpty.length < 2) return { rows: [], raggedRows: [] };

  const rawHeader = nonEmpty[0].map((h) => h.trim());

  /*
   * Map column INDEX to key, rather than assigning by name in a loop.
   *
   * Found by property testing, and it was silent data loss: `id,name,,` — a
   * trailing comma, which Excel writes constantly — produced two columns both
   * named "". Assigning by name meant the second overwrote the first, so
   * `1,bob,x,y` parsed to `{id:"1", name:"bob", "":"y"}` and the value "x"
   * vanished with no error anywhere.
   *
   * Unnamed columns are dropped: a column with no header has no meaning to a
   * schema that reads by name. A repeated header keeps its FIRST occurrence, so
   * behaviour is deterministic rather than last-write-wins.
   */
  const columns: { index: number; key: string }[] = [];
  const seen = new Set<string>();
  rawHeader.forEach((key, index) => {
    if (key === '' || seen.has(key)) return;
    seen.add(key);
    columns.push({ index, key });
  });

  const raggedRows: number[] = [];
  const parsed = nonEmpty.slice(1).map((cells, i) => {
    if (cells.length > rawHeader.length) raggedRows.push(i + 1);
    const rec: Record<string, string> = {};
    for (const { index, key } of columns) {
      rec[key] = (cells[index] ?? '').trim();
    }
    return rec;
  });

  return { rows: parsed, raggedRows };
}
