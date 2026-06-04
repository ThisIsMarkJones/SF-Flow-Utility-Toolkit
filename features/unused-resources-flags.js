/**
 * SF Flow Utility Toolkit - Unused Resources Flags
 *
 * After the Unused Resources Explorer runs, injects ⚠ indicators on
 * unused resources in the Flow Builder Manager (Resources) tab toolbox.
 *
 * Pattern mirrors MissingDescriptionFlags._flagToolboxItems() exactly —
 * same selector, same observer setup, same requestAnimationFrame flush.
 *
 * activate(entries) — array of { name, label } objects (or plain strings).
 *                     Called after analysis; starts flagging.
 * deactivate()      — clears all flags and stops the observer.
 */

const UnusedResourcesFlags = (() => {

  // Lowercase key → original name, for case-insensitive matching
  let _unusedKeys  = new Map();
  let _flaggedIds  = new Set();
  let _observer    = null;
  let _isActive    = false;

  // ===== Public API =====

  function activate(entries) {
    deactivate();

    for (const entry of (entries || [])) {
      if (typeof entry === 'string') {
        _unusedKeys.set(entry.toLowerCase(), entry);
      } else {
        if (entry.name)  _unusedKeys.set(entry.name.toLowerCase(),  entry.name);
        if (entry.label) _unusedKeys.set(entry.label.toLowerCase(), entry.name || entry.label);
      }
    }

    if (_unusedKeys.size === 0) return;

    _isActive = true;
    _startObserving();

    // Attempt immediately — works if user is already on Manager tab.
    // Retry a few times to catch late LWC renders.
    _flagToolboxItems();
    [500, 1500, 3000].forEach(d => setTimeout(() => { if (_isActive) _flagToolboxItems(); }, d));

    console.log(`[SFUT UnusedFlags] Active — watching for ${_unusedKeys.size} unused resource(s).`);
  }

  function deactivate() {
    if (_observer) { _observer.disconnect(); _observer = null; }
    _clearAllFlags();
    _unusedKeys.clear();
    _flaggedIds.clear();
    _isActive = false;
  }

  function isActive() { return _isActive; }

  // ===== Internals — mirrors MissingDescriptionFlags exactly =====

  function _startObserving() {
    if (_observer) return;

    if (!document.body) {
      setTimeout(() => { if (_isActive) _startObserving(); }, 500);
      return;
    }

    _observer = new MutationObserver((mutations) => {
      let hasRelevantChange = false;
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length > 0) {
          hasRelevantChange = true;
          break;
        }
      }
      if (!hasRelevantChange) return;
      // requestAnimationFrame lets LWC finish rendering the row list
      // before we scan — same approach as MissingDescriptionFlags
      requestAnimationFrame(() => _flagToolboxItems());
    });

    _observer.observe(document.body, { childList: true, subtree: true });
    console.log('[SFUT UnusedFlags] Observer started.');
  }

  function _flagToolboxItems() {
    if (!_isActive || _unusedKeys.size === 0) return;

    // Same selector and inner query used by MissingDescriptionFlags
    const paletteItems = document.querySelectorAll(
      'builder_platform_interaction-left-panel-resources tr.palette-item'
    );

    let newFlags = 0;

    for (const row of paletteItems) {
      const nameEl = row.querySelector(
        'builder_platform_interaction-palette-item .slds-truncate'
      );
      if (!nameEl) continue;

      // Read own text nodes only — textContent includes child spans
      // (e.g. existing sfut-desc-flag-toolbox) which would break matching.
      // title is always "" in this DOM so we can't rely on it either.
      const resourceText = Array.from(nameEl.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent)
        .join('')
        .trim();

      if (!resourceText || !_unusedKeys.has(resourceText.toLowerCase())) continue;

      const rowId = `unused::${row.getAttribute('data-guid') || resourceText}`;

      if (_flaggedIds.has(rowId) && nameEl.querySelector('.sfut-unused-flag-toolbox')) continue;
      if (_flaggedIds.has(rowId)) _flaggedIds.delete(rowId);
      if (nameEl.querySelector('.sfut-unused-flag-toolbox')) continue;

      const flag = document.createElement('span');
      flag.className = 'sfut-unused-flag-toolbox';
      flag.title = `"${resourceText}" is not used anywhere in this flow`;
      flag.setAttribute('aria-label', `Warning: ${resourceText} is unused`);
      flag.textContent = ' ⊗';
      nameEl.appendChild(flag);

      _flaggedIds.add(rowId);
      newFlags++;
    }

    if (newFlags > 0) {
      console.log(`[SFUT UnusedFlags] Flagged ${newFlags} toolbox resource(s).`);
    }
  }

  function _clearAllFlags() {
    document.querySelectorAll('.sfut-unused-flag-toolbox').forEach(el => el.remove());
  }

  return { activate, deactivate, isActive };

})();