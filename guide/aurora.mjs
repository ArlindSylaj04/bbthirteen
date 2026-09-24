import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { ANN, FILE, BROWSER } from './lib.mjs';
const b = await chromium.launch({ executablePath: BROWSER });
const p = await (await b.newContext({ viewport:{width:1700,height:1050}, deviceScaleFactor:2 })).newPage();
const errs=[]; p.on('pageerror',e=>errs.push('P: '+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('C: '+m.text());});
await p.addInitScript(ANN);
await p.goto(FILE,{waitUntil:'load'});
await p.evaluate(()=>sessionStorage.setItem('qa-session',JSON.stringify({name:'Arlind Sylaj',role:'admin',ts:Date.now()})));
await p.reload({waitUntil:'load'}); await p.waitForTimeout(2200);
await (await p.$('label:has-text("Import XLS / CSV") input[type=file]')).setInputFiles('data/qtest_uneven.csv');
await p.waitForTimeout(6500);
const meanEmpty = async () => {
  const buf = await p.screenshot({ clip:{x:60,y:700,width:120,height:120}, type:'jpeg', quality:100 });
  return p.evaluate(async u=>{const i=new Image(); i.src=u; await i.decode();
    const c=document.createElement('canvas'); c.width=i.width; c.height=i.height;
    const x=c.getContext('2d'); x.drawImage(i,0,0); const d=x.getImageData(0,0,c.width,c.height).data;
    let r=0,g=0,bl=0; for(let k=0;k<d.length;k+=4){r+=d[k];g+=d[k+1];bl+=d[k+2];}
    const n=d.length/4; return [Math.round(r/n),Math.round(g/n),Math.round(bl/n)];
  }, 'data:image/jpeg;base64,'+buf.toString('base64'));
};
const attrs = () => p.evaluate(()=>[document.documentElement.getAttribute('data-vfx'), document.documentElement.getAttribute('data-aurora')]);
const openLayout = async () => { await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(e=>/Layout/.test(e.textContent||'')); b&&b.click();}); await p.waitForTimeout(900); };
const click = async (re) => { await p.evaluate(r=>{const b=[...document.querySelectorAll('button')].find(e=>new RegExp(r).test((e.textContent||'').trim())); b&&b.click();}, re); await p.waitForTimeout(800); };
const closeTop = async () => { await p.evaluate(()=>{const o=[...document.querySelectorAll('div')].filter(d=>{const s=getComputedStyle(d);return s.position==='fixed'&&parseInt(s.zIndex||0)>=1000&&d.getBoundingClientRect().width>400;}).pop(); const x=o&&[...o.querySelectorAll('button')].find(b=>/^×$/.test((b.textContent||'').trim())); x&&x.click();}); await p.waitForTimeout(900); };

console.log('start          ', await attrs(), 'empty-area', await meanEmpty());
await openLayout(); await click('^On$|^Off$'); await closeTop();
console.log('lights off     ', await attrs(), 'empty-area', await meanEmpty());
await p.screenshot({path:'out/4-lights-off.png', clip:{x:0,y:0,width:1700,height:760}});
await openLayout(); await click('^Glass$|^Flat$'); await closeTop();
console.log('flat + no light', await attrs(), 'empty-area', await meanEmpty());
await openLayout(); await click('^On$|^Off$'); await closeTop();
console.log('flat + lights  ', await attrs(), 'empty-area', await meanEmpty());
await p.reload({waitUntil:'load'}); await p.waitForTimeout(2500);
console.log('after reload   ', await attrs(), '(choice must survive)');
console.log('errors:', errs.length?errs:'none');
await b.close();
