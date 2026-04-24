/**
 * SF Flow Utility Toolkit - Side Button
 *
 * Renders the persistent side button and contextual menu
 * on supported Salesforce pages.
 *
 * Update:
 * - Avoids "Uncaught (in promise) ... message channel closed" by always providing
 *   a callback to chrome.runtime.sendMessage for openSettings.
 * - Restores the previous Missing Descriptions behaviour:
 *   - "Show Missing Description Flags" when flags are not active
 *   - "Hide Missing Description Flags" when flags are active
 *   - "Refresh Missing Descriptions" action when available
 * - Removes API Name Generator from the side button menu.
 * - Prevents the side button from rendering inside iframes / VF frames.
 * - Adds a "Run Health Check" menu item for Flow Builder.
 */

const SideButton = (() => {

  let buttonElement = null;
  let menuElement = null;
  let isMenuOpen = false;
  let urlObserverInitialised = false;

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

    buttonElement = document.createElement('div');
    buttonElement.id = 'sfut-side-button';
    buttonElement.className = 'sfut-side-button';
    buttonElement.title = 'SF Flow Utility Toolkit';
    buttonElement.innerHTML = `
      <span class="sfut-side-button-icon">⚡</span>
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
      <span class="sfut-menu-title">SF Flow Utility Toolkit</span>
      <span class="sfut-menu-close">&times;</span>
    `;
    menuElement.appendChild(header);

    // Menu content container
    const content = document.createElement('div');
    content.id = 'sfut-menu-content';
    content.className = 'sfut-menu-content';
    menuElement.appendChild(content);

    // Settings link (always present)
    const footer = document.createElement('div');
    footer.className = 'sfut-menu-footer';
    footer.innerHTML = `
      <a href="#" id="sfut-settings-link" class="sfut-menu-settings-link">
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

    content.innerHTML = '';

    const features = ContextDetector.getAvailableFeatures();
    const menuItems = _getMenuItemsForFeatures(features);

    if (menuItems.length === 0) {
      content.innerHTML = '<div class="sfut-menu-empty">No tools available for this page.</div>';
      return;
    }

    menuItems.forEach((item) => {
      const menuItem = document.createElement('div');
      menuItem.className = 'sfut-menu-item';
      menuItem.dataset.feature = item.id;
      menuItem.dataset.action = item.action || 'activate';
      menuItem.innerHTML = `
        <span class="sfut-menu-item-icon">${item.icon}</span>
        <span class="sfut-menu-item-label">${item.label}</span>
      `;
      menuItem.addEventListener('click', () => {
        _handleMenuItemClick(item);
      });
      content.appendChild(menuItem);
    });
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
   * Restores the older Missing Descriptions actions.
   *
   * @param {string[]} features - Array of feature identifiers
   * @returns {Object[]} Array of menu item objects
   */
  function _getMenuItemsForFeatures(features) {
    const featureMap = {
      'setup-tabs': {
        id: 'setup-tabs',
        icon: '📑',
        label: 'Setup Tabs'
      },
      'flow-list-search': {
        id: 'flow-list-search',
        icon: '🔍',
        label: 'Flow List Search'
      },
      'canvas-search': {
        id: 'canvas-search',
        icon: '🔎',
        label: 'Search & Highlight'
      },
      'missing-descriptions': {
        id: 'missing-descriptions',
        icon: '⚠️',
        label: _areMissingDescriptionFlagsActive()
          ? 'Hide Missing Description Flags'
          : 'Show Missing Description Flags'
      },
      'ai-assistant': {
        id: 'ai-assistant',
        icon: '🤖',
        label: 'Flow Metadata & AI Assistant'
      },
      'comparison-exporter': {
        id: 'comparison-exporter',
        icon: '📊',
        label: 'Comparison Exporter'
      },
      'flow-version-manager': {
        id: 'flow-version-manager',
        icon: '🧾',
        label: 'Flow Version Manager'
      },
      'flow-trigger-explorer-enhancer': {
        id: 'flow-trigger-explorer-enhancer',
        icon: '🧭',
        label: 'Flow Trigger Explorer Enhancer'
      },
      'flow-health-check': {
        id: 'flow-health-check',
        icon: '🩺',
        label: 'Run Health Check'
      }
    };

    const items = features
      .filter((f) => featureMap[f])
      .map((f) => featureMap[f]);

    if (features.includes('missing-descriptions')) {
      items.push({
        id: 'missing-descriptions',
        action: 'refresh',
        icon: '🔄',
        label: 'Refresh Missing Descriptions'
      });
    }

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

    isMenuOpen = forceState !== undefined ? forceState : !isMenuOpen;

    if (isMenuOpen) {
      // Rebuild menu content so dynamic labels reflect current state
      _populateMenu();
      menuElement.classList.remove('sfut-menu-hidden');
      menuElement.classList.add('sfut-menu-visible');
    } else {
      menuElement.classList.remove('sfut-menu-visible');
      menuElement.classList.add('sfut-menu-hidden');
    }
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

        if (buttonElement) {
          if (ContextDetector.shouldShowSideButton()) {
            buttonElement.style.display = 'flex';
          } else {
            buttonElement.style.display = 'none';
            _toggleMenu(false);
          }
        }
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