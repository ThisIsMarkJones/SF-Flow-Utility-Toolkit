'use strict';
/**
 * Contrast check for the colour tokens, in the light and dark themes.
 *
 * Covers every rule in toolkit.css, and in the Settings page's <style> block,
 * that sets both `color` and a background from tokens. Text that inherits its colour from a parent rule isn't paired
 * here, so it still needs checking by eye.
 *
 * Light values come from the `:root` block in tokens.css (`--lwc-*` hooks use
 * their literal fallback). Dark values are the `:root` values overridden by
 * the `html[data-sfut-theme="dark"]` block.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const STYLES = path.resolve(__dirname, '..', '..', 'styles');
const MIN_TEXT_CONTRAST = 4.5;
const DARK_SELECTOR = 'html[data-sfut-theme="dark"]';

/**
 * Pairs that already failed in light before dark mode, with their ratio then.
 * Recorded rather than fixed in the dark mode release; they must not get worse.
 * `.sfut-fee-overlay` is the modal backdrop, so its text never sits on it.
 * The prompt star buttons are a ★ glyph used as an icon, not body text.
 */
const KNOWN_LIGHT_FAILURES = new Map([
  ['.sfut-group-dropdown .uiMenuItem a:hover', 4.15],
  ['.sfut-canvas-search-bar-nav:hover', 4.17],
  ['.sfut-fte-info-trigger:hover, .sfut-fte-info-trigger:focus', 4.16],
  ['.sfut-sfe-overlay .sfut-sfe-badge-expired', 4.21],
  ['.sfut-sfe-overlay .sfut-sfe-cal-cell-other', 2.08],
  ['.sfut-sfe-overlay .sfut-sfe-chip-expired', 4.21],
  ['.sfut-unused-item-datatype', 4.35],
  ['.sfut-fee-overlay', 4.47],
  ['.sfut-fee-element-type', 4.03],
  ['.sfut-fee-dict-toggle:hover', 4.06],
  ['.sfut-fee-toast', 4.20],
  ['settings.html .category-badge', 4.15],
  ['settings.html .prompt-star-btn', 2.17],
  ['settings.html .prompt-star-btn:hover', 1.72],
  ['settings.html .prompt-star-btn.is-default', 1.72]
]);

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

function declarations(body) {
  const out = {};
  for (const part of body.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).replace(/!important/, '').trim();
  }
  return out;
}

/** Innermost `selector { body }` rules; @media wrappers fall away. */
function rules(css) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(stripComments(css)))) {
    out.push({ selector: m[1].trim().replace(/\s+/g, ' '), decls: declarations(m[2]) });
  }
  return out;
}

function tokenMaps() {
  const all = rules(fs.readFileSync(path.join(STYLES, 'tokens.css'), 'utf8'));
  const pick = (sel) => Object.assign({}, ...all.filter(r => r.selector === sel).map(r => r.decls));
  const light = pick(':root');
  const darkOverrides = pick(DARK_SELECTOR);
  return { light, dark: { ...light, ...darkOverrides }, hasDark: Object.keys(darkOverrides).length > 0 };
}

/** Resolves var() references; returns null for anything that isn't a plain colour. */
function resolve(value, tokens, depth = 0) {
  if (depth > 10 || value == null) return null;
  const v = value.trim();
  const m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/);
  if (m) {
    const [, name, fallback] = m;
    if (name in tokens) return resolve(tokens[name], tokens, depth + 1);
    return fallback ? resolve(fallback, tokens, depth + 1) : null;
  }
  return parseColour(v);
}

function parseColour(v) {
  if (v === 'white') return [255, 255, 255, 1];
  if (v === 'black') return [0, 0, 0, 1];
  let m = v.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map(c => c + c).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  return null;
}

const over = (top, base) => top.slice(0, 3).map((c, i) => c * top[3] + base[i] * (1 - top[3])).concat(1);

function luminance([r, g, b]) {
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Rules to check. Settings page selectors are prefixed so exceptions can't collide. */
function sourceRules() {
  const toolkit = rules(fs.readFileSync(path.join(STYLES, 'toolkit.css'), 'utf8'));
  const html = fs.readFileSync(path.join(STYLES, '..', 'settings', 'settings.html'), 'utf8');
  const settings = rules(html.match(/<style>([\s\S]*?)<\/style>/)[1])
    .map(r => ({ ...r, selector: `settings.html ${r.selector}` }));
  return [...toolkit, ...settings];
}

/** Every same-rule text/background pair, with its contrast ratio in the given theme. */
function pairs(tokens) {
  const surface = resolve('var(--sfut-color-surface)', tokens);
  const out = [];
  for (const { selector, decls } of sourceRules()) {
    const text = decls.color;
    const bg = decls['background-color'] ?? decls.background;
    if (!text || !bg || !text.includes('var(--sfut-') || !bg.includes('var(--sfut-')) continue;
    let fg = resolve(text, tokens);
    let back = resolve(bg, tokens);
    if (!fg || !back) continue;
    back = over(back, surface);
    fg = over(fg, back);
    out.push({ selector, text, bg, ratio: contrast(fg, back) });
  }
  return out;
}

const describe = (p) => `${p.selector}  (${p.text} on ${p.bg}): ${p.ratio.toFixed(2)}:1`;

test('the contrast check finds text/background pairs in toolkit.css and the Settings page', () => {
  const found = pairs(tokenMaps().light);
  assert.ok(found.filter(p => !p.selector.startsWith('settings.html')).length > 20);
  assert.ok(found.filter(p => p.selector.startsWith('settings.html')).length > 5);
});

test('light theme: text/background pairs meet 4.5:1, apart from recorded exceptions', () => {
  const failing = pairs(tokenMaps().light).filter(p => p.ratio < MIN_TEXT_CONTRAST);
  const unexpected = failing.filter(p => !(p.ratio >= KNOWN_LIGHT_FAILURES.get(p.selector) - 0.005));
  assert.deepEqual(unexpected.map(describe), []);
});

test('dark theme: text/background pairs meet 4.5:1, and recorded exceptions are no worse than in light', (t) => {
  const { dark, hasDark } = tokenMaps();
  if (!hasDark) return t.skip('no dark token set yet');
  const failing = pairs(dark).filter(p => p.ratio < MIN_TEXT_CONTRAST);
  const unexpected = failing.filter(p => !(p.ratio >= KNOWN_LIGHT_FAILURES.get(p.selector) - 0.005));
  assert.deepEqual(unexpected.map(describe), []);
});
