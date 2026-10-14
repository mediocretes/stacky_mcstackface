// The page. One state object, re-rendered as HTML strings on every change; events are
// delegated from the document by data-* attributes.

import { analyze } from './engine/analysis.js';
import { CLASSES, CLASS_NAMES, LEVEL_CAP, FIELD_COUNT } from './engine/layout.js';
import { DATASET_VERSION, parseClientFiles } from './engine/parse.js';
import { parseSpellbook, parseLoadouts, importKind } from './engine/imports.js';
import { mergeImported } from './engine/sets.js';
import { bundle, chainCaution, formatMetric, METRICS, HUNTS } from './engine/roles.js';
import { option, spellName, effects } from './ui.js';
import { setsView, onSetsChange, onSetsClick, readShareLink } from './sets-view.js';
import * as store from './store.js';
import { esc, seconds, castTime, target, skill, classes, description } from './format.js';

const DEFAULTS = {
  trio: ['BRD', 'SHD', 'SHM'], level: 30, hunting: 'generic', fightTicks: null,
  tab: 'best', metrics: {}, show: 'castable', query: '', sort: 'level',
  sets: [], activeSet: 0, compareLevel: null, lastImport: null,
  bard: { aura: 0, jamFest: 0, singingMastery: 0 },
};

const state = {
  ds: null,
  settings: { ...DEFAULTS, ...store.loadSettings() },
  result: null,
  busy: null, // a message while files are read
  error: null,
  open: new Set(), // expanded cards and rows
  detail: null, // spell id shown in full in the spell list
  incoming: readShareLink(location.hash), // sets from a shared link, until used or ignored
  pending: { spells: null, dbstr: null }, // files chosen so far; both are needed
  reloading: false, // the file panel is open over an already-loaded dataset
  book: null, // { file, size, names, loadedAt } from a spellbook export, or null
  note: null, // what the last file read did
  fileError: null, // why the last file could not be read
  filesOpen: false, // the file panel, once the two needed files are in; always open before
  sections: {}, // open or closed, for each <details> the player has toggled or edited inside
};

const root = document.getElementById('app');

// ---- state changes ------------------------------------------------------------------------

// The spellbook's names as a Set, built once per spellbook.
function owned() {
  if (!state.book) return null;
  if (state.book.set?.size !== state.book.names.length) state.book.set = new Set(state.book.names);
  return state.book.set;
}

function recompute() {
  state.result = null;
  if (!state.ds) return;
  try {
    state.result = analyze(state.ds, state.settings, owned());
  } catch (e) {
    state.error = `Could not work out the spells for this trio: ${e.message}`;
  }
}

function set(patch, { compute = true } = {}) {
  Object.assign(state.settings, patch);
  store.saveSettings(state.settings);
  if (compute) recompute();
  render();
}

function parseInWorker(spells, dbstr, meta) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    } catch {
      const dec = new TextDecoder('windows-1252');
      try { resolve(parseClientFiles(dec.decode(spells), dec.decode(dbstr), meta)); } catch (e) { reject(e); }
      return;
    }
    worker.onmessage = (e) => {
      worker.terminate();
      if (e.data.ok) resolve(e.data.ds); else reject(new Error(e.data.error));
    };
    worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message || 'the file reader failed')); };
    worker.postMessage({ spells, dbstr, meta }, [spells, dbstr]);
  });
}

const FILES = { spells: 'spells_us.txt', dbstr: 'dbstr_us.txt' };

// What a file is — one of the two client files, a spellbook export or a saved-sets file — by
// its name, or by its first lines for a renamed copy.
async function kindOf(file) {
  const n = file.name.toLowerCase();
  if (n === FILES.spells) return 'spells';
  if (n === FILES.dbstr) return 'dbstr';
  const head = await file.slice(0, 8192).text();
  const other = importKind(file.name, head);
  if (other) return other;
  const f = (head.split(/\r?\n/)[0] ?? '').split('^');
  if (f.length === FIELD_COUNT && /^\d+$/.test(f[0])) return 'spells';
  if (f.length >= 4 && f.length <= 6 && /^\d+$/.test(f[0]) && /^\d+$/.test(f[1])) return 'dbstr';
  return null;
}

