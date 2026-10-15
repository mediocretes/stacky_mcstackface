// A trio's spell pool at one level: every spell any of the three classes can cast at 1 to
// LEVEL_CAP, with each effect resolved at the trio's level.
//
// A trio's level is the lowest of its three classes, and a spell's level is the lowest level
// at which any of the three can cast it. Spells above the trio's level stay in the pool so
// upgrades can be named, and carry two numbers per effect:
//   value    resolved at the trio's level — what every ranking and metric reads
//   display  resolved at the spell's own level — what the client will show when you get it

import { CLASSES, LEVEL_CAP, RESIST } from './layout.js';
import { resolve, durationTicks, PERMANENT, UnknownFormula } from './formulas.js';
import { toI } from './layout.js';

const BRD = CLASSES.indexOf('BRD');
const SINGING = 41; // the spell file's skill code for songs sung rather than played
// The effects the singing bonus scales on a beneficial Singing song: the damage shield, the seven
// stats (4 strength … 10 charisma) and the five resists (46 fire … 50 magic). Measured on the
// shield, strength and cold resist; the other stats and resists are inferred from those.
// Left out: attack speed (measured: with worn haste removed, a 23% song read 23% at a ×1.4
// bonus), armor class (the inventory window shows it past a soft cap) and mana (never read).
const SINGING_SCALES = new Set([59, 4, 5, 6, 7, 8, 9, 10, 46, 47, 48, 49, 50]);

// A bard song: a row a bard can learn. Its level is the bard's, whoever else can cast it.
export const isSong = (row) => row.levels[BRD] >= 1 && row.levels[BRD] <= 254;

// Rows in these categories cannot occupy a spell gem; they are a different UI.
const UNGEMMABLE = new Set(['Disciplines', 'Combat Abilities']);
const ITEM_SPAS = new Set([32, 109]);

const finiteTicks = (t) => (t === PERMANENT ? 0 : t);

export function parseSlots(raw, level, ds, { ticks = 0, strict = true, context, displayLevel = null, displayTicks = 0 } = {}) {
  const out = [];
  if (!raw) return out;
  for (const chunk of raw.split('$')) {
    const [n, spa, base, base2, formula, max] = chunk.split('|').map(toI);
    if (spa === 10 && base === 0 && base2 === 100 && formula === 0) continue; // blank filler
    const ctx = context ? `${context} slot ${n}` : undefined;
    const value = resolve(base, formula, max, level, { ticks, strict, context: ctx });
    const display = displayLevel
      ? resolve(base, formula, max, displayLevel, { ticks: displayTicks, strict, context: ctx })
      : value;
    const entity = ITEM_SPAS.has(spa) ? (ds.items[base] ?? null) : null;
    out.push({ slot: n, spa, base, base2, formula, max, entity, value, display });
  }
  return out;
}

// trio: three class codes. level: the trio's level. fightTicks: cut DoTs off at this length.
// owned: the spell names in your spellbook, or null when none was given.
// bard: what the bard's AAs do to songs, both measured in game —
//   songLevels  Jam Fest: songs resolve this many levels above the trio's
//   singing     tenths added to the singing bonus (Singing Mastery 2 a rank, Amplification its
//               own value), applied to the SINGING_SCALES effects of a beneficial Singing-skill
//               song. The bonuses add: a shield of 6 read 7 at +2 and 11 at +9. A detrimental
//               song is not scaled, because every reading was of a song on the player.
// Returns { pool, unresolvable } — a spell with an unknown formula is left out and named.
// Each spell's `owned` is true or false against the spellbook, or null without one.
export function buildPool(ds, trio, level, { fightTicks = null, owned = null, bard = {} } = {}) {
  const { songLevels = 0, singing = 0 } = bard;
  const idx = trio.map((c) => {
    const i = CLASSES.indexOf(c);
    if (i < 0) throw new Error(`unknown class ${c}`);
    return i;
  });
  const pool = [];
  const unresolvable = [];

  for (const s of ds.spells) {
    const category = ds.categories[s.category] ?? null;
    if (UNGEMMABLE.has(category)) continue;
    const levels = idx.map((i) => s.levels[i]);
    const eff = Math.min(...levels);
    if (!(eff >= 1 && eff <= LEVEL_CAP)) continue;

    const song = isSong(s);
    const bonus = song ? songLevels : 0;
    const at = level + bonus; // the level its numbers are read at
    const ticks = durationTicks(s.durFormula, s.durCap, at);
    const elapsed = fightTicks ? Math.min(finiteTicks(ticks), fightTicks) : finiteTicks(ticks);
    const floor = eff > level ? eff : null;
    let dticks = ticks;
    let delapsed = elapsed;
    if (floor) {
      dticks = durationTicks(s.durFormula, s.durCap, floor + bonus);
      delapsed = fightTicks ? Math.min(finiteTicks(dticks), fightTicks) : finiteTicks(dticks);
    }

    let slots;
    try {
      slots = parseSlots(s.slots, at, ds, {
        ticks: elapsed, context: s.name, displayLevel: floor ? floor + bonus : null, displayTicks: delapsed,
      });
    } catch (e) {
      if (!(e instanceof UnknownFormula)) throw e;
      unresolvable.push({ id: s.id, name: s.name, formula: e.formula, level: eff });
      continue;
    }

    const row = {
      id: s.id,
      name: s.name,
      level: eff,
      classLevels: Object.fromEntries(trio.map((c, i) => [c, levels[i]])),
      cast: s.cast / 1000,
      recovery: s.recovery / 1000,
      reuse: s.reuse / 1000,
      mana: s.mana,
      resist: RESIST[s.resist] ?? String(s.resist),
      resistAdjust: s.resistAdjust,
      target: s.target,
      beneficial: s.beneficial,
      skill: s.skill,
      category,
      subcategory: ds.categories[s.subcategory] ?? null,
      line: s.line,
      descId: s.desc,
      durFormula: s.durFormula,
      durCap: s.durCap,
      ticks,
      duration: ticks === PERMANENT ? PERMANENT : ticks * 6,
      displayLevel: floor,
      displayTicks: dticks,
      displayDuration: dticks === PERMANENT ? PERMANENT : dticks * 6,
      slots,
      recourseId: s.link,
      recourse: [],
      owned: owned ? owned.has(s.name) : null,
      song,
      songLevels: bonus,
      singing: 0,
    };
    if (song && s.skill === SINGING && s.beneficial !== 0 && singing > 0) {
      row.singing = singing;
      for (const x of slots) {
        if (!SINGING_SCALES.has(x.spa)) continue;
        x.value = Math.floor((x.value * (10 + singing)) / 10);
        x.display = Math.floor((x.display * (10 + singing)) / 10);
      }
    }

    const r = s.link > 0 ? ds.recourses[s.link] : null;
    if (r) {
      row.recourseName = r.name;
      row.recourse = parseSlots(r.slots, at, ds, { displayLevel: floor ? floor + bonus : null });
      row.recourseBeneficial = r.beneficial;
      row.recourseTarget = r.target;
    }
    pool.push(row);
  }
  return { pool, unresolvable };
}
