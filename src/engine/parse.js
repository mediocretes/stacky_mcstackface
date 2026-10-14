// Reads the player's own client files into a compact dataset that can be cached in their
// browser. Nothing here ships with the app: the files come from the player's install.
//
// The dataset keeps every row some class can cast at levels 1 to LEVEL_CAP, the recourse rows
// those link to, and only the strings they need: category names, the descriptions of kept
// rows, and the names of items they summon.

import { F, CLASSES, LEVEL_CAP, splitRow, toI } from './layout.js';

export const DATASET_VERSION = 1;

const ITEM_SPAS = new Set([32, 109]); // summon item, summon armor: the base is an item id

function lines(text) {
  return text.split(/\r?\n/);
}

// dbstr_us.txt holds many keyed string tables; field 1 is the table.
export function parseStrings(text, types) {
  const out = Object.fromEntries(types.map((t) => [t, new Map()]));
  for (const line of lines(text)) {
    const f = line.split('^');
    const tbl = out[toI(f[1])];
    if (tbl) tbl.set(toI(f[0]), f[2]);
  }
  return out;
}

function slotBases(raw, spas) {
  const ids = [];
  if (!raw) return ids;
  for (const chunk of raw.split('$')) {
    const p = chunk.split('|');
    if (spas.has(toI(p[1]))) ids.push(toI(p[2]));
  }
  return ids;
}

export function parseClientFiles(spellsText, dbstrText, meta = {}) {
  const spells = [];
  const byId = new Map(); // every row: [name, beneficial, target, raw slots] — links are out of band
  let rows = 0;
  let notPlayer = 0;

  for (const line of lines(spellsText)) {
    const f = splitRow(line);
    if (!f) continue;
    rows += 1;
    const id = toI(f[F.id]);
    byId.set(id, [f[F.name], toI(f[F.beneficial]), toI(f[F.target]), f[F.slots]]);

    const levels = CLASSES.map((_, i) => toI(f[F.classBase + i]));
    if (!levels.some((l) => l >= 1 && l <= LEVEL_CAP)) continue;
    if (f[F.notPlayer] === '1') { notPlayer += 1; continue; }

    spells.push({
      id,
      name: f[F.name],
      cast: toI(f[F.cast]),
      recovery: toI(f[F.recovery]),
      reuse: toI(f[F.reuse]),
      durFormula: toI(f[F.durFormula]),
      durCap: toI(f[F.durCap]),
      mana: toI(f[F.mana]),
      beneficial: toI(f[F.beneficial]),
      resist: toI(f[F.resist]),
      resistAdjust: toI(f[F.resistAdjust]),
      target: toI(f[F.target]),
      skill: toI(f[F.skill]),
      levels,
      category: toI(f[F.category]),
      subcategory: toI(f[F.subcategory]),
      line: toI(f[F.line]),
      desc: toI(f[F.desc]),
      link: toI(f[F.link]),
      slots: f[F.slots],
    });
  }
  if (rows === 0) throw new Error('spells_us.txt has no rows — is it the right file?');
  if (spells.length === 0) throw new Error('spells_us.txt has no spell any class can cast at 1 to 50.');

  // A link is attached as a recourse only when the row it names is called "<X> Recourse".
  const recourses = {};
  for (const s of spells) {
    const r = s.link > 0 && byId.get(s.link);
    if (r && r[0].endsWith('Recourse')) {
      recourses[s.link] = { name: r[0], beneficial: r[1], target: r[2], slots: r[3] };
    }
  }

  const strings = parseStrings(dbstrText, [5, 6, 44]);
  if (strings[5].size === 0) throw new Error('dbstr_us.txt has no category names — is it the right file?');
  const descIds = new Set(spells.map((s) => s.desc));
  const itemIds = new Set(spells.flatMap((s) => slotBases(s.slots, ITEM_SPAS)));
  for (const r of Object.values(recourses)) slotBases(r.slots, ITEM_SPAS).forEach((i) => itemIds.add(i));

  const pick = (map, ids) => Object.fromEntries([...ids].filter((i) => map.has(i)).map((i) => [i, map.get(i)]));

  return {
    version: DATASET_VERSION,
    source: { rows, kept: spells.length, notPlayer, ...meta },
    spells,
    recourses,
    categories: Object.fromEntries(strings[5]),
    descriptions: pick(strings[6], descIds),
    items: pick(strings[44], itemIds),
  };
}
