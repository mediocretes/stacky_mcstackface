// Two more files a player can give: the spellbook export and the game's saved spell sets.
//
//   <character>_<server>-<CLASS>-Spellbook.txt   written by /outputfile spellbook in game;
//       one "level<TAB>name" line per spell. It covers the whole character's book, not
//       just one class set, so it is matched against your spells by name.
//   <character>_<server>_LO<n>.ini                 the game's settings for one class set,
//       which hold its saved spell sets: a name and 14 gems of spell ids per set.

export const GEMS = 14;

// name → level, from a spellbook export.
export function parseSpellbook(text) {
  const book = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(\d+)\t(.+?)\s*$/);
    if (m) book.set(m[2], Number(m[1]));
  }
  if (book.size === 0) throw new Error('That file has no spellbook lines in it ("level, tab, spell name").');
  return book;
}

// The saved spell sets in a loadout ini: [{ name, slots: [id | null × 14] }]. A set the game
// marks unused, or one with no name, is left out.
export function parseLoadouts(text) {
  const sets = new Map();
  let section = null;
  let found = false;
  const entry = (n) => sets.get(n) ?? sets.set(n, { slots: new Map() }).get(n);
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('[')) { section = line; found ||= line === '[SpellLoadouts]'; continue; }
    if (section !== '[SpellLoadouts]') continue;
    let m;
    if ((m = line.match(/^SpellLoadout(\d+)\.name=(.*)$/))) entry(m[1]).name = m[2].trim();
    else if ((m = line.match(/^SpellLoadout(\d+)\.inuse=(\d+)$/))) entry(m[1]).inuse = Number(m[2]);
    else if ((m = line.match(/^SpellLoadout(\d+)\.slot(\d+)=(-?\d+)$/))) {
      const id = Number(m[3]);
      entry(m[1]).slots.set(Number(m[2]), id === -1 ? null : id);
    }
  }
  if (!found) throw new Error('That file has no saved spell sets in it (no [SpellLoadouts] section).');
  return [...sets.values()]
    .filter((s) => s.name && (s.inuse === undefined || s.inuse === 1))
    .map((s) => ({ name: s.name, slots: Array.from({ length: GEMS }, (_, i) => s.slots.get(i + 1) ?? null) }));
}

// Which of the two a file is, by name first and by its first lines otherwise.
export function importKind(name, head) {
  if (/-Spellbook\.txt$/i.test(name)) return 'spellbook';
  if (/_LO\d+\.ini$/i.test(name)) return 'loadouts';
  if (/^\[SpellLoadouts\]/m.test(head) || /^SpellLoadout\d+\./m.test(head)) return 'loadouts';
  if (/^\d+\t\S/.test(head)) return 'spellbook';
  return null;
}
