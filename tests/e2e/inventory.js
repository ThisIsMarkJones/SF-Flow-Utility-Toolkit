'use strict';
/**
 * Builds the selector inventory from the toolkit's source.
 *
 * Collects string-literal selectors (including ones split across lines with
 * `+`) passed to querySelector / querySelectorAll / closest / matches in
 * features/, utils/ and ui/, plus selector constants (`selector: '...'`,
 * `*_SELECTOR = '...'`, `const SEL = { KEY: '...' }`, `_triggerToggleButton('...'`)
 * and editor tag names used as map keys, and groups them by the page they run on. Selectors built with `${...}` are
 * listed as dynamic and not checked automatically.
 *
 * Usage: node tests/e2e/inventory.js [--json]
 */
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DIRS = ['features', 'utils', 'ui'];

// Which page each file's selectors are checked on. Files not listed are
// "Toolkit UI" (the toolkit's own DOM) or unused on Salesforce pages.
const PAGE_BY_FILE = {
  'features/canvas-search.js': 'Flow Builder',
  'features/keyboard-shortcuts.js': 'Flow Builder',
  'features/api-name-generator.js': 'Flow Builder',
  'features/missing-description-flags.js': 'Flow Builder',
  'features/unused-resources-flags.js': 'Flow Builder',
  'features/unused-resources.js': 'Flow Builder',
  'features/autosave.js': 'Flow Builder',
  'features/ai-assistant.js': 'Flow Builder',
  'features/flow-health-check.js': 'Flow Builder',
  'features/flow-import-export.js': 'Flow Builder',
  'features/flow-error-explorer.js': 'Flow Builder (Debug)',
  'utils/flow-error-detector.js': 'Flow Builder (Debug)',
  'features/comparison-exporter.js': 'Flow Version Comparison',
  'features/setup-tabs.js': 'Setup',
  'features/flow-list-search.js': 'Setup: Flows list',
  'features/flow-trigger-explorer-enhancer.js': 'Flow Trigger Explorer',
  'features/flow-version-manager.js': 'Setup: Flow details',
  'features/scheduled-flow-explorer.js': 'Setup',
  'features/where-is-this-used.js': 'Setup: Flow details',
  'features/flow-error-dictionary.js': 'Setup',
  'utils/context-detector.js': 'Flow Version Comparison'
};

/**
 * Reads one or more string literals joined by `+` starting at text[i]
 * (after whitespace). Returns the joined string, or null if the argument
 * isn't built only from literals.
 */
function readLiterals(text, i) {
  let out = '';
  let found = false;
  for (;;) {
    while (/\s/.test(text[i] || '')) i++;
    const q = text[i];
    if (q !== "'" && q !== '"' && q !== '`') return found ? out : null;
    let j = i + 1;
    let lit = '';
    while (j < text.length && text[j] !== q) {
      if (text[j] === '\\') { lit += text[j + 1]; j += 2; continue; }
      if (q !== '`' && text[j] === '\n') return null;
      lit += text[j++];
    }
    out += lit;
    found = true;
    i = j + 1;
    while (/\s/.test(text[i] || '')) i++;
    if (text[i] !== '+') return out;
    i++;
  }
}

