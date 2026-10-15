// What changed on the page, for the people using it. Shown, newest first, in "What's new" at the
// foot of the page.
//
// Every pull request that changes what a player sees or gets adds ONE entry at the top of this
// list, in the same pull request. One with no effect on the page (a README, a test, a tool)
// adds none. Several changes on one day are separate entries, the newest first.
//
//   date   YYYY-MM-DD, the day the change was made
//   text   one or two plain sentences, in the page's own words: what changed for the player
export const CHANGELOG = [
  {
    date: '2026-10-14',
    text: 'Crowd control rules: charm, mesmerize, pacify, fear, root, snare and blind. Charm and mesmerize '
      + 'are ranked by the highest level they hold, snare by how much it slows, the rest by how long they '
      + 'last. "What you\'re fighting" admits the ones that only work on undead, summoned or animals.',
  },
  {
    date: '2026-10-14',
    text: 'Bards: two song-damage songs in the aura, like Denon\'s Disruptive Discord and Chords of '
      + 'Dissonance, are no longer shown as refusing each other. Tested in game, both land on every mob.',
  },
  {
    date: '2026-10-14',
    text: 'Bards: Singing Mastery and Amplification now raise a Singing song\'s stats and resists as well as '
      + 'its damage shield, as measured in game. Its haste, armor class and mana are still shown unscaled.',
  },
  {
    date: '2026-10-14',
    text: 'Song damage is listed with the other damage rules, after damage over time, instead of last.',
  },
  {
    date: '2026-10-14',
    text: 'Fixed a crash on the Sets tab after an update: a returning visit could load old and new '
      + 'parts of the page together. Each version now loads whole, and the footer shows which one you have.',
  },
  {
    date: '2026-10-14',
    text: 'The gem picker is grouped into sections, most likely first, and the Buffs tab uses the same '
      + 'sections. Collapsible sections now stay open or closed the way you leave them.',
  },
  {
    date: '2026-10-14',
    text: 'Bards: a Symphonic Aura builder for your sets, and the Jam Fest, Singing Mastery and Symphonic '
      + 'Aura ranks under Your trio. Aura gems choose only songs the aura can sing, and the set shows '
      + 'which songs it sings, which it passes over, and which refuse each other.',
  },
  {
    date: '2026-10-14',
    text: 'First version: best picks, buffs, sets and every spell your trio can cast, worked out from your '
      + 'own client files. Import your spellbook export and your saved spell sets.',
  },
];
