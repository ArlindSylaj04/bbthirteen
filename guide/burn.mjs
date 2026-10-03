// The burn-down button on an environment row opens that one environment's chart
// in its own card under the list, and closes again on a second click.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { ANN, FILE, BROWSER, importQtest } from './lib.mjs';
const b = await chromium.launch({ executablePath: BROWSER });
const p = await (await b.newContext({ viewport:{width:1680,height:1100}, deviceScaleFactor:2 })).newPage();
const errs=[]; p.on('pageerror',e=>errs.push('P: '+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('C: '+m.text());});
await p.addInitScript(ANN);
await p.goto(FILE,{waitUntil:'load'});
await p.evaluate(()=>sessionStorage.setItem('qa-session',JSON.stringify({name:'Arlind Sylaj',role:'admin',ts:Date.now()})));
await p.reload({waitUntil:'load'}); await p.waitForTimeout(2600);
await importQtest(p,'data/qtest_export_26.03.00.csv',6500);

const card = () => p.evaluate(()=>{const c=document.getElementById('burn-card');
  if(!c) return null; const t=(c.innerText||'').replace(/\s+/g,' ');
  return { title:(t.match(/Burn-down · \w+/)||[''])[0], h:Math.round(c.getBoundingClientRect().height),
           verdict:(t.match(/(Window closed[^.]*\.|All \d+ tests executed[^.]*\.|\d+ tests? per[^.]*\.)/)||[''])[0].slice(0,80) };});
const click = (env) => p.evaluate(x=>{const r=document.getElementById('envrow-'+x);
  [...r.querySelectorAll('button')].find(b=>/Burn-down/.test(b.textContent||'')).click();}, env);

console.log('1. no card before any click:', await card());
console.log('2. overall summary section gone:', await p.evaluate(()=>!/Overall Progress Summary/.test(document.body.innerText)));
console.log('3. release totals in the left panel:', await p.evaluate(()=>{
  const lbl=[...document.querySelectorAll('div')].find(d=>(d.textContent||'').trim()==='Release total');
  return (lbl.parentElement.innerText||'').replace(/\n+/g,' | ');}));
await click('QC1'); await p.waitForTimeout(1500);
console.log('4. after QC1 click :', await card());
await click('IR3'); await p.waitForTimeout(1200);
console.log('5. after IR3 click :', await card(), '(only one environment at a time)');
await click('IR3'); await p.waitForTimeout(1000);
console.log('6. second click closes:', await card());
await click('QC1'); await p.waitForTimeout(1400);
const el = await p.$('#burn-card'); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(600);
const bb = await el.boundingBox();
await p.screenshot({path:'out/burncard.png', clip:{x:Math.max(0,bb.x-30), y:Math.max(0,bb.y-30), width:1500, height:Math.min(760, 1100-Math.max(0,bb.y-30))}});
console.log('errors:', errs.length?errs:'none');
await b.close();
