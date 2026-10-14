# Working rules

This repository is **public**. It holds code only.

- **No game data, ever.** Never commit `spells_us.txt`, `dbstr_us.txt`, logs, spellbook exports or
  loadout files, or anything copied out of them — not as fixtures, not in comments, not in commit
  messages. Tests build synthetic rows in the file's layout (`test/engine.test.js`). `.gitignore`
  refuses the client files; do not weaken it.
- **No private narrative.** Do not quote a player's logs, characters or notes from the private desktop
  tool this engine was ported from.
- **The layout guard stays strict.** `src/engine/layout.js` refuses a spell file of the wrong width
  or with its effect column moved. A patch that trips it needs the column map re-checked, never a
  looser guard.
- **Engine changes are checked twice.** Run `npm test` here. The engine also has a parity check
  against the desktop tool on real client files, which lives with that tool; say when a change
  needs it run.
- **No build step, no dependencies.** Plain ES modules that run in the browser and in Node.
