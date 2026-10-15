// Spell sets: a row of gems, each holding a RULE rather than a spell, so the set keeps itself
// current as you level. A rule is one of
//   { kind: 'role', key, metric }   the best castable spell for a ranked role
//   { kind: 'want', key }           the best castable spell for a buff
//   { kind: 'spell', id }           exactly this spell
//   null                            an empty gem
// Within one set a spell fills one gem: pinned spells are placed first, then the rules in gem
// order each take the best spell not already in the set.

import { buildPool } from './pool.js';
import { classify, calibrateBurst, rank, role, ROLE_KEYS } from './roles.js';
import { candidates, want, coveringSlots, WANT_KEYS, isMagnitude as isSize } from './wants.js';
import { LEVEL_CAP } from './layout.js';
import { bardEffects, bardRanks, band, walk, eligible, conflicts, amplification } from './aura.js';

export const GEMS = 14;

export function ruleLabel(rule) {
  if (!rule) return 'empty';
  if (rule.kind === 'role') {
    const r = role(rule.key);
    return r ? `best ${r.label}` : `unknown role ${rule.key}`;
  }
  if (rule.kind === 'want') {
    const w = want(rule.key);
    return w ? `${w.label} buff` : `unknown buff ${rule.key}`;
  }
  return 'this spell';
}

// Everything a set needs at one level, built once and shared by every set. owned: the
// spellbook's names, or null.
export function context(ds, settings, level, owned = null, extraSinging = 0) {
  const { pool } = buildPool(ds, settings.trio, level, {
    fightTicks: settings.fightTicks ?? null, owned, bard: bardEffects(settings, extraSinging),
  });
  const hunting = settings.hunting ?? 'generic';
  const ctx = { hunting, burstThreshold: calibrateBurst(pool, hunting), fightTicks: settings.fightTicks ?? null };
  return { level, pool, ctx, members: classify(pool, ctx), byId: new Map(pool.map((s) => [s.id, s])) };
}

function ordered(rule, c) {
  if (rule.kind === 'role') {
    const r = role(rule.key);
    if (!r) return [];
    const metric = r.metrics.includes(rule.metric) ? rule.metric : r.metrics[0];
    return rank(c.members[rule.key] ?? [], metric, c.ctx);
  }
  if (rule.kind === 'want') return want(rule.key) ? candidates(c.pool, rule.key) : [];
  return [];
}

// gems → [{ rule, spell, value, state, unscribed }] where state is
//   'ok'      a castable spell fills it (a scribed one first, when a spellbook was given;
//             `unscribed` is then a better castable spell that is not in the book)
//   'later'   only a spell above your level would (spell is that one)
//   'none'    nothing in this trio fits
//   'empty'   no rule
// opts.band: gem indices where a rule chooses only songs the Symphonic Aura sings.
export function resolveSet(gems, c, opts = {}) {
  const scoped = opts.band ?? new Set();
  const used = new Set();
  const out = gems.map((rule) => ({ rule, spell: null, value: null, state: rule ? 'none' : 'empty', unscribed: null }));

  out.forEach((g) => {
    if (g.rule?.kind !== 'spell') return;
    const s = c.byId.get(g.rule.id);
    if (!s) return;
    g.spell = s;
    g.state = s.level <= c.level ? 'ok' : 'later';
    used.add(s.id);
  });

  out.forEach((g, i) => {
    if (!g.rule || g.rule.kind === 'spell') return;
    const list = ordered(g.rule, c).filter(([s]) => !used.has(s.id) && (!scoped.has(i) || eligible(s)));
    const castable = list.filter(([s]) => s.level <= c.level);
    const hit = castable.find(([s]) => s.owned !== false) ?? castable[0];
    if (hit) {
      [g.spell, g.value] = hit;
      g.state = 'ok';
      used.add(hit[0].id);
      const better = castable.find(([s, v]) => s.owned === false && v !== null && hit[1] !== null && v > hit[1]);
      if (better && g.rule.kind === 'role') g.unscribed = better[0];
      else if (better && g.rule.kind === 'want' && isSize(g.rule.key)) g.unscribed = better[0];
    } else if (list.length) {
      const soonest = [...list].sort((a, b) => a[0].level - b[0].level)[0];
      [g.spell, g.value] = soonest;
      g.state = 'later';
    }
  });
  return out;
}

// The rules a spell can fill — the roles it belongs to, then the buffs it gives — each with
// what that rule would pick at this level. Used to explain a gem that holds one exact spell.
export function rulesFor(spell, c, { auraOnly = false } = {}) {
  const rules = [
    ...ROLE_KEYS.filter((k) => (c.members[k] ?? []).some((s) => s.id === spell.id)).map((key) => ({ kind: 'role', key })),
    ...WANT_KEYS.filter((k) => coveringSlots(spell, k)).map((key) => ({ kind: 'want', key })),
  ];
  const opts = auraOnly ? { band: new Set([0]) } : {};
  return rules.map((rule) => ({ rule, pick: resolveSet([rule], c, opts)[0] }));
}

