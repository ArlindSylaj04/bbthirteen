// Recall check for Recurring Defects: three pairs that the title alone does not
// catch — a German inflection, a reworded duplicate, and two tickets that share
// nothing but a test case — plus a set that sits in one environment only.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { ANN, FILE, BROWSER } from './lib.mjs';
const b = await chromium.launch({ executablePath: BROWSER });
const p = await (await b.newContext({ viewport:{width:1680,height:1100}, deviceScaleFactor:2 })).newPage();
const errs=[]; p.on('pageerror',e=>errs.push('P: '+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('C: '+m.text());});
await p.addInitScript(ANN);
await p.goto(FILE,{waitUntil:'load'});
await p.evaluate(()=>sessionStorage.setItem('qa-session',JSON.stringify({name:'Arlind Sylaj',role:'admin',ts:Date.now()})));
await p.reload({waitUntil:'load'}); await p.waitForTimeout(3000);
await p.waitForSelector('label:has-text("Import Jira CSV") input[type=file]', {state:'attached'});
const run = async (csv) => {
  await (await p.$('label:has-text("Import Jira CSV") input[type=file]')).setInputFiles(csv);
  await p.waitForTimeout(3000);
  const sec = await p.evaluate(()=>(document.body.innerText.match(/Recurring Defects across Environments[\s\S]{0,2600}/)||[''])[0]);
  const groups=[...sec.matchAll(/(\d+)% match\n(.+)\n(.+)/g)].map(m=>`${m[1]}% ${m[3]} :: ${m[2].slice(0,54)}`);
  console.log(csv);
  console.log(groups.length ? '  ' + groups.join('\n  ')
    : '  (none) ' + (sec.split('No repeat found')[1]||'').split('\n').filter(Boolean)[0]);
};
await run('data/jira_recurring_hard.csv');   // expect 3 groups, all IR1 → IR3
await run('data/jira_bugs_26.03.00.csv');    // expect none, and a reason why
console.log('errors:', errs.length?errs:'none');
await b.close();
