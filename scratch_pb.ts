import { loadPortfolio } from './lib/data';
(async () => {
  const p = await loadPortfolio();
  const rows = [...p.rows].sort((a,b)=>b.priorityScore-a.priorityScore);
  rows.slice(0,15).forEach((r,i)=>{
    console.log(`${i+1}\t${r.customer.customerName}\t${r.customer.csmName}\t${r.playbook.urgency}\t${r.playbook.action}`);
  });
  const counts: Record<string,number> = {};
  rows.forEach(r=>{counts[r.playbook.action]=(counts[r.playbook.action]||0)+1;});
  console.log('---'); console.log(counts);
  const byCsm: Record<string,number[]> = {};
  rows.forEach((r,i)=>{(byCsm[r.customer.csmName] ||= []).push(i+1);});
  console.log('---'); console.log(byCsm);
})();
