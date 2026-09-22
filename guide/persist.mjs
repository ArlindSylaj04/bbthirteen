import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { ANN, FILE, BROWSER } from './lib.mjs';
const b = await chromium.launch({ executablePath: BROWSER });
const ctx = await b.newContext({ viewport:{width:1680,height:1050} });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('P: '+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('C: '+m.text());});
await p.addInitScript(ANN);
await p.goto(FILE,{waitUntil:'load'});
await p.evaluate(()=>sessionStorage.setItem('qa-session',JSON.stringify({name:'Arlind Sylaj',role:'admin',ts:Date.now()})));
await p.reload({waitUntil:'load'}); await p.waitForTimeout(2200);

await (await p.$('label:has-text("Import XLS / CSV") input[type=file]')).setInputFiles('data/qtest_export_26.03.00.csv');
await p.waitForTimeout(6000);
const after = await p.evaluate(()=>document.body.innerText);
console.log('1. after import — header says:', (after.match(/\d+ tests[^\n]*/)||['(none)'])[0].slice(0,80));
console.log('   planned/passed:', (after.match(/(\d+)\s*\nPLANNED/)||['?'])[0].replace(/\n/g,' '), '|', (after.match(/(\d+)\s*\nPASSED/)||['?'])[0].replace(/\n/g,' '));

const store = await p.evaluate(()=>{
  const out={}; let total=0;
  for (let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); const v=localStorage.getItem(k)||''; out[k]=v.length; total+=k.length+v.length; }
  return { keys: Object.entries(out).sort((a,b)=>b[1]-a[1]).slice(0,8), total, n: localStorage.length };
});
console.log('2. localStorage: ', store.n, 'keys,', (store.total/1048576).toFixed(2), 'MB total');
console.log('   biggest:', store.keys.map(([k,v])=>k+'='+(v/1024).toFixed(0)+'KB').join('  '));

// simulate closing and reopening the file
await p.goto('about:blank'); await p.waitForTimeout(400);
await p.goto(FILE,{waitUntil:'load'}); await p.waitForTimeout(3000);
const re = await p.evaluate(()=>document.body.innerText);
console.log('3. AFTER REOPEN — planned:', (re.match(/(\d+|—)\s*\nPLANNED/)||['?'])[0].replace(/\n/g,' '),
            '| qTest chip:', (re.match(/qTest\s+(not yet|[^\n·]*)/)||['?'])[0].slice(0,34));
console.log('   "No data imported yet" shown:', /No data imported yet/.test(re));
console.log('4. warning shown:', /Storage full/.test(re), '|', (re.match(/\u26a0 Storage full[^\n]*/)||[''])[0]);
console.log('errors:', errs.length?errs.slice(0,3):'none');
await b.close();
