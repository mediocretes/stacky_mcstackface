# Stacky McStackface

A single web page for EverQuest Legends players: pick your three classes and a
level, and see the best spell your trio can cast for each job — heal, slow, haste, nuke, damage over
time, buffs — and the spell that replaces it later. Build spell sets that keep themselves current as
you level.

It runs entirely in your browser and ships no game data. You give it two files from your own
install, and it works everything out from those.

## Using it

1. Open the page.
2. From your EverQuest Legends folder (the one with `eqgame.exe`), choose **`spells_us.txt`** and
   **`dbstr_us.txt`**, one at a time in either order, or drop them on the page. The folder is large:
   type the name into the file window's *File name* box rather than scrolling for it. You only do
   this once, and again after a game patch.
3. Choose your three classes and your trio's level — the lowest of the three.
4. Optionally, add two more files from the same folder:
   - **your spellbook export**, `<name>_<server>-<class>-Spellbook.txt`, written in game by
     `/outputfile spellbook`. Picks then prefer spells you have scribed, mark the ones you have
     not, and name a better one you could scribe now.
   - **your saved spell sets**, `<name>_<server>_LO1.ini` (LO2, LO3… for your other class sets).
     Each saved set becomes a set on the Sets tab.

Every file goes in the **Your files** panel at the top. It folds down to a one-line summary once the
two needed files are in, and again after each file you add; open it any time to add or replace one.

| Tab | What it shows |
|---|---|
| **Best picks** | For each ranked job, the best spell you can cast now, the next one that beats it, and every effect each carries. Most jobs can be ranked more than one way (damage per second, per mana, per cast…). |
| **Buffs** | For each thing you might want on you — a stat, a resist, see invisible, run speed — the biggest you can cast now and the next bigger one. |
| **Sets** | Rows of 14 gems. Each gem holds a rule (*best slow*, *strength buff*) or one spell you always want. Raise your level and the changed gems are marked, with what they replaced; every gem also shows when it will change next. Import the sets you saved in game: each gem then holds that exact spell, with the rules it fills beside it and what each rule would pick, one click to switch. Copy a set as text, or copy a link that carries your sets to someone else. |
| **All spells** | Everything your trio can cast, now or later, searchable by name and effect, with the game's own description. |

**Options:** what you are fighting (some spells only work on undead, summoned or animals), and a
fight length, which cuts damage-over-time off when the mob would be dead.

## Bards and the Symphonic Aura

With a bard in the trio, *Your trio* asks for three AA ranks from your AA window:

- **Jam Fest** makes songs read 1, 3, 5, 6 or 7 levels higher, by rank.
- **Singing Mastery** adds 20% a rank to the singing bonus. It is applied to the damage shield of a
  Singing-skill song, the one effect it has been measured on; other effects are shown unscaled.
- **Symphonic Aura** is how many songs the aura sings for a set that runs it.

On the Sets tab, tick **runs the Symphonic Aura** on the set that holds your songs. Then:

- **Its last gems are aura gems**, one per rank. A rule there chooses only songs the aura can sing:
  *best haste* means the best haste *song*, not a spell. Chips beside an imported song answer the
  same way.
- **The aura's walk is shown gem by gem.** It sings the first eligible songs counting up from the
  last gem. A spell or single-target song in an aura gem is passed over, and the aura reaches one gem
  further up. An eligible song it does not reach is marked dead: while the aura is on, it cannot be
  sung by hand.
- **Conflicts are named.** Two songs with the same effect in the same slot cannot both hold — the
  game keeps the larger and refuses the other whole. Hastes never add, whatever their slots: only
  the larger counts.
- **Amplification** in the aura adds its own bonus to Singing songs' damage shields, and the set
  shows the shields that land.
- **Fill the aura's gems with songs** starts from haste, song damage, damage shield, slow,
  Amplification and mana, keeping the ones a song can fill.

What this rests on: the aura sings every song together, every 6 seconds, so a song's own duration
does not matter and more ranks do not thin the others. That, the conflict rules and the bonuses
were all read from a player's combat log. What it does not know yet: whether a song's haste adds to
a spell's, which of two slows on a mob counts, and which effects besides the damage shield take the
singing bonus.

## Your files and your data

