// The Sets tab: spell sets whose gems hold rules, resolved at your level.

import { esc } from './format.js';
import { option, spellName, effects } from './ui.js';
import { GEMS, context, resolveSet, nextChanges, template, asText, ruleLabel } from './engine/sets.js';
import { ROLE_KEYS, role, METRICS, formatMetric } from './engine/roles.js';
import { WANT_KEYS, want, candidates, isMagnitude } from './engine/wants.js';
import { LEVEL_CAP } from './engine/layout.js';

// Contexts per level, kept until the trio, options or files change.
function contexts(state) {
  const st = state.settings;
  const key = JSON.stringify([st.trio, st.hunting, st.fightTicks, state.ds.source.loadedAt, state.ds.source.rows]);
  if (state.ctxCache?.key !== key) state.ctxCache = { key, map: new Map() };
  const { map } = state.ctxCache;
  return (lv) => {
    if (!map.has(lv)) map.set(lv, context(state.ds, st, lv));
    return map.get(lv);
  };
}

const emptyGems = () => Array.from({ length: GEMS }, () => null);
const activeIndex = (st) => Math.min(Math.max(st.activeSet ?? 0, 0), (st.sets?.length ?? 1) - 1);

function ruleValue(rule) {
  if (!rule) return '';
  return rule.kind === 'spell' ? 'spell' : `${rule.kind}:${rule.key}`;
}

function gemControls(i, rule, c, spellOptions) {
  const roles = ROLE_KEYS.filter((k) => (c.members[k] ?? []).length > 0);
  const wants = WANT_KEYS.filter((k) => candidates(c.pool, k).length > 0);
  const cur = ruleValue(rule);
  let html = `<select data-gem-kind="${i}" aria-label="gem ${i + 1}">
    ${option('', '— empty —', cur)}
    <optgroup label="Best for a job">${roles.map((k) => option(`role:${k}`, `best ${role(k).label}`, cur)).join('')}</optgroup>
    <optgroup label="Buff">${wants.map((k) => option(`want:${k}`, want(k).label, cur)).join('')}</optgroup>
    <optgroup label="Exactly">${option('spell', 'a spell I choose', cur)}</optgroup>
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
      <button class="button" data-act="new-set" data-template="">Start an empty set</button></div>`;
  }

  const ai = activeIndex(st);
  const s = sets[ai];
  const resolved = resolveSet(s.gems, c);
  const cmp = st.compareLevel ?? st.level - 1;
  const before = cmp >= 1 && cmp <= LEVEL_CAP && cmp !== st.level ? resolveSet(s.gems, at(cmp)) : null;
  const next = nextChanges(s.gems, st.level, at);
  const sorted = [...c.pool].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const spellOptions = (id) => sorted.map((x) => option(x.id, `L${x.level} ${x.name}`, id)).join('');
  const changed = before ? resolved.filter((g, i) => g.state === 'ok' && before[i].spell?.id !== g.spell.id && before[i].state === 'ok').length : 0;

  const rows = resolved.map((g, i) => {
    const was = before?.[i];
    const isNew = was && g.state === 'ok' && (was.state !== 'ok' || was.spell.id !== g.spell.id);
    const badges = [
      isNew ? `<span class="badge new">new since L${cmp}${was.state === 'ok' ? ` — was ${esc(was.spell.name)}` : ''}</span>` : '',
      next[i] ? `<span class="badge">→ ${esc(next[i].spell.name)} at L${next[i].level}</span>` : '',
    ].join('');
    let got = '';
    if (g.state === 'ok') got = `${spellName(g.spell, st.level)} <span class="val">${esc(valueText(g))}</span><div class="sub">${effects(g.spell)}</div>`;
    else if (g.state === 'later') got = `<span class="none">nothing yet —</span> ${spellName(g.spell, st.level)}`;
    else if (g.state === 'none') got = '<span class="none">nothing in this trio fits</span>';
    return `<li class="gem${isNew ? ' changed' : ''}">
      <span class="n">${i + 1}</span>
      <div class="rule">${gemControls(i, g.rule, c, spellOptions)}
        <span class="move"><button class="quiet" data-gem-up="${i}" aria-label="move up"${i === 0 ? ' disabled' : ''}>↑</button><button class="quiet" data-gem-down="${i}" aria-label="move down"${i === GEMS - 1 ? ' disabled' : ''}>↓</button></span></div>
      <div class="got">${got}${badges ? `<div class="badges">${badges}</div>` : ''}</div>
    </li>`;
  }).join('');

  const tabsHtml = sets.map((x, i) => `<button role="tab" aria-selected="${i === ai}" data-set-tab="${i}">${esc(x.name)}</button>`).join('');
  const blank = s.gems.every((g) => !g);
  return `${intro}${undo}
    <nav class="tabs sets" role="tablist">${tabsHtml}<button data-act="new-set" data-template="" aria-label="new set">+ New</button></nav>
    <div class="row setbar">
      <label>Name <input type="text" value="${esc(s.name)}" data-set-name maxlength="40"></label>
      <label>Compare with level <input type="number" min="1" max="${LEVEL_CAP}" value="${esc(cmp)}" data-compare></label>
      ${before ? `<span class="small">${changed ? `${changed} gem${changed === 1 ? '' : 's'} changed since L${cmp}` : `nothing changed since L${cmp}`}</span>` : ''}
    </div>
    ${blank ? `<p class="actions">Fill it from a starting point:
      <button class="button" data-act="fill" data-template="fight">fighting</button>
      <button class="button" data-act="fill" data-template="buffs">buffs</button></p>` : ''}
    <ol class="gems">${rows}</ol>
    <p class="actions">
      <button class="button" data-act="copy-text">Copy as text</button>
      <button class="button" data-act="copy-link">Copy a link to these sets</button>
      <button class="quiet" data-act="delete-set">Delete this set</button>
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
