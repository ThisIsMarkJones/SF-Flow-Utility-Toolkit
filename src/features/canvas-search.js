/**
 * SF Flow Utility Toolkit - Canvas Search & Highlight
 * 
 * Adds a search overlay to the Flow Builder canvas that lets users
 * search for elements by name or type, highlights matching cards,
 * and navigates between results.
 * 
 * Context: Flow Builder (/builder_platform_interaction/flowBuilder.app)
 * 
 * DOM selectors (from Flow Builder page source):
 *   Canvas wrapper:       builder_platform_interaction-alc-canvas .canvas
 *   Flow container:       .flow-container (child of .canvas, has CSS transform for pan/zoom)
 *   Element cards:        .element-card
 *   Element labels:       span.text-element-label[title]
 *   Element type labels:  span.element-type-label[title]
 *   Connector badges:     .connector-badge span.slds-truncate[title]
 *   Base card (visible):  .base-card
 * 
 * Settings used:
 *   canvasSearch.shortcut        – keyboard shortcut to open search (default: 'Ctrl+Shift+F')
 *   canvasSearch.highlightColour – colour for highlighted elements (default: '#FFD700')
 */

const CanvasSearch = (() => {

  // State
  let _isOpen = false;
  let _matches = [];        // Array of { card, label, type }
  let _currentIndex = -1;   // Index within _matches of the focused result
  let _highlightColour = '#FFD700';
  let _shortcutParts = null; // Parsed shortcut { ctrl, shift, alt, meta, key }

  // DOM references
  let _overlay = null;
  let _input = null;
  let _countLabel = null;
  let _debounceTimer = null;

  // CSS class applied to highlighted element cards
  const HIGHLIGHT_CLASS = 'sfut-canvas-highlight';
  const FOCUS_CLASS = 'sfut-canvas-highlight-focus';

  // ===== Initialisation =====

  async function init() {
    const context = ContextDetector.detectContext();
    if (context !== ContextDetector.CONTEXTS.FLOW_BUILDER) return;

    // Load settings
    const settings = await SettingsManager.getMultiple([
      'canvasSearch.shortcut',
      'canvasSearch.highlightColour'
    ]);

    _highlightColour = settings['canvasSearch.highlightColour'] || '#FFD700';
    const shortcutStr = settings['canvasSearch.shortcut'] || 'Ctrl+Shift+F';
    _shortcutParts = _parseShortcut(shortcutStr);

    // Inject highlight styles (colour is dynamic from settings)
    _injectDynamicStyles();

    // Listen for keyboard shortcut
    document.addEventListener('keydown', _onKeyDown, true);

    console.log(`[SFUT] Canvas Search initialised. Shortcut: ${shortcutStr}`);
  }

  /**
   * Called from the side-button menu to open search on demand.
   */
  function onActivate() {
    _openSearch();
  }

  // ===== Shortcut Parsing =====

  /**
   * Parses a shortcut string like "Ctrl+Shift+F" into components.
   */
  function _parseShortcut(str) {
    const parts = str.split('+').map(p => p.trim().toLowerCase());
    return {
      ctrl: parts.includes('ctrl'),
      shift: parts.includes('shift'),
      alt: parts.includes('alt'),
      meta: parts.includes('meta') || parts.includes('cmd'),
      key: parts.filter(p => !['ctrl', 'shift', 'alt', 'meta', 'cmd'].includes(p))[0] || ''
    };
  }

  /**
   * Checks if a keyboard event matches the configured shortcut.
   */
  function _matchesShortcut(e) {
    if (!_shortcutParts) return false;
    return (
      e.ctrlKey === _shortcutParts.ctrl &&
      e.shiftKey === _shortcutParts.shift &&
      e.altKey === _shortcutParts.alt &&
      e.metaKey === _shortcutParts.meta &&
      e.key.toLowerCase() === _shortcutParts.key
    );
  }

  // ===== Keyboard Handling =====

  function _onKeyDown(e) {
    // Open/focus search on configured shortcut
    if (_matchesShortcut(e)) {
      e.preventDefault();
      e.stopPropagation();
      if (_isOpen) {
        _input?.focus();
        _input?.select();
      } else {
        _openSearch();
      }
      return;
    }

    // Only handle remaining keys if search is open
    if (!_isOpen) return;

    // Escape to close
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      _closeSearch();
      return;
    }

    // Enter or Down arrow: next match
    if (e.key === 'Enter' || (e.key === 'ArrowDown' && e.target === _input)) {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        _navigatePrev();
      } else {
        _navigateNext();
      }
      return;
    }

    // Up arrow: previous match
    if (e.key === 'ArrowUp' && e.target === _input) {
      e.preventDefault();
      e.stopPropagation();
      _navigatePrev();
      return;
    }
  }

  // ===== Search Overlay UI =====

  function _openSearch() {
    if (_isOpen) return;
    _isOpen = true;

    _createOverlay();
    _input.focus();
  }

  function _closeSearch() {
    if (!_isOpen) return;
    _isOpen = false;

    _clearHighlights();
    _matches = [];
    _currentIndex = -1;

    if (_overlay && _overlay.parentNode) {
      _overlay.parentNode.removeChild(_overlay);
    }
    _overlay = null;
    _input = null;
    _countLabel = null;
  }

  function _createOverlay() {
    // Remove existing if somehow left over
    const existing = document.querySelector('.sfut-canvas-search-bar');
    if (existing) existing.remove();

    // Build the search bar
    const bar = document.createElement('div');
    bar.className = 'sfut-canvas-search-bar';

    // Search icon
    const icon = document.createElement('span');
    icon.className = 'sfut-canvas-search-bar-icon';
    icon.textContent = '🔍';
    bar.appendChild(icon);

    // Input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'sfut-canvas-search-bar-input';
    input.placeholder = 'Search elements…';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    bar.appendChild(input);

    // Navigation buttons
    const prevBtn = document.createElement('button');
    prevBtn.className = 'sfut-canvas-search-bar-nav';
    prevBtn.textContent = '▲';
    prevBtn.title = 'Previous match (Shift+Enter)';
    prevBtn.addEventListener('click', (e) => { e.preventDefault(); _navigatePrev(); _input.focus(); });
    bar.appendChild(prevBtn);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'sfut-canvas-search-bar-nav';
    nextBtn.textContent = '▼';
    nextBtn.title = 'Next match (Enter)';
    nextBtn.addEventListener('click', (e) => { e.preventDefault(); _navigateNext(); _input.focus(); });
    bar.appendChild(nextBtn);

    // Count label
    const count = document.createElement('span');
    count.className = 'sfut-canvas-search-bar-count';
    count.textContent = '';
    bar.appendChild(count);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'sfut-canvas-search-bar-close';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Close (Escape)';
    closeBtn.addEventListener('click', (e) => { e.preventDefault(); _closeSearch(); });
    bar.appendChild(closeBtn);

    // Debounced search on input
    input.addEventListener('input', () => {
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => {
        _performSearch(input.value.trim());
      }, 150);
    });

    // Inject into the canvas area
    const canvasContainer = document.querySelector(
      'builder_platform_interaction-alc-canvas-container, ' +
      'builder_platform_interaction-alc-canvas'
    );
    if (canvasContainer) {
      canvasContainer.style.position = canvasContainer.style.position || 'relative';
      canvasContainer.appendChild(bar);
    } else {
      // Fallback: append to body
      document.body.appendChild(bar);
    }

    _overlay = bar;
    _input = input;
    _countLabel = count;
  }

  // ===== Search Logic =====

  function _performSearch(query) {
    _clearHighlights();
    _matches = [];
    _currentIndex = -1;

    if (!query) {
      _updateCount();
      return;
    }

    const lowerQuery = query.toLowerCase();

    // 1) Search element cards by label and type
    const elementCards = document.querySelectorAll(
      'builder_platform_interaction-alc-element-card-template .element-card'
    );

    elementCards.forEach(card => {
      // Element label
      const labelEl = card.querySelector('span.text-element-label[title]');
      const label = labelEl ? labelEl.getAttribute('title') : '';

      // Element type
      const typeEl = card.querySelector('span.element-type-label[title]');
      const type = typeEl ? typeEl.getAttribute('title') : '';

      const labelMatch = label.toLowerCase().includes(lowerQuery);
      const typeMatch = type.toLowerCase().includes(lowerQuery);

      if (labelMatch || typeMatch) {
        _matches.push({
          card: card,
          label: label,
          type: type,
          matchedOn: labelMatch ? 'label' : 'type'
        });
      }
    });

    // 2) Search connector badges (decision outcome labels)
    const badges = document.querySelectorAll(
      '.connector-badge span.slds-truncate[title]'
    );

    badges.forEach(badge => {
      const badgeText = badge.getAttribute('title') || '';
      if (badgeText.toLowerCase().includes(lowerQuery)) {
        // For badges, highlight the badge container itself
        const badgeContainer = badge.closest('.connector-badge');
        if (badgeContainer) {
          _matches.push({
            card: badgeContainer,
            label: badgeText,
            type: 'Connector',
            matchedOn: 'badge',
            isBadge: true
          });
        }
      }
    });

    // 3) Search Toolbox palette items (resources and elements in the left panel)
    const paletteItems = document.querySelectorAll(
      'builder_platform_interaction-left-panel-resources tr.palette-item'
    );

    paletteItems.forEach(row => {
      const nameEl = row.querySelector(
        'builder_platform_interaction-palette-item .slds-truncate'
      );
      if (!nameEl) return;

      const itemName = (nameEl.textContent || '').trim();
      if (!itemName) return;

      if (itemName.toLowerCase().includes(lowerQuery)) {
        // Determine the section category from the accordion header
        const section = row.closest('lightning-accordion-section');
        const sectionTitle = section
          ? (section.querySelector('.slds-accordion__summary-content')?.getAttribute('title') || '')
          : '';

        _matches.push({
          card: row,
          label: itemName,
          type: sectionTitle || 'Toolbox',
          matchedOn: 'toolbox',
          isToolbox: true,
          section: section
        });
      }
    });

    // Apply highlights to all matches
    _matches.forEach(match => {
      if (match.isBadge) {
        match.card.classList.add(HIGHLIGHT_CLASS);
      } else {
        match.card.classList.add(HIGHLIGHT_CLASS);
      }
    });

    // Auto-navigate to first match
    if (_matches.length > 0) {
      _currentIndex = 0;
      _focusMatch(0);
    }

    _updateCount();
  }

  // ===== Navigation =====

  function _navigateNext() {
    if (_matches.length === 0) return;
    // Remove focus from current
    if (_currentIndex >= 0) {
      _matches[_currentIndex].card.classList.remove(FOCUS_CLASS);
    }
    _currentIndex = (_currentIndex + 1) % _matches.length;
    _focusMatch(_currentIndex);
    _updateCount();
  }

  function _navigatePrev() {
    if (_matches.length === 0) return;
    // Remove focus from current
    if (_currentIndex >= 0) {
      _matches[_currentIndex].card.classList.remove(FOCUS_CLASS);
    }
    _currentIndex = (_currentIndex - 1 + _matches.length) % _matches.length;
    _focusMatch(_currentIndex);
    _updateCount();
  }

  function _focusMatch(index) {
    const match = _matches[index];
    if (!match) return;

    match.card.classList.add(FOCUS_CLASS);

    if (match.isToolbox) {
      // For Toolbox items: ensure the accordion section is expanded and scroll into view
      if (match.section) {
        const sectionEl = match.section.querySelector('.slds-accordion__section');
        if (sectionEl && !sectionEl.classList.contains('slds-is-open')) {
          // Click the section button to expand it
          const expandBtn = match.section.querySelector('.slds-accordion__summary-action');
          if (expandBtn) expandBtn.click();
        }
      }
      // Ensure the Toolbox panel is visible
      const leftPanel = document.querySelector('.left-panel');
      if (leftPanel && !leftPanel.classList.contains('slds-is-open')) {
        // Try to open it
        const toolboxBtn = document.querySelector('button[title="Show Toolbox"]');
        if (toolboxBtn) toolboxBtn.click();
      }
      // Scroll the item into view within the Toolbox's scrollable container
      match.card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      _scrollToElement(match.card);
    }
  }

  // ===== Scroll Into View =====

  /**
   * Scrolls the canvas so the matched element is visible.
   * 
   * The Flow Builder canvas uses CSS transforms on .flow-container
   * for panning/zooming. We can't use scrollIntoView directly
   * because the canvas is overflow:hidden with transformed children.
   * 
   * Strategy: Adjust the transform on .flow-container so the
   * target element is centred in the visible canvas viewport.
   */
  function _scrollToElement(el) {
    const canvas = document.querySelector(
      'builder_platform_interaction-alc-canvas .canvas'
    );
    const flowContainer = canvas?.querySelector('.flow-container');
    if (!canvas || !flowContainer) {
      // Fallback: try native scrollIntoView
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      return;
    }

    // Get current transform values
    const style = flowContainer.style.transform || '';
    const matrixMatch = style.match(/matrix\(([^)]+)\)/);
    let tx = 0, ty = 0, scale = 1;

    if (matrixMatch) {
      const values = matrixMatch[1].split(',').map(Number);
      // matrix(scaleX, 0, 0, scaleY, translateX, translateY)
      scale = values[0] || 1;
      tx = values[4] || 0;
      ty = values[5] || 0;
    } else {
      // Try transformOrigin + simple translate parse
      const translateMatch = style.match(/translate\(([^,]+),\s*([^)]+)\)/);
      if (translateMatch) {
        tx = parseFloat(translateMatch[1]) || 0;
        ty = parseFloat(translateMatch[2]) || 0;
      }
    }

    // Get element position relative to the flow container
    const elRect = el.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    // Where the element currently appears in the viewport
    const elCentreX = elRect.left + elRect.width / 2;
    const elCentreY = elRect.top + elRect.height / 2;

    // Where the canvas centre is
    const canvasCentreX = canvasRect.left + canvasRect.width / 2;
    const canvasCentreY = canvasRect.top + canvasRect.height / 2;

    // How much to shift the transform
    const deltaX = canvasCentreX - elCentreX;
    const deltaY = canvasCentreY - elCentreY;

    const newTx = tx + deltaX;
    const newTy = ty + deltaY;

    // Apply smooth transition
    flowContainer.style.transition = 'transform 0.35s ease';
    flowContainer.style.transform = `matrix(${scale}, 0, 0, ${scale}, ${newTx}, ${newTy})`;

    // Also sync the custom scrollbars if present
    // (Flow Builder uses builder_platform_interaction-alc-scrollbar)
    // We'll let the transition settle then remove the transition property
    setTimeout(() => {
      flowContainer.style.transition = '';
    }, 400);
  }

  // ===== Highlight Management =====

  function _clearHighlights() {
    document.querySelectorAll('.' + HIGHLIGHT_CLASS).forEach(el => {
      el.classList.remove(HIGHLIGHT_CLASS);
      el.classList.remove(FOCUS_CLASS);
    });
  }

  function _updateCount() {
    if (!_countLabel) return;
    if (_matches.length === 0) {
      const hasQuery = _input && _input.value.trim().length > 0;
      _countLabel.textContent = hasQuery ? 'No matches' : '';
      _countLabel.classList.toggle('sfut-canvas-search-bar-no-results', hasQuery);
    } else {
      _countLabel.textContent = `${_currentIndex + 1} of ${_matches.length}`;
      _countLabel.classList.remove('sfut-canvas-search-bar-no-results');
    }
  }

  // ===== Dynamic Styles =====

  function _injectDynamicStyles() {
    const existingStyle = document.getElementById('sfut-canvas-search-dynamic');
    if (existingStyle) existingStyle.remove();

    const style = document.createElement('style');
    style.id = 'sfut-canvas-search-dynamic';
    style.textContent = `
      /* Highlight for all matching element cards */
      .element-card.${HIGHLIGHT_CLASS} .base-card,
      .connector-badge.${HIGHLIGHT_CLASS} {
        box-shadow: 0 0 0 3px ${_highlightColour} !important;
        border-color: ${_highlightColour} !important;
      }

      /* Stronger highlight for the currently focused match */
      .element-card.${FOCUS_CLASS} .base-card,
      .connector-badge.${FOCUS_CLASS} {
        box-shadow: 0 0 0 3px ${_highlightColour}, 0 0 12px 4px ${_highlightColour}80 !important;
        border-color: ${_highlightColour} !important;
      }

      /* Dim non-matching cards when search is active */
      .element-card:not(.${HIGHLIGHT_CLASS}) .base-card {
        /* Only dim when at least one highlight exists */
      }
    `;
    document.head.appendChild(style);
  }

  // ===== Listen for settings changes =====

  if (typeof SettingsManager !== 'undefined' && SettingsManager.onChange) {
    SettingsManager.onChange((key, newValue) => {
      if (key === 'canvasSearch.highlightColour') {
        _highlightColour = newValue || '#FFD700';
        _injectDynamicStyles();
      }
      if (key === 'canvasSearch.shortcut') {
        _shortcutParts = _parseShortcut(newValue || 'Ctrl+Shift+F');
      }
    });
  }

  // ===== Public API =====
  return {
    init,
    onActivate
  };

})();

// Register with the toolkit
if (typeof SFFlowUtilityToolkit !== 'undefined') {
  SFFlowUtilityToolkit.registerFeature('canvas-search', CanvasSearch);
}