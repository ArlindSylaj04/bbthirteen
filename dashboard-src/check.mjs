// Syntax-checks the dashboard component class without running it.
import fs from 'fs';
import path from 'path';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const src = fs.readFileSync(path.join(HERE, 'src', '04-app.js'), 'utf8');
try {
  new Function('DCLogic', '"use strict"; return ' + src);
  console.log('src/04-app.js: syntax OK');
} catch (e) {
  console.error('src/04-app.js SYNTAX ERROR: ' + e.message);
  process.exit(1);
}
