import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { ANN, FILE, BROWSER } from './lib.mjs';
const b = await chromium.launch({ executablePath: BROWSER });
const p = await (await b.newContext({ viewport:{width:1680,height:1050} })).newPage();
await p.addInitScript(ANN);
await p.goto(FILE,{waitUntil:'load'}); await p.waitForTimeout(2500);
const mean = async () => {
  const buf = await p.screenshot({ clip:{x:60,y:640,width:100,height:100}, type:'jpeg', quality:100 });
  return p.evaluate(async (u)=>{ const i=new Image(); i.src=u; await i.decode();
    const c=document.createElement('canvas'); c.width=i.width; c.height=i.height;
    const x=c.getContext('2d'); x.drawImage(i,0,0); const d=x.getImageData(0,0,c.width,c.height).data;
    let r=0,g=0,bl=0; for(let k=0;k<d.length;k+=4){r+=d[k];g+=d[k+1];bl+=d[k+2];}
    const n=d.length/4; return [Math.round(r/n),Math.round(g/n),Math.round(bl/n)];
  }, 'data:image/jpeg;base64,'+buf.toString('base64'));
};
console.log('as shipped        :', await mean());
await p.addStyleTag({content:'html[data-vfx="glass"] body::before{background:#ff0000 !important;filter:none !important;opacity:1 !important;}'});
await p.waitForTimeout(500);
console.log('::before forced red:', await mean(), '  <- if not red, the pseudo-element is not painting');
await p.addStyleTag({content:'html[data-vfx="glass"] body::before{z-index:5 !important;}'});
await p.waitForTimeout(500);
console.log('+ z-index 5        :', await mean());
await b.close();
