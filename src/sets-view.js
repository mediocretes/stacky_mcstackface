// The Sets tab: spell sets whose gems hold rules, resolved at your level.

import { esc } from './format.js';
import { option, spellName, effects } from './ui.js';
import { GEMS, context, resolveSet, nextChanges, template, asText, ruleLabel, rulesFor, resolveWithAura, auraTemplate } from './engine/sets.js';
import { bardRanks, verdict, band, eligible } from './engine/aura.js';
import { role, METRICS, formatMetric } from './engine/roles.js';
import { want, candidates, isMagnitude } from './engine/wants.js';
import { LEVEL_CAP } from './engine/layout.js';
import { sections } from './groups.js';

// Contexts per level (and per singing bonus, for a set whose aura sings Amplification), kept
// until the trio, options, bard AAs or files change.
function contexts(state) {
  const st = state.settings;
  const key = JSON.stringify([st.trio, st.hunting, st.fightTicks, st.bard ?? null, state.ds.source.loadedAt, state.ds.source.rows, state.book?.loadedAt ?? null]);
  if (state.ctxCache?.key !== key) state.ctxCache = { key, map: new Map() };
  const { map } = state.ctxCache;
  const owned = state.book ? new Set(state.book.names) : null;
  return (lv, extra = 0) => {
    const k = `${lv}:${extra}`;
    if (!map.has(k)) map.set(k, context(state.ds, st, lv, owned, extra));
    return map.get(k);
  };
}

// Does this set run the Symphonic Aura? Only with a bard in the trio and a rank above 0.
const auraOn = (st, s) => Boolean(s.aura) && bardRanks(st).aura > 0;

const emptyGems = () => Array.from({ length: GEMS }, () => null);
const activeIndex = (st) => Math.min(Math.max(st.activeSet ?? 0, 0), (st.sets?.length ?? 1) - 1);

function ruleValue(rule) {
  if (!rule) return '';
  return rule.kind === 'spell' ? 'spell' : `${rule.kind}:${rule.key}`;
}

// The rules this trio can fill at all, as sections; in an aura gem, only those a song can fill.
// The rule a gem already holds is always listed, so a select never loses its value.
function ruleSections(c, auraGem, rule) {
  const spells = (kind, key) => (kind === 'role' ? c.members[key] ?? [] : candidates(c.pool, key).map(([s]) => s));
  const ok = (kind, key) => (rule?.kind === kind && rule.key === key)
    || (auraGem ? spells(kind, key).some((s) => eligible(s)) : spells(kind, key).length > 0);
  return sections(ok);
}

function gemControls(i, rule, c, spellOptions, auraGem) {
  const cur = ruleValue(rule);
  let html = `<select data-gem-kind="${i}" aria-label="gem ${i + 1}">
    ${option('', '— empty —', cur)}${option('spell', 'a spell I choose', cur)}
    ${ruleSections(c, auraGem, rule).map(([title, items]) => `<optgroup label="${esc(title)}">${items.map((r) => option(`${r.kind}:${r.key}`, r.name, cur)).join('')}</optgroup>`).join('')}
  </select>`;
  if (rule?.kind === 'role' && role(rule.key)?.metrics.length > 1) {
    const r = role(rule.key);
    const m = r.metrics.includes(rule.metric) ? rule.metric : r.metrics[0];
    html += `<select data-gem-metric="${i}" aria-label="ranked by">${r.metrics.map((x) => option(x, `by ${METRICS[x].label}`, m)).join('')}</select>`;
  }
  if (rule?.kind === 'spell') html += `<select data-gem-spell="${i}" aria-label="spell">${spellOptions(rule.id)}</select>`;
  return html;
}

function valueText(g) {
  if (g.value === null || g.value === undefined || g.state !== 'ok') return '';
  if (g.rule.kind === 'role') {
    const r = role(g.rule.key);
    return formatMetric(r.metrics.includes(g.rule.metric) ? g.rule.metric : r.metrics[0], g.value);
  }
  if (g.rule.kind === 'want' && isMagnitude(g.rule.key)) return String(g.value);
  return '';
}

