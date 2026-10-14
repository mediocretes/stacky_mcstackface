// Sections for every rule a gem can hold, the ones a gem most often wants first. The gem
// picker and the Buffs tab both use them, so the two always agree. Within a section, rules are
// in alphabetical order of what they are, with "best" ignored.

import { ROLE_KEYS, role } from './engine/roles.js';
import { WANT_KEYS, want } from './engine/wants.js';

const R = (key) => ['role', key];
const W = (key) => ['want', key];

export const GROUPS = [
  ['Damage', [R('damage'), R('burst'), R('dot'), R('song_damage')]],
  ['Healing', [R('heal'), R('hot'), W('regen'), W('instant_heal')]],
  ['Slows and debuffs', [R('slow'), R('resist_debuff'), R('stat_tap_ac'), R('stat_tap_atk'), R('stat_tap_str')]],
  ['Haste and combat', [R('haste'), R('damage_shield'), W('damage_shield'), W('attack'), W('melee_proc'),
    W('hate_on_attack'), W('singing_amplification')]],
  ['Defense', [W('max_hp'), W('armor_class'), W('rune'), W('spell_reflect'), W('invulnerability')]],
  ['Stats', [W('strength'), W('stamina'), W('agility'), W('dexterity'), W('charisma'), W('intelligence'), W('wisdom')]],
  ['Resists', [W('magic_resist'), W('fire_resist'), W('cold_resist'), W('poison_resist'), W('disease_resist')]],
  ['Mana and endurance', [W('mana_regen'), W('hp_to_mana'), W('endurance_regen')]],
  ['Pets and summoning', [R('pet_heal'), R('pet_haste'), W('summon_pet'), W('summon_undead'), W('pet_ward'),
    W('pet_reclaim'), W('recall_pet'), W('pet_size'), W('summon_item'), W('summon_armor')]],
  ['Cures', [W('cure_poison'), W('cure_disease'), W('cure_curse'), W('cure_blindness'), W('dispel')]],
  ['Movement and senses', [W('movement'), W('levitate'), W('water_breathing'), W('invisibility'), W('see_invisible'),
    W('infravision'), W('ultravision'), W('vision_range'), W('see_through'), W('sense'), W('eye_of_zomm'), W('true_north')]],
  ['Travel and escape', [W('gate'), W('bind_affinity'), W('shadow_step'), W('feign_death')]],
  ['Appearance', [W('model_size'), W('illusion')]],
];

// How a rule reads in a list: a role is "best …", a want is what it gives.
export function ruleName(kind, key) {
  if (kind === 'role') return `best ${role(key)?.label ?? key}`;
  return want(key)?.label ?? key;
}

const sortKey = (e) => e.name.replace(/^best /, '').toLowerCase();

// [[title, [{ kind, key, name }]]] for the rules `available(kind, key)` admits, in section
// order and alphabetical within each. Anything no section names lands in "Other", so new
// vocabulary is never silently left out of the picker.
export function sections(available) {
  const named = new Set(GROUPS.flatMap(([, items]) => items.map(([k, key]) => `${k}:${key}`)));
  const rest = [...ROLE_KEYS.map(R), ...WANT_KEYS.map(W)].filter(([k, key]) => !named.has(`${k}:${key}`));
  return [...GROUPS, ['Other', rest]]
    .map(([title, items]) => [title, items
      .filter(([k, key]) => (k === 'role' ? role(key) : want(key)) && available(k, key))
      .map(([kind, key]) => ({ kind, key, name: ruleName(kind, key) }))
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || (a.kind === 'role' ? -1 : 1))])
    .filter(([, items]) => items.length);
}
