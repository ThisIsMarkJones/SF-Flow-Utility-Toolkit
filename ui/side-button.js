// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Mark Jones. SF Flow Utility Toolkit.
/**
 * SF Flow Utility Toolkit - Side Button
 *
 * Renders the persistent side button and contextual menu
 * on supported Salesforce pages.
 *
 * Update:
 * - Avoids "Uncaught (in promise) ... message channel closed" by always providing
 *   a callback to chrome.runtime.sendMessage for openSettings.
 * - Groups entries (Canvas, Analyse, Assist, Move) with headers on pages with
 *   more than five entries. Toggles (Missing Description Flags, Setup Tabs)
 *   are one row with a switch; while the flags are on, a ↻ on that row
 *   refreshes them.
 * - Removes API Name Generator from the side button menu.
 * - Prevents the side button from rendering inside iframes / VF frames.
 * - Adds a "Run Health Check" menu item for Flow Builder.
 * - Adds the "Scheduled Flow Explorer" menu entry for Setup pages.
 * - Adds global Cmd/Ctrl+Shift+U keyboard shortcut to toggle the sidebar
 *   from any page where the side button is present.
 */

const SideButton = (() => {

  let buttonElement = null;
  let menuElement = null;
  let isMenuOpen = false;
  let urlObserverInitialised = false;
  let _returnFocusTo = null;

  /** Everything the arrow keys move between, in order. */
  const MENU_ITEM_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"]';

  /**
   * Settings the launcher reads synchronously (the shortcut handler must call
   * preventDefault() before any await). Filled at init from SettingsManager,
   * then kept current through SettingsManager.onChange.
   */
  const SETTING_KEYS = [
    'keyboardShortcuts.enabled',
    'sideButton.hidden',
    'sideButton.edge',
    'sideButton.verticalPosition',
    'sideButton.idleOpacity'
  ];
  /**
   * Menu groups, in display order. Headers only show on pages with more than
   * GROUP_HEADER_THRESHOLD entries (Flow Builder); smaller menus stay flat.
   */
  const GROUPS = [
    { id: 'setup',   label: 'Setup' },   // Setup Tabs, which leads Setup pages' flat menus
    { id: 'canvas',  label: 'Canvas' },
    { id: 'analyse', label: 'Analyse' },
    { id: 'assist',  label: 'Assist' },
    { id: 'move',    label: 'Move' }
  ];
  const GROUP_HEADER_THRESHOLD = 5;

  const _settings = Object.fromEntries(SETTING_KEYS.map(k => [k, SettingsManager.DEFAULTS[k]]));
  let _settingsListenerAttached = false;

  /**
   * Initialises the side button if the current context supports it.
   */
  function init() {
    // Only render the side button in the top window, not inside embedded iframes.
    if (window.top !== window.self) {
      return;
    }

    if (!ContextDetector.shouldShowSideButton()) {
      return;
    }

    _createButton();
    _createMenu();
    _attachEventListeners();
    _loadSettings();
    _updateVisibility();
  }

  /**
   * Returns the menu entries for the current page, after feature toggles.
   * @returns {Object[]}
   */
  function _currentMenuItems() {
    return _getMenuItemsForFeatures(ContextDetector.getAvailableFeatures());
  }

  /**
   * Shows the button only on supported pages that have at least one menu entry
   * (so not on Flow details, whose tools live in the page itself), and closes
   * the menu when the button goes away.
   */
  function _updateVisibility() {
    if (!buttonElement) return;
    const visible = ContextDetector.shouldShowSideButton() && _currentMenuItems().length > 0;
    buttonElement.style.display = visible ? '' : 'none';
    if (!visible) _toggleMenu(false);
  }

  /**
   * Reads the launcher settings into the cache and listens for changes.
   */
  async function _loadSettings() {
    try {
      Object.assign(_settings, await SettingsManager.getMultiple(SETTING_KEYS));
    } catch (e) {
      console.warn('[SFUT] Side button settings could not be read, using defaults:', e);
    }

    if (!_settingsListenerAttached) {
      _settingsListenerAttached = true;
      SettingsManager.onChange((key, newValue) => {
        if (!SETTING_KEYS.includes(key)) return;
        _settings[key] = newValue ?? SettingsManager.DEFAULTS[key];
      });
    }
  }

  /**
   * Refreshes the menu items based on current context.
   * Call this when URL changes within a single-page app navigation.
   */
  function refresh() {
    if (window.top !== window.self) return;

    if (menuElement) {
      _populateMenu();
    }
    _updateVisibility();
  }

  /**
   * Creates the side button element and appends it to the page.
   */
  function _createButton() {
    const existing = document.getElementById('sfut-side-button');
    if (existing) {
      buttonElement = existing;
      return;
    }

    buttonElement = document.createElement('button');
    buttonElement.type = 'button';
    buttonElement.id = 'sfut-side-button';
    buttonElement.className = 'sfut-side-button';
    buttonElement.title = 'SF Flow Utility Toolkit';
    buttonElement.setAttribute('aria-label', 'SF Flow Utility Toolkit');
    buttonElement.setAttribute('aria-haspopup', 'menu');
    buttonElement.setAttribute('aria-controls', 'sfut-menu-content');
    buttonElement.setAttribute('aria-expanded', 'false');
    buttonElement.innerHTML = `
      <span class="sfut-side-button-icon" aria-hidden="true">⚡</span>
    `;
    document.body.appendChild(buttonElement);
  }

  /**
   * Creates the contextual menu panel.
   */
  function _createMenu() {
    const existing = document.getElementById('sfut-menu');
    if (existing) {
      menuElement = existing;
      _populateMenu();
      return;
    }

    menuElement = document.createElement('div');
    menuElement.id = 'sfut-menu';
    menuElement.className = 'sfut-menu sfut-menu-hidden';

    // Menu header
    const header = document.createElement('div');
    header.className = 'sfut-menu-header';
    header.innerHTML = `
      <span class="sfut-menu-title" id="sfut-menu-title">SF Flow Utility Toolkit</span>
      <button type="button" class="sfut-menu-close" aria-label="Close menu">&times;</button>
    `;
    menuElement.appendChild(header);

    // Filter box: shown on menus with more than GROUP_HEADER_THRESHOLD entries
    const filter = document.createElement('div');
    filter.className = 'sfut-menu-filter';
    filter.hidden = true;
    filter.innerHTML = `
      <input type="search" class="sfut-menu-filter-input" id="sfut-menu-filter-input"
             placeholder="Filter tools" aria-label="Filter tools" aria-controls="sfut-menu-content"
             autocomplete="off" spellcheck="false">
    `;
    menuElement.appendChild(filter);

    // Menu content container
    const content = document.createElement('div');
    content.id = 'sfut-menu-content';
    content.className = 'sfut-menu-content';
    content.setAttribute('role', 'menu');
    content.setAttribute('aria-labelledby', 'sfut-menu-title');
    menuElement.appendChild(content);

    const noMatch = document.createElement('div');
    noMatch.className = 'sfut-menu-empty sfut-menu-no-match';
    noMatch.setAttribute('role', 'status');
    noMatch.hidden = true;
    noMatch.textContent = 'No matching tools';
    menuElement.appendChild(noMatch);

    // Settings link (always present)
    const footer = document.createElement('div');
    footer.className = 'sfut-menu-footer';
    footer.innerHTML = `
      <a href="#" id="sfut-settings-link" class="sfut-menu-settings-link" role="menuitem" tabindex="-1">
        ⚙ Settings
      </a>
    `;
    menuElement.appendChild(footer);

    document.body.appendChild(menuElement);

    _populateMenu();
  }

  /**
   * Populates the menu with items based on the current context.
   */
  function _populateMenu() {
    const content = document.getElementById('sfut-menu-content');
    if (!content) return;

    // A rebuild while the menu is in use (refresh() after a feature loads)
    // puts focus back on the same entry.
    const focused = content.contains(document.activeElement) ? document.activeElement : null;
    const refocus = focused && `[data-feature="${focused.dataset.feature}"][data-action="${focused.dataset.action}"]`;

    content.innerHTML = '';

    const menuItems = _currentMenuItems();

    if (menuItems.length === 0) {
      content.innerHTML = '<div class="sfut-menu-empty">No tools available for this page.</div>';
      return;
    }

    const showHeaders = menuItems.length > GROUP_HEADER_THRESHOLD;

    for (const group of GROUPS) {
      const groupItems = menuItems.filter(item => item.group === group.id);
      if (!groupItems.length) continue;

      if (showHeaders) {
        const header = document.createElement('div');
        header.className = 'sfut-menu-group-label';
        header.setAttribute('role', 'presentation');
        header.dataset.group = group.id;
        header.textContent = group.label;
        content.appendChild(header);
      }

      groupItems.forEach(item => content.appendChild(_buildMenuRow(item, group)));
    }

    _filterWrap().hidden = menuItems.length <= GROUP_HEADER_THRESHOLD;
    _applyFilter();

    if (refocus) content.querySelector(refocus)?.focus();
  }

  function _filterWrap() {
    return menuElement.querySelector('.sfut-menu-filter');
  }

  function _filterInput() {
    return menuElement.querySelector('.sfut-menu-filter-input');
  }

  /**
   * Hides the rows that don't match the filter text (by entry label or group
   * name), and any group header left with no rows.
   */
  function _applyFilter() {
    const input = _filterInput();
    const query = !_filterWrap().hidden && input ? input.value.trim().toLowerCase() : '';
    const rows = [...menuElement.querySelectorAll('.sfut-menu-row')];

    rows.forEach(row => { row.hidden = !!query && !row.dataset.filterText.includes(query); });
    menuElement.querySelectorAll('.sfut-menu-group-label').forEach(label => {
      label.hidden = !rows.some(row => !row.hidden && row.dataset.group === label.dataset.group);
    });
    menuElement.querySelector('.sfut-menu-no-match').hidden = !query || rows.some(row => !row.hidden);
  }

  /**
   * Builds one menu row. Actions are a single item; toggles show their state
   * as a switch, and Missing Descriptions adds a ↻ (refresh) control beside
   * it while the flags are on, in place of a separate Refresh entry.
   *
   * @param {Object} item - Entry from _getMenuItemsForFeatures
   * @param {{id: string, label: string}} group
   * @returns {HTMLElement}
   */
  function _buildMenuRow(item, group) {
    const row = document.createElement('div');
    row.className = 'sfut-menu-row';
    row.setAttribute('role', 'none');
    row.dataset.group = group.id;
    row.dataset.filterText = `${item.label} ${group.label}`.toLowerCase();

    const menuItem = document.createElement('div');
    menuItem.className = 'sfut-menu-item';
    menuItem.dataset.feature = item.id;
    menuItem.dataset.action = 'activate';
    menuItem.tabIndex = -1;
    menuItem.innerHTML = `
      <span class="sfut-menu-item-icon" aria-hidden="true">${item.icon}</span>
      <span class="sfut-menu-item-label">${item.label}</span>
    `;

    if (item.type === 'toggle') {
      menuItem.classList.add('sfut-menu-item--toggle');
      menuItem.setAttribute('role', 'menuitemcheckbox');
      menuItem.setAttribute('aria-checked', String(!!item.checked));
      menuItem.insertAdjacentHTML('beforeend', '<span class="sfut-menu-switch" aria-hidden="true"></span>');
    } else {
      menuItem.setAttribute('role', 'menuitem');
    }

    menuItem.addEventListener('click', () => _handleMenuItemClick(item));
    row.appendChild(menuItem);

    if (item.refreshable) {
      const refreshBtn = document.createElement('div');
      refreshBtn.className = 'sfut-menu-item-refresh';
      refreshBtn.setAttribute('role', 'menuitem');
      refreshBtn.setAttribute('aria-label', 'Refresh Missing Descriptions');
      refreshBtn.title = 'Refresh Missing Descriptions';
      refreshBtn.tabIndex = -1;
      refreshBtn.dataset.feature = item.id;
      refreshBtn.dataset.action = 'refresh';
      refreshBtn.textContent = '↻';
      refreshBtn.addEventListener('click', () => _handleMenuItemClick({ id: item.id, action: 'refresh' }));
      row.appendChild(refreshBtn);
    }

    return row;
  }

  /**
   * Returns whether the Setup Tabs are currently injected and visible in the DOM.
   *
   * @returns {boolean}
   */
  function _areSetupTabsVisible() {
    return !!document.querySelector('.sfut-custom-tab');
  }

  /**
   * Returns whether a feature is currently enabled, by checking its module's
   * isEnabled() export. Defaults to true if the module isn't available yet.
   * @param {string} featureId
   * @returns {boolean}
   */
  function _isFeatureEnabled(featureId) {
    const moduleMap = {
      'canvas-search':               typeof CanvasSearch               !== 'undefined' ? CanvasSearch               : null,
      'ai-assistant':                typeof FlowAIAssistant            !== 'undefined' ? FlowAIAssistant            : null,
      'comparison-exporter':         typeof ComparisonExporter         !== 'undefined' ? ComparisonExporter         : null,
      'flow-health-check':           typeof FlowHealthCheck            !== 'undefined' ? FlowHealthCheck            : null,
      'unused-resources':            typeof UnusedResources             !== 'undefined' ? UnusedResources             : null,
      'scheduled-flow-explorer':     typeof ScheduledFlowExplorer      !== 'undefined' ? ScheduledFlowExplorer      : null,
      'flow-import-export':          typeof FlowImportExport            !== 'undefined' ? FlowImportExport            : null,
      'missing-descriptions':        typeof MissingDescriptionFlags     !== 'undefined' ? MissingDescriptionFlags     : null,
      'setup-tabs':                  typeof SetupTabsFeature            !== 'undefined' ? SetupTabsFeature            : null,
      'api-name-generator':          typeof APINameGenerator            !== 'undefined' ? APINameGenerator            : null,
      'flow-error-explorer':         typeof FlowErrorExplorer           !== 'undefined' ? FlowErrorExplorer           : null,
      'flow-error-dictionary':       typeof FlowErrorDictionaryFeature  !== 'undefined' ? FlowErrorDictionaryFeature  : null,
    };
    const mod = moduleMap[featureId];
    if (!mod || typeof mod.isEnabled !== 'function') return true; // default visible
    return mod.isEnabled();
  }

  /**
   * Returns whether Missing Description Flags are currently active.
   * Requires MissingDescriptionFlags.isActive() to exist.
   *
   * @returns {boolean}
   */
  function _areMissingDescriptionFlagsActive() {
    return (
      typeof MissingDescriptionFlags !== 'undefined' &&
      typeof MissingDescriptionFlags.isActive === 'function' &&
      MissingDescriptionFlags.isActive()
    );
  }

  /**
   * Maps feature identifiers to menu item display properties.
   *
   * Note: 'flow-list-search' is intentionally excluded. The feature auto-injects
   * its search toolbar on the Flows page without requiring a manual trigger, so a
   * sidebar menu entry adds no value there.
   *
   * @param {string[]} features - Array of feature identifiers
   * @returns {Object[]} Array of menu item objects
   */
  function _getMenuItemsForFeatures(features) {
    const featureMap = {
      'setup-tabs': {
        id: 'setup-tabs',
        group: 'setup',
        type: 'toggle',
        icon: '📑',
        label: 'Setup Tabs',
        checked: _areSetupTabsVisible()
      },
      'canvas-search': {
        id: 'canvas-search',
        group: 'canvas',
        type: 'action',
        icon: '🔎',
        label: 'Search & Highlight'
      },
      'missing-descriptions': {
        id: 'missing-descriptions',
        group: 'canvas',
        type: 'toggle',
        icon: '⚠️',
        label: 'Missing Description Flags',
        checked: _areMissingDescriptionFlagsActive(),
        refreshable: _areMissingDescriptionFlagsActive()
      },
      'ai-assistant': {
        id: 'ai-assistant',
        group: 'assist',
        type: 'action',
        icon: '🤖',
        label: 'Flow Metadata & AI Assistant'
      },
      'comparison-exporter': {
        id: 'comparison-exporter',
        group: 'move',
        type: 'action',
        icon: '📊',
        label: 'Comparison Exporter'
      },

      'flow-health-check': {
        id: 'flow-health-check',
        group: 'analyse',
        type: 'action',
        icon: '🩺',
        label: 'Run Health Check'
      },
      'unused-resources': {
        id: 'unused-resources',
        group: 'analyse',
        type: 'action',
        icon: '🧹',
        label: 'Find Unused Resources'
      },
      'flow-import-export': {
        id: 'flow-import-export',
        group: 'move',
        type: 'action',
        icon: '📦',
        label: 'Import / Export Flows'
      },
      'scheduled-flow-explorer': {
        id: 'scheduled-flow-explorer',
        group: 'analyse',
        type: 'action',
        icon: '⏰',
        label: 'Scheduled Flow Explorer'
      },

      'flow-error-explorer': (
        typeof ContextDetector !== 'undefined' &&
        typeof ContextDetector.isErrorDebugSession === 'function' &&
        ContextDetector.isErrorDebugSession()
      ) ? {
        id: 'flow-error-explorer',
        group: 'analyse',
        type: 'action',
        icon: '🚫',
        label: 'Flow Error Explorer'
      } : null,

      'flow-error-dictionary': {
        id: 'flow-error-dictionary',
        group: 'analyse',
        type: 'action',
        icon: '🚫',
        label: 'Flow Error Dictionary'
      }
    };

    const items = features
      .filter((f) => featureMap[f])
      .filter((f) => featureMap[f] !== null)
      .filter((f) => _isFeatureEnabled(f))
      .map((f) => featureMap[f])
      .filter(Boolean);

    return items;
  }

  /**
   * Handles clicks on menu items, delegating to the appropriate feature.
   * @param {{id: string, action?: string}} item
   */
  function _handleMenuItemClick(item) {
    _toggleMenu(false);

    const event = new CustomEvent('sfut-feature-activate', {
      detail: {
        feature: item.id,
        action: item.action || 'activate'
      }
    });
    document.dispatchEvent(event);
  }

  /**
   * Toggles the menu open/closed.
   * @param {boolean} [forceState] - Optional forced state
   */
  function _toggleMenu(forceState) {
    if (!menuElement) return;

    const opening = forceState !== undefined ? forceState : !isMenuOpen;
    if (opening && _currentMenuItems().length === 0) return;
    if (opening === isMenuOpen) return;
    isMenuOpen = opening;
    if (buttonElement) buttonElement.setAttribute('aria-expanded', String(isMenuOpen));

    if (isMenuOpen) {
      // Remember where focus was, to put it back when the menu closes.
      const active = document.activeElement;
      _returnFocusTo = active && active !== document.body ? active : null;

      // Rebuild menu content so dynamic labels reflect current state
      _filterInput().value = '';
      _populateMenu();
      menuElement.classList.remove('sfut-menu-hidden');
      menuElement.classList.add('sfut-menu-visible');
      if (!_filterWrap().hidden) _filterInput().focus();
      else _menuItems()[0]?.focus();
    } else {
      const focusWasInMenu = menuElement.contains(document.activeElement);
      menuElement.classList.remove('sfut-menu-visible');
      menuElement.classList.add('sfut-menu-hidden');
      if (focusWasInMenu) {
        if (_returnFocusTo && _returnFocusTo.isConnected) _returnFocusTo.focus();
        else document.activeElement.blur();
      }
      _returnFocusTo = null;
    }
  }

  /**
   * The menu's items in order (entries, ↻ controls, then Settings).
   * @returns {HTMLElement[]}
   */
  function _menuItems() {
    if (!menuElement) return [];
    return [...menuElement.querySelectorAll(MENU_ITEM_SELECTOR)]
      .filter(el => !el.closest('[hidden]'));
  }

  /**
   * Keyboard handling inside the open menu. Every key press stops here, so
   * Flow Builder's own handlers and the canvas Shift+letter shortcuts can't
   * act on it (for example Delete removing a selected element).
   *
   * @param {KeyboardEvent} e
   */
  function _handleMenuKeydown(e) {
    e.stopPropagation();

    // The toggle shortcut can't reach the document listener from here.
    if (_isToggleShortcut(e)) {
      if (_settings['keyboardShortcuts.enabled'] === false) return;
      e.preventDefault();
      _toggleMenu(false);
      return;
    }

    const items = _menuItems();
    const index = items.indexOf(document.activeElement);
    const focusAt = (i) => items[(i + items.length) % items.length]?.focus();
    const input = _filterInput();

    if (e.target === input) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusAt(0);
      } else if (e.key === 'Enter') {
        // Runs the first matching entry (not the Settings link).
        e.preventDefault();
        menuElement.querySelector('.sfut-menu-row:not([hidden]) .sfut-menu-item')?.click();
      } else if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        _toggleMenu(false);
      }
      return; // other keys type into the box
    }

    // Typing a letter on an entry goes to the filter box.
    const printable = e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (printable && !_filterWrap().hidden) {
      input.focus();
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusAt(index < 0 ? -1 : index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusAt(0);
        break;
      case 'End':
        e.preventDefault();
        focusAt(-1);
        break;
      case 'Enter':
      case ' ':
        if (index >= 0) {
          e.preventDefault();
          items[index].click();
        }
        break;
      case 'Escape':
      case 'Tab':
        e.preventDefault();
        _toggleMenu(false);
        break;
    }
  }

  /**
   * @param {KeyboardEvent} e
   * @returns {boolean} Whether this is Cmd/Ctrl+Shift+U
   */
  function _isToggleShortcut(e) {
    return (e.key || '').toUpperCase() === 'U' && e.shiftKey && (e.ctrlKey || e.metaKey) && !e.altKey;
  }

  /**
   * Attaches all event listeners for the side button and menu.
   */
  function _attachEventListeners() {
    if (!buttonElement || !menuElement) return;

    if (!buttonElement.dataset.sfutBound) {
      buttonElement.addEventListener('click', (e) => {
        e.stopPropagation();
        _toggleMenu();
      });

      buttonElement.dataset.sfutBound = 'true';
    }

    const closeButton = menuElement.querySelector('.sfut-menu-close');
    if (closeButton && !closeButton.dataset.sfutBound) {
      closeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        _toggleMenu(false);
      });

      closeButton.dataset.sfutBound = 'true';
    }

    if (!menuElement.dataset.sfutKeysBound) {
      menuElement.addEventListener('keydown', _handleMenuKeydown);
      _filterInput().addEventListener('input', _applyFilter);
      menuElement.dataset.sfutKeysBound = 'true';
    }

    const settingsLink = menuElement.querySelector('#sfut-settings-link');
    if (settingsLink && !settingsLink.dataset.sfutBound) {
      settingsLink.addEventListener('click', (e) => {
        e.preventDefault();

        chrome.runtime.sendMessage({ action: 'openSettings' }, () => {
          if (chrome.runtime.lastError) {
            console.warn('[SFUT] openSettings message failed:', chrome.runtime.lastError.message);
          }
        });

        _toggleMenu(false);
      });

      settingsLink.dataset.sfutBound = 'true';
    }

    if (!document.body.dataset.sfutSideButtonDocBound) {
      document.addEventListener('click', (e) => {
        if (
          isMenuOpen &&
          menuElement &&
          buttonElement &&
          !menuElement.contains(e.target) &&
          !buttonElement.contains(e.target)
        ) {
          _toggleMenu(false);
        }
      });

      document.body.dataset.sfutSideButtonDocBound = 'true';
    }

    // Global keyboard shortcut: Cmd/Ctrl+Shift+U — Toggle Utility Sidebar.
    // Attached here rather than in keyboard-shortcuts.js so it works on all
    // pages where the side button is present, not just the Flow Builder canvas.
    if (!document.body.dataset.sfutSideButtonKeyBound) {
      document.addEventListener('keydown', (e) => {
        if (_isToggleShortcut(e)) {
          // Read from the cache: preventDefault() only works before any await.
          if (_settings['keyboardShortcuts.enabled'] === false) return;
          e.preventDefault();
          _toggleMenu();
        }
      });

      document.body.dataset.sfutSideButtonKeyBound = 'true';
    }

    _observeUrlChanges();
  }

  /**
   * Observes URL changes in Salesforce's single-page app architecture
   * and refreshes the menu context accordingly.
   */
  function _observeUrlChanges() {
    if (urlObserverInitialised) return;
    urlObserverInitialised = true;

    let lastUrl = window.location.href;

    const observer = new MutationObserver(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        refresh();

        // refresh() also shows or hides the button for the new page.
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  return {
    init,
    refresh
  };

})();