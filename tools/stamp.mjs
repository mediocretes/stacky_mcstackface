// Copies the site into a folder for deployment, stamping every script and stylesheet address
// with a version: `./wants.js` becomes `./wants.js?v=abc1234`.
//
// Why: GitHub Pages lets browsers keep each file for 10 minutes. Without a stamp, a visitor
// who had the page open before a deploy can get the new page with some old scripts, and a new
// script asking an old one for something it does not have breaks the page. With one, every
// deploy uses new addresses, so a browser either has a whole old version or fetches a whole
// new one. The source itself is never stamped; it runs as it is from any static server.
//
//   node tools/stamp.mjs <out-dir> <version>

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = ['index.html', 'app.css', 'LICENSE', 'src'];

// A relative address of a .js file inside quotes: an import, a dynamic import, a worker URL.
const SPECIFIER = /(['"])(\.{1,2}\/[^'"?]+\.js)\1/g;

function files(path) {
  return statSync(path).isDirectory() ? readdirSync(path).flatMap((f) => files(join(path, f))) : [path];
}

export function stampText(name, text, version) {
  const v = encodeURIComponent(version);
  if (name.endsWith('.js')) return text.replace(SPECIFIER, (_, q, p) => `${q}${p}?v=${v}${q}`);
  if (name.endsWith('.html')) {
    return text
      .replace(/(src|href)="((?:src\/)?[^"?:]+\.(?:js|css))"/g, (_, attr, p) => `${attr}="${p}?v=${v}"`)
      .replace('<meta name="version" content="dev">', `<meta name="version" content="${version}">`);
  }
  return text;
}

export function stamp(out, version) {
  if (!version || /[^\w.-]/.test(version)) throw new Error(`a version is a short word, not ${JSON.stringify(version)}`);
  rmSync(out, { recursive: true, force: true });
  for (const top of SITE) {
    for (const file of files(join(ROOT, top))) {
      const rel = relative(ROOT, file);
      const dest = join(out, rel);
      mkdirSync(dirname(dest), { recursive: true });
      const text = readFileSync(file, 'utf8');
      writeFileSync(dest, stampText(rel, text, version));
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [out, version] = process.argv.slice(2);
  if (!out) throw new Error('usage: node tools/stamp.mjs <out-dir> <version>');
  stamp(out, version);
  console.log(`stamped ${out} as ${version}`);
}
