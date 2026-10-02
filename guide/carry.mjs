import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { ANN, FILE, BROWSER, openReleaseManager } from './lib.mjs';
const b = await chromium.launch({ executablePath: BROWSER });
const ctx = await b.newContext({ viewport:{width:1680,height:1050}, deviceScaleFactor:2 });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('P: '+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('C: '+m.text());});
await p.addInitScript(ANN);
await p.goto(FILE,{waitUntil:'load'});
await p.evaluate(()=>sessionStorage.setItem('qa-session',JSON.stringify({name:'Arlind Sylaj',role:'admin',ts:Date.now()})));
await p.reload({waitUntil:'load'}); await p.waitForTimeout(2200);

// build the same 26.03.00 release (IR1 / QC1 / IR3) so "today" sits inside QC1
await openReleaseManager(p);
await p.click('button:has-text("New release")'); await p.waitForTimeout(600);
await p.fill('input[placeholder="26.02.05"]', '26.03.00');
let d = await p.$$('input[type=date]');
await d[0].fill('2026-08-03'); await d[1].fill('2026-11-06');
for (const env of ['IR1','QC1','IR3']) { await p.click(`button[title^="Add or remove ${env}"]`); await p.waitForTimeout(300); }
await p.waitForTimeout(600);
d = await p.$$('input[type=date]');
const plan=[['2026-08-03','2026-08-28','2026-08-31','2026-09-04'],
            ['2026-09-07','2026-10-02','2026-10-05','2026-10-09'],
            ['2026-10-12','2026-10-30','2026-11-02','2026-11-06']];
for(let e=0;e<3;e++) for(let f=0;f<4;f++){ const ix=2+e*6+f; if(d[ix]) await d[ix].fill(plan[e][f]); }
await p.waitForTimeout(500);
await p.locator('button:has-text("Create release")').scrollIntoViewIfNeeded();
await p.click('button:has-text("Create release")'); await p.waitForTimeout(1200);
await p.evaluate(()=>{const ovs=[...document.querySelectorAll('div')].filter(x=>{const s=getComputedStyle(x);return s.position==='fixed'&&parseInt(s.zIndex||0)>=1000&&x.getBoundingClientRect().width>400;});const t=ovs[ovs.length-1];const x=t&&[...t.querySelectorAll('button')].find(b=>/^×$/.test((b.textContent||'').trim()));x&&x.click();});
await p.waitForTimeout(900);
await p.click('text=26.03.00'); await p.waitForTimeout(1200);

await (await p.$('label:has-text("Import Jira CSV") input[type=file]')).setInputFiles('data/jira_carryover_26.03.00.csv');
await p.waitForTimeout(2000);

const t = await p.evaluate(()=>document.body.innerText);
const grab = (re) => (t.match(re)||['(none)'])[0].replace(/\n/g,' | ');
console.log('env:      ', grab(/Environment\s*\n?\s*QC1[^\n]*/));
console.log('KPIs:     ', grab(/\d+\s*\nTOTAL[\s\S]{0,180}/).slice(0,180));
console.log('carry:    ', grab(/\d+\s*\nCarry-over[^\n]*[\s\S]{0,120}/));
await p.evaluate(()=>window.scrollTo(0,0));
const cb = await p.evaluate(()=>{const e=[...document.querySelectorAll('div')].find(x=>/CARRY.OVER/i.test(x.textContent||'')&&x.textContent.length<400); if(!e) return null; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height};});
await p.waitForTimeout(700);
if (cb) { const r=await p.evaluate(()=>{const e=[...document.querySelectorAll('div')].find(x=>/CARRY.OVER/i.test(x.textContent||'')&&x.textContent.length<400); const b=e.getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height};});
  await p.screenshot({path:'shots/c1-carry-strip.png', clip:{x:Math.max(0,r.x-18),y:Math.max(0,r.y-18),width:Math.min(1680,r.w+36),height:r.h+36}}); console.log('  ✓ strip shot'); }
// open the carry-over list
await p.evaluate(()=>{const e=[...document.querySelectorAll('div')].find(x=>/CARRY.OVER/i.test(x.textContent||'')&&x.textContent.length<400); e&&e.click();});
await p.waitForTimeout(1400);
const ws = await p.evaluate(()=>document.body.innerText);
console.log('workspace:', (ws.match(/\d+ shown[^\n]*/)||['(none)'])[0]);
console.log('rows:     ', (ws.match(/GCSAP-\d+/g)||[]).join(' '));
console.log('origin sel:', await p.evaluate(()=>{const s=[...document.querySelectorAll('select')].find(x=>[...x.options].some(o=>/Carry-over only/.test(o.text))); return s? s.options[s.selectedIndex].text : '(not found)';}));
await p.screenshot({path:'shots/c2-carry-workspace.png'});
await p.evaluate(()=>{const ovs=[...document.querySelectorAll('div')].filter(x=>{const s=getComputedStyle(x);return s.position==='fixed'&&parseInt(s.zIndex||0)>=1000&&x.getBoundingClientRect().width>400;});const t=ovs[ovs.length-1];const x=t&&[...t.querySelectorAll('button')].find(b=>/^×$/.test((b.textContent||'').trim()));x&&x.click();});
await p.waitForTimeout(1000);
// panel shot in BOTH themes
for (const mode of ['dark','light']) {
  if (mode === 'light') { await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^[☀☾]$/.test((x.textContent||'').trim())); b&&b.click();}); await p.waitForTimeout(1200); }
  // tag the panel, then let Playwright scroll to it and measure it
  await p.evaluate(() => {
    const card = [...document.querySelectorAll('div[data-glass]')].find(d => /^Defect Overview/.test((d.textContent || '').trim()));
    if (card) card.id = 'probe-defov';
  });
  const el = await p.$('#probe-defov');
  if (el) {
    await el.scrollIntoViewIfNeeded();
    await p.waitForTimeout(700);
    const box = await el.boundingBox();
    const vw = p.viewportSize().width, vh = p.viewportSize().height;
    const x = Math.max(0, Math.min(box.x - 16, vw - 200));
    const y = Math.max(0, Math.min(box.y - 16, vh - 200));
    await p.screenshot({ path: `shots/c3-panel-${mode}.png`,
      clip: { x, y, width: Math.min(box.width + 32, vw - x), height: Math.min(box.height + 32, vh - y) } });
    console.log('  ✓ panel', mode, Math.round(box.width) + 'x' + Math.round(box.height));
  }
}
console.log('errors:', errs.length?errs:'none');
await b.close();