// Every file is chosen in the panel at the top; this only opens it.
const importButton = () => '<button class="quiet" data-act="open-files">Import your saved sets from the game</button>';

// A gem holding one exact spell: which rules that spell fills, and what each would pick now.
function hints(i, g, c, auraGem) {
  if (g.rule?.kind !== 'spell' || !g.spell) return '';
  const chips = rulesFor(g.spell, c, { auraOnly: auraGem }).slice(0, 3).map(({ rule, pick }) => {
    const value = rule.kind === 'role' ? `role:${rule.key}` : `want:${rule.key}`;
    const same = pick.spell?.id === g.spell.id;
    const what = pick.state === 'ok' ? (same ? 'the same spell' : esc(pick.spell.name)) : 'nothing castable';
    return `<button class="chip${same ? ' same' : ' differs'}" data-gem-rule="${i}" data-rule="${value}"
      title="Make this gem ${esc(ruleLabel(rule))}">${esc(ruleLabel(rule))}: ${what}</button>`;
  });
  return chips.length ? `<div class="hints"><span class="small">fills</span> ${chips.join('')}</div>` : '';
}

const SPA = { 1: 'armor class', 4: 'strength', 11: 'attack speed', 47: 'cold resist', 49: 'disease resist', 59: 'damage shield', 334: 'song damage' };

function auraSummary(a, resolved, st) {
  const r = bardRanks(st);
  const names = a.pulsed.map((i) => esc(resolved[i].spell.name));
  const lines = [
    `<p><b>Symphonic Aura, rank ${a.rank}</b> sings ${names.length ? names.join(', ') : 'nothing yet'} — all together, every 6 seconds,
      so a song's own duration does not matter. ${names.length < a.rank ? `It has room for ${a.rank - names.length} more.` : ''}</p>`,
  ];
  const levels = a.songLevels ? `Songs read ${a.songLevels} level${a.songLevels === 1 ? '' : 's'} above yours (Jam Fest ${r.jamFest}).` : '';
  const parts = [];
  if (r.singingMastery) parts.push(`Singing Mastery ${r.singingMastery} +${r.singingMastery * 20}%`);
  if (a.amp) parts.push(`Amplification +${a.amp * 10}%`);
  const singing = a.singing
    ? `Singing songs' damage shields, stats and resists are ×${((10 + a.singing) / 10).toFixed(1)} (${parts.join(', ')}). Their haste,
       armor class and mana, and any song on a mob, are shown unscaled: those have not been measured.`
    : '';
  if (levels || singing) lines.push(`<p class="small">${levels} ${singing}</p>`);
  for (const x of a.conflicts) {
    const what = x.shared.map((s) => SPA[s.spa] ?? `effect ${s.spa}`).join(', ');
    lines.push(x.kind === 'refused'
      ? `<p class="warn">${esc(x.refuse.name)} is refused by ${esc(x.keep.name)}: both put ${esc(what)} in the same slot, and the game keeps only the larger song. It adds nothing.</p>`
      : `<p class="warn">${esc(x.refuse.name)}'s ${x.kind} does not add to ${esc(x.keep.name)}'s: only the larger counts. Its other effects still hold.</p>`);
  }
  return `<div class="aura-box">${lines.join('')}</div>`;
}

function auraBadges(i, a, resolved) {
  if (!a) return '';
  const g = resolved[i];
  if (a.pulsed.includes(i)) return '<span class="badge aura">♪ sung by the aura</span>';
  if (a.dead.includes(i)) return '<span class="badge scribe">dead: the aura does not reach this gem, and while it is on this song cannot be sung by hand</span>';
  if (a.skipped.includes(i)) return `<span class="badge">the aura passes over this — ${esc(verdict(g.spell).why)} — and reaches one gem further up</span>`;
  if (a.unknown.includes(i)) return `<span class="badge">may or may not be sung by the aura: ${esc(verdict(g.spell).why)}</span>`;
  return '';
}

function copiedNote(c) {
  if (!c) return '';
  if (typeof c === 'string') return `<p class="small" data-copied>${esc(c)}</p>`;
  return `<p class="small" data-copied>This browser would not let the page use the clipboard. Copy it from here:</p>
    <textarea class="manual" readonly rows="4" data-copied-text>${esc(c.manual)}</textarea>`;
}