// Every picker and every drop comes here. Each file goes to its own place: the two client
// files wait for each other and are read together; the other two are read at once. The file
// panel closes after anything is read successfully, and stays open on an error.
async function takeFiles(list) {
  state.fileError = null;
  state.note = null;
  const others = [];
  for (const file of [...list]) {
    const kind = await kindOf(file);
    if (kind === 'spells' || kind === 'dbstr') state.pending[kind] = file;
    else if (kind) others.push([kind, file]);
    else if (file.name.toLowerCase() === 'spells_us_str.txt') state.fileError = 'That is spells_us_str.txt. The one needed is spells_us.txt, without "_str".';
    else state.fileError = `${file.name} is not a file this page reads. It takes ${FILES.spells}, ${FILES.dbstr}, a spellbook export (…-Spellbook.txt) or saved sets (…_LO1.ini).`;
  }
  let read = false;
  if (state.pending.spells && state.pending.dbstr) read = await readClientFiles();
  for (const [kind, file] of others) read = (await readOther(kind, file)) || read;
  if (read && !state.fileError && state.ds) state.filesOpen = false;
  if (state.fileError) state.filesOpen = true;
  recompute();
  render();
}

async function readClientFiles() {
  const { spells, dbstr } = state.pending;
  state.busy = `Reading ${spells.name} (${(spells.size / 1e6).toFixed(0)} MB)…`;
  render();
  let ok = false;
  try {
    const [a, b] = await Promise.all([spells.arrayBuffer(), dbstr.arrayBuffer()]);
    const meta = {
      spellsFile: { size: spells.size, modified: spells.lastModified },
      dbstrFile: { size: dbstr.size, modified: dbstr.lastModified },
      loadedAt: Date.now(),
    };
    state.ds = await parseInWorker(a, b, meta);
    state.saved = await store.saveDataset(state.ds);
    state.reloading = false;
    ok = true;
  } catch (e) {
    state.fileError = e.message;
  }
  state.pending = { spells: null, dbstr: null };
  state.busy = null;
  return ok;
}

async function readOther(kind, file) {
  try {
    if (kind === 'spellbook') {
      const book = parseSpellbook(await file.text());
      state.book = { file: file.name, size: book.size, names: [...book.keys()], loadedAt: Date.now() };
      await store.saveBook({ file: state.book.file, size: state.book.size, names: state.book.names, loadedAt: state.book.loadedAt });
      const mine = state.ds ? scribedCount() : null;
      state.note = `Spellbook read: ${book.size} spells${mine !== null ? `, ${mine} of them ones this trio can cast` : ''}. Picks now prefer what you have scribed.`;
    } else {
      const loadouts = parseLoadouts(await file.text());
      if (!loadouts.length) throw new Error(`${file.name} has no saved spell sets that are in use.`);
      const { sets, replaced } = mergeImported(state.settings.sets ?? [], loadouts);
      const names = loadouts.map((l) => l.name);
      set({ sets, activeSet: sets.findIndex((x) => x.name === names[0]), tab: 'sets', lastImport: { file: file.name, names } }, { compute: false });
      state.note = `Imported ${names.join(', ')} from ${file.name}${replaced.length ? ` (replacing your ${replaced.join(', ')})` : ''}. ` +
        'Each gem holds exactly the spell the game has there; the chips beside a gem show which rules it fills.';
    }
    return true;
  } catch (e) {
    state.fileError = e.message;
    return false;
  }
}

function scribedCount() {
  const set = owned();
  return state.ds.spells.filter((s) => set.has(s.name) && state.settings.trio.some((c) => {
    const l = s.levels[CLASSES.indexOf(c)];
    return l >= 1 && l <= LEVEL_CAP;
  })).length;
}

// ---- rendering ----------------------------------------------------------------------------

const picker = (accept) => `<input type="file" accept="${accept}" data-pick hidden>`;
const fileDate = (ms) => (ms ? new Date(ms).toLocaleDateString() : 'an unknown date');

function clientSlot(kind, primary) {
  const f = state.pending[kind];
  if (f) {
    return `<li class="slot done"><span class="tick">✓</span> <b>${esc(FILES[kind])}</b>
      <span class="small">${(f.size / 1e6).toFixed(1)} MB</span> <label class="quiet">change${picker('.txt')}</label></li>`;
  }
  return `<li class="slot"><label class="button${primary ? ' primary' : ''}">Choose ${esc(FILES[kind])}${picker('.txt')}</label></li>`;
}

