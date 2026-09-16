// Rebuilds Testing_Report_Dashboard_v4.html from the editable sources in src/.
// v3 stays frozen in the repo as the previous release.
//
// The dashboard ships as a single self-contained HTML file that carries its own
// asset bundle (fonts, SheetJS, PptxGenJS, React UMD and the imported "Defect
// Center" view) as a gzip+base64 manifest. Only two lines of that file change
// when we edit the app:
//
//   line 376 — the asset manifest (we re-pack the Defect Center into it)
//   line 388 — the page itself, inlined as a JSON string
//
// Everything else is copied through untouched, so the bundle stays intact.
//
// Usage:  node build.mjs [outputFile]
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = process.argv[2] || path.join(HERE, '..', 'Testing_Report_Dashboard_v4.html');
const BASE = process.env.DASHBOARD_BASE || OUT;   // the built file is its own base
const DEFECT_UUID = 'cc17f2bf-3fcd-47a7-96b5-144f0b707ca2';
const MANIFEST_LINE = 375;   // 0-indexed
const TEMPLATE_LINE = 387;

if (!fs.existsSync(BASE)) {
  console.error('No base bundle at ' + BASE + '.\nSet DASHBOARD_BASE to a previously built dashboard HTML file.');
  process.exit(1);
}

// 1. the page = the editable parts, concatenated in order
const PARTS = ['01-head.html', '02-body.html', '03-script-open.html', '04-app.js', '05-tail.html'];
const tpl = PARTS.map(f => fs.readFileSync(path.join(HERE, 'src', f), 'utf8')).join('');

const lines = fs.readFileSync(BASE, 'utf8').split('\n');

// 2. re-pack the imported Defect Center view into the asset manifest
const manifest = JSON.parse(lines[MANIFEST_LINE]);
const defect = fs.readFileSync(path.join(HERE, 'defect-center.dc.html'));
manifest[DEFECT_UUID] = {
  ...manifest[DEFECT_UUID],
  compressed: true,
  data: zlib.gzipSync(defect, { level: 9 }).toString('base64'),
};
lines[MANIFEST_LINE] = JSON.stringify(manifest);

// 3. inline the page (escaping </script so the host <script> tag stays intact)
lines[TEMPLATE_LINE] = JSON.stringify(tpl).replace(/<\/script/gi, '<\\u002Fscript');

fs.writeFileSync(OUT, lines.join('\n'));
console.log('built ' + OUT + ' (' + (fs.statSync(OUT).size / 1048576).toFixed(2) + ' MB)');