export function setsView(state) {
  const st = state.settings;
  const sets = st.sets ?? [];
  const at = contexts(state);
  const c = at(st.level);
  const undo = state.undoSet ? `<p class="warn">Deleted “${esc(state.undoSet.set.name)}”. <button class="quiet" data-act="undo-delete">Undo</button></p>` : '';
  const intro = `<p class="lede">A spell set is a row of gems. Give each gem a rule — the best slow, a strength buff, or one
    spell you always want — and the set keeps itself current as you level. Sets are kept in this browser.</p>`;

  if (!sets.length) {
    return `${intro}${undo}<div class="actions">
      <button class="button primary" data-act="new-set" data-template="fight">Start a fighting set</button>
      <button class="button" data-act="new-set" data-template="buffs">Start a buff set</button>
      <button class="button" data-act="new-set" data-template="">Start an empty set</button>
      ${importButton()}</div>`;
  }

  const ai = activeIndex(st);
  const s = sets[ai];
  const withAura = auraOn(st, s);
  const run = resolveWithAura(s.gems, st, st.level, at, { aura: withAura });
  const { resolved, opts } = run;
  const a = run.aura;
  const shown = run.c; // the context the shown numbers come from (with Amplification's bonus, when it is sung)
  const cmp = st.compareLevel ?? st.level - 1;
  const before = cmp >= 1 && cmp <= LEVEL_CAP && cmp !== st.level ? resolveSet(s.gems, at(cmp), opts) : null;
  const next = nextChanges(s.gems, st.level, at, opts);
  const sorted = [...c.pool].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const spellOptions = (id) => sorted.map((x) => option(x.id, `L${x.level} ${x.name}`, id)).join('');
  const changed = before ? resolved.filter((g, i) => g.state === 'ok' && before[i].spell?.id !== g.spell.id && before[i].state === 'ok').length : 0;

  const rows = resolved.map((g, i) => {
    const was = before?.[i];
    const isNew = was && g.state === 'ok' && (was.state !== 'ok' || was.spell.id !== g.spell.id);
    const badges = [
      isNew ? `<span class="badge new">new since L${cmp}${was.state === 'ok' ? ` — was ${esc(was.spell.name)}` : ''}</span>` : '',
      next[i] ? `<span class="badge">→ ${esc(next[i].spell.name)} at L${next[i].level}</span>` : '',
      g.unscribed ? `<span class="badge scribe">better, not scribed: ${esc(g.unscribed.name)}</span>` : '',
      auraBadges(i, a, resolved),
    ].join('');
    const auraGem = Boolean(a?.band.has(i));
    let got = '';
    if (g.state === 'ok') got = `${spellName(g.spell, st.level)} <span class="val">${esc(valueText(g))}</span><div class="sub">${effects(g.spell)}</div>`;
    else if (g.state === 'later') got = `<span class="none">nothing yet —</span> ${spellName(g.spell, st.level)}`;
    else if (g.state === 'none' && g.rule?.kind === 'spell') {
      const known = state.ds.spells.find((x) => x.id === g.rule.id);
      got = `<span class="none">${known ? `${esc(known.name)} — not a spell this trio can cast` : `spell #${g.rule.id} — not one this page knows`}</span>`;
    } else if (g.state === 'none') got = '<span class="none">nothing in this trio fits</span>';
    return `<li class="gem${isNew ? ' changed' : ''}${auraGem ? ' aura' : ''}">
      <span class="n">${i + 1}${auraGem ? '<span class="note-aura" title="an aura gem: its rule chooses only songs the aura sings">♪</span>' : ''}</span>
      <div class="rule">${gemControls(i, g.rule, c, spellOptions, auraGem)}
        <span class="move"><button class="quiet" data-gem-up="${i}" aria-label="move up"${i === 0 ? ' disabled' : ''}>↑</button><button class="quiet" data-gem-down="${i}" aria-label="move down"${i === GEMS - 1 ? ' disabled' : ''}>↓</button></span></div>
      <div class="got">${got}${badges ? `<div class="badges">${badges}</div>` : ''}${hints(i, g, shown, auraGem)}</div>
    </li>`;
  }).join('');

  const tabsHtml = sets.map((x, i) => `<button role="tab" aria-selected="${i === ai}" data-set-tab="${i}">${esc(x.name)}</button>`).join('');
  const bard = st.trio.includes('BRD');
  const rank = bardRanks(st).aura;
  const auraToggle = bard ? `<label class="check"><input type="checkbox" data-set-aura${s.aura ? ' checked' : ''}> runs the Symphonic Aura</label>
      ${s.aura && !rank ? '<span class="small">— set your Symphonic Aura rank under Your trio</span>' : ''}` : '';
  const auraFill = withAura ? `<button class="quiet" data-act="fill-aura">Fill the aura's gems with songs</button>` : '';
  const blank = s.gems.every((g) => !g);
  return `${intro}${undo}
    <nav class="tabs sets" role="tablist">${tabsHtml}<button data-act="new-set" data-template="" aria-label="new set">+ New</button></nav>
    <div class="row setbar">
      <label>Name <input type="text" value="${esc(s.name)}" data-set-name maxlength="40"></label>
      <label>Compare with level <input type="number" min="1" max="${LEVEL_CAP}" value="${esc(cmp)}" data-compare></label>
      ${before ? `<span class="small">${changed ? `${changed} gem${changed === 1 ? '' : 's'} changed since L${cmp}` : `nothing changed since L${cmp}`}</span>` : ''}
      ${auraToggle} ${auraFill}
    </div>
    ${a ? auraSummary(a, resolved, st) : ''}
    ${blank ? `<p class="actions">Fill it from a starting point:
      <button class="button" data-act="fill" data-template="fight">fighting</button>
      <button class="button" data-act="fill" data-template="buffs">buffs</button></p>` : ''}
    <ol class="gems">${rows}</ol>
    <p class="actions">
      <button class="button" data-act="copy-text">Copy as text</button>
      <button class="button" data-act="copy-link">Copy a link to these sets</button>
      <button class="quiet" data-act="delete-set">Delete this set</button>
      ${importButton()}
    </p>
    ${copiedNote(state.copied)}`;
}

