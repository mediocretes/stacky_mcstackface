// What the page shows, computed from a dataset and the player's settings: for every role the
// best spell you can cast now and the next one that beats it, and the same for every buff.

import { buildPool } from './pool.js';
import { classify, calibrateBurst, rank, unvalued, ROLE_KEYS, role } from './roles.js';
import { WANT_KEYS, want, candidates, isMagnitude, displayCoverage } from './wants.js';

const byLevel = (a, b) => a[0].level - b[0].level || b[1] - a[1];

// ranked: [[spell, value]] best first, over every spell in the pool (above-level included).
// With a spellbook, the pick is the best spell you have scribed, and a better one you could
// scribe now is named beside it.
function pick(ranked, level) {
  const castable = ranked.filter(([s]) => s.level <= level);
  const upcoming = ranked.filter(([s]) => s.level > level);
  const choice = castable.find(([s]) => s.owned !== false) ?? castable[0] ?? null;
  const unscribed = choice ? castable.find(([s, v]) => s.owned === false && v > choice[1]) ?? null : null;
  const better = choice ? upcoming.filter(([, v]) => v > choice[1]) : upcoming;
  return {
    castable,
    upcoming,
    choice,
    unscribed,
    next: [...better].sort(byLevel)[0] ?? null, // the soonest spell that beats today's pick
    best: better[0] ?? null, // the strongest one in the level range
  };
}

export function analyze(ds, settings, owned = null) {
  const { trio, level, hunting = 'generic', fightTicks = null, metrics = {} } = settings;
  const { pool, unresolvable } = buildPool(ds, trio, level, { fightTicks, owned });
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
      p.choice = p.castable.find(([s]) => s.owned !== false) ?? p.castable[0] ?? null;
      p.unscribed = null;
      p.next = [...p.upcoming].sort(byLevel)[0] ?? null;
    }
    return { key, label: w.label, magnitude, count: cands.length, ...p, display: (s) => displayCoverage(s, key) };
  });

  return { pool, unresolvable, ctx, roles, wants, level, trio };
}