- **Nothing is uploaded.** The page has no server and no analytics; the files are read in your
  browser.
- **What it keeps, in this browser only:** the part of your spell file it needs (about 700 KB, in
  IndexedDB), the spell names from your spellbook export if you gave one (IndexedDB), and your trio,
  level and sets, imported ones included (localStorage). *Forget my files* and *Forget it* remove the
  first two.
- **A shared link** holds your trio, level and set rules — spell ids, not spell text.
- **No game data ships with the page.** Every spell name and number you see comes from your files.

## How the numbers are worked out

- **Which spells.** Every spell any of your three classes can cast at levels 1 to 50. A spell's
  level is the lowest level at which any of the three gets it.
- **Effects at your level.** The spell file stores most effects as a base, a scaling formula and a
  cap, not as a number. They are worked out at your trio's level. A spell above your level shows the
  numbers it will have when you can cast it, marked `@L38`.
- **Ranking.** Each job (role) has a rule for which spells belong and one or more measures to rank
  them by, defined in [`src/engine/spec.js`](src/engine/spec.js). A spell that can win on one number
  and cost you on another — a heal that also slows your own attacks — always has every effect listed.
- **Burst damage** is a nuke whose own recast is long enough that you cannot fit it into a rotation.
  It is ranked by damage per cast rather than per second.
- **Left out:** rows the spell file marks as not a player's spell (item effects), disciplines and
  combat abilities (they do not go in a spell gem), and any spell whose formula this page cannot
  compute; those are named on the page rather than shown with a guessed number.

## Known limits

- **Stacking is not modelled.** Two buffs that use the same effect slot will not both hold on you;
  the page does not warn about it yet.
- **Two scaling formulas are educated guesses.** They affect a few rare spells.
- **Bard song AAs** (Jam Fest, Singing Mastery, Amplification) are not applied, so songs read at
  your plain level and singing bonus.
- **The level cap is 50**, as observed in game; the spell file itself goes far higher.
- **After a game patch** that changes the spell file's layout, the page refuses the new file
  rather than reading it wrongly, until it is updated.

## Development

There is no build step and there are no dependencies. Serve the folder with any static server and
open `index.html`:

```
python3 -m http.server 8000
```

`npm test` (or `node --test`) runs the engine tests. They build synthetic rows in the client file's layout;
no game data is ever committed here, and `.gitignore` refuses the client files. The engine is a port of a
private desktop tool, and before a release it is also checked against that tool on real client files.

| Path | What it is |
|---|---|
| `src/engine/` | Plain ES modules with no DOM; they run in the browser and in Node. `layout.js` (the file's columns, and the check that refuses an unknown layout), `formulas.js`, `parse.js`, `pool.js`, `roles.js`, `wants.js`, `sets.js`, `analysis.js`, `imports.js` (the spellbook export and saved sets), `aura.js` (the Symphonic Aura and the bard's song AAs), `spec.js` (the role and buff vocabulary, generated from the desktop tool; never edit by hand), `spec-extra.js` (vocabulary only this page has), `vocab.js` (the two merged). |
| `src/app.js`, `src/sets-view.js`, `src/ui.js`, `src/format.js` | The page: state, rendering and events. |
| `src/worker.js` | Parses the files off the page's thread. |
| `src/store.js` | IndexedDB and localStorage. |
| `test/` | Engine tests on synthetic rows. |

On `localhost` only, `#load=<folder>` reads the two files from that folder instead of asking for
them, so the page can be tested in a headless browser.

**Deploying** is automatic: every push to `main` runs `.github/workflows/pages.yml`, which runs the
tests and publishes a copy made by `tools/stamp.mjs`. That copy has every script and stylesheet
address stamped with the commit (`wants.js?v=abc1234`). GitHub Pages lets browsers keep each file
for 10 minutes, and without the stamp a returning visitor could get the new page with some old
scripts — which is how the first Safari report happened. The footer shows the version you have.

## Roadmap

- Warn when two buffs in a set use the same effect slot (songs already are).
- Read the bard AA ranks from the combat log instead of asking for them.

## Licence

MIT — see [LICENSE](LICENSE).

*A fan-made tool, not affiliated with or endorsed by Daybreak Game Company.*
