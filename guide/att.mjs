// Cutover attendance: the roll fills itself from the qTest import, the two ticks
// survive a reload, and a hand-added person can be removed again.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { ANN, FILE, BROWSER, importQtest } from './lib.mjs';
const b = await chromium.launch({ executablePath: BROWSER });
const p = await (await b.newContext({ viewport:{width:1680,height:1100}, deviceScaleFactor:2 })).newPage();
const errs=[]; p.on('pageerror',e=>errs.push('P: '+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('C: '+m.text());});
await p.addInitScript(ANN);
await p.goto(FILE,{waitUntil:'load'});
await p.evaluate(()=>sessionStorage.setItem('qa-session',JSON.stringify({name:'Arlind Sylaj',role:'admin',ts:Date.now()})));
await p.reload({waitUntil:'load'}); await p.waitForTimeout(2600);
await importQtest(p,'data/qtest_pc1.csv',7000);

const envSel = () => p.evaluate(()=>{const s=[...document.querySelectorAll('select')].find(x=>[...x.options].every(o=>/^[A-Z]{2,3}\d$/.test(o.value))); return s? s.value : '(none)';});
const roll = () => p.evaluate(()=>[...document.querySelectorAll('button')]
  .filter(b=>(b.title||'').indexOf('Click to cycle')===0)
  .map(b=>{const row=b.parentElement; const cells=[...row.children];
    return cells[0].innerText.split('\n')[0].trim()+' | '+cells[1].innerText.trim()+' | '+cells[2].innerText.trim()+' | '+b.textContent.trim()+' | '+(cells[4]?cells[4].textContent.trim():'');}));
const kpis = () => p.evaluate(()=>{const t=document.body.innerText; const m=t.match(/(\d+)\nTAKING PART\n(\d+)\nNOT TAKING PART\n(\d+)\nNO ANSWER YET\n(\d+)\nFINISHED TESTING/);
  return m? {in:+m[1], out:+m[2], none:+m[3], done:+m[4]} : '(not found)';});

console.log('1. environment  :', await envSel(), '(expect PC1)');
console.log('2. roll from the import:');
(await roll()).forEach(r=>console.log('   ', r));
console.log('3. counters     :', await kpis());

const cycle = (i) => p.evaluate(n=>{const bs=[...document.querySelectorAll('button')].filter(b=>(b.title||'').indexOf('Click to cycle')===0); bs[n].click();}, i);
const finish = (i) => p.evaluate(n=>{const bs=[...document.querySelectorAll('button')].filter(b=>/finished with testing$/.test(b.title||'')); bs[n].click();}, i);
await cycle(0); await p.waitForTimeout(450);
await cycle(1); await p.waitForTimeout(450); await cycle(1); await p.waitForTimeout(450);
await finish(0); await p.waitForTimeout(600);
console.log('4. after ticks  :', await kpis(), '(expect in:1 out:1 none:4 done:1)');
await p.reload({waitUntil:'load'}); await p.waitForTimeout(3500);
console.log('5. after reload :', await kpis());

await p.fill('input[placeholder^="Name"]', 'R. Externa');
await p.fill('input[placeholder="Team or role"]', 'Basis on call');
await p.waitForTimeout(400);
await p.evaluate(()=>[...document.querySelectorAll('button')].find(b=>/Add person/.test(b.textContent)).click());
await p.waitForTimeout(900);
console.log('6. after add    :', (await roll()).some(r=>r.indexOf('R. Externa')===0) ? 'R. Externa on the roll' : 'ADD FAILED');
await p.evaluate(()=>[...document.querySelectorAll('button')].find(b=>/Remove this person/.test(b.title||'')).click());
await p.waitForTimeout(900);
console.log('7. after remove :', (await roll()).some(r=>r.indexOf('R. Externa')===0) ? 'REMOVE FAILED' : 'gone again');

const h = await p.$('text=Cutover Attendance'); await h.scrollIntoViewIfNeeded(); await p.waitForTimeout(700);
const bb = await h.boundingBox();
await p.screenshot({path:'out/attend.png', clip:{x:Math.max(0,bb.x-28), y:Math.max(0,bb.y-60), width:1240, height:720}});
console.log('errors:', errs.length?errs:'none');
await b.close();
