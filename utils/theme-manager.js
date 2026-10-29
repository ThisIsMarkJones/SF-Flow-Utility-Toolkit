// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Mark Jones. SF Flow Utility Toolkit.
/**
 * SF Flow Utility Toolkit - Theme Manager
 *
 * Sets data-sfut-theme="light" | "dark" on this frame's <html>, which switches
 * the colour tokens in styles/tokens.css.
 *
 * Setting 'theme.mode':
 * - 'light' / 'dark': applied as is.
 * - 'auto' (default): follows the page's actual background colour, not
 *   prefers-color-scheme. Salesforce's own dark mode doesn't cover Setup or
 *   Flow Builder, so a dark OS doesn't mean a dark page; reading the page also
 *   picks up extensions such as Dark Reader.
 *
 * Content scripts run in every frame, so each frame decides for itself (the
 * Setup VF iframe follows its own background, not the outer page's).
 *
 * Auto re-checks, at most once per RECHECK_MS, when:
 * - <html> or <body> changes class or style (page themes toggle these)
 * - <head> gains or loses elements (Dark Reader adds and removes <style>s)
 * - <body> gains or loses children (each toolkit modal is appended there)
 * - refresh() is called (main.js does this on SPA URL changes)
 * None of the observers watch subtrees, to keep Flow Builder fast.
 */

const ThemeManager = (() => {

  const ATTR = 'data-sfut-theme';
  const SETTING_KEY = 'theme.mode';
  const MODES = ['auto', 'light', 'dark'];

  /** Relative luminance below which a background counts as dark (#777 is about 0.18). */
  const DARK_LUMINANCE = 0.2;

  /** Backgrounds more transparent than this are skipped while walking up the tree. */
  const MIN_ALPHA = 0.5;

  const RECHECK_MS = 500;

  /** Sample points, as fractions of the viewport. Spread across the content area. */
  const SAMPLE_POINTS = [[0.25, 0.6], [0.5, 0.6], [0.75, 0.6]];

  /** The toolkit's own UI, which must never be sampled. */
  const TOOLKIT_UI = '[class*="sfut-"], [id^="sfut-"]';

  let _mode = 'auto';
  let _started = false;
  let _recheckTimer = null;
  let _lastApplied = null;

  /**
   * Reads the setting, applies the theme and starts watching for changes.
   * Safe to call more than once.
   */
  async function init() {
    if (_started) return;
    _started = true;

    try {
      _mode = _normaliseMode(await SettingsManager.get(SETTING_KEY));
    } catch (e) {
      console.warn('[SFUT Theme] Could not read theme setting, defaulting to auto:', e);
      _mode = 'auto';
    }

    apply();
    _observe();

    SettingsManager.onChange((key, newValue) => {
      if (key !== SETTING_KEY) return;
      _mode = _normaliseMode(newValue);
      apply();
    });
  }

  /**
   * Resolves the theme now and sets the attribute.
   * @returns {'light'|'dark'} The theme applied
   */
  function apply() {
    const theme = resolveTheme(_mode, _mode === 'auto' ? _sampleBackgrounds() : []);
    document.documentElement.setAttribute(ATTR, theme);

    if (theme !== _lastApplied) {
      console.log(`[SFUT Theme] ${theme} (mode: ${_mode})`);
      _lastApplied = theme;
    }
    return theme;
  }

  /**
   * Schedules a re-check. Calls within RECHECK_MS of each other collapse into one.
   */
  function refresh() {
    if (!_started || _mode !== 'auto' || _recheckTimer) return;
    _recheckTimer = setTimeout(() => {
      _recheckTimer = null;
      apply();
    }, RECHECK_MS);
  }

  /**
   * Decides the theme from the mode and, in auto, the sampled background colours.
   * A majority of dark samples means dark; no usable samples means light.
   *
   * @param {string} mode - 'auto' | 'light' | 'dark'
   * @param {string[]} colours - CSS colours as returned by getComputedStyle
   * @returns {'light'|'dark'}
   */
  function resolveTheme(mode, colours) {
    if (mode === 'light' || mode === 'dark') return mode;

    const luminances = (colours || [])
      .map(parseColour)
      .filter(c => c && c[3] >= MIN_ALPHA)
      .map(luminance);
    if (!luminances.length) return 'light';

    const dark = luminances.filter(l => l < DARK_LUMINANCE).length;
    return dark > luminances.length / 2 ? 'dark' : 'light';
  }

  /**
   * Parses rgb()/rgba() as returned by getComputedStyle.
   * @param {string} value
   * @returns {number[]|null} [r, g, b, alpha]
   */
  function parseColour(value) {
    const m = String(value || '').match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
    if (!m) return null;
    let alpha = m[4] === undefined ? 1 : parseFloat(m[4]);
    if (m[4] && m[4].endsWith('%')) alpha /= 100;
    return [+m[1], +m[2], +m[3], alpha];
  }

  /**
   * WCAG relative luminance.
   * @param {number[]} rgb
   * @returns {number} 0 (black) to 1 (white)
   */
  function luminance([r, g, b]) {
    const lin = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  // --- Private ---

  function _normaliseMode(value) {
    return MODES.includes(value) ? value : 'auto';
  }

  /**
   * Returns the visible background colour at each sample point, ignoring the
   * toolkit's own UI. Falls back to <body>, then <html>.
   * @returns {string[]}
   */
  function _sampleBackgrounds() {
    const colours = [];

    if (typeof document.elementsFromPoint === 'function') {
      for (const [fx, fy] of SAMPLE_POINTS) {
        const stack = document.elementsFromPoint(window.innerWidth * fx, window.innerHeight * fy);
        const pageEl = stack.find(el => !el.closest(TOOLKIT_UI));
        const colour = pageEl && _backgroundOf(pageEl);
        if (colour) colours.push(colour);
      }
    }

    if (!colours.length) {
      const fallback = _backgroundOf(document.body) || _backgroundOf(document.documentElement);
      if (fallback) colours.push(fallback);
    }
    return colours;
  }

  /**
   * Walks up from an element to the first background that's opaque enough to see.
   * @param {Element|null} el
   * @returns {string|null}
   */
  function _backgroundOf(el) {
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const colour = getComputedStyle(node).backgroundColor;
      const parsed = parseColour(colour);
      if (parsed && parsed[3] >= MIN_ALPHA) return colour;
    }
    return null;
  }

  function _observe() {
    const observer = new MutationObserver(refresh);
    const pageStyle = { attributes: true, attributeFilter: ['class', 'style'] };

    observer.observe(document.documentElement, pageStyle);
    if (document.head) observer.observe(document.head, { childList: true });
    if (document.body) observer.observe(document.body, { ...pageStyle, childList: true });
  }

  // --- Public API ---
  return {
    init,
    apply,
    refresh,
    resolveTheme,
    parseColour,
    luminance
  };

})();
