// Release Backlog × Testing Link: every column sorts, and the ones with a fixed
// set of values filter from the header funnel. Assignee is the one that matters
// most — who a ticket sits with — so it is checked value by value.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { ANN, FILE, BROWSER } from './lib.mjs';
const b = await chromium.launch({ executablePath: BROWSER });
const p = await (await b.newContext({ viewport:{width:1680,height:1050}, deviceScaleFactor:2 })).newPage();
const errs=[]; p.on('pageerror',e=>errs.push('P: '+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('C: '+m.text());});
await p.addInitScript(ANN);
await p.goto(FILE,{waitUntil:'load'});
await p.evaluate(()=>sessionStorage.setItem('qa-session',JSON.stringify({name:'Arlind Sylaj',role:'admin',ts:Date.now()})));
await p.reload({waitUntil:'load'}); await p.waitForTimeout(2200);
await (await p.$('label:has-text("Import Story+Bug CSV") input[type=file]')).setInputFiles('data/backlog_assignee.csv');
await p.waitForTimeout(2200);

const keys  = () => p.evaluate(()=>(document.body.innerText.match(/GCSAP-5\d\d\d/g)||[]));
const funnel = (col) => p.evaluate(c=>{const b=[...document.querySelectorAll('button')].find(x=>(x.title||'')==='Filter by '+c || /^\d+ values? picked/.test(x.title||'') && x.__c===c); if(!b) throw new Error('no funnel for '+c); b.click();}, col);
const openCol = async (col) => { const done = await p.$('button:has-text("Done")'); if (done) await done.click();
  await p.evaluate(c=>{const bs=[...document.querySelectorAll('button')];
    const hit=bs.find(x=>new RegExp('^Filter by '+c+'$','i').test(x.title||'')) || bs.find(x=>/values? picked/.test(x.title||'') && (x.parentElement.innerText||'').toLowerCase().indexOf(c)===0);
    if(!hit) throw new Error('no funnel for '+c); hit.click();}, col); await p.waitForTimeout(700); };
const pick = (v) => p.evaluate(t=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().split('\n')[0].trim()===t); if(!b) throw new Error('no chip '+t); b.click();}, v);
const chips = () => p.evaluate(()=>[...document.querySelectorAll('button')].filter(x=>(x.title||'')==='Remove this filter').map(x=>x.innerText.replace('✕','').trim()));
const sortBy = (c) => p.evaluate(t=>{const b=[...document.querySelectorAll('button')].find(x=>new RegExp('^Sort by '+t,'i').test(x.title||'')); if(!b) throw new Error('no header '+t); b.click();}, c);

console.log('1. rows                :', (await keys()).length);
await openCol('assignee');
console.log('2. chooser values      :', await p.evaluate(()=>{const m=document.body.innerText.match(/Filter · Assignee\n([^\n]*\n)*?/); return [...document.querySelectorAll('button')].filter(x=>/^\S/.test(x.innerText)&&x.offsetParent&&/\n\d+$/.test(x.innerText.trim())).map(x=>x.innerText.trim().replace('\n',' ')).join(' | ');}));
await pick('L. Haas'); await p.waitForTimeout(800);
console.log('3. L. Haas             :', (await keys()).join(' '), '(expect 2)');
await pick('Unassigned'); await p.waitForTimeout(800);
console.log('4. + Unassigned        :', (await keys()).join(' '), '(expect 4 — multi-select)');
console.log('5. chips               :', (await chips()).join(' · '));
await p.evaluate(()=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Done').click()); await p.waitForTimeout(500);
await p.evaluate(()=>[...document.querySelectorAll('button')].find(x=>(x.title||'')==='Remove this filter').click()); await p.waitForTimeout(800);
console.log('6. after chip removed  :', (await keys()).length, 'rows ·', (await chips()).join(' · ') || 'no chips');

await sortBy('ticket'); await p.waitForTimeout(700);
const asc = await keys();
await sortBy('ticket'); await p.waitForTimeout(700);
const desc = await keys();
console.log('7. sort by ticket  ↑   :', asc.slice(0,3).join(' '));
console.log('   sort by ticket  ↓   :', desc.slice(0,3).join(' '), desc[0]===asc[asc.length-1] ? '(reversed)' : '(NOT REVERSED)');
await sortBy('ticket'); await p.waitForTimeout(700);
console.log('8. third click clears  :', (await keys()).slice(0,3).join(' '));

await p.evaluate(()=>{const h=[...document.querySelectorAll('div')].find(x=>/^Release Backlog × Testing Link/.test((x.textContent||'').trim()));
  if(h) window.scrollTo(0, h.getBoundingClientRect().top+window.scrollY-50);});
await p.waitForTimeout(800);
const hb = await p.evaluate(()=>{const h=[...document.querySelectorAll('div')].find(x=>/^Release Backlog × Testing Link/.test((x.textContent||'').trim())); const b=h.getBoundingClientRect(); return {x:b.x,y:b.y};});
await p.screenshot({path:'shots/p-asg.png', clip:{x:Math.max(0,hb.x-28), y:Math.max(0,hb.y-28), width:Math.min(1680-Math.max(0,hb.x-28),1200), height:620}});
console.log('errors:', errs.length?errs:'none');
await b.close();
