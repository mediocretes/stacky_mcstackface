// Engine tests on SYNTHETIC rows. No game data lives in this repository: every row below is
// made up here, in the client file's layout, to exercise one rule.
//
//   node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { F, FIELD_COUNT, CLASSES, splitRow, LayoutError } from '../src/engine/layout.js';
import { increment, resolve, durationTicks, PERMANENT } from '../src/engine/formulas.js';
import { parseClientFiles } from '../src/engine/parse.js';
import { buildPool } from '../src/engine/pool.js';
import { classify, calibrateBurst, rank, bundle, formatMetric } from '../src/engine/roles.js';
import { candidates, coverage } from '../src/engine/wants.js';
import { analyze } from '../src/engine/analysis.js';
import { context, resolveSet, nextChanges, rulesFor, mergeImported, resolveWithAura, auraTemplate } from '../src/engine/sets.js';
import { verdict, band, walk, conflicts } from '../src/engine/aura.js';
import { parseSpellbook, parseLoadouts, importKind } from '../src/engine/imports.js';

function row({
  id, name, levels = {}, slots = '', cast = 2500, recovery = 1500, reuse = 0, mana = 10,
  beneficial = 0, target = 5, durFormula = 0, durCap = 0, category = 0, subcategory = 0, notPlayer = 0, skill = 0,
}) {
  const f = Array(FIELD_COUNT).fill('0');
  Object.assign(f, {
    [F.id]: String(id), [F.name]: name, [F.cast]: String(cast), [F.recovery]: String(recovery),
    [F.reuse]: String(reuse), [F.mana]: String(mana), [F.beneficial]: String(beneficial),
    [F.target]: String(target), [F.durFormula]: String(durFormula), [F.durCap]: String(durCap),
    [F.category]: String(category), [F.subcategory]: String(subcategory), [F.desc]: String(id),
    [F.notPlayer]: String(notPlayer), [F.resist]: '1', [F.slots]: slots, [F.skill]: String(skill),
  });
  CLASSES.forEach((c, i) => { f[F.classBase + i] = String(levels[c] ?? 255); });
  return f.join('^');
}

const SPELLS = [
  row({ id: 1, name: 'Test Bolt', levels: { WIZ: 5 }, slots: '1|0|-20|0|102|100', category: 1 }),
  row({ id: 2, name: 'Test Slow', levels: { SHM: 10 }, slots: '1|11|80|0|101|50', durFormula: 6, durCap: 35, category: 2, subcategory: 3 }),
  row({ id: 3, name: 'Better Slow', levels: { SHM: 30 }, slots: '1|11|70|0|101|40', durFormula: 6, durCap: 35, category: 2, subcategory: 3 }),
  row({ id: 4, name: 'Test Strength', levels: { SHM: 1 }, slots: '1|4|5|0|101|20', beneficial: 1, target: 51, durFormula: 3, category: 4 }),
  row({ id: 5, name: 'Test Discipline', levels: { WIZ: 10 }, slots: '1|0|-5|0|100|0', category: 5 }),
  row({ id: 6, name: 'Test Item Effect', levels: { SHM: 1 }, slots: '1|4|50|0|100|0', beneficial: 1, notPlayer: 1 }),
  row({ id: 7, name: 'Test Out Of Band', levels: { WAR: 60 }, slots: '1|0|-5|0|100|0' }),
  row({ id: 8, name: 'Test Odd Formula', levels: { ENC: 15 }, slots: '1|0|-10|0|999|0' }),
].join('\n');

const DBSTR = [
  '1^5^Direct Damage^0', '2^5^Utility Detrimental^0', '3^5^Slow^0', '4^5^Statistic Buffs^0', '5^5^Disciplines^0',
  '2^6^Slows your target for %z.^0', '4^6^Increases strength by #1.^0',
].join('\n');

const ds = parseClientFiles(SPELLS, DBSTR);
const TRIO = ['SHM', 'WIZ', 'ENC'];

test('formulas: scaling, down-growing caps, durations', () => {
  assert.equal(increment(101, 30), 15);
  assert.equal(increment(110, 30), 5);
  assert.equal(increment(999, 30), null);
  assert.equal(resolve(-20, 102, 100, 20), 40);
  assert.equal(resolve(80, 101, 50, 20), 70); // a slow: 0 < max < base scales DOWN
  assert.equal(resolve(80, 101, 50, 80), 50); // and stops at max
  assert.throws(() => resolve(10, 999, 0, 20), /formula 999/);
  assert.equal(durationTicks(6, 35, 30), 17);
  assert.equal(durationTicks(50, 0, 30), PERMANENT);
  assert.equal(durationTicks(300, 12, 30), 12); // 200 and up are literal tick counts
});

