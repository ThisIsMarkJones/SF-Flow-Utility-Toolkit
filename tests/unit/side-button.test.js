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

const headers = (doc) => [...doc.querySelectorAll('.sfut-menu-group-label')].map(el => el.textContent);
const activations = (doc) => {
  const seen = [];
  doc.addEventListener('sfut-feature-activate', e => seen.push(e.detail));
  return seen;
};

test('Flow Builder groups its entries under Canvas, Analyse, Assist and Move', async () => {
  const { doc, shortcut } = await setup();
  shortcut();
  assert.deepEqual(headers(doc), ['Canvas', 'Analyse', 'Assist', 'Move']);
  const order = [...doc.querySelectorAll('.sfut-menu-group-label, .sfut-menu-item')].map(el =>
    el.classList.contains('sfut-menu-group-label') ? `# ${el.textContent}` : el.dataset.feature);
  assert.deepEqual(order, [
    '# Canvas', 'canvas-search', 'missing-descriptions',
    '# Analyse', 'flow-health-check', 'unused-resources',
    '# Assist', 'ai-assistant',
    '# Move', 'flow-import-export'
  ]);
});

test('Error Explorer joins Analyse only in a fault-debug session', async () => {
  const { doc, shortcut } = await setup({ url: `${FLOW_BUILDER_URL}&guid=abc` });
  shortcut();
  assert.ok(doc.querySelector('.sfut-menu-item[data-feature="flow-error-explorer"]'));
});

test('Setup pages stay flat, with no group headers', async () => {
  const { doc, shortcut } = await setup({ url: SETUP_FLOWS_URL });
  shortcut();
  assert.deepEqual(headers(doc), []);
  assert.equal(doc.querySelectorAll('.sfut-menu-item').length, 4);
});

test('toggles are one row with a switch showing their state', async () => {
  const { doc, shortcut } = await setup({ url: SETUP_FLOWS_URL });
  shortcut();
  const tabs = doc.querySelector('.sfut-menu-item[data-feature="setup-tabs"]');
  assert.equal(tabs.getAttribute('role'), 'menuitemcheckbox');
  assert.equal(tabs.getAttribute('aria-checked'), 'false');
  assert.equal(tabs.textContent.trim().replace(/\s+/g, ' '), '📑 Setup Tabs');
  assert.ok(tabs.querySelector('.sfut-menu-switch'));
});

test('Missing Description Flags: no ↻ while off', async () => {
  const { doc, shortcut } = await setup({ features: { MissingDescriptionFlags: { isEnabled: () => true, isActive: () => false } } });
  shortcut();
  const row = doc.querySelector('.sfut-menu-item[data-feature="missing-descriptions"]');
  assert.equal(row.getAttribute('aria-checked'), 'false');
  assert.equal(doc.querySelector('.sfut-menu-item-refresh'), null);
});

test('Missing Description Flags: while on, the ↻ on the same row refreshes them', async () => {
  const { doc, shortcut } = await setup({ features: { MissingDescriptionFlags: { isEnabled: () => true, isActive: () => true } } });
  shortcut();
  const row = doc.querySelector('.sfut-menu-item[data-feature="missing-descriptions"]');
  assert.equal(row.getAttribute('aria-checked'), 'true');
  const refresh = doc.querySelector('.sfut-menu-item-refresh');
  assert.equal(refresh.parentElement, row.parentElement);
  assert.equal([...doc.querySelectorAll('.sfut-menu-item')].filter(el => /Refresh/.test(el.textContent)).length, 0);

  const seen = activations(doc);
  refresh.click();
  assert.deepEqual(seen.map(d => ({ ...d })), [{ feature: 'missing-descriptions', action: 'refresh' }]);
});

const focusedId = (doc) => {
  const el = doc.activeElement;
  return el?.dataset?.feature ? `${el.dataset.feature}:${el.dataset.action}` : el?.id || el?.tagName;
};

test('the button is a real button that reports whether the menu is open', async () => {
  const { doc, shortcut } = await setup();
  const btn = doc.getElementById('sfut-side-button');
  assert.equal(btn.tagName, 'BUTTON');
  assert.equal(btn.getAttribute('aria-haspopup'), 'menu');
  assert.equal(btn.getAttribute('aria-expanded'), 'false');
  shortcut();
  assert.equal(btn.getAttribute('aria-expanded'), 'true');
  assert.equal(doc.getElementById('sfut-menu-content').getAttribute('role'), 'menu');
});

test('opening the menu focuses the first entry; arrows, Home and End move and wrap', async () => {
  const { doc, shortcut, key } = await setup({ url: SETUP_FLOWS_URL });
  shortcut();
  assert.equal(focusedId(doc), 'setup-tabs:activate');
  key('ArrowDown');
  assert.equal(focusedId(doc), 'scheduled-flow-explorer:activate');
  key('End');
  assert.equal(focusedId(doc), 'sfut-settings-link');
  key('ArrowDown');
  assert.equal(focusedId(doc), 'setup-tabs:activate');
  key('ArrowUp');
  assert.equal(focusedId(doc), 'sfut-settings-link');
  key('Home');
  assert.equal(focusedId(doc), 'setup-tabs:activate');
});

test('Enter runs the focused entry and closes the menu', async () => {
  const { doc, shortcut, key, menuOpen } = await setup({ url: SETUP_FLOWS_URL });
  const seen = activations(doc);
  shortcut();
  key('ArrowDown');
  key('Enter');
  assert.deepEqual(seen.map(d => ({ ...d })), [{ feature: 'scheduled-flow-explorer', action: 'activate' }]);
  assert.equal(menuOpen(), false);
});

test('Escape closes the menu and puts focus back where it was', async () => {
  const { doc, shortcut, key, menuOpen } = await setup();
  const input = doc.createElement('input');
  doc.body.appendChild(input);
  input.focus();
  shortcut();
  assert.notEqual(doc.activeElement, input);
  key('Escape');
  assert.equal(menuOpen(), false);
  assert.equal(doc.activeElement, input);
});

test('Tab closes the menu', async () => {
  const { shortcut, key, menuOpen } = await setup();
  shortcut();
  key('Tab');
  assert.equal(menuOpen(), false);
});

test('the shortcut still closes the menu while focus is inside it', async () => {
  const { shortcut, menuOpen } = await setup();
  shortcut();
  shortcut();
  assert.equal(menuOpen(), false);
});

test('key presses in the menu never reach the page (Flow Builder, canvas shortcuts)', async () => {
  const { doc, shortcut, key } = await setup();
  let reached = 0;
  doc.addEventListener('keydown', () => reached++);
  shortcut();
  reached = 0;
  for (const k of ['Delete', 'Backspace', 'S', 'ArrowDown']) key(k, { shiftKey: k === 'S' });
  assert.equal(reached, 0);
});

test('a rebuild while the menu is open keeps focus on the same entry', async () => {
  const { doc, shortcut, key, SideButton } = await setup();
  shortcut();
  key('ArrowDown');
  key('ArrowDown');
  const before = focusedId(doc);
  SideButton.refresh();
  assert.equal(focusedId(doc), before);
});

test('Setup pages keep their original order, with Setup Tabs first', async () => {
  const { doc, shortcut } = await setup({ url: SETUP_FLOWS_URL });
  shortcut();
  assert.deepEqual([...doc.querySelectorAll('.sfut-menu-item')].map(el => el.dataset.feature),
    ['setup-tabs', 'scheduled-flow-explorer', 'flow-error-dictionary', 'flow-import-export']);
});
