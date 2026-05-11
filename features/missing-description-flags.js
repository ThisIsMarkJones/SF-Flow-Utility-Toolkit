/**
 * SF Flow Utility Toolkit - Missing Description Flags
 *
 * Detects flow elements that lack descriptions and injects
 * visual warning indicators onto their canvas cards in Flow Builder.
 *
 * Updates:
 * - Robust DOM observer on document.body
 * - (Optional/legacy) Refresh metadata after Save
 * - Adds an explicit refresh() action for Option A (menu-driven refresh)
 *   so users can click "Refresh Missing Descriptions" to re-fetch metadata and re-flag.
 * - Exposes isActive() so the side panel can switch between
 *   "Show Missing Description Flags" and "Hide Missing Description Flags"
 */

const MissingDescriptionFlags = (() => {

  // Track state
  let _isActive = false;
  let _flowMetadata = null;
  let _elementsWithoutDescription = [];
  let _observer = null;
  let _flaggedElements = new Set();

  // Activation coordination
  let _activationPromise = null;
  const _READY_POLL_MS = 500;
  const _READY_MAX_ATTEMPTS = 40; // ~20 seconds

  // Save-refresh coordination (kept; optional)
  let _saveHooksInstalled = false;
  let _refreshTimer = null;
  let _refreshInFlight = null;
  let _lastRefreshAt = 0;
  const _MIN_REFRESH_GAP_MS = 1500; // prevent rapid double refreshes
  const _REFRESH_DELAY_MS = 1200;   // slight delay after save completion to allow server commit

  async function init() {
    const enabled = await SettingsManager.get('missingDescriptions.enabled');
    if (!enabled) {
      console.log('[SFUT MissingDesc] Feature is disabled in settings.');
      return;
    }

    await _activateWhenReady(false);
  }

  async function onActivate() {
    if (_isActive) {
      _deactivate();
      await SettingsManager.set('missingDescriptions.enabled', false);
      _showToast('Missing Description Flags disabled.');
      return;
    }

    await SettingsManager.set('missingDescriptions.enabled', true);
    await _activateWhenReady(true);
    _showToast('Missing Description Flags enabled.');
  }

  /**
   * Returns whether Missing Description Flags are currently active.
   * Used by the side button to determine whether to show
   * "Show Missing Description Flags" or "Hide Missing Description Flags".
   *
   * @returns {boolean}
   */
  function isActive() {
    return _isActive;
  }

  /**
   * Manual refresh action.
   * Re-fetches metadata and rebuilds flags.
   * If the feature is not active yet, it will activate first (if enabled).
   */
  async function refresh() {
    const enabled = await SettingsManager.get('missingDescriptions.enabled');
    if (!enabled) {
      _showToast('Missing Description Flags are disabled.', 'warning');
      return;
    }

    // If not active yet, activate (which fetches metadata) then we’re done.
    if (!_isActive) {
      await _activateWhenReady(true);
      // If activation succeeded, flags are already drawn.
      if (_isActive) _showToast('Missing Description Flags refreshed.');
      return;
    }

    // Active: refresh metadata + rebuild flags
    await _refreshMetadataAndReflag(true);
    _showToast('Missing Description Flags refreshed.');
  }

  async function _activateWhenReady(userInitiated = false) {
    if (_activationPromise) return _activationPromise;

    _activationPromise = (async () => {
      if (_isActive) return;

      for (let attempt = 1; attempt <= _READY_MAX_ATTEMPTS; attempt++) {
        const enabled = await SettingsManager.get('missingDescriptions.enabled');
        if (!enabled) {
          if (userInitiated) console.log('[SFUT MissingDesc] Disabled while waiting to activate.');
          return;
        }

        const flowId = SalesforceAPI.getFlowIdFromUrl();
        if (flowId) {
          await _activate(flowId);
          return;
        }

        if (userInitiated || attempt === 1 || attempt % 10 === 0) {
          console.log(`[SFUT MissingDesc] Waiting for flowId... (attempt ${attempt}/${_READY_MAX_ATTEMPTS})`);
        }

        await new Promise(r => setTimeout(r, _READY_POLL_MS));
      }

      console.warn('[SFUT MissingDesc] flowId not available after waiting; skipping activation.');
    })().finally(() => {
      _activationPromise = null;
    });

    return _activationPromise;
  }

  async function _activate(flowId) {
    console.log('[SFUT MissingDesc] Activating...');

    if (_isActive) return;
    if (!flowId) {
      console.warn('[SFUT MissingDesc] No flowId found in URL.');
      return;
    }

    try {
      _flowMetadata = await SalesforceAPI.getFlowMetadata(flowId);
      console.log('[SFUT MissingDesc] Flow metadata retrieved:', _flowMetadata?.MasterLabel);

      _elementsWithoutDescription = _findElementsWithoutDescriptions(_flowMetadata.Metadata);
      console.log(
        `[SFUT MissingDesc] Found ${_elementsWithoutDescription.length} elements without descriptions:`,
        _elementsWithoutDescription.map(e => e.label)
      );

      _isActive = true;

      // Start robust observer and initial scan
      _startObserving();
      _flagCanvasElements();

      // Retry flagging after short delays to catch late-rendering canvas elements
      // (Orchestrator stages, steps, and the flow-name header often render after
      // the initial DOM is ready)
      const retryDelays = [500, 1500, 3000];
      for (const delay of retryDelays) {
        setTimeout(() => {
          if (_isActive) _flagCanvasElements();
        }, delay);
      }

      // Save hooks are optional; keep them if you want, but Option A doesn't depend on them.
      _installSaveRefreshHooks();

      console.log('[SFUT MissingDesc] Active (observer running).');

    } catch (error) {
      console.error('[SFUT MissingDesc] Failed to activate:', error);
      _showToast('Failed to load flow metadata. Check console for details.', 'error');
      _isActive = false;
    }
  }

  function _deactivate() {
    console.log('[SFUT MissingDesc] Deactivating...');

    if (_observer) {
      _observer.disconnect();
      _observer = null;
    }

    _clearAllFlags();

    _flaggedElements.clear();
    _elementsWithoutDescription = [];
    _flowMetadata = null;
    _isActive = false;

    console.log('[SFUT MissingDesc] Deactivated.');
  }

  function _findElementsWithoutDescriptions(metadata) {
    if (!metadata) return [];

    // Debug: log which metadata keys contain data
    const keysWithData = Object.keys(metadata).filter(
      k => Array.isArray(metadata[k]) && metadata[k].length > 0
    );
    console.log('[SFUT MissingDesc] Metadata keys with data:', keysWithData);

    const missing = [];

    const elementTypes = [
      { key: 'actionCalls', type: 'Action' },
      { key: 'apexPluginCalls', type: 'Apex Action' },
      { key: 'assignments', type: 'Assignment' },
      { key: 'collectionProcessors', type: 'Collection Processor' },
      { key: 'customErrors', type: 'Custom Error' },
      { key: 'decisions', type: 'Decision' },
      { key: 'loops', type: 'Loop' },
      { key: 'recordCreates', type: 'Create Records' },
      { key: 'recordDeletes', type: 'Delete Records' },
      { key: 'recordLookups', type: 'Get Records' },
      { key: 'recordRollbacks', type: 'Roll Back Records' },
      { key: 'recordUpdates', type: 'Update Records' },
      { key: 'screens', type: 'Screen' },
      { key: 'subflows', type: 'Subflow' },
      { key: 'transforms', type: 'Transform' },
      { key: 'waits', type: 'Wait' },
      // Orchestrator element types (stages can appear under either key)
      { key: 'orchestratedStages', type: 'Stage' },
      { key: 'stages', type: 'Stage' }
    ];

    // Resource types (appear in Toolbox, not on canvas)
    const resourceTypes = [
      { key: 'variables', type: 'Variable' },
      { key: 'formulas', type: 'Formula' },
      { key: 'constants', type: 'Constant' },
      { key: 'textTemplates', type: 'Text Template' },
      { key: 'choices', type: 'Choice' },
      { key: 'dynamicChoiceSets', type: 'Dynamic Choice Set' }
    ];

    for (const { key, type } of elementTypes) {
      const elements = metadata[key];
      if (!elements || !Array.isArray(elements)) continue;

      for (const element of elements) {
        if (!element.description || element.description.trim() === '') {
          missing.push({
            name: element.name,
            label: element.label || element.name,
            type,
            isResource: false
          });
        }

        // Orchestrator: scan nested stageSteps within stages
        if ((key === 'orchestratedStages' || key === 'stages') && Array.isArray(element.stageSteps)) {
          for (const step of element.stageSteps) {
            if (!step.description || step.description.trim() === '') {
              missing.push({
                name: step.name,
                label: step.label || step.name,
                type: 'Step',
                isResource: false
              });
            }
          }
        }
      }
    }

    // Resources: match by API name (resources don't always have labels)
    for (const { key, type } of resourceTypes) {
      const resources = metadata[key];
      if (!resources || !Array.isArray(resources)) continue;

      for (const resource of resources) {
        if (!resource.description || resource.description.trim() === '') {
          missing.push({
            name: resource.name,
            label: resource.name,
            type,
            isResource: true
          });
        }
      }
    }

    // Flow-level description
    if (!metadata.description || metadata.description.trim() === '') {
      missing.push({
        name: '__FLOW__',
        label: '__FLOW_LEVEL__',
        type: 'Flow'
      });
    }

    return missing;
  }

  function _flagCanvasElements() {
    if (!_isActive) return;

    // --- Build lookup map from ALL missing items ---
    const missingAll = new Map();
    for (const el of _elementsWithoutDescription) {
      if (el.name === '__FLOW__') continue;

      missingAll.set((el.label || '').toLowerCase(), el);
      if (el.name && el.name.toLowerCase() !== (el.label || '').toLowerCase()) {
        missingAll.set(el.name.toLowerCase(), el);
      }
    }

    let flagCount = 0;

    // --- 1) Standard canvas element cards (flows + orchestrator stages) ---
    const labelSpans = document.querySelectorAll(
      'span.text-element-label:not(.text-element-label-mask)'
    );

    for (const span of labelSpans) {
      const labelText = (span.title || span.textContent || '').trim();
      if (!labelText) continue;

      const matchKey = labelText.toLowerCase();
      // Also try stripping leading number prefix (e.g. "1. ", "2. ") that
      // Orchestrator adds to stage labels on the canvas but not in metadata
      const strippedKey = matchKey.replace(/^\d+\.\s*/, '');

      const matched = missingAll.has(matchKey) || missingAll.has(strippedKey);
      if (!matched) continue;

      const card = span.closest('.element-card');
      if (!card) continue;

      // Use data-key if available, then aria-label for uniqueness, then label text
      const cardId = card.closest('[data-key]')?.getAttribute('data-key')
        || card.querySelector('.base-card')?.getAttribute('aria-label')
        || labelText;
      if (_flaggedElements.has(cardId)) continue;

      _injectFlag(card, labelText);
      _flaggedElements.add(cardId);
      flagCount++;
    }

    // --- 2) Orchestrator step items (inside stepped-stage-element-card) ---
    const stepItems = document.querySelectorAll(
      '.stepped-stage-element-card [data-item-guid]'
    );

    for (const stepRow of stepItems) {
      const stepLabel = (stepRow.getAttribute('data-label') || '').trim();
      const stepName = (stepRow.getAttribute('data-name') || '').trim();
      if (!stepLabel && !stepName) continue;

      const matchByLabel = stepLabel ? missingAll.has(stepLabel.toLowerCase()) : false;
      const matchByName = stepName ? missingAll.has(stepName.toLowerCase()) : false;
      if (!matchByLabel && !matchByName) continue;

      const stepGuid = stepRow.getAttribute('data-item-guid') || stepLabel;
      const flagId = `step::${stepGuid}`;
      if (_flaggedElements.has(flagId)) continue;

      // Inject flag next to the step label
      const labelEl = stepRow.querySelector('span.itemLabel');
      if (labelEl && !labelEl.querySelector('.sfut-desc-flag-toolbox')) {
        const flag = document.createElement('span');
        flag.className = 'sfut-desc-flag-toolbox';
        flag.title = `"${stepLabel || stepName}" has no description`;
        flag.setAttribute('aria-label', `Warning: ${stepLabel || stepName} has no description`);
        flag.textContent = ' ⚠';
        labelEl.appendChild(flag);
      }

      _flaggedElements.add(flagId);
      flagCount++;
    }

    // --- 3) Flow-level description flag ---
    const flowMissing = _elementsWithoutDescription.find(e => e.name === '__FLOW__');
    if (flowMissing && !_flaggedElements.has('__FLOW__')) {
      _injectFlowLevelFlag();
      // Only mark as flagged if injection actually succeeded
      if (document.querySelector('.sfut-desc-flag-flow')) {
        _flaggedElements.add('__FLOW__');
      }
    }

    if (flagCount > 0) {
      console.log(`[SFUT MissingDesc] Flagged ${flagCount} canvas elements.`);
    }

    // --- Toolbox resources ---
    _flagToolboxItems();
  }

  /**
   * Flags resources in the Toolbox (left panel) that have no description.
   * Matches by API name against palette-item text content.
   */
  function _flagToolboxItems() {
    if (!_isActive) return;

    // Build a map of ALL items missing descriptions (resources AND elements)
    // Elements appear in the Toolbox by label, resources by API name
    const missingByName = new Map();
    for (const el of _elementsWithoutDescription) {
      if (el.name === '__FLOW__') continue;
      // Index by API name (resources) and label (elements) for matching
      missingByName.set(el.name.toLowerCase(), el);
      if (el.label && el.label.toLowerCase() !== el.name.toLowerCase()) {
        missingByName.set(el.label.toLowerCase(), el);
      }
    }

    if (missingByName.size === 0) return;

    // Find all palette items in the Toolbox
    const paletteItems = document.querySelectorAll(
      'builder_platform_interaction-left-panel-resources tr.palette-item'
    );

    let toolboxFlagCount = 0;

    for (const row of paletteItems) {
      const nameEl = row.querySelector(
        'builder_platform_interaction-palette-item .slds-truncate'
      );
      if (!nameEl) continue;

      const resourceName = (nameEl.textContent || '').trim();
      if (!resourceName) continue;

      const matchKey = resourceName.toLowerCase();
      if (!missingByName.has(matchKey)) continue;

      const flagId = `toolbox::${row.getAttribute('data-guid') || resourceName}`;
      if (_flaggedElements.has(flagId)) continue;

      // Inject a small ⚠ flag next to the resource name
      if (!nameEl.querySelector('.sfut-desc-flag-toolbox')) {
        const flag = document.createElement('span');
        flag.className = 'sfut-desc-flag-toolbox';
        flag.title = `"${resourceName}" has no description`;
        flag.setAttribute('aria-label', `Warning: ${resourceName} has no description`);
        flag.textContent = ' ⚠';
        nameEl.appendChild(flag);
      }

      _flaggedElements.add(flagId);
      toolboxFlagCount++;
    }

    if (toolboxFlagCount > 0) {
      console.log(`[SFUT MissingDesc] Flagged ${toolboxFlagCount} toolbox resources.`);
    }
  }

  function _injectFlag(card, labelText) {
    const baseCard = card.querySelector('.base-card');
    if (!baseCard) return;

    // Check if already flagged (on either the base-card or the card itself)
    if (card.querySelector('.sfut-desc-flag')) return;

    const flag = document.createElement('div');
    flag.className = 'sfut-desc-flag';
    flag.title = `"${labelText}" has no description`;
    flag.setAttribute('aria-label', `Warning: ${labelText} has no description`);
    flag.innerHTML = '⚠';

    // Inject on the element-card wrapper (not inside base-card) so LWC
    // re-renders of the card interior don't destroy the flag
    card.style.position = 'relative';
    card.appendChild(flag);
  }

  function _injectFlowLevelFlag() {
    const flowNameEl = document.querySelector('.test-flow-name');
    if (!flowNameEl) return;

    if (flowNameEl.parentElement.querySelector('.sfut-desc-flag-flow')) return;

    const flag = document.createElement('span');
    flag.className = 'sfut-desc-flag-flow';
    flag.title = 'This flow has no description';
    flag.setAttribute('aria-label', 'Warning: This flow has no description');
    flag.innerHTML = ' ⚠';

    flowNameEl.parentElement.appendChild(flag);
    console.log('[SFUT MissingDesc] Flow-level description flag added.');
  }

  function _startObserving() {
    if (_observer) return;

    if (!document.body) {
      setTimeout(() => {
        if (_isActive) _startObserving();
      }, 500);
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

      requestAnimationFrame(() => _flagCanvasElements());
    });

    _observer.observe(document.body, { childList: true, subtree: true });
    console.log('[SFUT MissingDesc] Observer started on document.body.');
  }

  // -------------------------
  // Refresh after Save (legacy/optional)
  // -------------------------

  function _installSaveRefreshHooks() {
    if (_saveHooksInstalled) return;
    _saveHooksInstalled = true;

    const SAVE_BTN_SELECTOR = 'lightning-button.test-toolbar-save button[title="Save"]';

    const attachToSaveButton = () => {
      const btn = document.querySelector(SAVE_BTN_SELECTOR);
      if (!btn) return null;

      let wasDisabled = btn.disabled || btn.getAttribute('aria-disabled') === 'true';

      const mo = new MutationObserver(() => {
        if (!_isActive) return;

        const isDisabled = btn.disabled || btn.getAttribute('aria-disabled') === 'true';

        if (wasDisabled && !isDisabled) {
          console.log('[SFUT MissingDesc] Save completion detected. Scheduling metadata refresh...');
          _scheduleRefreshAfterSave();
        }

        wasDisabled = isDisabled;
      });

      mo.observe(btn, {
        attributes: true,
        attributeFilter: ['disabled', 'aria-disabled', 'class']
      });

      return mo;
    };

    let saveBtnObserver = attachToSaveButton();

    const bootstrapObserver = new MutationObserver(() => {
      if (saveBtnObserver) return;
      saveBtnObserver = attachToSaveButton();
      if (saveBtnObserver) bootstrapObserver.disconnect();
    });

    if (document.body) {
      bootstrapObserver.observe(document.body, { childList: true, subtree: true });
    }

    document.addEventListener('keydown', (e) => {
      if (!_isActive) return;
      const isSaveShortcut = (e.ctrlKey || e.metaKey) && (e.key || '').toLowerCase() === 's';
      if (isSaveShortcut) {
        _scheduleRefreshAfterSave();
      }
    }, true);
  }

  function _scheduleRefreshAfterSave() {
    const now = Date.now();
    if (now - _lastRefreshAt < _MIN_REFRESH_GAP_MS) return;

    if (_refreshTimer) clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(() => {
      _refreshTimer = null;
      _refreshMetadataAndReflag(false).catch(err => {
        console.warn('[SFUT MissingDesc] Refresh after save failed:', err);
      });
    }, _REFRESH_DELAY_MS);
  }

  async function _refreshMetadataAndReflag(skipToasts) {
    if (!_isActive) return;
    if (_refreshInFlight) return _refreshInFlight;

    _refreshInFlight = (async () => {
      const flowId = SalesforceAPI.getFlowIdFromUrl();
      if (!flowId) return;

      _lastRefreshAt = Date.now();
      console.log('[SFUT MissingDesc] Refreshing metadata...');

      const newMeta = await SalesforceAPI.getFlowMetadata(flowId);

      _flowMetadata = newMeta;
      _elementsWithoutDescription = _findElementsWithoutDescriptions(_flowMetadata.Metadata);

      _clearAllFlags();
      _flaggedElements.clear();
      _flagCanvasElements();

      console.log(`[SFUT MissingDesc] Refresh complete. Missing descriptions: ${_elementsWithoutDescription.length}`);

      if (!skipToasts) {
        // no-op: Option A handles toasts; leaving hook for future
      }
    })().finally(() => {
      _refreshInFlight = null;
    });

    return _refreshInFlight;
  }

  function _clearAllFlags() {
    document.querySelectorAll('.sfut-desc-flag').forEach(el => el.remove());
    document.querySelectorAll('.sfut-desc-flag-flow').forEach(el => el.remove());
    document.querySelectorAll('.sfut-desc-flag-toolbox').forEach(el => el.remove());
  }

  function _showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `sfut-toast ${
      type === 'error' ? 'sfut-toast-error' :
      type === 'warning' ? 'sfut-toast-warning' : ''
    }`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('sfut-toast-visible'));

    setTimeout(() => {
      toast.classList.remove('sfut-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // --- Public API ---
  return { init, onActivate, refresh, isActive };

})();

// Register with the toolkit
SFFlowUtilityToolkit.registerFeature('missing-descriptions', MissingDescriptionFlags);