test('layout: a row of the wrong width or with moved effects is refused', () => {
  assert.equal(splitRow(''), null);
  assert.equal(splitRow(row({ id: 9, name: 'x', slots: '1|0|-14958600.3|0|100|0' })).length, FIELD_COUNT);
  assert.throws(() => splitRow(Array(173).fill('0').join('^')), LayoutError);
  const moved = row({ id: 9, name: 'x' }).split('^');
  moved[F.slots] = 'not slots';
  assert.throws(() => splitRow(moved.join('^')), LayoutError);
});

test('parse: keeps the level 1-50 rows, drops item effects, keeps only needed strings', () => {
  assert.deepEqual(ds.spells.map((s) => s.id), [1, 2, 3, 4, 5, 8]);
  assert.equal(ds.source.notPlayer, 1);
  assert.equal(ds.categories[3], 'Slow');
  assert.deepEqual(Object.keys(ds.descriptions).sort(), ['2', '4']);
});

test('pool: trio levels, value at your level, display at the spell\'s own', () => {
  const { pool, unresolvable } = buildPool(ds, TRIO, 20);
  const byId = Object.fromEntries(pool.map((s) => [s.id, s]));
  assert.ok(!byId[5], 'a discipline cannot occupy a gem');
  assert.deepEqual(unresolvable.map((u) => u.id), [8]);
  assert.equal(byId[1].slots[0].value, 40);
  assert.equal(byId[1].level, 5);
  assert.equal(byId[3].level, 30);
  assert.equal(byId[3].displayLevel, 30);
  assert.equal(byId[3].slots[0].value, 60); // at level 20, for ranking
  assert.equal(byId[3].slots[0].display, 55); // at level 30, what the game will show
});

test('roles: membership, ranking, wording', () => {
  const { pool } = buildPool(ds, TRIO, 20);
  const ctx = { hunting: 'generic', burstThreshold: calibrateBurst(pool), fightTicks: null };
  const roles = classify(pool, ctx);
  assert.deepEqual(roles.slow.map((s) => s.name), ['Test Slow', 'Better Slow']);
  assert.deepEqual(roles.damage.map((s) => s.name), ['Test Bolt']);
  const ranked = rank(roles.slow, 'strength', ctx);
  assert.deepEqual(ranked.map(([s, v]) => [s.name, v]), [['Better Slow', -60], ['Test Slow', -70]]);
  assert.equal(formatMetric('strength', -70), '30% slow');
  const slow = pool.find((s) => s.id === 2);
  assert.deepEqual(bundle(slow), ['attack speed → 70%']);
  assert.deepEqual(bundle(slow, { friendly: true }), ['30% slow']);
});

test('analysis: the best castable pick and the next one that beats it', () => {
  const r = analyze(ds, { trio: TRIO, level: 20 });
  const slow = r.roles.find((x) => x.key === 'slow');
  assert.equal(slow.choice[0].name, 'Test Slow');
  assert.equal(slow.next[0].name, 'Better Slow');
});

test('wants: a buff is covered by its effect and sized by it', () => {
  const { pool } = buildPool(ds, TRIO, 20);
  const strength = candidates(pool, 'strength');
  assert.deepEqual(strength.map(([s, v]) => [s.name, v]), [['Test Strength', 15]]);
  assert.equal(coverage(pool.find((s) => s.id === 1), 'strength'), null);
});

test('sets: rules resolve at your level and know when they change', () => {
  const cache = new Map();
  const at = (lv) => cache.get(lv) ?? (cache.set(lv, context(ds, { trio: TRIO }, lv)), cache.get(lv));
  const gems = [{ kind: 'role', key: 'slow' }, { kind: 'want', key: 'strength' }, { kind: 'spell', id: 3 }, null];
  const r = resolveSet(gems, at(20));
  assert.deepEqual(r.map((g) => [g.spell?.name ?? null, g.state]),
    [['Test Slow', 'ok'], ['Test Strength', 'ok'], ['Better Slow', 'later'], [null, 'empty']]);
  const next = nextChanges(gems, 20, at);
  assert.equal(next[0], null, 'the pinned Better Slow is taken, so the slow rule keeps Test Slow');
  assert.deepEqual([next[2].level, next[2].spell.name], [30, 'Better Slow'], 'the pin becomes castable at 30');
  const free = nextChanges([{ kind: 'role', key: 'slow' }], 20, at);
  assert.deepEqual([free[0].level, free[0].spell.name], [30, 'Better Slow']);
});