function neededFiles() {
  if (state.ds && !state.reloading) {
    const s = state.ds.source;
    return `<ol class="slots">
        <li class="slot done"><span class="tick">✓</span> <b>${FILES.spells}</b> <span class="small">from ${esc(fileDate(s.spellsFile?.modified))},
          ${s.kept.toLocaleString()} spells any class can cast at 1–${LEVEL_CAP}</span></li>
        <li class="slot done"><span class="tick">✓</span> <b>${FILES.dbstr}</b> <span class="small">from ${esc(fileDate(s.dbstrFile?.modified))}</span></li>
      </ol>
      ${state.saved === false ? '<p class="warn">This browser would not store them, so you will need to load them again next visit.</p>' : ''}
      <p class="actions"><button class="button" data-act="reload">Load newer files</button>
        <span class="small">after a game patch — choose both again</span></p>`;
  }
  const first = state.pending.spells ? 'dbstr' : 'spells';
  return `<p>Choose them one at a time, in either order.</p>
    <ol class="slots">${clientSlot('spells', first === 'spells')}${clientSlot('dbstr', first === 'dbstr')}</ol>
    ${state.reloading ? '<p class="actions"><button class="quiet" data-act="cancel-reload">Cancel</button></p>' : ''}`;
}

function optionalFiles() {
  const b = state.book;
  const last = state.settings.lastImport;
  const book = b
    ? `<li class="slot done"><span class="tick">✓</span> <b>${esc(b.file)}</b> <span class="small">your spellbook, ${b.size} spells</span>
        <label class="quiet">replace${picker('.txt')}</label> <button class="quiet" data-act="forget-book">forget</button></li>`
    : `<li class="slot"><label class="button">Choose your spellbook export${picker('.txt')}</label>
        <span class="small">In game, <code>/outputfile spellbook</code> writes <code>&lt;name&gt;_&lt;server&gt;-&lt;class&gt;-Spellbook.txt</code>.
        Picks then prefer what you have scribed and mark what you have not.</span></li>`;
  const sets = last
    ? `<li class="slot done"><span class="tick">✓</span> <b>${esc(last.file)}</b> <span class="small">imported ${esc(last.names.join(', '))}</span>
        <label class="quiet">import again or another${picker('.ini')}</label></li>`
    : `<li class="slot"><label class="button">Choose your saved sets${picker('.ini')}</label>
        <span class="small"><code>&lt;name&gt;_&lt;server&gt;_LO1.ini</code> (LO2, LO3… for your other class sets). Each saved set
        becomes a set on the Sets tab.</span></li>`;
  return `<ul class="slots">${book}${sets}</ul>`;
}

function filesSummary() {
  const s = state.ds.source;
  const parts = [`${FILES.spells} from ${fileDate(s.spellsFile?.modified)}`];
  if (state.book) parts.push(`spellbook (${state.book.size} spells)`);
  if (state.settings.lastImport) parts.push(`saved sets: ${state.settings.lastImport.names.join(', ')}`);
  return parts.join(' · ');
}

function filesPanel() {
  const open = state.filesOpen || !state.ds;
  const head = state.ds
    ? `<button class="files-head" data-act="toggle-files" aria-expanded="${open}">
        <span class="chev" aria-hidden="true">${open ? '▾' : '▸'}</span><h2>Your files</h2>
        ${open ? '' : `<span class="files-summary">${esc(filesSummary())}</span>`}</button>`
    : '<div class="files-head"><h2>1 · Your files</h2></div>';
  const first = state.pending.spells ? 'dbstr' : 'spells';
  const body = `<div class="files-body">
      <h3>Needed <span class="small">from your EverQuest Legends folder, the one with <code>eqgame.exe</code> in it</span></h3>
      ${neededFiles()}
      <h3>Optional <span class="small">from the same folder</span></h3>
      ${optionalFiles()}
      <p class="small"><b>Tip:</b> the folder holds thousands of files, so don't scroll for one. On Windows, type its name
      (say <code>${esc(state.ds && !state.reloading ? 'spells_us.txt' : FILES[first])}</code>) into the <i>File name</i> box and press Enter;
      on a Mac, start typing the name and the list jumps to it. You can also drop any of these files on this panel.</p>
      <p class="small">Files are read here, in your browser. Nothing is uploaded; this page has no server. It remembers
      what it needs, so the two needed files only come back after a game patch.</p>
      ${state.ds ? '<p class="actions"><button class="quiet" data-act="forget">Forget my client files</button></p>' : ''}
    </div>`;
  return `<section class="files-panel${open ? ' open' : ''}" data-drop>
    ${head}
    ${open ? body : ''}
    ${state.busy ? `<p class="busy">${esc(state.busy)}</p>` : ''}
    ${state.fileError ? `<p class="error">${esc(state.fileError)}</p>` : ''}
    ${state.note ? `<p class="note">${esc(state.note)}</p>` : ''}
  </section>`;
}

