// The burn-down button on an environment row opens that environment's chart in
// the Burn-down panel, expanded, and scrolls to it.
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
console.log('1. buttons on rows:', await p.evaluate(()=>[...document.querySelectorAll('[id^=envrow-]')]
  .map(r=>{const b=[...r.querySelectorAll('button')].find(x=>/Burn-down/.test(x.textContent||''));
    const l=[...r.querySelectorAll('div')].find(d=>/ left$/.test((d.textContent||'').trim()));
    return r.id.replace('envrow-','')+(b?' ✓':' ✗')+(l?' · '+l.textContent.trim():'');}).join('  |  ')));
console.log('2. sparkline gone from rows:', await p.evaluate(()=>![...document.querySelectorAll('[id^=envrow-] svg')].length));
const y0 = await p.evaluate(()=>Math.round(window.scrollY));
await p.evaluate(()=>{const r=document.getElementById('envrow-QC1'); [...r.querySelectorAll('button')].find(x=>/Burn-down/.test(x.textContent||'')).click();});
await p.waitForTimeout(1600);
console.log('3. after click  :', await p.evaluate(()=>{
  const card=document.getElementById('bdcard-QC1');
  return { panelOpen: /Burn-down — Time vs Remaining Tests/.test(document.body.innerText),
           card: card? 'present, h '+Math.round(card.getBoundingClientRect().height) : 'MISSING',
           scrolled: Math.round(window.scrollY) };}), '(was', y0+')');
console.log('4. row still closed (button did not toggle the row):', await p.evaluate(()=>{
  const r=document.getElementById('envrow-QC1'); return r.getBoundingClientRect().height < 140;}));
const el = await p.$('#bdcard-QC1'); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(600);
const bb = await el.boundingBox();
await p.screenshot({path:'out/burnbtn.png', clip:{x:Math.max(0,bb.x-30), y:Math.max(0,bb.y-220), width:1480, height:700}});
console.log('errors:', errs.length?errs:'none');
await b.close();
