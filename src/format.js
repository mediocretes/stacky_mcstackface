// Small display helpers. Nothing here changes a number; it only puts one into words.

import { PERMANENT } from './engine/formulas.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export function seconds(s) {
  if (s === PERMANENT) return 'permanent';
  if (!s) return 'instant';
  if (s < 120) return `${s} s`;
  const m = s / 60;
  if (m < 120) return `${Number.isInteger(m) ? m : m.toFixed(1)} min`;
  const h = m / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

export const castTime = (s) => (s ? `${+s.toFixed(2)} s` : 'instant');

// Who a spell lands on, by its target code. Codes not listed print as a number.
const TARGETS = {
  1: 'line of sight', 3: 'group', 4: 'area around you', 5: 'one target', 6: 'self',
  8: 'area at target', 9: 'one animal', 10: 'one undead', 11: 'one summoned', 13: 'one target (tap)',
  14: 'your pet', 15: 'corpse', 16: 'one plant', 40: 'area around you', 41: 'group',
  51: 'one target', 52: 'one target', 56: 'one target',
};
export const target = (code) => TARGETS[code] ?? `target type ${code}`;

const SKILLS = { 4: 'abjuration', 5: 'alteration', 14: 'conjuration', 18: 'divination', 24: 'evocation',
  12: 'brass', 41: 'singing', 49: 'stringed', 54: 'wind', 70: 'percussion' };
export const skill = (code) => SKILLS[code] ?? null;

// "SHM 27 · BRD 30" — the classes of the trio that can cast it, lowest first.
export function classes(spell) {
  return Object.entries(spell.classLevels)
    .filter(([, l]) => l >= 1 && l <= 50)
    .sort((a, b) => a[1] - b[1])
    .map(([c, l]) => `${c} ${l}`).join(' · ');
}

// The client's own description, with its placeholders filled: #N is slot N's number, @N its
// cap where it has one, %z the duration.
export function description(spell, ds) {
  const text = ds.descriptions[spell.descId];
  if (!text) return null;
  const slot = (n) => spell.slots.find((x) => x.slot === Number(n));
  return text
    .replace(/#(\d+)/g, (m, n) => { const x = slot(n); return x ? String(Math.abs(x.display)) : m; })
    .replace(/@(\d+)/g, (m, n) => { const x = slot(n); return x ? String(Math.abs(x.max || x.display)) : m; })
    .replace(/%z/g, seconds(spell.displayDuration))
    .replace(/<br>/gi, ' ');
}