test('share links round-trip and refuse junk', async () => {
  globalThis.location = { origin: 'https://example.test', pathname: '/planner/' };
  const { shareLink, readShareLink } = await import('../src/sets-view.js');
  const settings = { trio: TRIO, level: 20, sets: [{ name: 'Fight ✓', gems: [{ kind: 'role', key: 'slow' }, { kind: 'spell', id: 3 }, { kind: 'bogus' }] }] };
  const link = shareLink(settings);
  assert.ok(link.startsWith('https://example.test/planner/#share='));
  const back = readShareLink(link.slice(link.indexOf('#')));
  assert.equal(back.sets[0].name, 'Fight ✓');
  assert.deepEqual(back.sets[0].gems.slice(0, 3), [{ kind: 'role', key: 'slow' }, { kind: 'spell', id: 3 }, null]);
  assert.equal(back.sets[0].gems.length, 14);
  assert.equal(readShareLink('#share=not-json'), null);
});

test('imports: spellbook export and saved sets', () => {
  const book = parseSpellbook('1\tTest Strength\r\n10\tTest Slow\r\n\r\n');
  assert.deepEqual([...book.entries()], [['Test Strength', 1], ['Test Slow', 10]]);
  assert.throws(() => parseSpellbook('nothing here'), /no spellbook lines/);

  const ini = ['[HotButtons]', 'Page1Button1=x', '[SpellLoadouts]',
    'SpellLoadout1.inuse=1', 'SpellLoadout1.name=Fight', 'SpellLoadout1.slot1=2', 'SpellLoadout1.slot2=-1', 'SpellLoadout1.slot3=999',
    'SpellLoadout2.inuse=0', 'SpellLoadout2.name=Old', 'SpellLoadout2.slot1=4',
    'SpellLoadout3.inuse=1', 'SpellLoadout3.name=',
    '[Other]', 'SpellLoadout4.name=Not a loadout'].join('\r\n');
  const sets = parseLoadouts(ini);
  assert.equal(sets.length, 1, 'unused and unnamed sets are left out');
  assert.equal(sets[0].name, 'Fight');
  assert.deepEqual(sets[0].slots.slice(0, 4), [2, null, 999, null]);
  assert.equal(sets[0].slots.length, 14);
  assert.throws(() => parseLoadouts('[Defaults]\nx=1'), /no saved spell sets/);

  assert.equal(importKind('Someone_server-BRD-Spellbook.txt', ''), 'spellbook');
  assert.equal(importKind('Someone_server_LO3.ini', ''), 'loadouts');
  assert.equal(importKind('renamed.txt', '[SpellLoadouts]\nSpellLoadout1.name=A'), 'loadouts');
  assert.equal(importKind('renamed.txt', '12\tSome Spell'), 'spellbook');
  assert.equal(importKind('notes.txt', 'hello'), null);

  const merged = mergeImported([{ name: 'Fight', gems: [] }, { name: 'Mine', gems: [] }], sets);
  assert.deepEqual(merged.replaced, ['Fight']);
  assert.deepEqual(merged.sets.map((x) => x.name), ['Fight', 'Mine']);
  assert.deepEqual(merged.sets[0].gems.slice(0, 3), [{ kind: 'spell', id: 2 }, null, { kind: 'spell', id: 999 }]);
});

test('spellbook: picks prefer what you have scribed and name the better one you have not', () => {
  const ds2 = parseClientFiles(`${SPELLS}\n${row({ id: 10, name: 'Mid Slow', levels: { SHM: 15 }, slots: '1|11|75|0|101|45', durFormula: 6, durCap: 35 })}`, DBSTR);
  const owned = new Set(['Test Slow', 'Test Strength', 'Test Bolt']);
  const r = analyze(ds2, { trio: TRIO, level: 20 }, owned);
  const slow = r.roles.find((x) => x.key === 'slow');
  assert.equal(slow.choice[0].name, 'Test Slow');
  assert.equal(slow.unscribed[0].name, 'Mid Slow');
  assert.equal(slow.choice[0].owned, true);
  assert.equal(slow.unscribed[0].owned, false);

  const withoutBook = analyze(ds2, { trio: TRIO, level: 20 });
  assert.equal(withoutBook.roles.find((x) => x.key === 'slow').choice[0].name, 'Mid Slow');

  const c = context(ds2, { trio: TRIO }, 20, owned);
  const [g] = resolveSet([{ kind: 'role', key: 'slow' }], c);
  assert.deepEqual([g.spell.name, g.unscribed.name], ['Test Slow', 'Mid Slow']);

  // An imported gem holding Test Slow: it fills the slow role, whose pick (with this book) is itself.
  const hints = rulesFor(c.byId.get(2), c);
  assert.deepEqual(hints.map((h) => [h.rule.kind, h.rule.key, h.pick.spell.name]), [['role', 'slow', 'Test Slow']]);
});

