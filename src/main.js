/**
 * SF Flow Utility Toolkit - Main Entry Point
 *
 * Updated:
 * - Supports menu actions (e.g., Refresh Missing Descriptions)
 * - When a menu item dispatches { feature, action }, we call:
 *    - await module.refresh() if action === 'refresh'
 *    - otherwise await module.onActivate()
 * - Refreshes the side menu after activate/toggle so dynamic labels update correctly
 * - Refreshes the side menu after feature init so page-load active state is reflected
 * - Minor resilience improvements for newly registered features and SPA context changes
 */

const SFFlowUtilityToolkit = (() => {

  const featureRegistry = {};
  let initialised = false;

  // Track what we've initialised for the current URL/context
  let _sideButtonInitialised = false;
  const _initialisedFeatures = new Set();

  // SPA watcher
  let _lastUrl = location.href;
  let _watchTimer = null;

  // Retry settings
  const INIT_RETRY_MS = 500;
  const INIT_MAX_ATTEMPTS = 40; // ~20 seconds

  function registerFeature(featureId, module) {
    featureRegistry[featureId] = module;
    console.log(`[SFUT] Feature '${featureId}' registered.`);

    // If the toolkit is already running, attempt to initialise the feature immediately
    // if it is relevant to the current page context.
    if (initialised) {
      const context = ContextDetector.detectContext();
      const availableFeatures = ContextDetector.getAvailableFeatures();

      if (context !== ContextDetector.CONTEXTS.NONE && availableFeatures.includes(featureId)) {
        _activateFeature(featureId);
      }
    }
  }

  async function init() {
    if (initialised) return;
    initialised = true;

    _startUrlWatcher();
    await _initForCurrentPageWithRetry();

    console.log('[SFUT] Initialisation complete (SPA watcher active).');
  }

  async function _initForCurrentPageWithRetry() {
    for (let attempt = 1; attempt <= INIT_MAX_ATTEMPTS; attempt++) {
      const context = ContextDetector.detectContext();
      console.log(`[SFUT] Context detected: ${context} (attempt ${attempt}/${INIT_MAX_ATTEMPTS})`);

      if (context !== ContextDetector.CONTEXTS.NONE) {
        await _initForContext(context);
        return;
      }

      await new Promise(r => setTimeout(r, INIT_RETRY_MS));
    }

    console.log('[SFUT] Not a supported page (after waiting), skipping initialisation.');
  }

  async function _initForContext(context) {
    if (!_sideButtonInitialised) {
      SideButton.init();
      _sideButtonInitialised = true;

      document.addEventListener('sfut-feature-activate', async (e) => {
        const { feature, action } = e.detail || {};
        await _handleFeatureActivation(feature, action);
      });
    }

    const availableFeatures = ContextDetector.getAvailableFeatures();
    console.log(`[SFUT] Available features for context '${context}': ${availableFeatures.join(', ')}`);

    for (const featureId of availableFeatures) {
      await _activateFeature(featureId);
    }

    if (typeof SideButton !== 'undefined' && typeof SideButton.refresh === 'function') {
      SideButton.refresh();
    }
  }

  async function _activateFeature(featureId) {
    const key = `${location.href}::${featureId}`;
    if (_initialisedFeatures.has(key)) return;

    const module = featureRegistry[featureId];
    if (!module) {
      console.log(`[SFUT] Feature '${featureId}' not yet registered, skipping.`);
      return;
    }

    if (typeof module.init === 'function') {
      try {
        await module.init();
        _initialisedFeatures.add(key);
        console.log(`[SFUT] Feature '${featureId}' initialised successfully.`);

        // Refresh the side menu so any feature state that changed during init
        // is reflected immediately (e.g. Missing Description Flags already active on load)
        if (typeof SideButton !== 'undefined' && typeof SideButton.refresh === 'function') {
          SideButton.refresh();
        }
      } catch (error) {
        console.error(`[SFUT] Error initialising feature '${featureId}':`, error);
      }
    } else {
      console.warn(`[SFUT] Feature '${featureId}' does not implement init().`);
    }
  }

  async function _handleFeatureActivation(featureId, action = 'activate') {
    if (!featureId) return;

    const module = featureRegistry[featureId];
    if (!module) {
      console.warn(`[SFUT] Feature '${featureId}' not found in registry.`);
      return;
    }

    if (action === 'refresh') {
      if (typeof module.refresh === 'function') {
        try {
          await module.refresh();

          if (typeof SideButton !== 'undefined' && typeof SideButton.refresh === 'function') {
            SideButton.refresh();
          }
        } catch (error) {
          console.error(`[SFUT] Error refreshing feature '${featureId}':`, error);
        }
      } else {
        console.warn(`[SFUT] Feature '${featureId}' does not implement refresh().`);
      }
      return;
    }

    if (typeof module.onActivate === 'function') {
      try {
        await module.onActivate();

        if (typeof SideButton !== 'undefined' && typeof SideButton.refresh === 'function') {
          SideButton.refresh();
        }
      } catch (error) {
        console.error(`[SFUT] Error activating feature '${featureId}':`, error);
      }
    } else {
      console.warn(`[SFUT] Feature '${featureId}' does not implement onActivate().`);
    }
  }

  function _startUrlWatcher() {
    if (_watchTimer) return;

    _watchTimer = setInterval(async () => {
      const currentUrl = location.href;
      if (currentUrl === _lastUrl) return;

      _lastUrl = currentUrl;
      console.log('[SFUT] URL changed (SPA):', currentUrl);

      _initialisedFeatures.clear();

      await _initForCurrentPageWithRetry();
    }, 500);
  }

  return {
    registerFeature,
    init
  };

})();

// Bootstrap
SFFlowUtilityToolkit.init();
