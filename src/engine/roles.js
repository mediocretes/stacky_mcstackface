// Which spells fill which ranked role, how each role is ranked, and how an effect is put
// into words. The roles themselves are data, in spec.js.

import { SPEC } from './vocab.js';
import { PERMANENT } from './formulas.js';

// ---- effect vocabulary -------------------------------------------------------------------

// Plain words for effect codes (SPAs). 0, 3, 11 and 79 each cover a benefit and its opposite:
// the sign, or for 11 the side of 100, is what separates them.
export const SPA_WORDS = {
  0: 'hp', 1: 'ac', 2: 'atk', 3: 'movement', 4: 'str', 5: 'dex', 6: 'agi', 7: 'sta', 8: 'int',
  9: 'wis', 10: 'cha', 11: 'attack speed', 12: 'invisibility', 13: 'see invisible',
  14: 'enduring breath', 15: 'mana', 18: 'pacify', 20: 'blind', 22: 'charm', 23: 'fear',
  24: 'light source', 25: 'bind affinity', 26: 'gate', 27: 'dispel', 28: 'invis vs undead',
  29: 'invis vs animals', 30: 'max level affected', 31: 'mesmerize', 32: 'summon item',
  33: 'summon pet', 35: 'disease counter', 36: 'poison counter', 40: 'invulnerability',
  42: 'shadow step', 46: 'fire resist', 47: 'cold resist', 48: 'poison resist',
  49: 'disease resist', 50: 'magic resist', 52: 'sense dead', 53: 'sense summoned',
  54: 'sense animals', 55: 'rune', 56: 'true north', 57: 'levitate', 58: 'illusion',
  59: 'damage shield', 60: 'reflect', 65: 'infravision', 66: 'ultravision', 67: 'eye of zomm',
  68: 'reclaim energy', 69: 'max hp', 71: 'summon undead pet', 73: 'see through',
  74: 'feign death', 79: 'instant hp', 83: 'teleport', 85: 'melee proc', 86: 'aggro radius',
  87: 'vision range', 88: 'evacuate', 89: 'model size', 94: 'breaks on attack', 97: 'max mana',
  99: 'root', 100: 'heal over time', 103: 'recall pet', 104: 'translocate', 109: 'summon armor',
  114: 'hate on attack', 116: 'curse counter', 118: 'singing amplification',
  120: 'healing taken', 121: 'heal on hit', 124: 'spell damage %', 148: 'stacking blocker',
  149: 'stacking overwrite', 158: 'spell reflect', 163: 'melee absorb', 164: 'sense trap',
  165: 'disarm trap', 166: 'pick lock', 189: 'endurance regen', 192: 'hate', 298: 'pet size',
  334: 'song damage', 457: 'lifetap',
};

export const spaWord = (spa) => SPA_WORDS[spa] ?? `effect ${spa}`;

// A presence marker, not a size: printing the number would read as a measurement.
export const FLAG_SPAS = new Set([12, 13, 14, 18, 20, 23, 24, 25, 28, 29, 31, 33, 40, 42, 52, 53,
  54, 56, 57, 65, 66, 67, 71, 73, 94, 99, 103, 163, 164, 165, 166, 192]);

// The base is an id (an item, a spell, a race) or points at nothing: never compared as a size.
export const ID_SPAS = new Set([32, 33, 58, 71, 85, 103, 109, 201, 289, 323, 333, 373, 386, 387,
  406, 407, 419, 427, 429, 442, 443, 453, 454, 537]);

// Size axes whose direction is the player's preference, so nothing ranks them.
export const PREFERENCE_SPAS = new Set([89, 298]);

// A base that locates a place. 146 is a coordinate only on a teleport row.
const TELEPORT_SPAS = new Set([83, 88, 104, 145]);
export const COORDINATE_SPAS = new Set([...TELEPORT_SPAS, 146]);
export const isTeleport = (spell) => spell.slots.some((x) => TELEPORT_SPAS.has(x.spa));
const isCoordinate = (spell, x) => TELEPORT_SPAS.has(x.spa) || (x.spa === 146 && isTeleport(spell));

// The direction of an effect is its base's sign — or max's, where base is 0 (some regens).
export function effectSign(slot) {
  if (slot.base !== 0) return Math.sign(slot.base);
  return Math.sign(slot.max);
}

// Does this spell cost you hp? (Cannibalize does; a plain mana song does not.)
export const negativeHp = (spell) => spell.slots.some((x) => x.spa === 0 && x.base < 0);