// ---- the Symphonic Aura, on synthetic songs ----------------------------------------------------
const song = (o) => row({ mana: 0, reuse: 0, beneficial: 1, skill: 41, durFormula: 5, ...o });
const SONGS = [
  song({ id: 20, name: 'Test Haste Song', levels: { BRD: 5 }, slots: '1|11|110|0|101|130', target: 6, category: 6 }),
  row({ id: 21, name: 'Test Spell Haste', levels: { SHM: 5 }, slots: '1|11|140|0|100|0', beneficial: 1, target: 51, durFormula: 3, category: 6 }),
  song({ id: 22, name: 'Test Shield Song', levels: { BRD: 8 }, slots: '1|59|-6|0|100|0', target: 41 }),
  song({ id: 23, name: 'Test Amp', levels: { BRD: 10 }, slots: '1|118|2|0|110|28', target: 6 }),
  song({ id: 24, name: 'Test Lull Song', levels: { BRD: 6 }, slots: '1|18|1|0|100|0', target: 5, beneficial: 0 }),
  song({ id: 25, name: 'Test Paid Song', levels: { BRD: 7 }, slots: '1|4|10|0|100|0', target: 41, mana: 10 }),
  song({ id: 26, name: 'Test Other Haste Song', levels: { BRD: 9 }, slots: '2|11|105|0|100|0', target: 41, skill: 70, category: 6 }),
  song({ id: 27, name: 'Test Small Shield Song', levels: { BRD: 9 }, slots: '1|59|-3|0|100|0', target: 41, skill: 70 }),
].join('\n');
const dsA = parseClientFiles(`${SPELLS}\n${SONGS}`, `${DBSTR}\n6^5^Haste^0`);
const BTRIO = ['BRD', 'SHM', 'WIZ'];
const bardAt = (bard) => {
  const cache = new Map();
  const settings = { trio: BTRIO, bard };
  return [settings, (lv, extra = 0) => cache.get(`${lv}:${extra}`) ?? (cache.set(`${lv}:${extra}`, context(dsA, settings, lv, null, extra)), cache.get(`${lv}:${extra}`))];
};

test('aura: which songs it sings', () => {
  const [, at] = bardAt({});
  const by = (id) => at(20).byId.get(id);
  assert.equal(verdict(by(20)).pulsed, true, 'self only');
  assert.equal(verdict(by(22)).pulsed, true, 'group');
  assert.equal(verdict(by(24)).pulsed, false, 'single target');
  assert.match(verdict(by(25)).why, /mana/);
  assert.equal(verdict(by(21)).why, 'not a bard song');
  assert.deepEqual([...band(3)].sort((a, b) => a - b), [11, 12, 13]);
});

test('aura: the walk up from the last gem — pulsed, skipped, dead', () => {
  const [, at] = bardAt({});
  const c = at(20);
  const pin = (id) => ({ kind: 'spell', id });
  const gems = Array(14).fill(null);
  gems[13] = pin(20); gems[12] = pin(21); gems[11] = pin(22); gems[2] = pin(26);
  const w = walk(resolveSet(gems, c), 2);
  assert.deepEqual(w.pulsed, [13, 11], 'the spell at 13 is passed over and the aura reaches 12');
  assert.deepEqual(w.skipped, [12]);
  assert.deepEqual(w.dead, [2], 'an aura song the aura does not reach cannot be sung by hand');
});

test('aura: rules in aura gems choose only aura songs', () => {
  const [settings, at] = bardAt({ aura: 1 });
  const gems = [...Array(13).fill(null), { kind: 'role', key: 'haste' }];
  assert.equal(resolveSet(gems, at(20))[13].spell.name, 'Test Spell Haste', 'outside an aura, the bigger spell haste wins');
  const r = resolveWithAura(gems, settings, 20, at, { aura: true });
  assert.equal(r.resolved[13].spell.name, 'Test Haste Song');
  assert.deepEqual(r.aura.pulsed, [13]);
  assert.deepEqual(rulesFor(at(20).byId.get(20), at(20), { auraOnly: true }).map((h) => h.pick.spell.name), ['Test Haste Song']);
});