function incomingBanner() {
  const p = state.incoming;
  return `<div class="warn">This link holds ${p.sets.length} set${p.sets.length === 1 ? '' : 's'} for
    ${esc(p.trio.join(' / '))} at level ${esc(p.level)}. Using them replaces your own sets.
    <button class="button" data-act="use-shared">Use them</button> <button class="quiet" data-act="ignore-shared">Ignore</button></div>`;
}

// The bard's AAs that change songs. The game does not write them to any file this page reads,
// so they are typed in; each is one number from the AA window.
function bardInputs(st) {
  const b = st.bard ?? {};
  const field = (key, label, max) => `<label>${label} <input type="number" min="0" max="${max}" value="${esc(b[key] ?? 0)}" data-bard="${key}"></label>`;
  return `<details class="bard" ${details('bard', !(b.aura || b.jamFest || b.singingMastery))}><summary>Bard AAs</summary>
    <div class="row">${field('aura', 'Symphonic Aura', 12)}${field('jamFest', 'Jam Fest', 5)}${field('singingMastery', 'Singing Mastery', 4)}</div>
    <p class="small">Ranks, from your AA window. Jam Fest makes songs read 1, 3, 5, 6 or 7 levels higher. Singing Mastery's
    bonus is applied to Singing songs' damage shields, the one effect it has been measured on. Symphonic Aura's rank is how many
    songs a set that runs it gets sung for it (on the Sets tab).</p>
  </details>`;
}

// A collapsible section stays the way the player left it. Its first state comes from `first`;
// after any toggle, or any edit inside it, the page remembers and never changes it on its own.
function details(name, first) {
  const open = name in state.sections ? state.sections[name] : first;
  return `data-section="${name}"${open ? ' open' : ''}`;
}

function setup() {
  const st = state.settings;
  const classSelect = (i) => `<select data-trio="${i}" aria-label="class ${i + 1}">${CLASSES.map((c) => option(c, `${c} — ${CLASS_NAMES[c]}`, st.trio[i])).join('')}</select>`;
  return `<section class="setup${state.ds ? '' : ' muted'}">
    <h2>${state.ds ? '' : '2 · '}Your trio</h2>
    <div class="row">${classSelect(0)}${classSelect(1)}${classSelect(2)}
      <label class="level">Level <input type="number" min="1" max="${LEVEL_CAP}" value="${esc(st.level)}" data-level></label></div>
    <p class="small">A trio's level is the lowest of its three classes; spells above it are shown as upgrades to come.</p>
    <details ${details('options', st.hunting !== 'generic' || Boolean(st.fightTicks))}><summary>Options</summary>
      <div class="row">
        <label>Fighting <select data-hunting>${HUNTS.map((h) => option(h, h === 'generic' ? 'anything' : h, st.hunting)).join('')}</select></label>
        <label>Fight length <input type="number" min="1" max="200" placeholder="full" value="${esc(st.fightTicks ?? '')}" data-fight> ticks</label>
      </div>
      <p class="small">"Fighting" admits spells that only work on undead, summoned or animals. Fight length
      cuts damage-over-time off when the mob dies (a tick is 6 seconds); leave it empty to count the full duration.</p>
    </details>
    ${st.trio.includes('BRD') ? bardInputs(st) : ''}
    ${state.incoming ? incomingBanner() : ''}
    ${state.error ? `<p class="error">${esc(state.error)}</p>` : ''}
  </section>`;
}

function rankedList(r, metric, valueOf) {
  const rows = [...r.castable, ...r.upcoming];
  return `<ol class="ranked">${rows.map(([s, v]) => `<li class="${s.level > state.result.level ? 'later' : ''}">
    <div>${spellName(s, state.result.level)} <span class="classes">${esc(classes(s))}</span></div>
    <div class="val">${s.level > state.result.level ? '' : esc(valueOf(v))}</div>
    <div class="sub">${effects(s)}</div></li>`).join('')}</ol>`;
}