// ---- query parameters ---------------------------------------------------------------------

export const HUNTS = ['generic', 'undead', 'summoned', 'animal'];

const allHuntingTargets = Object.values(SPEC.hunting_targets).flat();
export function conditionalExclusions(hunting = 'generic') {
  const unlocked = SPEC.hunting_targets[hunting] ?? [];
  return allHuntingTargets.filter((t) => !unlocked.includes(t));
}

export const PET_TARGETS = SPEC.recipient_classes.pet;
const GROUP_TARGETS = SPEC.recipient_classes.group;

const RECIPIENT = Object.fromEntries(
  Object.entries(SPEC.recipient_classes).flatMap(([name, codes]) => codes.map((c) => [c, name])));
export const recipient = (target) => RECIPIENT[target] ?? null;

const arr = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

function excludedTargets(rule, ctx) {
  return arr(rule).flatMap((r) => {
    if (r === 'conditional') return conditionalExclusions(ctx.hunting);
    if (r === 'pet') return PET_TARGETS;
    if (r === 'group') return GROUP_TARGETS;
    return [r];
  });
}

// ---- the predicate ------------------------------------------------------------------------

function slotMatches(slot, cond) {
  if (slot.spa !== cond.spa) return false;
  if (cond.sign === 'negative' && !(effectSign(slot) < 0)) return false;
  if (cond.sign === 'positive' && !(effectSign(slot) > 0)) return false;
  if (cond.base_below !== undefined && !(slot.base < cond.base_below)) return false;
  if (cond.base_above !== undefined && !(slot.base > cond.base_above)) return false;
  return true;
}

function durationMatches(spell, want) {
  switch (want) {
    case 'instant': return spell.ticks !== PERMANENT && spell.ticks === 0;
    case 'finite': return spell.ticks !== PERMANENT && spell.ticks > 0;
    case 'permanent': return spell.ticks === PERMANENT;
    default: return true;
  }
}

function recastMatches(spell, want, ctx) {
  if (want === 'burst') return spell.reuse > ctx.burstThreshold;
  if (want === 'sustained') return spell.reuse <= ctx.burstThreshold;
  return true;
}

const categoriesOf = (spell) => [spell.category, spell.subcategory].filter((c) => c !== null);

export function matches(spell, role, ctx) {
  const m = role.match ?? {};
  if (m.beneficial !== undefined) {
    if (m.beneficial && spell.beneficial === 0) return false;
    if (!m.beneficial && spell.beneficial !== 0) return false;
  }
  if (!durationMatches(spell, m.duration)) return false;
  if (!recastMatches(spell, m.recast, ctx)) return false;
  if (m.slot && !spell.slots.some((s) => slotMatches(s, m.slot))) return false;
  if (m.slot_any && !m.slot_any.some((c) => spell.slots.some((s) => slotMatches(s, c)))) return false;
  if (m.category_any && !categoriesOf(spell).some((c) => m.category_any.includes(c))) return false;
  if (m.target_any && !excludedTargets(m.target_any, ctx).includes(spell.target)) return false;

  const ex = role.exclude ?? {};
  if (ex.target && excludedTargets(ex.target, ctx).includes(spell.target)) return false;
  if (ex.category_any && categoriesOf(spell).some((c) => ex.category_any.includes(c))) return false;
  return true;
}

// A nuke you cannot cast every few casts is "burst", ranked per cast rather than per second.
// The line is the median cast-bar time of the pool's damage spells × burst_after_casts.
export function calibrateBurst(pool, hunting = 'generic') {
  const { recast, ...match } = SPEC.roles.damage.match;
  const base = { ...SPEC.roles.damage, match };
  const occ = pool.filter((s) => matches(s, base, { hunting, burstThreshold: 0 }))
    .map(occupancy).sort((a, b) => a - b);
  const median = occ.length === 0 ? 4.5 : occ[Math.floor(occ.length / 2)];
  return median * (SPEC.burst_after_casts ?? 3);
}

export const ROLE_KEYS = Object.keys(SPEC.roles);
export const role = (key) => SPEC.roles[key];

// role key → spells in pool order, by the predicate alone.
export function classify(pool, ctx) {
  return Object.fromEntries(ROLE_KEYS.map((k) => [k, pool.filter((s) => matches(s, SPEC.roles[k], ctx))]));
}

// ---- metrics ------------------------------------------------------------------------------

