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
import { context, resolveSet, nextChanges } from '../src/engine/sets.js';

function row({
  id, name, levels = {}, slots = '', cast = 2500, recovery = 1500, reuse = 0, mana = 10,
  beneficial = 0, target = 5, durFormula = 0, durCap = 0, category = 0, subcategory = 0, notPlayer = 0,
}) {
  const f = Array(FIELD_COUNT).fill('0');
  Object.assign(f, {
    [F.id]: String(id), [F.name]: name, [F.cast]: String(cast), [F.recovery]: String(recovery),
    [F.reuse]: String(reuse), [F.mana]: String(mana), [F.beneficial]: String(beneficial),
    [F.target]: String(target), [F.durFormula]: String(durFormula), [F.durCap]: String(durCap),
    [F.category]: String(category), [F.subcategory]: String(subcategory), [F.desc]: String(id),
    [F.notPlayer]: String(notPlayer), [F.resist]: '1', [F.slots]: slots,
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