function roleCard(r) {
  const open = state.open.has(`role:${r.key}`);
  const fmtV = (v) => formatMetric(r.metric, v);
  const metricPicker = r.metrics.length > 1
    ? `<label class="metric">by <select data-metric="${r.key}">${r.metrics.map((m) => option(m, METRICS[m].label, r.metric)).join('')}</select></label>`
    : `<span class="metric">by ${esc(METRICS[r.metric].label)}</span>`;
  const choice = r.choice
    ? `<div class="pick">${spellName(r.choice[0], state.result.level)} <span class="val">${esc(fmtV(r.choice[1]))}</span>
       <div class="classes">${esc(classes(r.choice[0]))}</div>${effects(r.choice[0])}
       ${chainCaution(r.choice[0]) ? `<div class="caution">⏳ ${esc(chainCaution(r.choice[0]))}</div>` : ''}</div>`
    : '<div class="pick none">Nothing castable yet.</div>';
  const next = (r.unscribed
    ? `<div class="next scribe">Better, and castable now: ${spellName(r.unscribed[0], state.result.level)}
       <span class="val">${esc(fmtV(r.unscribed[1]))}</span> <div class="sub">${effects(r.unscribed[0])}</div></div>`
    : '') + (r.next
    ? `<div class="next">Next: ${spellName(r.next[0], state.result.level)} <div class="sub">${effects(r.next[0])}</div></div>`
    : '');
  return `<article class="card">
    <header><h3>${esc(r.label)}</h3>${metricPicker}</header>
    ${choice}${next}
    <button class="quiet toggle" data-toggle="role:${r.key}">${open ? 'Hide' : 'Show'} all ${r.count}</button>
    ${open ? rankedList(r, r.metric, fmtV) : ''}
    ${r.unvalued.length ? `<p class="small">${r.unvalued.length} could not be valued by this measure.</p>` : ''}
  </article>`;
}

function bestView() {
  const shown = state.result.roles.filter((r) => r.count > 0);
  const absent = state.result.roles.filter((r) => r.count === 0).map((r) => r.label);
  return `<p class="lede">The best spell your trio can cast now for each kind of job, and the next one that beats it.
    Every effect is listed, because a spell can win on one number and cost you on another.</p>
    <div class="cards">${shown.map(roleCard).join('')}</div>
    ${absent.length ? `<p class="small">Nothing in this trio for: ${esc(absent.join(', '))}.</p>` : ''}`;
}

const WANT_GROUPS = [
  ['Health and defense', ['max_hp', 'armor_class', 'regen', 'instant_heal', 'damage_shield', 'rune', 'invulnerability', 'spell_reflect', 'melee_proc', 'hate_on_attack']],
  ['Stats', ['strength', 'stamina', 'agility', 'dexterity', 'charisma', 'intelligence', 'wisdom', 'attack']],
  ['Resists', ['magic_resist', 'fire_resist', 'cold_resist', 'poison_resist', 'disease_resist']],
  ['Mana and endurance', ['mana_regen', 'hp_to_mana', 'endurance_regen']],
  ['Cures', ['cure_poison', 'cure_disease', 'cure_curse', 'cure_blindness', 'dispel']],
  ['Movement and senses', ['movement', 'levitate', 'water_breathing', 'invisibility', 'see_invisible', 'infravision', 'ultravision', 'vision_range', 'see_through', 'sense', 'eye_of_zomm', 'true_north']],
  ['Travel and escape', ['gate', 'bind_affinity', 'shadow_step', 'feign_death']],
  ['Pets and summoning', ['summon_pet', 'summon_undead', 'pet_ward', 'pet_reclaim', 'recall_pet', 'pet_size', 'summon_item', 'summon_armor']],
  ['Appearance', ['model_size', 'illusion']],
];

