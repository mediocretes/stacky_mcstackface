// Vocabulary this page adds to the desktop tool's. spec.js is generated from that tool and is
// never edited by hand; vocab.js merges the two.

export const EXTRA = {
  roles: {
    // A bard song that damages everything around you each tick (effect 334): Denon's
    // Disruptive Discord, Chords of Dissonance. Its tick matches the log's: Denon's 11 at
    // level 30, 12 with Jam Fest's +3 levels.
    song_damage: {
      label: 'song damage',
      diversity: 'none',
      metrics: ['song_tick'],
      match: { beneficial: false, slot: { spa: 334, sign: 'negative' } },
    },
  },
  wants: {
    // Amplification: tenths added to the singing bonus of Singing-skill songs. Its 7 at level
    // 30 took a damage shield from 7 to 11, so 7 means +70%, not the 7% its text prints.
    singing_amplification: { spa: [118], label: 'singing amplification' },
  },
};
