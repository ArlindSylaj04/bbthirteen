export const ANN = () => {
  window.__clear = () => document.querySelectorAll('.__annx').forEach(e => e.remove());
  window.__find = (txt, exact) => {
    const all = [...document.querySelectorAll('button,label,a,input,select,div,span,h1,h2,h3')];
    const hit = all.filter(e => {
      if (!e.offsetParent && e.tagName !== 'BODY') { const r = e.getBoundingClientRect(); if (!r.width || !r.height) return false; }
      const t = (e.innerText || e.textContent || '').trim().replace(/\s+/g, ' ');
      return exact ? t === txt : t.includes(txt);
    });
    hit.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
    return hit[0] || null;
  };
  // bounding box of the modal panel that contains `txt`
  window.__panel = (txt) => {
    const el = window.__find(txt); if (!el) return null;
    let e = el;
    while (e && e.parentElement) {
      const pe = e.parentElement;
      if (getComputedStyle(pe).position === 'fixed') break;
      e = pe;
    }
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  // nearest card-like ancestor (rounded, has a background, reasonably large)
  window.__card = (txt, minW) => {
    const el = window.__find(txt); if (!el) return null;
    minW = minW || 320;
    let e = el, best = null;
    for (let i = 0; i < 12 && e; i++) {
      const st = getComputedStyle(e), r = e.getBoundingClientRect();
      const rad = parseFloat(st.borderRadius) || 0;
      if (rad >= 10 && r.width >= minW && r.height >= 90 && st.backgroundColor !== 'rgba(0, 0, 0, 0)') { best = r; break; }
      e = e.parentElement;
    }
    if (!best) best = el.getBoundingClientRect();
    return { x: best.x, y: best.y, width: best.width, height: best.height };
  };
  // vertical span between two anchors, full width of the first one's card
  window.__span = (fromTxt, toTxt, w) => {
    const a = window.__find(fromTxt), b = window.__find(toTxt);
    if (!a) return null;
    const ra = a.getBoundingClientRect();
    const rb = b ? b.getBoundingClientRect() : null;
    return { x: ra.x, y: ra.y, width: w || ra.width, height: rb ? Math.max(60, rb.y - ra.y) : ra.height };
  };
  // items: [{ txt|sel|box, n, pos }] pos = tl|tr|bl|br
  window.__ann = (items, opt) => {
    opt = opt || {};
    items.forEach(it => {
      let r = it.box;
      if (!r) {
        const el = it.sel ? document.querySelector(it.sel) : window.__find(it.txt, it.exact);
        if (!el) { console.warn('ANN miss:', it.txt || it.sel); return; }
        const b = el.getBoundingClientRect();
        r = { x: b.x, y: b.y, width: b.width, height: b.height };
      }
      const pad = it.pad == null ? 6 : it.pad;
      const box = document.createElement('div');
      box.className = '__annx';
      Object.assign(box.style, { position: 'fixed', left: (r.x - pad) + 'px', top: (r.y - pad) + 'px',
        width: (r.width + pad * 2) + 'px', height: (r.height + pad * 2) + 'px',
        border: '3px solid #ff2d55', borderRadius: '12px', zIndex: 99998, pointerEvents: 'none',
        boxShadow: '0 0 0 3px rgba(255,45,85,0.28), 0 6px 22px rgba(255,45,85,0.35)' });
      document.body.appendChild(box);
      if (it.n == null) return;
      const pos = it.pos || 'tl';
      const bad = document.createElement('div');
      bad.className = '__annx'; bad.textContent = it.n;
      const S = 36;
      let bx = r.x - pad - S / 2, by = r.y - pad - S / 2;
      if (pos.includes('r')) bx = r.x + r.width + pad - S / 2;
      if (pos.includes('b')) by = r.y + r.height + pad - S / 2;
      if (pos === 'IR') { bx = r.x + r.width - pad - S - 4; by = r.y + (r.height - S) / 2; }
      if (pos === 'IL') { bx = r.x + pad + 4; by = r.y + (r.height - S) / 2; }
      if (pos === 'L')  { bx = r.x - pad - S - 8; by = r.y + (r.height - S) / 2; }
      if (pos === 'R')  { bx = r.x + r.width + pad + 8; by = r.y + (r.height - S) / 2; }
      Object.assign(bad.style, { position: 'fixed', left: Math.max(4, bx) + 'px', top: Math.max(4, by) + 'px',
        width: S + 'px', height: S + 'px', borderRadius: '50%', background: '#ff2d55', color: '#fff',
        font: '800 19px/36px Arial, sans-serif', textAlign: 'center', zIndex: 99999, pointerEvents: 'none',
        boxShadow: '0 4px 14px rgba(0,0,0,0.55)', border: '2px solid #fff' });
      document.body.appendChild(bad);
    });
  };
};
export const LOGIN = { name: 'Arlind Sylaj', role: 'admin' };
export const FILE = 'file:///home/user/bbthirteen/Testing_Report_Dashboard_v4.html';
export const BROWSER = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