function buffsView() {
  const lvl = state.result.level;
  const rows = state.result.wants.filter((w) => w.count > 0);
  const absent = state.result.wants.filter((w) => w.count === 0).map((w) => w.label);
  const size = (w, s) => (w.magnitude ? (s.level > lvl ? w.display(s) : null) : null);
  return `<p class="lede">Buffs you can put on yourself, by what they give. Where the number is a size, the largest you can cast
    leads; otherwise the highest level does. Spells that give several things appear under each.</p>
    <div class="scroll"><table class="buffs"><thead><tr><th>Buff</th><th>Best you can cast</th><th>Size</th><th>Next</th></tr></thead><tbody>
    ${grouped(rows).map(([group, ws]) => `<tr class="group"><th colspan="4">${esc(group)}</th></tr>` + ws.map((w) => {
      const open = state.open.has(`want:${w.key}`);
      const c = w.choice;
      const all = [...w.castable, ...w.upcoming];
      return `<tr class="${open ? 'open' : ''}" data-toggle="want:${w.key}">
        <td>${esc(w.label)} <span class="count">${w.count}</span></td>
        <td>${c ? spellName(c[0], lvl) : '<span class="none">not yet</span>'}${w.unscribed ? `<div class="sub">better, not scribed: ${spellName(w.unscribed[0], lvl)} ${esc(w.unscribed[1])}</div>` : ''}</td>
        <td class="val">${c && w.magnitude ? esc(c[1]) : ''}</td>
        <td>${w.next ? `${spellName(w.next[0], lvl)}${w.magnitude ? ` <span class="val">${esc(size(w, w.next[0]))}</span>` : ''}` : ''}</td></tr>
        ${open ? `<tr class="detail"><td colspan="4"><ol class="ranked">${all.map(([s, v]) => `<li class="${s.level > lvl ? 'later' : ''}">
          <div>${spellName(s, lvl)} <span class="classes">${esc(classes(s))}</span></div>
          <div class="val">${w.magnitude ? esc(s.level > lvl ? w.display(s) : v) : ''}</div>
          <div class="sub">${effects(s)} · ${esc(seconds(s.displayDuration))} · ${esc(target(s.target))}</div></li>`).join('')}</ol></td></tr>` : ''}`;
    }).join('')).join('')}
    </tbody></table></div>
    ${absent.length ? `<p class="small">Nothing in this trio for: ${esc(absent.join(', '))}.</p>` : ''}`;
}

function grouped(rows) {
  const seen = new Set();
  const out = WANT_GROUPS.map(([g, keys]) => {
    const ws = keys.map((k) => rows.find((w) => w.key === k)).filter(Boolean);
    ws.forEach((w) => seen.add(w.key));
    return [g, ws];
  });
  out.push(['Other', rows.filter((w) => !seen.has(w.key))]);
  return out.filter(([, ws]) => ws.length);
}

function spellRows() {
  const { pool, level } = state.result;
  const st = state.settings;
  const q = st.query.trim().toLowerCase();
  let list = pool.filter((s) => (st.show === 'all' || (st.show === 'castable' ? s.level <= level : st.show === 'later' ? s.level > level
    : st.show === 'unscribed' ? s.level <= level && s.owned === false : s.owned === true)));
  if (q) list = list.filter((s) => s.name.toLowerCase().includes(q) || bundle(s, { friendly: true }).join(' ').toLowerCase().includes(q));
  list.sort(st.sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => a.level - b.level || a.name.localeCompare(b.name));
  if (list.length === 0) return '<tr><td colspan="6" class="none">No spells match.</td></tr>';
  return list.map((s) => {
    const open = state.detail === s.id;
    const desc = open ? description(s, state.ds) : null;
    const sk = skill(s.skill);
    return `<tr class="${s.level > level ? 'later' : ''}${open ? ' open' : ''}" data-spell="${s.id}">
      <td class="num">${s.level}</td><td><span class="spell">${esc(s.name)}</span><div class="classes">${esc(classes(s))}</div></td>
      <td class="num">${s.mana || ''}</td><td>${esc(castTime(s.cast))}</td><td>${esc(seconds(s.displayDuration))}</td>
      <td>${effects(s)}</td></tr>
      ${open ? `<tr class="detail"><td colspan="6">
        ${desc ? `<p class="desc">“${esc(desc)}”</p>` : ''}
        <p class="small">${esc(target(s.target))} · ${s.beneficial ? 'beneficial' : 'detrimental'} · resist ${esc(s.resist)}${s.resistAdjust ? ` (${s.resistAdjust})` : ''}
        · recovery ${esc(castTime(s.recovery))} · recast ${esc(castTime(s.reuse))}${s.category ? ` · ${esc(s.category)}${s.subcategory ? ` / ${esc(s.subcategory)}` : ''}` : ''}${sk ? ` · ${esc(sk)}` : ''} · id ${s.id}</p>
        ${chainCaution(s) ? `<p class="caution">⏳ ${esc(chainCaution(s))}</p>` : ''}
        ${s.displayLevel ? `<p class="small">Numbers are what the spell will read at L${s.displayLevel}, when you can cast it.</p>` : ''}
      </td></tr>` : ''}`;
  }).join('');
}

