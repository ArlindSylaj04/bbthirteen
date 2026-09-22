import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { ANN, FILE, BROWSER } from './lib.mjs';
const b = await chromium.launch({ executablePath: BROWSER });
const p = await (await b.newContext({ viewport:{width:1680,height:1050}, deviceScaleFactor:2 })).newPage();
const errs=[]; p.on('pageerror',e=>errs.push('P: '+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('C: '+m.text());});
await p.addInitScript(ANN);
await p.goto(FILE,{waitUntil:'load'});
await p.evaluate(()=>sessionStorage.setItem('qa-session',JSON.stringify({name:'Arlind Sylaj',role:'admin',ts:Date.now()})));
await p.reload({waitUntil:'load'}); await p.waitForTimeout(2200);
await (await p.$('label:has-text("Import Story+Bug CSV") input[type=file]')).setInputFiles('data/backlog_labels.csv');
await p.waitForTimeout(2200);
const t = await p.evaluate(()=>document.body.innerText);
console.log('tiles:', (t.match(/Release Backlog[\s\S]{0,420}/)||[''])[0].replace(/\n+/g,' | ').slice(0,420));
// filter dropdown options
console.log('filter opts:', await p.evaluate(()=>{const s=[...document.querySelectorAll('select')].find(x=>[...x.options].some(o=>/qTest linked/.test(o.text))); return s?[...s.options].map(o=>o.text):'(none)';}));
// click the new tile
await p.evaluate(()=>{const e=[...document.querySelectorAll('div')].find(d=>/qTest.missing ›/i.test(d.textContent||'')&&d.textContent.length<40); const c=e&&e.closest('div[title]'); (c||e).click();});
await p.waitForTimeout(1200);
const t2 = await p.evaluate(()=>document.body.innerText);
console.log('rows after filter:', (t2.match(/GCSAP-40\d\d/g)||[]).join(' '));
await p.evaluate(()=>{
  const h=[...document.querySelectorAll('div')].find(x=>/^Release Backlog \u00d7 Testing Link/.test((x.textContent||'').trim()));
  if(h) window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 60);
});
await p.waitForTimeout(900);
const hb = await p.evaluate(()=>{
  const h=[...document.querySelectorAll('div')].find(x=>/^Release Backlog \u00d7 Testing Link/.test((x.textContent||'').trim()));
  const b=h.getBoundingClientRect(); return {x:b.x,y:b.y};
});
await p.screenshot({path:'shots/lbl-backlog.png', clip:{x:Math.max(0,hb.x-30), y:Math.max(0,hb.y-30), width:Math.min(1680-Math.max(0,hb.x-30), 1180), height:560}});
console.log('errors:', errs.length?errs:'none');
await b.close();
