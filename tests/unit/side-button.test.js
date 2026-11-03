'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModules } = require('../helpers/load-modules');

const FLOW_BUILDER_URL = 'https://example.lightning.force.com/builder_platform_interaction/flowBuilder.app?flowId=301000000000001';
const SETUP_FLOWS_URL = 'https://example.lightning.force.com/lightning/setup/Flows/home';

/**
 * Loads ContextDetector, SettingsManager and SideButton on a page.
 * chrome.storage is stubbed in memory, so settings changes reach onChange listeners.
 *
 * @param {Object} [opts]
 * @param {string} [opts.url]
 * @param {Object} [opts.settings] - Stored settings (merged over DEFAULTS)
 * @param {Object} [opts.features] - Feature module globals, e.g. { FlowHealthCheck: { isEnabled: () => false } }
 */
async function setup({ url = FLOW_BUILDER_URL, settings = {}, features = {} } = {}) {
  const store = { ...settings };
  const listeners = [];
  const chrome = {
    runtime: { sendMessage() {}, lastError: null, onMessage: { addListener() {} } },
    storage: {
      sync: {
        get(keys, cb) {
          const list = keys === null ? Object.keys(store) : [].concat(keys);
          cb(Object.fromEntries(list.filter(k => k in store).map(k => [k, store[k]])));
        },
        set(obj, cb) {
          const changes = {};
          for (const [k, v] of Object.entries(obj)) { changes[k] = { oldValue: store[k], newValue: v }; store[k] = v; }
          listeners.forEach(l => l(changes, 'sync'));
          cb && cb();
        }
      },
      onChanged: { addListener: (l) => listeners.push(l) }
    }
  };
  const env = loadModules(
    ['utils/context-detector.js', 'utils/settings-manager.js', 'ui/side-button.js'],
    { dom: true, url, globals: { chrome, ...features } }
  );
  const SideButton = env.get('SideButton');
  SideButton.init();
  await new Promise(r => setTimeout(r, 0)); // let the settings load
  const doc = env.window.document;

  const key = (k, mods = {}) => {
    const e = new env.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods });
    (doc.activeElement || doc.body).dispatchEvent(e);
    return e;
  };
  return {
    env, doc, SideButton,
    SettingsManager: env.get('SettingsManager'),
    menuOpen: () => doc.getElementById('sfut-menu')?.classList.contains('sfut-menu-visible') ?? false,
    shortcut: () => key('U', { shiftKey: true, ctrlKey: true }),
    key
  };
}

test('Cmd/Ctrl+Shift+U toggles the menu and prevents the default synchronously', async () => {
  const { shortcut, menuOpen } = await setup();
  const e = shortcut();
  assert.equal(e.defaultPrevented, true);
  assert.equal(menuOpen(), true);
  shortcut();
  assert.equal(menuOpen(), false);
});

test('the shortcut does nothing when keyboard shortcuts are switched off', async () => {
  const { shortcut, menuOpen } = await setup({ settings: { 'keyboardShortcuts.enabled': false } });
  const e = shortcut();
  assert.equal(e.defaultPrevented, false);
  assert.equal(menuOpen(), false);
});

test('switching keyboard shortcuts off applies without a reload', async () => {
  const { shortcut, menuOpen, SettingsManager } = await setup();
  await SettingsManager.set('keyboardShortcuts.enabled', false);
  assert.equal(shortcut().defaultPrevented, false);
  assert.equal(menuOpen(), false);
});


const FLOW_DETAILS_URL = 'https://example.lightning.force.com/lightning/setup/Flows/page?address=%2F300000000000001';
const off = { isEnabled: () => false };
const buttonShown = (doc) => doc.getElementById('sfut-side-button').style.display !== 'none';
const menuLabels = (doc) => [...doc.querySelectorAll('.sfut-menu-item')].map(el => el.textContent.trim());

test('the button is hidden on Flow details, where the menu would be empty', async () => {
  const { doc, shortcut, menuOpen } = await setup({ url: FLOW_DETAILS_URL });
  assert.equal(buttonShown(doc), false);
  shortcut();
  assert.equal(menuOpen(), false);
});

test('the button is hidden on a Setup page when every feature it offers is switched off', async () => {
  const { doc } = await setup({
    url: SETUP_FLOWS_URL,
    features: { SetupTabsFeature: off, ScheduledFlowExplorer: off, FlowErrorDictionaryFeature: off, FlowImportExport: off }
  });
  assert.equal(buttonShown(doc), false);
});

test('the button shows on Setup pages and Flow Builder', async () => {
  for (const url of [SETUP_FLOWS_URL, FLOW_BUILDER_URL]) {
    const { doc } = await setup({ url });
    assert.equal(buttonShown(doc), true, url);
  }
});

test('feature toggles still hide their entries', async () => {
  const { doc, shortcut } = await setup({ features: { FlowHealthCheck: off } });
  shortcut();
  const labels = menuLabels(doc);
  assert.ok(labels.some(l => l.includes('Find Unused Resources')));
  assert.ok(!labels.some(l => l.includes('Run Health Check')));
});

test('Search & Highlight and Find Unused Resources have distinct icons', async () => {
  const { doc, shortcut } = await setup();
  shortcut();
  const labels = menuLabels(doc);
  assert.ok(labels.some(l => l.startsWith('🔎') && l.includes('Search & Highlight')));
  assert.ok(labels.some(l => l.startsWith('🧹') && l.includes('Find Unused Resources')));
});
