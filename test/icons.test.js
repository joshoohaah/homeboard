import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ICON_GROUPS, iconIndex } from '../src/icons.js';
import { iconExists } from '../src/app.js';

test('every suggested icon is in the pack, current, and listed once', async () => {
  const { all } = await iconIndex();
  const known = new Set(all.map(([name]) => name));
  const suggested = Object.values(ICON_GROUPS).flat();
  assert.deepEqual(suggested.filter((n) => !known.has(n)), []);
  assert.equal(new Set(suggested).size, suggested.length);
  for (const name of suggested) assert.equal(await iconExists(name), true, name);
});
test('the whole pack is searchable by everyday words', async () => {
  const { all } = await iconIndex();
  assert.ok(all.length > 7000);
  for (const [word, name] of [['wrestling', 'kabaddi'], ['dentist', 'tooth'], ['birthday', 'cake-variant'], ['backpack', 'bag-personal']]) {
    assert.ok(all.some(([n, text]) => n === name && text.includes(word)), word);
  }
});
