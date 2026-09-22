import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { ANN, FILE, BROWSER } from './lib.mjs';
import fs from 'node:fs';

const OUT = 'shots'; fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: BROWSER });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2, acceptDownloads: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('P: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('C: ' + m.text()); });
await p.addInitScript(ANN);

const shot = async (n, clip) => { await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/${n}.png`, ...(clip ? { clip } : {}) }); console.log('  ✓', n); };
const ann = i => p.evaluate(x => window.__ann(x), i);
const clear = () => p.evaluate(() => window.__clear());
const panel = t => p.evaluate(x => window.__panel(x), t);
const pad = (b, m = 26) => ({ x: Math.max(0, b.x - m), y: Math.max(0, b.y - m),
  width: Math.min(1680 - Math.max(0, b.x - m), b.width + m * 2), height: Math.min(1050 - Math.max(0, b.y - m), b.height + m * 2) });
const cardOf = (t, w) => p.evaluate(a => window.__card(a[0], a[1]), [t, w]);
const spanOf = (a, b, w) => p.evaluate(x => window.__span(x[0], x[1], x[2]), [a, b, w]);
const boxOf = t => p.evaluate(x => { const e = window.__find(x); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, t);
const region = async (t, m) => pad(await boxOf(t), m);
const V = 'input[placeholder="26.02.05"]';
const closeTop = async () => {
  await p.evaluate(() => {
    const ovs = [...document.querySelectorAll('div')].filter(d => {
      const st = getComputedStyle(d);
      return st.position === 'fixed' && parseInt(st.zIndex || '0') >= 1000 && d.getBoundingClientRect().width > 400;
    });
    const top = ovs[ovs.length - 1]; if (!top) return;
    const x = [...top.querySelectorAll('button')].find(b => /^[\u00d7\u2715\u2716x]$/i.test((b.textContent || '').trim()));
    if (x) x.click(); else top.click();
  });
  await p.waitForTimeout(1100);
};


// ══════════ 1 · LOGIN ══════════
await p.goto(FILE, { waitUntil: 'load' });
await p.waitForTimeout(2200);
await ann([{ txt: 'Editor Login', n: 1, pos: 'L' }]);
await shot('s01-login-button', { x: 340, y: 20, width: 1330, height: 200 });
await clear();
await p.click('button:has-text("Editor Login")'); await p.waitForTimeout(700);
const loginSel = await p.evaluate(() => {
  const sel = [...document.querySelectorAll('select')].find(x => /select user/i.test((x.options[0] || {}).text || ''));
  if (!sel) return null;
  const r = sel.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
});
await ann([{ box: loginSel, n: 1, pos: 'IR' }, { sel: 'input[type=password]', n: 2, pos: 'IR' }, { txt: 'Log in', exact: true, n: 3, pos: 'R' }]);
await shot('s02-login-form', pad(await panel('Editor / Admin Login'), 34));
await clear();
await p.evaluate(() => sessionStorage.setItem('qa-session', JSON.stringify({ name: 'Arlind Sylaj', role: 'admin', ts: Date.now() })));
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(2200);

// ══════════ 2 · RELEASE NAVIGATION ══════════
await ann([{ txt: 'RELEASES', n: 1, pos: 'R' }, { txt: '⚙ Manage Releases', n: 2, pos: 'R' }]);
await shot('s03-release-nav', { x: 8, y: 20, width: 760, height: 430 });
await clear();

// ══════════ 3 · MANAGE RELEASES ══════════
await p.click('text=⚙ Manage Releases'); await p.waitForTimeout(800);
await ann([{ txt: '+ New release', n: 1, pos: 'tl' }, { txt: 'Duplicate', n: 2, pos: 'br' }]);
await shot('s04-manage-releases', pad(await panel('ALL RELEASES'), 30));
await clear();

// ══════════ 4 · FORM — HEADER ══════════
await p.click('button:has-text("New release")'); await p.waitForTimeout(700);
await p.fill(V, '26.03.00');
const d = await p.$$('input[type=date]');
await d[0].fill('2026-08-03'); await d[1].fill('2026-11-06');
await p.waitForTimeout(350);
const bbSel = await p.locator('select').last().boundingBox();
const bbD0 = await (await p.$$('input[type=date]'))[0].boundingBox();
const bbD1 = await (await p.$$('input[type=date]'))[1].boundingBox();
await ann([
  { sel: V, n: 1, pos: 'IR' },
  { box: bbSel, n: 2, pos: 'IR' },
  { box: bbD0, n: 3, pos: 'IR' },
  { box: bbD1, n: 4, pos: 'IR' },
  { txt: 'Set as the current release', n: 5, pos: 'R' },
]);
await shot('s05-form-header', pad(await panel('NEW RELEASE'), 30));
await clear();

// ══════════ 5 · FORM — RESPONSIBILITIES ══════════
await p.click('button:has-text("+ Test Manager")'); await p.waitForTimeout(400);
await p.click('button:has-text("+ Defect Manager")'); await p.waitForTimeout(400);
const roleIn = p.locator('input[placeholder="Role (e.g. Test Manager)"]');
const nameIn = p.locator('input[placeholder="Name, Name"]');
await nameIn.nth(0).fill('Arlind Sylaj');
await nameIn.nth(1).fill('M. Brinkmann, L. Haas');
await p.waitForTimeout(350);
await ann([
  { box: await roleIn.nth(0).boundingBox(), n: 1, pos: 'IR' },
  { box: await nameIn.nth(0).boundingBox(), n: 2, pos: 'IR' },
  { txt: '+ Custom role', n: 3, pos: 'R' },
]);
await shot('s06-form-responsibilities', pad(await spanOf('RESPONSIBILITIES FOR THIS RELEASE', 'TEST ENVIRONMENTS IN THIS RELEASE', 1190), 26));
await clear();

// ══════════ 6 · FORM — ENVIRONMENTS + SCHEDULE ══════════
for (const env of ['IR1', 'QC1', 'IR3']) { await p.click(`button[title^="Add or remove ${env}"]`); await p.waitForTimeout(350); }
await p.waitForTimeout(600);
const sched = await p.$$('input[type=date]');
console.log('  date inputs after envs:', sched.length);
// [0],[1] = release start/end ; then 4 per environment (test start/end, fix start/end)
// per environment: testing start/end, bug-fixing start/end, retest start/end
const plan = [
  ['2026-08-03', '2026-08-28', '2026-08-31', '2026-09-04', '', ''],   // IR1
  ['2026-09-07', '2026-10-02', '2026-10-05', '2026-10-09', '', ''],   // QC1
  ['2026-10-12', '2026-10-30', '2026-11-02', '2026-11-06', '', ''],   // IR3
];
for (let e = 0; e < 3; e++) for (let f = 0; f < 6; f++) {
  const ix = 2 + e * 6 + f;
  if (sched[ix] && plan[e][f]) await sched[ix].fill(plan[e][f]);
}
await p.waitForTimeout(600);
await ann([
  { txt: 'TEST ENVIRONMENTS IN THIS RELEASE', n: 1, pos: 'L' },
  { txt: 'SCHEDULE PER ENVIRONMENT', n: 2, pos: 'L' },
  { box: await sched[2].boundingBox(), n: 3, pos: 'IR' },
  { box: await sched[4].boundingBox(), n: 4, pos: 'IR' },
]);
await shot('s07-form-schedule', pad(await panel('NEW RELEASE'), 26));
await clear();
await p.locator('button:has-text("Create release")').scrollIntoViewIfNeeded();
await p.waitForTimeout(500);
await ann([{ txt: 'Create release', n: 1, pos: 'R' }]);
await shot('s08-create-release', pad(await boxOf('Create release'), 150));
await clear();
await p.click('button:has-text("Create release")'); await p.waitForTimeout(1200);
await shot('s09-release-list', pad(await panel('ALL RELEASES'), 26));
await closeTop();

// switch to the new release in the nav
await p.click('text=26.03.00'); await p.waitForTimeout(1200);
await ann([{ txt: '26.03.00', n: 1, pos: 'R' }]);
await shot('s10-nav-switched', { x: 8, y: 20, width: 1670, height: 330 });
await clear();

// ══════════ 7 · IMPORT qTEST ══════════
await ann([{ txt: 'Import XLS / CSV', n: 1, pos: 'L' }]);
await shot('s11-import-xls-button', { x: 340, y: 100, width: 1330, height: 190 });
await clear();
await (await p.$('label:has-text("Import XLS / CSV") input[type=file]'))
  .setInputFiles('data/qtest_export_26.03.00.csv');
await p.waitForTimeout(2500);
await shot('s12-after-xls-full');

// ══════════ 8 · IMPORT JIRA ══════════
await ann([{ txt: 'Import Jira CSV', n: 1, pos: 'L' }]);
await shot('s13-import-jira-button', pad(await cardOf('DEFECT OVERVIEW', 300), 22));
await clear();
await (await p.$('label:has-text("Import Jira CSV") input[type=file]'))
  .setInputFiles('data/jira_carryover_26.03.00.csv');
await p.waitForTimeout(2200);
await shot('s14-after-jira-full');

// ══════════ 8b · CARRY-OVER ══════════
await p.evaluate(() => window.scrollTo(0, 0));
await p.waitForTimeout(600);
const coBox = await p.evaluate(() => {
  const e = [...document.querySelectorAll('div')].find(d => /CARRY.OVER/i.test(d.textContent || '') && d.textContent.length < 300);
  if (!e) return null; e.scrollIntoView({ block: 'center' });
  const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
});
await p.waitForTimeout(600);
if (coBox) {
  const r = await p.evaluate(() => {
    let e = [...document.querySelectorAll('div')].find(d => /CARRY.OVER/i.test(d.textContent || '') && d.textContent.length < 300);
    // walk out to the framed strip (the one carrying the purple left border)
    for (let i = 0; i < 4 && e; i++) { const st = getComputedStyle(e); if (parseFloat(st.borderLeftWidth) >= 3) break; e = e.parentElement; }
    const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height };
  });
  await shot('s25-carryover', pad(r, 20));
}
// the workspace, filtered to the carry-over
await p.evaluate(() => { const e = [...document.querySelectorAll('div')].find(d => /CARRY.OVER/i.test(d.textContent || '') && d.textContent.length < 300); e && e.click(); });
await p.waitForTimeout(1600);
const coW = await panel('Defect Management Workspace');
await ann([{ box: await boxOf('Carry-over only'), n: 1, pos: 'tl', pad: 4 }]);
await shot('s26-carryover-list', { x: Math.max(0, coW.x - 12), y: Math.max(0, coW.y - 12), width: Math.min(1680, coW.width + 24), height: 620 });
await clear();
await closeTop();

// ══════════ 9 · ENVIRONMENT CARDS ══════════
const scrollTo = async (txt, off = 120) => {
  const y = await p.evaluate(t => { const e = window.__find(t); return e ? e.getBoundingClientRect().top + window.scrollY : 0; }, txt);
  await p.evaluate(v => window.scrollTo(0, v), Math.max(0, y - off));
  await p.waitForTimeout(600);
};
await scrollTo('PLANNED RUNS', 150);
await ann([
  { txt: 'PLANNED RUNS', n: 1, pos: 'L' },
  { txt: '151 Passed', n: 2, pos: 'tl' },
]);
await shot('s15-env-cards', { x: 300, y: 60, width: 1220, height: 620 });
await clear();

// execution calendar (runs per day)
const cal = await p.$$('button[title^="Execution calendar"]');
console.log('  calendar buttons:', cal.length);
if (cal[1]) { await cal[1].click(); await p.waitForTimeout(2600);
  await ann([{ txt: 'Team Sales', n: 1, pos: 'R' }, { box: await boxOf('SUGGESTED PER WORKING DAY'), n: 2, pos: 'tr', pad: 4 }]);
  await shot('s16-exec-calendar', pad(await panel('EXECUTION CALENDAR'), 20)); await clear();
  await closeTop(); }

// test list per environment
await scrollTo('PLANNED RUNS', 150);
const expN = await p.evaluate(() => {
  const chips = [...document.querySelectorAll('*')].filter(e => /^\d+ TESTS$/.test((e.textContent||'').trim()) && e.getBoundingClientRect().width < 200);
  if (chips[1]) { (chips[1].closest('button') || chips[1]).click(); return chips.length; }
  return chips.length;
});
console.log('  test chips:', expN);
await p.waitForTimeout(1400);
await shot('s17-env-testlist');
await p.evaluate(() => { const bs = [...document.querySelectorAll('button')].filter(x => /^[\u25b6\u25bc\u25b8\u25be]$/.test((x.textContent||'').trim())); bs[1] && bs[1].click(); });
await p.waitForTimeout(700);

// ══════════ 10 · REQUIREMENT COVERAGE ══════════
await scrollTo('Requirement Coverage', 90);
await ann([{ txt: 'REQUIREMENTS COVERED', n: 1, pos: 'L' }, { txt: 'DISTINCT REQUIREMENTS COVERED PER TEST ENVIRONMENT', n: 2, pos: 'L' }]);
await shot('s18-requirement-coverage', pad(await cardOf('Requirement Coverage', 700), 22));
await clear();

// ══════════ 11 · COUNTDOWN ══════════
await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(600);

const cdA = await boxOf('RELEASE COUNTDOWN');
const cdB = await boxOf('Mon\u2013Fri 07:00\u201317:00');
await shot('s19-countdown', pad({ x: cdA.x, y: cdA.y, width: 470, height: (cdB.y + cdB.height) - cdA.y }, 26));
await clear();

// ══════════ 12 · DEFECT OVERVIEW ══════════
await scrollTo('DEFECT OVERVIEW', 90);
const doA = await boxOf('DEFECT OVERVIEW'), doB = await boxOf('DEFECT COURSE');
await shot('s20-defect-overview', pad({ x: doA.x - 14, y: doA.y, width: 430, height: (doB.y - doA.y) - 18 }, 22));

// ══════════ 13 · DEFECT MANAGER DASHBOARD ══════════
await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Defect Manager Dashboard/.test(x.textContent || '')); b && b.click(); });
await p.waitForTimeout(1500);
await p.evaluate(() => window.scrollTo(0, 0));
await p.waitForTimeout(1500);
await shot('s21-defect-dashboard');
await p.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find(x => /Back to Overview/.test(x.textContent || '')); b && b.click(); });
await p.waitForTimeout(1500);

// ══════════ 14 · EXPORTS ══════════
await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(600);
await ann([{ txt: 'PDF · Environments', n: 1, pos: 'bl' }, { txt: 'Overall', exact: true, n: 2, pos: 'tr' }, { txt: 'Go / No-Go', n: 3, pos: 'br' }]);
await shot('s22-export-buttons', { x: 340, y: 100, width: 1330, height: 200 });
await clear();
await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Go \/ No-Go/.test(x.textContent || '')); b && b.click(); });
await p.waitForTimeout(4500);
await ann([{ txt: 'Export as PowerPoint', n: 1, pos: 'bl' }]);
await shot('s23-gonogo', { x: 200, y: 0, width: 1420, height: 800 });
await clear();
await closeTop();

// defect export buttons
await scrollTo('DEFECT OVERVIEW', 120);
const opened = await p.evaluate(() => { const e = [...document.querySelectorAll('div')].find(d => /^\s*Closed & (Ready for Transport|RfT)\s*$/.test(d.textContent||'')); if (!e) return false; const c = e.closest('div[style*="cursor"]') || e.parentElement; c.click(); return true; });
console.log('  workspace opened:', opened);
if (opened) { await p.waitForTimeout(1500);
  await ann([{ txt: 'Excel', exact: true, n: 1, pos: 'bl' }, { txt: 'PowerPoint', exact: true, n: 2, pos: 'bl' }, { txt: 'CSV', exact: true, n: 3, pos: 'br' }]);
  const wsP = await panel('Defect Management Workspace');
await shot('s24-defect-exports', { x: Math.max(0, wsP.x - 12), y: Math.max(0, wsP.y - 12), width: Math.min(1680, wsP.width + 24), height: 700 });
  await clear(); }

console.log('errors:', errs.length ? errs : 'none');
await b.close();
