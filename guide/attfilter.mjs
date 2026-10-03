// The attendance roll folds away, and search / team / answer narrow it.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { ANN, FILE, BROWSER, importQtest } from './lib.mjs';
const b = await chromium.launch({ executablePath: BROWSER });
const p = await (await b.newContext({ viewport:{width:1680,height:1100}, deviceScaleFactor:2 })).newPage();
const errs=[]; p.on('pageerror',e=>errs.push('P: '+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('C: '+m.text());});
await p.addInitScript(ANN);
await p.goto(FILE,{waitUntil:'load'});
await p.evaluate(()=>sessionStorage.setItem('qa-session',JSON.stringify({name:'Arlind Sylaj',role:'admin',ts:Date.now()})));
await p.reload({waitUntil:'load'}); await p.waitForTimeout(2600);
await importQtest(p,'data/qtest_pc1.csv',6500);
// the filters are worth exercising on the wide roll, so open it first
await p.evaluate(()=>[...document.querySelectorAll('button')].find(x=>/Switch between the testers/.test(x.title||'')).click());
await p.waitForTimeout(800);
const st = () => p.evaluate(()=>{const t=document.body.innerText; const m=t.match(/(\d+ of \d+ shown|\d+ on the roll)/);
  return (m?m[0]:'-') + ' · ' + [...document.querySelectorAll('button')].filter(b=>(b.title||'').indexOf('Click to cycle')===0).length + ' rows';});
const setSel = (v) => p.evaluate(x=>{const s=[...document.querySelectorAll('select')].find(y=>[...y.options].some(o=>o.value===x));
  s.value=x; s.dispatchEvent(new Event('change',{bubbles:true}));}, v);
const cycle = (i,n) => p.evaluate(([x,k])=>{const bs=[...document.querySelectorAll('button')].filter(b=>(b.title||'').indexOf('Click to cycle')===0);
  for(let q=0;q<k;q++) bs[x].click();},[i,n]);

await cycle(0,1); await p.waitForTimeout(500);      // A. Sylaj -> taking part
await cycle(1,2); await p.waitForTimeout(500);      // C. Weber -> not taking part
console.log('1. all             :', await st());
await setSel('Taking part');   await p.waitForTimeout(700); console.log('2. taking part     :', await st());
await setSel('Not taking part');await p.waitForTimeout(700); console.log('3. not taking part :', await st());
await setSel('Needs answer');  await p.waitForTimeout(700); console.log('4. needs answer    :', await st());
await setSel('Everyone');      await p.waitForTimeout(700);
await setSel('Team Logistics');await p.waitForTimeout(700); console.log('5. one team        :', await st());
await p.fill('input[placeholder^="Search a name"]', 'roth'); await p.waitForTimeout(800);
console.log('6. + search roth   :', await st());
await p.evaluate(()=>[...document.querySelectorAll('button')].find(b=>/Clear/.test(b.textContent||'')).click());
await p.waitForTimeout(800); console.log('7. after clear     :', await st());
const mini = () => p.evaluate(()=>[...document.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||'')==='Minimise or maximise the roll').click());
await mini(); await p.waitForTimeout(700);
console.log('8. minimised       :', await st(), '| counters kept:', await p.evaluate(()=>/TAKING PART/i.test(document.body.innerText)));
await mini(); await p.waitForTimeout(700);
console.log('9. maximised again :', await st());
console.log('errors:', errs.length?errs:'none');
await b.close();