// Saved sets from the game become sets of exact spells, merged into yours by name.
export function mergeImported(sets, loadouts) {
  const out = structuredClone(sets);
  const added = [];
  const replaced = [];
  for (const l of loadouts) {
    const gems = l.slots.map((id) => (id ? { kind: 'spell', id } : null));
    const i = out.findIndex((s) => s.name === l.name);
    if (i >= 0) { out[i] = { name: l.name, gems }; replaced.push(l.name); } else { out.push({ name: l.name, gems }); added.push(l.name); }
  }
  return { sets: out, added, replaced };
}

// For each gem, the first level above `from` at which it resolves to a different castable
// spell, and that spell. `at(level)` returns a context; callers cache it.
export function nextChanges(gems, from, at, opts = {}) {
  const now = resolveSet(gems, at(from), opts).map((g) => (g.state === 'ok' ? g.spell.id : null));
  const out = gems.map(() => null);
  for (let lv = from + 1; lv <= LEVEL_CAP; lv += 1) {
    const r = resolveSet(gems, at(lv), opts);
    r.forEach((g, i) => {
      if (out[i] || !gems[i]) return;
      const id = g.state === 'ok' ? g.spell.id : null;
      if (id !== null && id !== now[i]) out[i] = { level: lv, spell: g.spell };
    });
    if (out.every((x, i) => x || !gems[i])) break;
  }
  return out;
}

// A set as the game runs it, with its Symphonic Aura when it has one. at(level, extraSinging)
// returns a context. With Amplification among the pulsed songs, the set is read again with its
// bonus added, so the numbers shown are the ones that land. Not in the first pulse after the aura
// is switched on: the pulse that lands Amplification is not itself amplified.
export function resolveWithAura(gems, settings, level, at, { aura = false } = {}) {
  const rank = aura ? bardRanks(settings).aura : 0;
  const opts = rank ? { band: band(rank, gems.length) } : {};
  let c = at(level, 0);
  let resolved = resolveSet(gems, c, opts);
  if (!rank) return { resolved, c, opts, aura: null };
  let w = walk(resolved, rank);
  const amp = amplification(w.pulsed.map((i) => resolved[i].spell));
  if (amp > 0) {
    c = at(level, amp);
    resolved = resolveSet(gems, c, opts);
    w = walk(resolved, rank);
  }
  const songs = w.pulsed.map((i) => resolved[i].spell);
  const fx = bardEffects(settings, amp);
  return {
    resolved, c, opts,
    aura: { rank, band: opts.band, ...w, amp, singing: fx.singing, songLevels: fx.songLevels, conflicts: conflicts(songs) },
  };
}

// The rules to fill a set's aura gems with, best first, keeping only those an aura song can fill.
const AURA_TEMPLATE = [
  ['role', 'haste'], ['role', 'song_damage'], ['want', 'damage_shield'], ['role', 'slow'],
  ['want', 'singing_amplification'], ['want', 'mana_regen'], ['want', 'armor_class'], ['want', 'regen'],
];

export function auraTemplate(c, rank) {
  return AURA_TEMPLATE.map(([kind, key]) => ({ kind, key }))
    .filter((r) => ordered(r, c).some(([s]) => eligible(s) && s.level <= c.level))
    .slice(0, rank);
}

// Starting points for an empty set. Only rules something in the trio can fill are kept.
const TEMPLATES = {
  fight: [
    ['role', 'damage'], ['role', 'dot'], ['role', 'burst'], ['role', 'heal'], ['role', 'hot'],
    ['role', 'slow'], ['role', 'resist_debuff'], ['role', 'haste'], ['role', 'damage_shield'],
    ['role', 'stat_tap_ac'], ['role', 'pet_heal'], ['role', 'pet_haste'], ['want', 'mana_regen'], ['want', 'feign_death'],
  ],
  buffs: [
    ['want', 'max_hp'], ['want', 'armor_class'], ['want', 'strength'], ['want', 'stamina'], ['want', 'agility'],
    ['want', 'dexterity'], ['want', 'attack'], ['want', 'regen'], ['want', 'movement'], ['want', 'magic_resist'],
    ['want', 'fire_resist'], ['want', 'cold_resist'], ['want', 'poison_resist'], ['want', 'disease_resist'],
  ],
};

export function template(name, c) {
  const rules = (TEMPLATES[name] ?? []).map(([kind, key]) => ({ kind, key }))
    .filter((r) => ordered(r, c).length > 0);
  return Array.from({ length: GEMS }, (_, i) => rules[i] ?? null);
}

// A set as plain text, for pasting into chat.
export function asText(name, resolved, level) {
  const lines = resolved.map((g, i) => {
    const what = g.spell ? `${g.spell.name}${g.state === 'later' ? ` (at L${g.spell.level})` : ''}` : '—';
    return `${String(i + 1).padStart(2)}. ${what}${g.rule ? `  [${ruleLabel(g.rule)}]` : ''}`;
  });
  return `${name} at level ${level}\n${lines.join('\n')}`;
}
