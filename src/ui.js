// HTML fragments shared by the views.
import { bundle } from './engine/roles.js';
import { esc } from './format.js';

export const option = (value, label, current) =>
  `<option value="${esc(value)}"${String(value) === String(current) ? ' selected' : ''}>${esc(label)}</option>`;

export function spellName(s, level) {
  const later = s.level > level;
  return `<span class="spell${later ? ' later' : ''}">${esc(s.name)}</span> <span class="lvl">${later ? `at L${s.level}` : `L${s.level}`}</span>`;
}

export const effects = (s) =>
  `<span class="effects">${bundle(s, { friendly: true }).map(esc).join(' · ') || 'no listed effects'}</span>`;
