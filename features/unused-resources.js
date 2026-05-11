/**
 * SF Flow Utility Toolkit - Find Unused Resources
 *
 * Scans the active Flow for user-authored Manager-tab resources that are not
 * referenced anywhere else in the flow, and presents a modal report grouped
 * by resource type. Each row is clickable; clicking attempts to open the
 * resource in Flow Builder's Manager tab (best-effort).
 *
 * Context: Flow Builder (/builder_platform_interaction/flowBuilder.app)
 *
 * Settings used:
 *   unusedResources.enabled   – master toggle (default true)
 *
 * Click-to-navigate is intentionally best-effort. Salesforce's Flow Builder
 * left panel is a Lightning Web Component tree, and the underlying DOM is not
 * a published API. The selector strategies below are layered from most
 * specific to most permissive, and any failure falls through to a toast that
 * directs the user to open the Manager tab manually.
 */

const UnusedResources = (() => {
  let _enabled = true; // set by init() based on settings

  // ===== Initialisation =====

  async function init() {
    const context = ContextDetector.detectContext();
    if (context !== ContextDetector.CONTEXTS.FLOW_BUILDER) return;

    const featureEnabled = await SettingsManager.get('unusedResources.enabled');
    if (!featureEnabled) { _enabled = false; return; }
    _enabled = true;
  }

  // ===== Activation =====

  async function onActivate() {
    if (!_enabled) return;

    try {
      const flowId = SalesforceAPI.getFlowIdFromUrl();
      if (!flowId) {
        UnusedResourcesModal.showError(
          'Could not determine the current Flow ID from the URL.'
        );
        return;
      }

      UnusedResourcesModal.showLoading('Current Flow');

      const result = await SalesforceAPI.getFlowMetadata(flowId);
      const metadata = result?.Metadata;

      if (!metadata) {
        UnusedResourcesModal.showError('Could not retrieve Flow metadata.');
        return;
      }

      const analysis = UnusedResourcesAnalyser.analyse(metadata);
      const flowLabel = metadata.label || result?.MasterLabel || 'Current Flow';

      UnusedResourcesModal.showReport(
        {
          flowLabel,
          totalResources: analysis.totalResources,
          totalUnused: analysis.totalUnused,
          groups: analysis.groups
        },
        {
          onResourceClick: _navigateToResource
        }
      );
    } catch (error) {
      console.error('[SFUT] Find Unused Resources failed:', error);
      UnusedResourcesModal.showError(
        error?.message || 'Unexpected error scanning for unused resources.'
      );
    }
  }

  // ===== Click-to-navigate (best-effort) =====

  /**
   * Attempts to open the given resource in Flow Builder's Manager tab.
   * Closes the modal on success, shows a toast on failure.
   *
   * @param {{ name: string, metadataKey: string }} resource
   */
  async function _navigateToResource(resource) {
    if (!resource || !resource.name) return;

    try {
      // Step 1: Activate the Manager tab.
      const managerActivated = await _activateManagerTab();
      if (!managerActivated) {
        _showNavigationFallback(resource.name,
          'Could not find the Manager tab.');
        return;
      }

      // Step 2: Wait briefly for the Manager view to render its resource list.
      await _wait(200);

      // Step 3: Locate and click the resource row.
      const row = await _findResourceRow(resource.name);
      if (!row) {
        _showNavigationFallback(resource.name,
          'Could not locate the resource in the Manager.');
        return;
      }

      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.click();

      // Close the modal so the user can see the Manager.
      UnusedResourcesModal.close();
    } catch (error) {
      console.warn('[SFUT] Resource navigation failed:', error);
      _showNavigationFallback(resource.name,
        'Navigation failed. Open the Manager tab and find the resource manually.');
    }
  }

  /**
   * Attempts to activate the Manager tab in the Flow Builder left panel.
   * Returns true on success (or if it was already active), false otherwise.
   */
  async function _activateManagerTab() {
    // Strategy 1: Look for an explicit Manager tab control. Flow Builder uses
    // a tab pattern that varies between releases; try several known attribute
    // selectors before falling back to a text-content match.
    const candidates = [
      'a[title="Manager"]',
      'button[title="Manager"]',
      '[data-tab-id="manager"]',
      '[data-tab-name="manager"]',
      '.manager-tab',
      'lightning-tab[label="Manager"]'
    ];

    for (const selector of candidates) {
      const el = document.querySelector(selector);
      if (el) {
        // If the tab is already active, do nothing — clicking an active tab
        // can collapse the panel in some Flow Builder versions.
        if (!_isElementActive(el)) {
          el.click();
        }
        return true;
      }
    }

    // Strategy 2: Text-content match within the Flow Builder left panel.
    const leftPanel = document.querySelector('.left-panel, builder_platform_interaction-left-panel');
    if (leftPanel) {
      const tabs = Array.from(leftPanel.querySelectorAll('a, button, li[role="tab"], [role="tab"]'));
      const managerTab = tabs.find((el) => {
        const text = (el.textContent || '').trim().toLowerCase();
        return text === 'manager' || text.startsWith('manager ');
      });
      if (managerTab) {
        if (!_isElementActive(managerTab)) {
          managerTab.click();
        }
        return true;
      }
    }

    return false;
  }

  /**
   * Searches the rendered Manager tab for the resource row matching the given
   * API name. Tries up to ~1.5s before giving up.
   *
   * The HTML samples gathered during design show resource rows render with the
   * API name available as a `title` attribute on the inner span, so the
   * primary strategy is `[title="<apiName>"]`. Fallbacks cover variations.
   */
  async function _findResourceRow(apiName) {
    const escapedName = _cssEscape(apiName);

    const startTime = Date.now();
    while (Date.now() - startTime < 1500) {
      // Strategy 1: Direct title attribute match (matches the rendered
      // resource detail panel — `<span ... title="varStuff">varStuff</span>`).
      const directMatch = document.querySelector(`[title="${escapedName}"]`);
      if (directMatch) {
        return _findClickableAncestor(directMatch);
      }

      // Strategy 2: Look for any element whose visible text exactly equals
      // the API name within the manager region.
      const managerRegion = document.querySelector(
        '.left-panel, builder_platform_interaction-left-panel, builder_platform_interaction-resource-manager'
      );
      if (managerRegion) {
        const textMatch = Array.from(managerRegion.querySelectorAll('span, a, li, div'))
          .find((el) => (el.textContent || '').trim() === apiName);
        if (textMatch) {
          return _findClickableAncestor(textMatch);
        }
      }

      // Wait a tick and retry — the resource list can take a moment to render
      // after the Manager tab is activated.
      await _wait(100);
    }

    return null;
  }

  /**
   * Walks up the DOM from the matched element to find an ancestor that's
   * realistically clickable (a list item, link, button, or LWC item host).
   * Falls back to the matched element itself if nothing better is found.
   */
  function _findClickableAncestor(el) {
    let cursor = el;
    let hops = 0;

    while (cursor && hops < 6) {
      const tag = cursor.tagName?.toLowerCase();
      if (tag === 'a' || tag === 'button' || tag === 'li') return cursor;
      if (cursor.getAttribute && cursor.getAttribute('role') === 'button') return cursor;
      if (cursor.classList && (
        cursor.classList.contains('palette-item') ||
        cursor.classList.contains('test-list-section-item') ||
        cursor.classList.contains('slds-list__item')
      )) return cursor;

      cursor = cursor.parentElement;
      hops++;
    }

    return el;
  }

  /**
   * Heuristic check for whether a tab element is the currently active tab.
   * Looks for common active/selected indicators across LWC/Aura/SLDS.
   */
  function _isElementActive(el) {
    if (!el) return false;
    if (el.getAttribute && el.getAttribute('aria-selected') === 'true') return true;
    if (el.classList && (
      el.classList.contains('slds-is-active') ||
      el.classList.contains('is-active') ||
      el.classList.contains('active')
    )) return true;
    return false;
  }

  /**
   * Shows a toast directing the user to open the Manager manually.
   * Uses the existing `sfut-toast` class if available, otherwise a fresh element.
   */
  function _showNavigationFallback(resourceName, reason) {
    const message = `Couldn't open ${resourceName}. ${reason}`;
    console.info('[SFUT] Unused Resources navigation fallback:', message);

    // Use an existing toast helper if the toolkit exposes one in the future,
    // otherwise create a transient element here.
    let toast = document.getElementById('sfut-unused-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'sfut-unused-toast';
      toast.className = 'sfut-toast sfut-toast-warning';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('sfut-toast-visible');

    setTimeout(() => {
      toast.classList.remove('sfut-toast-visible');
    }, 3500);
  }

  function _wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Escapes a string for safe use inside an attribute selector.
   * Falls back to a manual escape if the platform CSS.escape API is unavailable.
   */
  function _cssEscape(value) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }
    return String(value).replace(/(["\\])/g, '\\$1');
  }

  function isEnabled() { return _enabled; }

  // --- Public API ---
  return {
    init,
    isEnabled,
    onActivate
  };

})();

SFFlowUtilityToolkit.registerFeature('unused-resources', UnusedResources);