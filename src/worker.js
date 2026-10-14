// Parses the client files off the page's thread, so the page stays responsive while a
// 38 MB file is read.
import { parseClientFiles } from './engine/parse.js';

self.onmessage = (e) => {
  const { spells, dbstr, meta } = e.data;
  try {
    const dec = new TextDecoder('windows-1252');
    const ds = parseClientFiles(dec.decode(spells), dec.decode(dbstr), meta);
    self.postMessage({ ok: true, ds });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message, layout: err.name === 'LayoutError' || err.constructor?.name === 'LayoutError' });
  }
};
