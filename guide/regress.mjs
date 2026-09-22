import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { ANN, FILE, BROWSER } from './lib.mjs';
import fs from 'node:fs';
const OUT='/tmp/claude-0/-home-user-bbthirteen/01499b56-4d01-583a-b2d4-becbe79985be/scratchpad/dl2';
fs.mkdirSync(OUT,{recursive:true});
const b = await chromium.launch({ executablePath: BROWSER });
const ctx = await b.newContext({ viewport:{width:1680,height:1050}, acceptDownloads:true });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('P: '+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('C: '+m.text());});
await p.addInitScript(ANN);
const closeTop = async () => { await p.evaluate(()=>{const ovs=[...document.querySelectorAll('div')].filter(d=>{const s=getComputedStyle(d);return s.position==='fixed'&&parseInt(s.zIndex||0)>=1000&&d.getBoundingClientRect().width>400;});const t=ovs[ovs.length-1];if(!t)return;const x=[...t.querySelectorAll('button')].find(b=>/^[×✕x]$/i.test((b.textContent||'').trim()));if(x)x.click();else t.click();}); await p.waitForTimeout(900); };

await p.goto(FILE,{waitUntil:'load'});
await p.evaluate(()=>sessionStorage.setItem('qa-session',JSON.stringify({name:'Arlind Sylaj',role:'admin',ts:Date.now()})));
await p.reload({waitUntil:'load'}); await p.waitForTimeout(2200);
await (await p.$('label:has-text("Import XLS / CSV") input[type=file]')).setInputFiles('data/qtest_export_26.03.00.csv');
await p.waitForTimeout(2600);
await (await p.$('label:has-text("Import Jira CSV") input[type=file]')).setInputFiles('data/jira_carryover_26.03.00.csv');
await p.waitForTimeout(2200);
console.log('1. imports ok');

// modal sweep
for (const t of ['Layout','Users','Top Bugs','Manage Releases','Go / No-Go','History']) {
  const ok = await p.evaluate(x=>{const b=[...document.querySelectorAll('button,label,div')].find(e=>(e.textContent||'').trim().includes(x)&&e.getBoundingClientRect().width>0); if(b){b.click(); return true;} return false;}, t);
  await p.waitForTimeout(1100);
  console.log('   modal:', t, ok?'opened':'(skip)');
  await closeTop();
}
// defect course / aging should now have real dates
const txt = await p.evaluate(()=>document.body.innerText);
console.log('2. defect course:', (txt.match(/Created vs\. resolved per day[^\n]*/)||['(none)'])[0]);
console.log('3. created/resolved:', (txt.match(/Created\s*\n?\s*\d+/)||['?'])[0].replace(/\n/g,' '), '|', (txt.match(/Resolved\s*\n?\s*\d+/)||['?'])[0].replace(/\n/g,' '));

// exports
await p.evaluate(()=>window.scrollTo(0,0));
await p.waitForTimeout(500);
const opened = await p.evaluate(()=>{ const e=[...document.querySelectorAll('div')].find(d=>/CARRY.OVER/i.test(d.textContent||'')&&d.textContent.length<300); if(e){e.click(); return 'carry';}
  const t=[...document.querySelectorAll('div')].find(d=>(d.textContent||'').trim()==='OPEN'); if(t&&t.parentElement){t.parentElement.click(); return 'open';} return 'none';});
console.log('   workspace via:', opened);
await p.waitForTimeout(1400);
const btns = await p.$$eval('button', ns=>ns.map(n=>n.textContent.trim()).filter(t=>/^(Excel|PowerPoint|CSV)$/.test(t)));
console.log('4. export buttons:', btns);
for (const n of btns) { const [dl]=await Promise.all([p.waitForEvent('download',{timeout:25000}), p.click(`button:text-is("${n}")`)]);
  const f=OUT+'/'+dl.suggestedFilename(); await dl.saveAs(f); console.log('   ',n,'->',fs.statSync(f).size,'bytes'); }
console.log('errors:', errs.length?errs:'none');
await b.close();