function spellsView() {
  const st = state.settings;
  return `<div class="controls">
      <input type="search" placeholder="Search names and effects" value="${esc(st.query)}" data-query aria-label="search">
      <select data-show>${option('castable', 'castable now', st.show)}${option('later', 'coming later', st.show)}${option('all', 'all to level 50', st.show)}${state.book ? option('unscribed', 'castable, not scribed', st.show) + option('scribed', 'in my spellbook', st.show) : ''}</select>
      <select data-sort>${option('level', 'by level', st.sort)}${option('name', 'by name', st.sort)}</select>
    </div>
    <div class="scroll"><table class="spells"><thead><tr><th>L</th><th>Spell</th><th>Mana</th><th>Cast</th><th>Lasts</th><th>Effects</th></tr></thead>
    <tbody data-spell-rows>${spellRows()}</tbody></table></div>`;
}

function tabs() {
  const t = state.settings.tab;
  const tab = (key, label) => `<button role="tab" aria-selected="${t === key}" data-tab="${key}">${label}</button>`;
  return `<nav class="tabs" role="tablist">${tab('best', 'Best picks')}${tab('buffs', 'Buffs')}${tab('sets', 'Sets')}${tab('spells', 'All spells')}</nav>`;
}

function main() {
  if (!state.result) return '';
  const r = state.result;
  const view = { best: bestView, buffs: buffsView, sets: () => setsView(state), spells: spellsView }[state.settings.tab] ?? bestView;
  return `<section class="results">
    <h2 class="summary">${esc(r.trio.join(' / '))} at level ${r.level} <span>${r.pool.filter((s) => s.level <= r.level).length} spells castable · ${r.pool.filter((s) => s.level > r.level).length} to come</span></h2>
    ${r.unresolvable.length ? `<p class="warn">${r.unresolvable.length} spell(s) use an effect formula this tool cannot compute and are left out: ${esc(r.unresolvable.map((u) => u.name).join(', '))}.</p>` : ''}
    ${tabs()}${view()}
  </section>`;
}

// The focused control, as a selector that finds its replacement after the page is redrawn.
function focusKey(el) {
  if (!el || el === document.body || !root.contains(el)) return null;
  const a = [...el.attributes].find((x) => x.name.startsWith('data-'));
  return a ? `[${a.name}${a.value ? `="${CSS.escape(a.value)}"` : ''}]` : null;
}

function render() {
  const active = document.activeElement;
  const key = focusKey(active);
  const caret = active?.matches?.('[data-query]') ? active.selectionStart : null;
  root.innerHTML = filesPanel() + setup() + main();
  const again = key && root.querySelector(key);
  if (again) {
    again.focus();
    if (caret !== null) again.setSelectionRange(caret, caret);
  }
}

// ---- events -------------------------------------------------------------------------------

// <details> fires `toggle` without bubbling, so listen in the capture phase.
document.addEventListener('toggle', (e) => {
  if (e.target.matches?.('details[data-section]')) state.sections[e.target.dataset.section] = e.target.open;
}, true);

document.addEventListener('change', (e) => {
  const el = e.target;
  const section = el.closest?.('details[data-section]');
  if (section) state.sections[section.dataset.section] = section.open;
  if (state.ds && onSetsChange(el, state, set)) return;
  if (el.matches('[data-pick]')) takeFiles(el.files);
  else if (el.matches('[data-trio]')) {
    const trio = [...state.settings.trio];
    trio[Number(el.dataset.trio)] = el.value;
    set({ trio });
  } else if (el.matches('[data-level]')) {
    const n = Math.min(LEVEL_CAP, Math.max(1, parseInt(el.value, 10) || 1));
    set({ level: n });
  } else if (el.matches('[data-hunting]')) set({ hunting: el.value });
  else if (el.matches('[data-bard]')) {
    const max = { aura: 12, jamFest: 5, singingMastery: 4 }[el.dataset.bard];
    const n = Math.min(max, Math.max(0, parseInt(el.value, 10) || 0));
    set({ bard: { ...state.settings.bard, [el.dataset.bard]: n } });
  }
  else if (el.matches('[data-fight]')) {
    const n = parseInt(el.value, 10);
    set({ fightTicks: n > 0 ? n : null });
  } else if (el.matches('[data-metric]')) set({ metrics: { ...state.settings.metrics, [el.dataset.metric]: el.value } });
  else if (el.matches('[data-show]')) set({ show: el.value }, { compute: false });
  else if (el.matches('[data-sort]')) set({ sort: el.value }, { compute: false });
});

