// The column layout of the client's spells_us.txt, and the check that refuses a file
// whose layout this map was not verified against.
//
// A client patch on 2026-10-12 inserted a column and moved every column from 74 up by
// one. A parser reading the old positions does not crash: it reads categories, lines and
// effect slots from the wrong place and answers anyway. So every row goes through
// `splitRow`, which stops on any row that is not FIELD_COUNT wide or whose effect-slot
// column is not an effect-slot list. It cannot see a column whose meaning changed in place.

export const FIELD_COUNT = 174;

export const F = {
  id: 0,
  name: 1,
  cast: 8, // ms
  recovery: 9, // ms
  reuse: 10, // ms
  durFormula: 11,
  durCap: 12, // ticks
  mana: 14,
  beneficial: 28, // 0 detrimental, 1 beneficial, 2 beneficial-restricted
  resist: 29,
  target: 30,
  skill: 32,
  classBase: 36, // sixteen class levels, in CLASSES order; 255 = never
  resistAdjust: 79,
  link: 82, // another spell's id; a recourse when that row is named "... Recourse"
  desc: 86, // description string id, dbstr type 6
  category: 87, // dbstr type 5
  subcategory: 88, // dbstr type 5
  // 1 on rows that are not a player's spell: AA and item abilities, triggers, test rows, every
  // one with a class level; within levels 1-50, exactly the three item benefits. The column is
  // not a yes/no flag: -1 sits on many ordinary player spells, and 2 on a few rows nobody has
  // explained, so only 1 is read. Read from its carriers, not documented anywhere, so the page
  // says how many rows it left out because of it.
  notPlayer: 131,
  line: 166,
  slots: 173, // n|spa|base|base2|formula|max, joined by $
};

export const CLASSES = ['WAR', 'CLR', 'PAL', 'RNG', 'SHD', 'DRU', 'MNK', 'BRD',
  'ROG', 'SHM', 'NEC', 'WIZ', 'MAG', 'ENC', 'BST', 'BER'];

export const CLASS_NAMES = {
  WAR: 'Warrior', CLR: 'Cleric', PAL: 'Paladin', RNG: 'Ranger', SHD: 'Shadow Knight',
  DRU: 'Druid', MNK: 'Monk', BRD: 'Bard', ROG: 'Rogue', SHM: 'Shaman', NEC: 'Necromancer',
  WIZ: 'Wizard', MAG: 'Magician', ENC: 'Enchanter', BST: 'Beastlord', BER: 'Berserker',
};

export const RESIST = ['none', 'magic', 'fire', 'cold', 'poison', 'disease', 'chromatic',
  'prismatic', 'physical', 'corruption'];

// Observed in game; the client file carries the whole live ladder past it.
export const LEVEL_CAP = 50;

const SLOT_SHAPE = /^\d+\|\d+\|-?[\d.]+\|/; // a base can be fractional

export class LayoutError extends Error {}

const LAYOUT_HELP = 'The game was probably patched and this tool has not been updated for ' +
  'the new file. Nothing is shown until it is: past a moved column every category, spell ' +
  'line and effect would be read from the wrong place, and most of those would not fail, ' +
  'they would just be wrong.';

// Ruby's to_i: leading integer, or 0. "-14958600.3" → -14958600, "" → 0.
export const toI = (s) => {
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? 0 : n;
};

// One row of the spell file, split — or a LayoutError. Returns null for a blank line.
export function splitRow(line) {
  const f = line.split('^');
  if (f.length < 2) return null;
  if (f.length !== FIELD_COUNT) {
    throw new LayoutError(`spells_us.txt row ${f[0]} (${f[1]}) has ${f.length} columns; ` +
      `this tool knows the ${FIELD_COUNT}-column layout. ${LAYOUT_HELP}`);
  }
  const slots = f[F.slots];
  if (slots !== '' && !SLOT_SHAPE.test(slots)) {
    throw new LayoutError(`spells_us.txt row ${f[0]} (${f[1]}): column ${F.slots} is not an ` +
      `effect list (it reads ${JSON.stringify(slots.slice(0, 40))}). ${LAYOUT_HELP}`);
  }
  return f;
}