test('aura: Jam Fest levels and the singing bonus', () => {
  const [, plain] = bardAt({});
  const [, bard] = bardAt({ jamFest: 2, singingMastery: 1 });
  assert.equal(plain(20).byId.get(20).slots[0].value, 120);
  assert.equal(bard(20).byId.get(20).slots[0].value, 121, 'Jam Fest 2: the song reads at 23');
  assert.equal(plain(20).byId.get(22).slots[0].value, 6);
  assert.equal(bard(20).byId.get(22).slots[0].value, 7, 'Singing Mastery 1: 6 × 1.2, rounded down');
  assert.equal(bard(20).byId.get(27).slots[0].value, 3, 'a percussion song takes no singing bonus');
  assert.equal(bard(20).byId.get(21).slots[0].value, 140, 'a spell takes neither');
});

test('aura: Amplification among the pulsed songs raises the shields that land', () => {
  const [settings, at] = bardAt({ aura: 2, jamFest: 2, singingMastery: 1 });
  const gems = [...Array(12).fill(null), { kind: 'spell', id: 22 }, { kind: 'spell', id: 23 }];
  const r = resolveWithAura(gems, settings, 20, at, { aura: true });
  assert.equal(r.aura.amp, 5, 'Amplification 2 + 23/6');
  assert.equal(r.aura.singing, 7);
  assert.equal(r.resolved[12].spell.slots[0].value, 10, '6 × 1.7');
});

test('aura: songs in each other\'s way', () => {
  const [, at] = bardAt({});
  const c = at(20);
  const [shieldBig, shieldSmall, hasteA, hasteB] = [22, 27, 20, 26].map((id) => c.byId.get(id));
  const refused = conflicts([shieldBig, shieldSmall]);
  assert.deepEqual(refused.map((x) => [x.kind, x.keep.name, x.refuse.name]), [['refused', 'Test Shield Song', 'Test Small Shield Song']]);
  const haste = conflicts([hasteA, hasteB]);
  assert.deepEqual(haste.map((x) => [x.kind, x.keep.name]), [['haste', 'Test Haste Song']], 'hastes never add, whatever the slot');
  assert.deepEqual(auraTemplate(c, 5).map((r) => r.key), ['haste', 'damage_shield', 'singing_amplification']);
});

test('aura: two song-damage songs both land on a mob; other shared effects still refuse', () => {
  const s = (name, beneficial, slots) => ({ name, beneficial, slots });
  const x = (slot, spa, value, base = -value) => ({ slot, spa, value, base });
  const big = s('Test Big Song Damage', 0, [x(1, 334, 12)]);
  const small = s('Test Small Song Damage', 0, [x(1, 334, 10)]);
  assert.deepEqual(conflicts([big, small]), [], 'both tick on every mob');
  const mezA = s('Test Mez A', 0, [x(1, 31, 2, 1)]);
  const mezB = s('Test Mez B', 0, [x(1, 31, 1, 1)]);
  assert.deepEqual(conflicts([mezA, mezB]).map((c) => c.kind), ['refused'], 'a shared mez was not tested, so it is still named');
  const onYouA = s('Test Shield A', 1, [x(1, 334, 12)]);
  const onYouB = s('Test Shield B', 1, [x(1, 334, 10)]);
  assert.deepEqual(conflicts([onYouA, onYouB]).map((c) => c.kind), ['refused'], 'on you the rule is unchanged');
});

test('rule sections: most likely first, alphabetical within, nothing left over', async () => {
  const { sections } = await import('../src/groups.js');
  const all = sections(() => true);
  assert.deepEqual(all.map(([title]) => title), ['Damage', 'Healing', 'Slows and debuffs', 'Haste and combat', 'Defense',
    'Stats', 'Resists', 'Mana and endurance', 'Pets and summoning', 'Cures', 'Movement and senses', 'Travel and escape', 'Appearance'],
  'every rule has a section; a new one shows up here as "Other" until it is given one');
  assert.deepEqual(all[0][1].map((r) => r.name), ['best burst damage', 'best damage', 'best damage over time', 'best song damage']);
  assert.deepEqual(all[5][1].map((r) => r.name), ['agility', 'charisma', 'dexterity', 'intelligence', 'stamina', 'strength', 'wisdom']);
  const onlyWants = sections((kind) => kind === 'want');
  assert.ok(!onlyWants.some(([title]) => title === 'Damage'), 'a section with nothing available is left out');
});
