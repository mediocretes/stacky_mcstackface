// Kinds of buff you want ON YOU — strength, a resist, see invisible — and which spells
// provide each. Not a ranking: the size orders one attribute, which cannot decide between
// spells that each carry several. Where the number is not a size (an item id, a presence
// flag), candidates are listed by level instead.

import { SPEC } from './vocab.js';
import { PERMANENT } from './formulas.js';
import { effectSign, negativeHp, PET_TARGETS, ID_SPAS, FLAG_SPAS, PREFERENCE_SPAS, COORDINATE_SPAS } from './roles.js';

export const WANT_KEYS = Object.keys(SPEC.wants);
export const want = (key) => SPEC.wants[key];

// The slots through which this spell covers this want, or null where it does not.
export function coveringSlots(spell, key) {
  const w = SPEC.wants[key];
  if (!w) return null; // a rule this vocabulary does not know covers nothing
  if (spell.beneficial === 0) return null; // a want is always something you want on you
  if (w.needs_duration && spell.ticks !== PERMANENT && spell.ticks === 0) return null;
  if (!w.pet && PET_TARGETS.includes(spell.target)) return null;

  const negative = w.sign === 'negative';
  const slots = spell.slots.filter((x) => {
    if (!w.spa.includes(x.spa) || x.value === 0) return false;
    const sign = effectSign(x);
    return negative ? sign < 0 : sign > 0;
  });
  if (slots.length === 0) return null;

  const costsHp = negativeHp(spell);
  if (w.requires_negative_hp && !costsHp) return null;
  if (w.excludes_negative_hp && costsHp) return null;
  return slots;
}

export const proposes = (spell) => WANT_KEYS.filter((k) => coveringSlots(spell, k));

export function coverage(spell, key) {
  const slots = coveringSlots(spell, key);
  return slots ? slots.reduce((a, x) => a + x.value, 0) : null;
}

export function displayCoverage(spell, key) {
  const slots = coveringSlots(spell, key);
  return slots ? slots.reduce((a, x) => a + x.display, 0) : null;
}

const spasOf = (key) => SPEC.wants[key].spa;
const anyIn = (key, set) => spasOf(key).some((spa) => set.has(spa));

// Is this want's number a size? Not when it is an id, a flag, a preference or a place.
export function isMagnitude(key) {
  return !anyIn(key, ID_SPAS) && !anyIn(key, FLAG_SPAS) && !anyIn(key, PREFERENCE_SPAS) && !anyIn(key, COORDINATE_SPAS);
}

const byLevelDesc = (a, b) => b[0].level - a[0].level || (a[0].name < b[0].name ? -1 : a[0].name > b[0].name ? 1 : 0);

// [[spell, size]] — largest first for a size, highest level first otherwise.
export function candidates(pool, key) {
  const cands = pool.filter((s) => coveringSlots(s, key)).map((s) => [s, coverage(s, key)]);
  if (!isMagnitude(key)) return cands.sort(byLevelDesc);
  return cands.sort((a, b) => b[1] - a[1]);
}
