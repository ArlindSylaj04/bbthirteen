import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { ANN, FILE, BROWSER } from './lib.mjs';
const b = await chromium.launch({ executablePath: BROWSER });
const p = await (await b.newContext({ viewport:{width:1680,height:1050}, deviceScaleFactor:2 })).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(ANN);
await p.goto(FILE,{waitUntil:'load'});
await p.evaluate(()=>sessionStorage.setItem('qa-session',JSON.stringify({name:'Arlind Sylaj',role:'admin',ts:Date.now()})));
await p.reload({waitUntil:'load'}); await p.waitForTimeout(2200);
await (await p.$('label:has-text("Import Jira CSV") input[type=file]')).setInputFiles('data/jira_carryover_26.03.00.csv');
await p.waitForTimeout(2000);
for (const mode of ['dark','light']) {
  if (mode==='light'){ await p.evaluate(()=>{const x=[...document.querySelectorAll('button')].find(e=>/^[☀☾]$/.test((e.textContent||'').trim())); x&&x.click();}); await p.waitForTimeout(1200); }
  const box = await p.evaluate(()=>{
    const h=[...document.querySelectorAll('div')].reverse().find(x=>/^Defect Overview/.test((x.textContent||'').trim())&&x.textContent.length<60);
    if(!h) return null;
    let e=h; for(let i=0;i<10&&e;i++){ e=e.parentElement; const b=e.getBoundingClientRect(); if(b.width>280&&b.height>420) break; }
    const b=e.getBoundingClientRect(); window.scrollTo(0, Math.max(0, b.top+window.scrollY-40));
    const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:Math.min(r.height,700)};
  });
  await p.waitForTimeout(700);
  const r = await p.evaluate(()=>{const h=[...document.querySelectorAll('div')].reverse().find(x=>/^Defect Overview/.test((x.textContent||'').trim())&&x.textContent.length<60);
    let e=h; for(let i=0;i<10&&e;i++){ e=e.parentElement; const b=e.getBoundingClientRect(); if(b.width>280&&b.height>420) break; }
    const b=e.getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:Math.min(b.height,700)};});
  await p.screenshot({path:`shots/p-${mode}.png`, clip:{x:Math.max(0,r.x-14),y:Math.max(0,r.y-14),width:r.w+28,height:r.h+28}});
  console.log('  ✓', mode, Math.round(r.w)+'px wide');
}
console.log('errors:', errs.length?errs:'none');
await b.close();
