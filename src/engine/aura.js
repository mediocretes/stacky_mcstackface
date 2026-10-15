// The bard's Symphonic Aura: a toggled AA that sings some of your memorized songs for you.
//
// What the client says (the AA's own text): it pulses the first eligible song "starting from
// your final spell gem, and working backwards", one song a rank. A song is eligible when it
// costs no mana, has no cooldown and is not single-target. While it is on, an eligible song
// "cannot be played manually".
//
// What the log shows: every pulsed song lands together, in the same second, every 6 seconds
// (about 400 pulses of three songs on one day, 160 of three on another). So a song's own
// duration does not matter and more ranks do not thin the others; a song in the aura costs
// nothing but its gem.

import { GEMS } from './imports.js';

// Rank → levels Jam Fest adds to songs, from the client's text for each rank (1, 3, 5, 6, 7).
// Rank 2 was measured: Denon's ticked 11 before and 12 after, at one level, in one stance.
export const JAM_FEST_LEVELS = [0, 1, 3, 5, 6, 7];
// Rank → tenths Singing Mastery adds to the singing bonus (the client's 20, 40, 60, 80%).
export const SINGING_MASTERY_TENTHS = [0, 2, 4, 6, 8];

// The bard's AA ranks as stored in settings, or zeros when the trio has no bard.
export function bardRanks(settings) {
  const b = settings.bard ?? {};
  const has = settings.trio?.includes('BRD');
  const n = (v, max) => (has ? Math.min(Math.max(parseInt(v, 10) || 0, 0), max) : 0);
  return { aura: n(b.aura, 12), jamFest: n(b.jamFest, 5), singingMastery: n(b.singingMastery, 4) };
}

// What the pool needs from them.
export function bardEffects(settings, extraSinging = 0) {
  const r = bardRanks(settings);
  return { songLevels: JAM_FEST_LEVELS[r.jamFest], singing: SINGING_MASTERY_TENTHS[r.singingMastery] + extraSinging };
}

// Who a song lands on, and whether the aura will sing it. Every "eligible" was tried in game
// with the aura on; "assumed" ones were not.
const TARGETS = {
  6: ['eligible', 'self only: refused by hand with the aura on'],
  4: ['eligible', 'around you: kept pulsing with the aura on'],
  41: ['eligible', 'group: refused by hand with the aura on'],
  5: ['ineligible', 'single target: sung by hand with the aura on'],
  3: ['assumed', 'group (an older type): assumed like the newer group type, never tried'],
  8: ['assumed-out', 'targeted area: assumed like single target, never tried'],
};

export function verdict(spell) {
  if (!spell.song) return { pulsed: false, state: 'ineligible', why: 'not a bard song' };
  if (spell.mana > 0) return { pulsed: false, state: 'ineligible', why: `costs ${spell.mana} mana` };
  if (spell.reuse > 0) return { pulsed: false, state: 'ineligible', why: `has a ${spell.reuse} s cooldown` };
  const t = TARGETS[spell.target];
  if (!t) return { pulsed: false, state: 'unknown', why: `target type ${spell.target} has never been tried with the aura on` };
  const [state, why] = t;
  return { pulsed: state === 'eligible' || state === 'assumed', state, why };
}

export const eligible = (spell) => verdict(spell).pulsed;

// The gems where rules choose only aura songs: the last `rank` of them.
export function band(rank, gems = GEMS) {
  const n = Math.min(Math.max(rank, 0), gems);
  return new Set(Array.from({ length: n }, (_, i) => gems - 1 - i));
}

// Walk up from the last gem, as the aura does. resolved: [{ spell, state }] per gem.
//   pulsed   gems the aura sings
//   dead     eligible songs it does not reach — with the aura on they cannot be sung by hand
//   skipped  gems inside the band holding something the aura passes over
//   unknown  songs whose target type nobody has tried with the aura on
export function walk(resolved, rank) {
  const out = { pulsed: [], dead: [], skipped: [], unknown: [] };
  const inBand = band(rank, resolved.length);
  for (let i = resolved.length - 1; i >= 0; i -= 1) {
    const g = resolved[i];
    const s = g.state === 'ok' ? g.spell : null;
    if (!s) continue;
    const v = verdict(s);
    if (v.pulsed) (out.pulsed.length < rank ? out.pulsed : out.dead).push(i);
    else if (v.state === 'unknown') out.unknown.push(i);
    else if (inBand.has(i)) out.skipped.push(i);
  }
  return out;
}

// Effects that never decide whether two songs can both hold: flags and stacking markers.
const IGNORED = new Set([13, 35, 36, 39, 57, 65, 66, 79, 116, 148, 149,
  ...Array.from({ length: 21 }, (_, i) => 124 + i)]);

const strength = (x) => (x.spa === 11 && x.base < 100 ? 100 - x.value : Math.abs(x.value));

// Two ways songs get in each other's way, both seen in game. Only songs are compared: a song
// and an ordinary spell were seen to hold together. Songs on you and on your target never meet.
//
//   refused   the same effect in the same slot: the game keeps the larger song and refuses the
//             smaller one, silently and whole (Anthem de Arms against Chant of Battle).
//   haste     attack speed never adds up, whatever slot it sits in: only the larger haste (or
//             slow) counts, and the smaller song's other effects still hold (Anthem de Arms'
//             haste never added to Jonthan's, while its strength did).
//
// On a mob, song damage (effect 334) never decides a refusal: two song-damage songs sharing its slot
// were pulsed together in game, and every pulse landed both ticks on every mob. Only that effect was
// tried, so two detrimental songs sharing anything else are still compared as above.
const COEXIST_ON_A_MOB = new Set([334]);

export function conflicts(songs) {
  const out = [];
  for (let i = 0; i < songs.length; i += 1) {
    for (let j = i + 1; j < songs.length; j += 1) {
      const a = songs[i];
      const b = songs[j];
      if ((a.beneficial !== 0) !== (b.beneficial !== 0)) continue;
      const onMob = a.beneficial === 0;
      const shared = [];
      for (const x of a.slots) {
        if (IGNORED.has(x.spa) || x.value === 0 || (onMob && COEXIST_ON_A_MOB.has(x.spa))) continue;
        const y = b.slots.find((z) => z.slot === x.slot && z.spa === x.spa && z.value !== 0);
        if (y) shared.push({ slot: x.slot, spa: x.spa, a: strength(x), b: strength(y) });
      }
      if (shared.length) {
        const aWins = shared.filter((s) => s.a > s.b).length;
        const bWins = shared.filter((s) => s.b > s.a).length;
        const [keep, refuse] = aWins >= bWins ? [a, b] : [b, a];
        out.push({ kind: 'refused', keep, refuse, shared });
        continue;
      }
      const speed = (s) => s.slots.find((x) => x.spa === 11 && x.value !== 0);
      const [x, y] = [speed(a), speed(b)];
      if (x && y && (x.base > 100) === (y.base > 100)) {
        const [keep, refuse] = strength(x) >= strength(y) ? [a, b] : [b, a];
        out.push({ kind: x.base > 100 ? 'haste' : 'slow', keep, refuse, shared: [] });
      }
    }
  }
  return out;
}

// Amplification's own number, in tenths of the singing bonus, if it is among these songs.
export function amplification(songs) {
  return songs.reduce((t, s) => t + s.slots.filter((x) => x.spa === 118).reduce((a, x) => a + x.value, 0), 0);
}
