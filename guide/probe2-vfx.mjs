import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { ANN, FILE, BROWSER } from './lib.mjs';
const b = await chromium.launch({ executablePath: BROWSER });
const p = await (await b.newContext({ viewport:{width:1680,height:1050} })).newPage();
await p.addInitScript(ANN);
await p.goto(FILE,{waitUntil:'load'}); await p.waitForTimeout(2500);
const sample = async (label) => {
  const buf = await p.screenshot({ clip:{x:60,y:640,width:180,height:180} });
  // average RGB of that empty left-hand area
  const png = buf; // decode via sharp-free: use canvas in page instead
  return png.length;
};
// sample inside the page instead: draw the area into a canvas via html2canvas? simpler: read screenshot bytes
for (const mode of ['glass','flat']) {
  await p.evaluate(m=>document.documentElement.setAttribute('data-vfx',m), mode);
  await p.waitForTimeout(800);
  const buf = await p.screenshot({ clip:{x:60,y:640,width:120,height:120}, type:'jpeg', quality:100 });
  // crude: JPEG size correlates with content, but better — decode mean via page canvas
  const dataUrl = 'data:image/jpeg;base64,'+buf.toString('base64');
  const mean = await p.evaluate(async (u)=>{
    const img=new Image(); img.src=u; await img.decode();
    const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
    const x=c.getContext('2d'); x.drawImage(img,0,0);
    const d=x.getImageData(0,0,c.width,c.height).data; let r=0,g=0,bl=0;
    for(let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];bl+=d[i+2];}
    const n=d.length/4; return [Math.round(r/n),Math.round(g/n),Math.round(bl/n)];
  }, dataUrl);
  console.log(mode, 'empty-area mean RGB =', mean);
}
await b.close();