// ---- events -------------------------------------------------------------------------------

function updateGems(state, set, fn) {
  const sets = structuredClone(state.settings.sets);
  const s = sets[activeIndex(state.settings)];
  fn(s.gems, s);
  set({ sets }, { compute: false });
}

export function onSetsChange(el, state, set) {
  if (el.matches('[data-gem-kind]')) {
    const i = Number(el.dataset.gemKind);
    const v = el.value;
    updateGems(state, set, (gems) => {
      if (!v) gems[i] = null;
      else if (v === 'spell') {
        const c = contexts(state)(state.settings.level);
        const current = resolveSet(gems, c)[i];
        const pick = current.spell ?? [...c.pool].sort((a, b) => a.level - b.level)[0];
        gems[i] = { kind: 'spell', id: pick.id };
      } else {
        const [kind, key] = v.split(':');
        gems[i] = { kind, key };
      }
    });
  } else if (el.matches('[data-gem-metric]')) {
    updateGems(state, set, (gems) => { gems[Number(el.dataset.gemMetric)].metric = el.value; });
  } else if (el.matches('[data-gem-spell]')) {
    updateGems(state, set, (gems) => { gems[Number(el.dataset.gemSpell)].id = Number(el.value); });
  } else if (el.matches('[data-set-name]')) {
    updateGems(state, set, (gems, s) => { s.name = el.value.trim() || 'Untitled'; });
  } else if (el.matches('[data-set-aura]')) {
    updateGems(state, set, (gems, s) => { s.aura = el.checked; });
  } else if (el.matches('[data-compare]')) {
    const n = parseInt(el.value, 10);
    set({ compareLevel: n >= 1 && n <= LEVEL_CAP ? n : null }, { compute: false });
  } else return false;
  return true;
}

async function copy(state, text, what) {
  try {
    await navigator.clipboard.writeText(text);
    state.copied = `Copied ${what}.`;
  } catch {
    state.copied = { manual: text };
  }
}

