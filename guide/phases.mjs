// The phase strip must say what happened AND whether that is where it should be:
// a closed window with work left is not "in progress", and failures show.
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
console.log(await p.evaluate(()=>[...document.querySelectorAll('[id^=phasecard-]')].map(c=>{
  const t=(c.innerText||'').split('\n').map(x=>x.trim()).filter(Boolean);
  return { env:t[0]==='TODAY'?t[1]:t[0], today:t[0]==='TODAY', badge:t[t[0]==='TODAY'?2:1],
           line:t.filter(x=>/failed|not executed/.test(x)).join(' · '),
           segs:c.querySelectorAll('div[title*=":"]').length,
           border:getComputedStyle(c).borderColor };})));
const el = await p.$('[id^=phasecard-]'); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(700);
const bb = await el.boundingBox();
await p.screenshot({path:'out/phases.png', clip:{x:0, y:Math.max(0,bb.y-70), width:1680, height:430}});
console.log('errors:', errs.length?errs:'none');
await b.close();
