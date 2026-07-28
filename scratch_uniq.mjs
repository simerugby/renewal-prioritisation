import fs from 'fs';
const R=fs.readFileSync('README.md','utf8'), E=fs.readFileSync('EVIDENCE.md','utf8');
const checks=[
['R','| Detected the risk in the note | supplied notes | same facts, reworded | a book never seen |'],
['R','Both usage signals are excluded, it is scored on **51% of the model**, and the app says so'],
['R','A single blended health score sends the CSM to Oakwell. So the app computes two axes and never merges'],
['R','| **Two axes, never blended** |'],
['R','| **The triage list stays deterministic** |'],
['R','and Oakwell Design (£12k, the most distressed account in the book).'],
['R','- **Whether a decline is real.** Everfield'],
['R','verify` now prints those six, and one was wrong'],
['R','## Setup'],
['R','| Accounts with no NPS at all | 3 |'],
['R','## What could change these decisions'],
['R','looks, and stating it precisely matters more here than anywhere else in this document.'],
['R','---\n\n## Stack\n\nNext.js 16'],
['R','- **What counts as engagement.**'],
['E','**The data source is swappable.** `PortfolioSource` in `lib/data.ts` is a two-method interface.'],
['E',"**Nothing is tuned to this file's contents.** The scoring engine"],
['E','**`weekly_active_users_30d` — excluded for lack of variance and collinearity.**'],
['E','Every figure reproduces from a command, except two recall figures flagged where they appear.'],
['E','It also promotes Sterling Aviation #14 → #7 and Quantum Public Sector #15 → #8, both of which the'],
['E','Every number in the README and in this file is printed by one of the commands above, with two'],
['E','The file has 25 columns. Nine are scored'],
['E','`npm run check` runs typecheck, lint, tests and the verification harness together.'],
];
for(const [f,s] of checks){const t=f==='R'?R:E;const n=t.split(s).length-1;console.log((n===1?'OK   ':'!! '+n+' '), f, JSON.stringify(s.slice(0,72)));}
