'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModules } = require('../helpers/load-modules');

/** Loads ThemeManager with a stub SettingsManager whose 'theme.mode' can change. */
function setup(mode) {
  const listeners = [];
  const SettingsManager = {
    get: async (key) => (key === 'theme.mode' ? mode : null),
    onChange: (cb) => listeners.push(cb)
  };
  const env = loadModules(['utils/theme-manager.js'], { dom: true, globals: { SettingsManager } });
  const doc = env.window.document;
  return {
    ThemeManager: env.get('ThemeManager'),
    doc,
    theme: () => doc.documentElement.getAttribute('data-sfut-theme'),
    changeSetting: (value) => listeners.forEach(cb => cb('theme.mode', value, mode))
  };
}

test('resolveTheme: Light and Dark are applied as set, whatever the page', () => {
  const { ThemeManager } = setup();
  assert.equal(ThemeManager.resolveTheme('light', ['rgb(0, 0, 0)']), 'light');
  assert.equal(ThemeManager.resolveTheme('dark', ['rgb(255, 255, 255)']), 'dark');
});

test('resolveTheme: Auto follows the majority of the sampled backgrounds', () => {
  const { ThemeManager } = setup();
  assert.equal(ThemeManager.resolveTheme('auto', ['rgb(24, 26, 27)']), 'dark');           // Dark Reader's default
  assert.equal(ThemeManager.resolveTheme('auto', ['rgb(243, 243, 243)']), 'light');
  assert.equal(ThemeManager.resolveTheme('auto', ['rgb(30, 30, 30)', 'rgb(30, 30, 30)', 'rgb(255, 255, 255)']), 'dark');
  assert.equal(ThemeManager.resolveTheme('auto', ['rgb(30, 30, 30)', 'rgb(255, 255, 255)', 'rgb(255, 255, 255)']), 'light');
});

test('resolveTheme: Auto ignores transparent samples and defaults to light', () => {
  const { ThemeManager } = setup();
  assert.equal(ThemeManager.resolveTheme('auto', []), 'light');
  assert.equal(ThemeManager.resolveTheme('auto', ['rgba(0, 0, 0, 0)']), 'light');
  assert.equal(ThemeManager.resolveTheme('auto', ['rgba(0, 0, 0, 0)', 'rgb(20, 20, 20)']), 'dark');
});

test('resolveTheme: mid grey sits on the light side of the threshold', () => {
  const { ThemeManager } = setup();
  assert.equal(ThemeManager.resolveTheme('auto', ['rgb(128, 128, 128)']), 'light');
  assert.equal(ThemeManager.resolveTheme('auto', ['rgb(110, 110, 110)']), 'dark');
});

test('parseColour reads the comma and space forms getComputedStyle returns', () => {
  const { ThemeManager } = setup();
  assert.deepEqual([...ThemeManager.parseColour('rgb(1, 2, 3)')], [1, 2, 3, 1]);
  assert.deepEqual([...ThemeManager.parseColour('rgba(1, 2, 3, 0.5)')], [1, 2, 3, 0.5]);
  assert.deepEqual([...ThemeManager.parseColour('rgb(1 2 3 / 50%)')], [1, 2, 3, 0.5]);
  assert.equal(ThemeManager.parseColour('transparent'), null);
});

test('init in Auto reads the page background (body fallback when there are no sample points)', async () => {
  const { ThemeManager, doc, theme } = setup('auto');
  doc.body.style.backgroundColor = 'rgb(24, 26, 27)';
  await ThemeManager.init();
  assert.equal(theme(), 'dark');
});

test('init in Auto on an unstyled page is light', async () => {
  const { ThemeManager, theme } = setup('auto');
  await ThemeManager.init();
  assert.equal(theme(), 'light');
});

test('an unknown setting value falls back to Auto', async () => {
  const { ThemeManager, doc, theme } = setup('sepia');
  doc.body.style.backgroundColor = 'rgb(0, 0, 0)';
  await ThemeManager.init();
  assert.equal(theme(), 'dark');
});

test('changing the setting applies straight away', async () => {
  const { ThemeManager, theme, changeSetting } = setup('light');
  await ThemeManager.init();
  assert.equal(theme(), 'light');
  changeSetting('dark');
  assert.equal(theme(), 'dark');
  changeSetting('light');
  assert.equal(theme(), 'light');
});

test('Auto re-checks when the page background changes', async () => {
  const { ThemeManager, doc, theme } = setup('auto');
  await ThemeManager.init();
  assert.equal(theme(), 'light');
  doc.body.style.backgroundColor = 'rgb(0, 0, 0)';   // body style change triggers the observer
  await new Promise(r => setTimeout(r, 650));
  assert.equal(theme(), 'dark');
});

test('the toolkit\'s own UI never decides the theme', async () => {
  const { ThemeManager, doc, theme } = setup('auto');
  const modal = doc.createElement('div');
  modal.className = 'sfut-modal-overlay';
  modal.style.backgroundColor = 'rgb(0, 0, 0)';
  doc.body.appendChild(modal);
  // jsdom has no elementsFromPoint; stub it with the modal on top of the page.
  doc.elementsFromPoint = () => [modal, doc.body, doc.documentElement];
  await ThemeManager.init();
  assert.equal(theme(), 'light');
});
