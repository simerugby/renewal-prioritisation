import fs from 'fs';
const R=fs.readFileSync('README.md','utf8');
const start=R.indexOf('## Setup');
const end=R.indexOf('## Who I would prioritise first');
console.log(JSON.stringify(R.slice(start,end)));