// Seconds of cast bar one cast costs: cast + recovery.
export const occupancy = (s) => Math.max(s.cast + s.recovery, 0.25);
const slotsOf = (s, spa) => s.slots.filter((x) => x.spa === spa);

function sum(s, spa, sign) {
  return slotsOf(s, spa)
    .filter((x) => !sign || (sign === 'neg' ? effectSign(x) < 0 : effectSign(x) > 0))
    .reduce((a, x) => a + x.value, 0);
}

const finiteTicks = (s) => (s.ticks === PERMANENT ? 0 : s.ticks);
// A per-cast total: the repeating part lands once a tick, the flat part (79) once.
const perCast = (s, repeating, flat) => repeating * Math.max(finiteTicks(s), 1) + flat;
const truncated = (s, repeating, flat, fightTicks) =>
  repeating * Math.max(fightTicks ? Math.min(finiteTicks(s), fightTicks) : finiteTicks(s), 1) + flat;
const damage = (s) => perCast(s, sum(s, 0, 'neg'), sum(s, 79, 'neg'));
const healing = (s) => perCast(s, sum(s, 100) + sum(s, 0, 'pos'), sum(s, 79, 'pos'));
const perMana = (s, total) => (s.mana > 0 ? total / s.mana : null);

// The other end of a transfer: a stat tap lowers theirs and raises yours.
const recourseSum = (s, spa) => (s.recourse ?? []).filter((x) => x.spa === spa)
  .reduce((a, x) => a + (x.base < 0 ? -x.value : x.value), 0);
const swing = (s, spa) => sum(s, spa, 'neg') + recourseSum(s, spa);
const RESISTS = [46, 47, 48, 49, 50];

// Every metric reads higher-is-better. ctx.fightTicks feeds `landed`.
export const METRICS = {
  dps: { label: 'damage per second of casting', fn: (s) => damage(s) / occupancy(s) },
  dpm: { label: 'damage per mana', fn: (s) => perMana(s, damage(s)) },
  hit: { label: 'damage per cast', fn: (s) => sum(s, 0, 'neg') },
  total: { label: 'damage over the full duration', fn: (s) => damage(s) },
  heal_total: { label: 'healing over the full duration', fn: (s) => healing(s) },
  landed: { label: 'damage inside the fight length', fn: (s, c) => truncated(s, sum(s, 0, 'neg'), sum(s, 79, 'neg'), c.fightTicks) },
  landed_per_mana: { label: 'landed damage per mana', fn: (s, c) => perMana(s, truncated(s, sum(s, 0, 'neg'), sum(s, 79, 'neg'), c.fightTicks)) },
  hpm: { label: 'healing per mana', fn: (s) => perMana(s, healing(s)) },
  hps: { label: 'healing per second of casting', fn: (s) => healing(s) / occupancy(s) },
  size: { label: 'size', fn: (s) => sum(s, 0, 'pos') + sum(s, 59) },
  tick: { label: 'healing per tick', fn: (s) => sum(s, 100) + sum(s, 0, 'pos') },
  strength: {
    label: 'strength',
    fn: (s) => {
      const v = slotsOf(s, 11)[0];
      if (!v) return null;
      return v.base < 100 ? -v.value : v.value;
    },
  },
  depth: { label: 'deepest single resist lowered', fn: (s) => Math.max(0, ...RESISTS.map((spa) => sum(s, spa, 'neg'))) },
  breadth: { label: 'resists lowered', fn: (s) => RESISTS.filter((spa) => slotsOf(s, spa).length > 0).length },
  debuff_total: { label: 'total resist lowered', fn: (s) => RESISTS.reduce((a, spa) => a + sum(s, spa, 'neg'), 0) },
  swing_ac: { label: 'armor class moved, both ends', fn: (s) => swing(s, 1) },
  swing_atk: { label: 'attack moved, both ends', fn: (s) => swing(s, 2) },
  swing_str: { label: 'strength moved, both ends', fn: (s) => swing(s, 4) },
  duration: { label: 'duration', fn: (s) => (s.ticks === PERMANENT ? Infinity : s.ticks) },
  song_tick: { label: 'damage a tick to everything around you', fn: (s) => sum(s, 334, 'neg') },
};

// [[spell, value]] best first; spells the metric cannot value are left out (see `unvalued`).
export function rank(spells, metric, ctx = {}) {
  const fn = METRICS[metric].fn;
  return spells.map((s) => [s, fn(s, ctx)])
    .filter(([, v]) => v !== null && v !== undefined && !Number.isNaN(v))
    .sort((a, b) => (b[1] === a[1] ? 0 : b[1] > a[1] ? 1 : -1));
}