document.addEventListener('input', (e) => {
  if (!e.target.matches('[data-query]')) return;
  state.settings.query = e.target.value;
  store.saveSettings(state.settings);
  const body = root.querySelector('[data-spell-rows]');
  if (body) body.innerHTML = spellRows();
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act], [data-tab], [data-toggle], [data-spell], [data-set-tab], [data-gem-up], [data-gem-down], [data-gem-rule]');
  if (!el || e.target.closest('select, input, a')) return;
  if (el.dataset.act === 'use-shared' || el.dataset.act === 'ignore-shared') {
    const p = state.incoming;
    state.incoming = null;
    history.replaceState(null, '', location.pathname + location.search);
    if (el.dataset.act === 'use-shared') {
      const trio = p.trio.length === 3 && p.trio.every((c) => CLASSES.includes(c)) ? p.trio : state.settings.trio;
      const level = Math.min(LEVEL_CAP, Math.max(1, parseInt(p.level, 10) || state.settings.level));
      set({ trio, level, sets: p.sets, activeSet: 0, tab: 'sets' });
    } else render();
    return;
  }
  if (state.ds && onSetsClick(el, state, set, render)) return;
  if (el.dataset.act === 'toggle-files' || el.dataset.act === 'open-files') {
    state.filesOpen = el.dataset.act === 'open-files' ? true : !state.filesOpen;
    render();
    if (el.dataset.act === 'open-files') window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  if (el.dataset.act === 'reload' || el.dataset.act === 'cancel-reload') {
    state.reloading = el.dataset.act === 'reload';
    state.pending = { spells: null, dbstr: null };
    state.fileError = null;
    render();
    return;
  }
  if (el.dataset.act === 'forget-book') {
    store.forgetBook();
    state.book = null;
    state.note = null;
    state.fileError = null;
    recompute();
    render();
    return;
  }
  if (el.dataset.act === 'forget') {
    store.forgetDataset();
    state.ds = null;
    state.result = null;
    render();
  } else if (el.dataset.tab) set({ tab: el.dataset.tab }, { compute: false });
  else if (el.dataset.toggle) {
    const k = el.dataset.toggle;
    if (state.open.has(k)) state.open.delete(k); else state.open.add(k);
    render();
  } else if (el.dataset.spell) {
    const id = Number(el.dataset.spell);
    state.detail = state.detail === id ? null : id;
    const body = root.querySelector('[data-spell-rows]');
    if (body) body.innerHTML = spellRows();
  }
});

// A shared link opened in a tab that already has the page: the hash changes, nothing reloads.
window.addEventListener('hashchange', () => {
  const p = readShareLink(location.hash);
  if (p) { state.incoming = p; render(); }
});

document.addEventListener('dragover', (e) => {
  const panel = e.target.closest('[data-drop]');
  if (!panel) return;
  e.preventDefault();
  panel.classList.add('drag');
});
document.addEventListener('dragleave', (e) => {
  const panel = e.target.closest('[data-drop]');
  if (panel && !panel.contains(e.relatedTarget)) panel.classList.remove('drag');
});
document.addEventListener('drop', (e) => {
  if (!e.target.closest('[data-drop]')) return;
  e.preventDefault();
  takeFiles(e.dataTransfer.files);
});

// ---- start --------------------------------------------------------------------------------

// Development only: on a local server, #load=<dir> reads the two files from <dir> instead of
// asking for them, so the page can be checked in a headless browser.
async function devLoad() {
  const m = location.hash.match(/^#load=(.+)$/);
  if (!m || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return false;
  const get = async (n) => new File([await (await fetch(`${m[1]}/${n}`)).arrayBuffer()], n);
  await takeFiles([await get('spells_us.txt'), await get('dbstr_us.txt')]);
  return true;
}

render();
store.loadBook().then((book) => { if (book?.names) { state.book = book; recompute(); render(); } });
devLoad().then((done) => done || store.loadDataset().then((ds) => {
  if (ds && ds.version === DATASET_VERSION) {
    state.ds = ds;
    recompute();
  }
  render();
}));
