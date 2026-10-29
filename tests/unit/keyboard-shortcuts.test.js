'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModules } = require('../helpers/load-modules');

async function setup() {
  const env = loadModules(['features/keyboard-shortcuts.js'], {
    dom: true,
    globals: { SettingsManager: { get: async () => true } }
  });
  await env.get('KeyboardShortcuts').init();
  const press = (key, mods = { shiftKey: true }) => {
    const e = new env.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods });
    env.window.document.body.dispatchEvent(e);
    return e.defaultPrevented;
  };
  return { env, press };
}

test('Shift+Tab is not prevented', async () => {
  const { press } = await setup();
  assert.equal(press('Tab'), false);
});

test('Shift+ArrowDown (and other Shift+arrows) are not prevented', async () => {
  const { press } = await setup();
  for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']) {
    assert.equal(press(key), false, key);
  }
});

test('unmapped Shift+letters are not prevented', async () => {
  const { press } = await setup();
  assert.equal(press('Q'), false);
  assert.equal(press('K'), false);
});

test('Shift+S is still prevented (mapped to Save)', async () => {
  const { press } = await setup();
  assert.equal(press('S'), true);
});

test('every mapped key is prevented, including the special cases', async () => {
  const { press } = await setup();
  for (const key of 'SDRMXAZYEVFWTH') assert.equal(press(key), true, key);
});

test('Ctrl/Cmd combinations are never prevented', async () => {
  const { press } = await setup();
  assert.equal(press('k', { ctrlKey: true }), false);
  assert.equal(press('k', { metaKey: true }), false);
  assert.equal(press('S', { shiftKey: true, metaKey: true }), false);
});
