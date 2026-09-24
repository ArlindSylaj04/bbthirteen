import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { ANN, FILE, BROWSER } from './lib.mjs';
const b = await chromium.launch({ executablePath: BROWSER });
const p = await (await b.newContext({ viewport:{width:1680,height:1050} })).newPage();
await p.addInitScript(ANN);
await p.goto(FILE,{waitUntil:'load'}); await p.waitForTimeout(2500);
console.log(await p.evaluate(()=>{
  const out=[];
  out.push('data-vfx = '+document.documentElement.getAttribute('data-vfx'));
  const bs=getComputedStyle(document.body,'::before');
  out.push('body::before content='+bs.content+' pos='+bs.position+' z='+bs.zIndex+' op='+bs.opacity+' bg='+bs.backgroundImage.slice(0,60));
  [...document.body.children].slice(0,4).forEach((c,i)=>{
    const s=getComputedStyle(c);
    out.push(`body>child${i} <${c.tagName.toLowerCase()}> z=${s.zIndex} pos=${s.position} bg=${s.backgroundColor} bgimg=${s.backgroundImage.slice(0,40)}`);
  });
  const card=document.querySelector('[data-glass]');
  if(card){const s=getComputedStyle(card); out.push('card bg='+s.backgroundColor+' backdrop='+s.backdropFilter);}
  return out.join('\n');
}));
await b.close();
