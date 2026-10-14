// What the page shows, computed from a dataset and the player's settings: for every role the
// best spell you can cast now and the next one that beats it, and the same for every buff.

import { buildPool } from './pool.js';
import { classify, calibrateBurst, rank, unvalued, ROLE_KEYS, role } from './roles.js';
import { WANT_KEYS, want, candidates, isMagnitude, displayCoverage } from './wants.js';

const byLevel = (a, b) => a[0].level - b[0].level || b[1] - a[1];

// ranked: [[spell, value]] best first, over every spell in the pool (above-level included).
function pick(ranked, level) {
  const castable = ranked.filter(([s]) => s.level <= level);
  const upcoming = ranked.filter(([s]) => s.level > level);
  const choice = castable[0] ?? null;
  const better = choice ? upcoming.filter(([, v]) => v > choice[1]) : upcoming;
  return {
    castable,
    upcoming,
    choice,
    next: [...better].sort(byLevel)[0] ?? null, // the soonest spell that beats today's pick
    best: better[0] ?? null, // the strongest one in the level range
  };
}

export function analyze(ds, settings) {
  const { trio, level, hunting = 'generic', fightTicks = null, metrics = {} } = settings;
  const { pool, unresolvable } = buildPool(ds, trio, level, { fightTicks });
  const ctx = { hunting, burstThreshold: calibrateBurst(pool, hunting), fightTicks };
  const members = classify(pool, ctx);

  const roles = ROLE_KEYS.map((key) => {
    const r = role(key);
    const metric = r.metrics.includes(metrics[key]) ? metrics[key] : r.metrics[0];
    const spells = members[key];
    return {
      key, label: r.label, metrics: r.metrics, metric, count: spells.length,
      unvalued: unvalued(spells, metric, ctx),
      ...pick(rank(spells, metric, ctx), level),
    };
  });

  const wants = WANT_KEYS.map((key) => {
    const w = want(key);
    const cands = candidates(pool, key);
    const magnitude = isMagnitude(key);
    const p = magnitude ? pick(cands, level) : {
      castable: cands.filter(([s]) => s.level <= level),
      upcoming: cands.filter(([s]) => s.level > level),
    };
    if (!magnitude) {
      p.choice = p.castable[0] ?? null;
      p.next = [...p.upcoming].sort(byLevel)[0] ?? null;
    }
    return { key, label: w.label, magnitude, count: cands.length, ...p, display: (s) => displayCoverage(s, key) };
  });

  return { pool, unresolvable, ctx, roles, wants, level, trio };
}
