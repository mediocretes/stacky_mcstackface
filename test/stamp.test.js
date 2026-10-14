// The deploy stamp: every script and stylesheet address in the deployed copy carries the version,
// so a browser can never mix files from two deploys.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stamp, stampText } from '../tools/stamp.mjs';

const files = (p) => (statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => files(join(p, f))) : [p]);

test('stampText: imports, worker URLs, the page and the version tag', () => {
  assert.equal(stampText('a.js', "import { x } from './b.js';\nimport('../c.js');\nnew URL('./worker.js', import.meta.url);", 'v1'),
    "import { x } from './b.js?v=v1';\nimport('../c.js?v=v1');\nnew URL('./worker.js?v=v1', import.meta.url);");
  assert.equal(stampText('index.html', '<link href="app.css"><script src="src/app.js"></script><meta name="version" content="dev">', 'v1'),
    '<link href="app.css?v=v1"><script src="src/app.js?v=v1"></script><meta name="version" content="v1">');
  assert.equal(stampText('a.js', "const s = 'not/a/module.js';", 'v1'), "const s = 'not/a/module.js';", 'only relative addresses');
});

test('stamp: no address in the deployed copy is left unstamped', () => {
  const out = mkdtempSync(join(tmpdir(), 'stamp-'));
  try {
    stamp(out, 'test123');
    const left = [];
    let stamped = 0;
    for (const f of files(out).filter((x) => /\.(js|html)$/.test(x))) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/(['"])(\.{1,2}\/[^'"]+\.js)(\?v=[^'"]*)?\1/g)) (m[3] ? stamped++ : left.push(`${f}: ${m[2]}`));
      for (const m of text.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)) left.push(`${f}: ${m[1]}`);
    }
    assert.deepEqual(left, []);
    assert.ok(stamped > 40, `stamped ${stamped}`);
    assert.match(readFileSync(join(out, 'index.html'), 'utf8'), /<meta name="version" content="test123">/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