export const unvalued = (spells, metric, ctx = {}) => {
  const fn = METRICS[metric].fn;
  return spells.filter((s) => { const v = fn(s, ctx); return v === null || v === undefined || Number.isNaN(v); });
};

// A metric's value the way a player reads it. A slow's is negated so higher is better.
const FORMATS = {
  dps: (v) => `${v.toFixed(1)} damage/s`,
  dpm: (v) => `${v.toFixed(2)} damage/mana`,
  hit: (v) => `${v} a cast`,
  total: (v) => `${v} total`,
  landed: (v) => `${v} landed`,
  landed_per_mana: (v) => `${v.toFixed(2)} landed/mana`,
  heal_total: (v) => `${v} total`,
  hpm: (v) => `${v.toFixed(2)} healed/mana`,
  hps: (v) => `${v.toFixed(1)} healed/s`,
  tick: (v) => `${v} a tick`,
  strength: (v) => (v < 0 ? `${100 + v}% slow` : `+${v - 100}% haste`),
  depth: (v) => `-${v} on one resist`,
  breadth: (v) => `${v} resist${v === 1 ? '' : 's'}`,
  debuff_total: (v) => `-${v} across resists`,
  duration: (v) => (v === Infinity ? 'permanent' : `${v * 6} s`),
  song_tick: (v) => `${v} a tick`,
};
export function formatMetric(metric, v) {
  if (FORMATS[metric]) return FORMATS[metric](v);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

// ---- disclosure ---------------------------------------------------------------------------

const floorLabel = (spell) => (spell.displayLevel ? ` @L${spell.displayLevel}` : '');

// On a beneficial spell these carry their benefit in a negative number: a damage shield, and
// the counters a cure removes.
const NEGATIVE_IS_BENEFIT = new Set([35, 36, 59, 116]);

// Every effect a spell carries, in words, at the level the client will show it. `friendly`
// words a few effects the way a player reads them; without it the wording matches the
// desktop tool exactly, which is what the parity check compares.
export function bundle(spell, { friendly = false } = {}) {
  const out = [];
  for (const x of spell.slots) {
    const word = spaWord(x.spa);
    if (FLAG_SPAS.has(x.spa)) { out.push(word); continue; }
    if (isCoordinate(spell, x)) { if (x.spa !== 146) out.push(word); continue; }
    if (x.display === 0) continue;
    if (PREFERENCE_SPAS.has(x.spa)) { out.push(word); continue; }
    if (x.entity) { out.push(`${word} → ${x.entity}`); continue; }
    if (ID_SPAS.has(x.spa)) { out.push(word); continue; }
    if (x.spa === 11) {
      if (x.base > 100) out.push(`+${x.display - 100}% haste${floorLabel(spell)}`);
      else if (!friendly) out.push(`attack speed → ${x.display}%${floorLabel(spell)}`);
      else if (spell.beneficial) out.push(`your attacks ${100 - x.display}% slower${floorLabel(spell)}`);
      else out.push(`${100 - x.display}% slow${floorLabel(spell)}`);
      continue;
    }
    if (friendly && x.spa === 334 && x.base < 0) { out.push(`${x.display} damage a tick${floorLabel(spell)}`); continue; }
    if (friendly && spell.beneficial && NEGATIVE_IS_BENEFIT.has(x.spa)) {
      out.push(x.spa === 59 ? `${x.display} damage shield${floorLabel(spell)}`
        : `cures ${x.display} ${word}${x.display === 1 ? '' : 's'}${floorLabel(spell)}`);
      continue;
    }
    out.push(`${x.base < 0 ? '-' : '+'}${x.display} ${word}${floorLabel(spell)}`);
  }
  for (const x of spell.recourse ?? []) {
    if (x.display === 0) continue;
    out.push(`${x.base < 0 ? '-' : '+'}${x.display} ${spaWord(x.spa)} to you${floorLabel(spell)}`);
  }
  return out;
}

// A spell whose own reuse outlasts the cast bar cannot be chain-cast at its cast speed.
export function chainCaution(spell) {
  if (!(spell.reuse > spell.recovery)) return null;
  const cycle = spell.cast + spell.reuse;
  return `${+spell.reuse.toFixed(2)}s recast — repeats every ${cycle.toFixed(1)}s, not every ${occupancy(spell).toFixed(1)}s`;
}
