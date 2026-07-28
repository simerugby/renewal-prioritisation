import { parseCsv } from '../lib/csv';

console.log('case1 header-with-space:', JSON.stringify(parseCsv(' ,#\n#')));
console.log('case1b trailing commas :', JSON.stringify(parseCsv('id,name,,\n1,bob,x,y')));
console.log('case2 quoted-empty row :', JSON.stringify(parseCsv('a\n""')));

const samples = ['\uD800', 'a\n\uD800', '\uDFFF', 'a,b\n\uD800,\uDC00', '\0', 'a\n\0', '\uD800\uD800'];
for (const s of samples) {
  try {
    parseCsv(s);
    console.log('ok   :', JSON.stringify(s));
  } catch (e) {
    console.log('THROW:', JSON.stringify(s), '->', (e as Error).message);
  }
}