/** All selectors in a file, with their line numbers. */
function scan(text) {
  const found = [];
  const lineAt = (idx) => text.slice(0, idx).split('\n').length;
  const commentAt = (idx) => {
    const lineStart = text.lastIndexOf('\n', idx) + 1;
    return /^\s*(\*|\/\/|\/\*)/.test(text.slice(lineStart, idx + 1));
  };
  const add = (sel, idx) => { if (sel && sel.trim() && !commentAt(idx)) found.push({ selector: sel.trim(), line: lineAt(idx) }); };

  // querySelector(...), querySelectorAll(...), closest(...), matches(...)
  for (const m of text.matchAll(/\b(?:querySelector(?:All)?|closest|matches)\(/g)) {
    add(readLiterals(text, m.index + m[0].length), m.index);
  }
  // { selector: '...' }, FOO_SELECTOR = '...', _triggerToggleButton('...'
  for (const m of text.matchAll(/\bselector:|\b[A-Z0-9_]*SELECTORS?\s*=(?!\s*\{)|\b_triggerToggleButton\(/g)) {
    add(readLiterals(text, m.index + m[0].length), m.index);
  }
  // const SEL = { KEY: '...' } / const SELECTORS = { ... }
  for (const m of text.matchAll(/\bconst\s+(?:SEL|[A-Z0-9_]*SELECTORS?)\s*=\s*\{/g)) {
    const blockEnd = text.indexOf('};', m.index);
    const block = text.slice(m.index, blockEnd);
    for (const k of block.matchAll(/\b[A-Z][A-Z0-9_]*\s*:/g)) {
      add(readLiterals(text, m.index + k.index + k[0].length), m.index + k.index);
    }
  }
  // Tag-name keys in maps, e.g. { 'builder_platform_interaction-loop-editor': 'loop' }
  for (const m of text.matchAll(/['"]((?:builder_platform_interaction|flowruntime)-[a-z0-9-]+)['"]\s*:/g)) {
    add(m[1], m.index);
  }
  return found;
}

// Dynamic selectors whose values are fixed in the source: checked as these literals.
const EXPANSIONS = {
  '[data-label="${dataLabel}"]': ['[data-label="Label"]', '[data-label="API Name"]', '[data-label="Change Type"]'], // comparison-exporter getCellText
  '[data-testid="${testId}"]': ['[data-testid="baseFlowCompareVersionSelect"]', '[data-testid="secondaryFlowCompareVersionSelect"]'], // readPicker
  'a[data-tab-value="${tabValue}"]': ['a[data-tab-value="errorsTab"]', 'a[data-tab-value="warningsTab"]'] // _triggerErrorsPanelTab
};

function pageFor(rel, selector) {
  // The toolkit's own classes (sfut-*, or built from its class-name constants).
  if (/sfut|\$\{(?:C|CLASS_NAMES|TAB_CLASS|HIGHLIGHT_CLASS|FOCUS_CLASS)\b/i.test(selector)) return 'Toolkit UI';
  if (rel.startsWith('ui/')) return 'Toolkit UI';
  return PAGE_BY_FILE[rel] || 'Toolkit UI';
}

function build() {
  const entries = new Map(); // key: page|selector
  for (const dir of DIRS) {
    for (const name of fs.readdirSync(path.join(REPO_ROOT, dir)).sort()) {
      if (!name.endsWith('.js')) continue;
      const rel = `${dir}/${name}`;
      const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
      for (const { selector, line } of scan(text)) {
        const page = pageFor(rel, selector);
        const key = `${page}|${selector}`;
        if (!entries.has(key)) {
          entries.set(key, { selector, page, dynamic: selector.includes('${'), sources: [] });
        }
        const src = `${rel}:${line}`;
        if (!entries.get(key).sources.includes(src)) entries.get(key).sources.push(src);
      }
    }
  }
  for (const e of [...entries.values()]) {
    for (const literal of (e.dynamic && EXPANSIONS[e.selector]) || []) {
      const key = `${e.page}|${literal}`;
      if (!entries.has(key)) entries.set(key, { selector: literal, page: e.page, dynamic: false, expandedFrom: e.selector, sources: [...e.sources] });
    }
  }
  return [...entries.values()].sort((a, b) => a.page.localeCompare(b.page) || a.selector.localeCompare(b.selector));
}

if (require.main === module) {
  const inv = build();
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(inv, null, 2) + '\n');
  } else {
    const byPage = {};
    for (const e of inv) (byPage[e.page] = byPage[e.page] || []).push(e);
    for (const [page, list] of Object.entries(byPage)) {
      console.log(`\n## ${page} (${list.length})`);
      for (const e of list) console.log(`${e.dynamic ? '  [dynamic] ' : '  '}${e.selector}    ← ${e.sources.join(', ')}`);
    }
  }
}

module.exports = { build, scan, PAGE_BY_FILE };
