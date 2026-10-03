// The cutover roll narrows to the chosen environment. On the morning of a
// cutover nothing is assigned yet, so the roll falls back to the testers of the
// folders that environment covers — never the whole release by default.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { ANN, FILE, BROWSER, importQtest } from './lib.mjs';
const b = await chromium.launch({ executablePath: BROWSER });
const p = await (await b.newContext({ viewport:{width:1680,height:1100} })).newPage();
const errs=[]; p.on('pageerror',e=>errs.push('P: '+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('C: '+m.text());});
await p.addInitScript(ANN);
await p.goto(FILE,{waitUntil:'load'});
await p.evaluate(()=>sessionStorage.setItem('qa-session',JSON.stringify({name:'Arlind Sylaj',role:'admin',ts:Date.now()})));
await p.reload({waitUntil:'load'}); await p.waitForTimeout(2600);
await importQtest(p,'data/qtest_pc1_unassigned.csv',7000);

const roll = () => p.evaluate(()=>[...document.querySelectorAll('button')]
  .filter(b=>(b.title||'').indexOf('Click to cycle')===0)
  .map(b=>{const c=[...b.parentElement.children]; return c[0].innerText.split('\n')[0].trim()+' · '+c[1].innerText.trim();}));
const note = () => p.evaluate(()=>{const m=document.body.innerText.match(/Nobody is assigned[^\n]*|The \d+ testers who own[^\n]*|Everyone who has run[^\n]*|No tester and no folder[^\n]*/); return m?m[0]:'(no note)';});
const scope = () => p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Switch between the testers/.test(x.title||'')); return b?b.textContent.trim():'(no button)';});

console.log('1. note   :', await note());
console.log('2. roll   :', (await roll()).join(' | '));
console.log('3. button :', await scope());
await p.evaluate(()=>[...document.querySelectorAll('button')].find(x=>/Switch between the testers/.test(x.title||'')).click());
await p.waitForTimeout(800);
console.log('4. widened:', (await roll()).length, 'rows ·', await note());
console.log('5. button :', await scope());
console.log('errors:', errs.length?errs:'none');
await b.close();