export function shareLink(st) {
  const payload = { v: 1, trio: st.trio, level: st.level, sets: st.sets };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${location.origin}${location.pathname}#share=${b64}`;
}

export function readShareLink(hash) {
  const m = hash.match(/^#share=([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try {
    const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
    const p = JSON.parse(json);
    if (p.v !== 1 || !Array.isArray(p.sets) || !Array.isArray(p.trio)) return null;
    p.sets = p.sets.slice(0, 20).map((s) => ({
      name: String(s.name ?? 'Shared set').slice(0, 40),
      gems: Array.from({ length: GEMS }, (_, i) => sanitizeRule(s.gems?.[i])),
    }));
    return p;
  } catch {
    return null;
  }
}

function sanitizeRule(r) {
  if (!r || typeof r !== 'object') return null;
  if (r.kind === 'spell' && Number.isInteger(r.id)) return { kind: 'spell', id: r.id };
  if (r.kind === 'role' && role(r.key)) return { kind: 'role', key: r.key, ...(r.metric && METRICS[r.metric] ? { metric: r.metric } : {}) };
  if (r.kind === 'want' && want(r.key)) return { kind: 'want', key: r.key };
  return null;
}

export function onSetsClick(el, state, set, render) {
  const st = state.settings;
  if (el.dataset.setTab !== undefined) set({ activeSet: Number(el.dataset.setTab) }, { compute: false });
  else if (el.dataset.gemRule !== undefined) {
    const [kind, key] = el.dataset.rule.split(':');
    updateGems(state, set, (gems) => { gems[Number(el.dataset.gemRule)] = { kind, key }; });
  }
  else if (el.dataset.gemUp !== undefined || el.dataset.gemDown !== undefined) {
    const i = Number(el.dataset.gemUp ?? el.dataset.gemDown);
    const j = el.dataset.gemUp !== undefined ? i - 1 : i + 1;
    if (j < 0 || j >= GEMS) return true;
    updateGems(state, set, (gems) => { [gems[i], gems[j]] = [gems[j], gems[i]]; });
  } else if (el.dataset.act === 'new-set' || el.dataset.act === 'fill') {
    const c = contexts(state)(st.level);
    const gems = el.dataset.template ? template(el.dataset.template, c) : emptyGems();
    const sets = structuredClone(st.sets ?? []);
    if (el.dataset.act === 'fill') sets[activeIndex(st)].gems = gems;
    else sets.push({ name: { fight: 'Fighting', buffs: 'Buffs' }[el.dataset.template] ?? `Set ${sets.length + 1}`, gems });
    state.undoSet = null;
    set({ sets, activeSet: el.dataset.act === 'fill' ? activeIndex(st) : sets.length - 1 }, { compute: false });
  } else if (el.dataset.act === 'fill-aura') {
    const rank = bardRanks(st).aura;
    const rules = auraTemplate(contexts(state)(st.level), rank);
    updateGems(state, set, (gems) => {
      [...band(rank, gems.length)].sort((x, y) => y - x).forEach((gi, k) => { gems[gi] = rules[k] ?? gems[gi]; });
    });
  } else if (el.dataset.act === 'delete-set') {
    const sets = structuredClone(st.sets);
    const ai = activeIndex(st);
    state.undoSet = { set: sets[ai], index: ai };
    sets.splice(ai, 1);
    set({ sets, activeSet: Math.max(0, ai - 1) }, { compute: false });
  } else if (el.dataset.act === 'undo-delete' && state.undoSet) {
    const sets = structuredClone(st.sets ?? []);
    sets.splice(state.undoSet.index, 0, state.undoSet.set);
    const index = state.undoSet.index;
    state.undoSet = null;
    set({ sets, activeSet: index }, { compute: false });
  } else if (el.dataset.act === 'copy-text') {
    const at = contexts(state);
    const s = st.sets[activeIndex(st)];
    copy(state, asText(s.name, resolveSet(s.gems, at(st.level)), st.level), 'the set as text').then(render);
  } else if (el.dataset.act === 'copy-link') {
    copy(state, shareLink(st), 'a link to your sets (it holds your trio, level and sets, and no game data)').then(render);
  } else return false;
  return true;
}
