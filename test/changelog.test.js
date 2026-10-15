import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHANGELOG } from '../src/changelog.js';

test('the changelog is newest first, and every entry has a date and some words', () => {
  assert.ok(CHANGELOG.length > 0);
  for (const e of CHANGELOG) {
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(e.text.trim().length > 0);
  }
  const dates = CHANGELOG.map((e) => e.date);
  assert.deepEqual(dates, [...dates].sort().reverse());
});
