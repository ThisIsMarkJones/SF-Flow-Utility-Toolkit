/**
 * SF Flow Utility Toolkit - API Name Generator
 *
 * Generates standardised API names for Flow elements and resources
 * based on configurable prefixes and naming conventions.
 *
 * Two modes of operation:
 *   1. INLINE: When an element's configuration panel opens in Flow Builder,
 *      a generate button (🏷️) is injected next to the API Name field.
 *      Clicking it reads the Label, determines the element type from the
 *      panel header, and writes the generated API name into the field.
 *
 *   2. MODAL (fallback): Accessible from the side-button menu. Opens a
 *      panel where the user selects an element type, enters a label,
 *      and copies the generated name.
 *
 * Context: Flow Builder (/builder_platform_interaction/flowBuilder.app)
 *
 * DOM selectors (from Flow Builder page source):
 *   Panel header:    h2.header-title (contains element type text)
 *   Panel icon:      lightning-icon[icon-name] (in the panel header)
 *   Label input:     lightning-input.label input
 *   API Name input:  lightning-input.devName input
 *   Label-Desc container: builder_platform_interaction-label-description
 *
 * Dependencies:
 *   - APINamePrefixes (config/api-name-prefixes.js)
 *   - SettingsManager (utils/settings-manager.js)
 */

const APINameGenerator = (() => {

  // State
  let _observer = null;
  let _scanInterval = null;
  let _namingPattern = 'Snake_Case';

  // Flow metadata cache used to resolve the flow kind (Screen Flow vs
  // Record-Triggered Flow vs Schedule-Triggered Flow etc.) for the Flow
  // Properties editor. Populated lazily on first use; invalidated when the
  // flow ID changes (e.g. when the user navigates to a different flow).
  let _flowKindCache = {
    flowId: null,          // The flow DefinitionId we cached for
    kind: null,            // The resolved type key or null if unresolved
    inFlight: null         // A Promise of the ongoing fetch, to dedupe concurrent calls
  };

  // Inline injection marker
  const INJECTED_MARKER = 'data-sfut-apigen-injected';
  const GENERATE_BTN_CLASS = 'sfut-apigen-inline-btn';

  // ===== Initialisation =====

  async function init() {
    const context = ContextDetector.detectContext();
    if (context !== ContextDetector.CONTEXTS.FLOW_BUILDER) return;

    // Load settings
    _namingPattern = await SettingsManager.get('apiNameGenerator.namingPattern') || 'Snake_Case';

    // Load prefix configuration.
    // APINamePrefixes.load() already handles the desired behaviour:
    //   1. Use custom prefixes from storage if present
    //   2. Otherwise fall back to the shipped default JSON
    //   3. Otherwise fall back to hardcoded defaults
    await APINamePrefixes.load();

    // Start observing for configuration panels opening
    _startObserving();

    // Pre-fetch the flow kind (Screen Flow / Record-Triggered / etc.) so it's
    // ready when the user opens the Flow Properties dialog. Best-effort only —
    // if the fetch fails or the flow is brand new and unsaved, the detection
    // logic falls back to the generic "flow" prefix.
    _getFlowKindForCurrentFlow().catch(() => { /* swallow */ });

    // Listen for settings changes
    SettingsManager.onChange((key, newValue) => {
      if (key === 'apiNameGenerator.namingPattern') {
        _namingPattern = newValue || 'Snake_Case';
      }
    });

    // Note: Custom-prefix live-reload is handled internally by APINamePrefixes
    // via a chrome.storage.onChanged listener on storage.local.

    console.log(
      '[SFUT APIGen] Initialised. Pattern:',
      _namingPattern,
      '| Custom prefixes:',
      APINamePrefixes.isCustom()
    );
  }

  // ===== Inline Injection =====

  function _startObserving() {
    if (_observer) return;

    _observer = new MutationObserver(() => {
      requestAnimationFrame(() => _scanForPanels());
    });

    _observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Initial scan
    _scanForPanels();

    // Periodic scan to catch modals the observer might miss
    // (Aura modals sometimes reuse existing DOM containers)
    if (!_scanInterval) {
      _scanInterval = setInterval(() => _scanForPanels(), 1000);
    }
  }

  function _scanForPanels() {
    _scanStandardPanels();
    _scanScreenPropertyEditors();
  }

  /**
   * Original injection path for standard Flow elements/resources
   * that use builder_platform_interaction-label-description and lightning-input.devName.
   */
  function _scanStandardPanels() {
    const devNameInputs = document.querySelectorAll('lightning-input.devName');

    devNameInputs.forEach(devNameInput => {
      const container = devNameInput.closest('builder_platform_interaction-label-description');
      if (!container) return;
      if (container.getAttribute(INJECTED_MARKER)) return;

      const apiNameField = devNameInput.querySelector('input');
      if (!apiNameField) return;

      // Skip injection when the API Name field is disabled.
      // The Flow Properties editor on existing (already-saved) flows marks the
      // API Name input as disabled because Salesforce does not allow renaming
      // a flow's API name post-creation. Injecting a generate button on a
      // read-only field would be confusing.
      if (_isApiNameFieldDisabled(devNameInput, apiNameField)) return;

      const labelInput = container.querySelector('lightning-input.label');
      const labelField = labelInput ? labelInput.querySelector('input') : null;

      _injectGenerateButton(container, labelField, apiNameField);
      container.setAttribute(INJECTED_MARKER, 'true');
    });
  }

  /**
   * Determines whether the API Name input is disabled (read-only).
   * Salesforce marks the flow's own API Name as disabled in the Flow Properties
   * dialog for already-saved flows. Checks both the outer lightning-input
   * wrapper (which carries the attribute in Lightning) and the inner <input>.
   */
  function _isApiNameFieldDisabled(devNameInput, apiNameField) {
    if (devNameInput && devNameInput.hasAttribute && devNameInput.hasAttribute('disabled')) {
      return true;
    }
    if (apiNameField && apiNameField.disabled) return true;
    return false;
  }

  /**
   * Additional scan path for Screen component editors that expose API Name
   * in screen property editors rather than label-description containers.
   */
  function _scanScreenPropertyEditors() {
    const editorSelectors = [
      'builder_platform_interaction-screen-display-text-field-properties-editor',
      'flowruntime-message-editor',
      'builder_platform_interaction-screen-repeater-field-properties-editor',
      'builder_platform_interaction-screen-extension-properties-editor',
      'builder_platform_interaction-screen-section-base-editor',
      'builder_platform_interaction-screen-section-field-properties-editor',
      'builder_platform_interaction-screen-field-properties-editor',
      'builder_platform_interaction-screen-component-properties-editor'
    ];

    const editors = document.querySelectorAll(editorSelectors.join(','));
    editors.forEach(editor => {
      if (editor.getAttribute(INJECTED_MARKER)) return;

      const apiNameField = _findScreenApiNameInput(editor);
      if (!apiNameField) return;

      // If this editor already got picked up by standard path, skip it.
      if (apiNameField.closest('builder_platform_interaction-label-description')) return;

      _injectGenerateButtonForScreenEditor(editor, apiNameField);
      editor.setAttribute(INJECTED_MARKER, 'true');
    });

    // Fallback: detect from visible screen property panels even if the custom editor
    // selector changes over time.
    const panelBodies = document.querySelectorAll('.properties-container, .panelContainer');
    panelBodies.forEach(panel => {
      if (panel.getAttribute(`${INJECTED_MARKER}-screen`)) return;

      const type = _detectScreenSubtypeFromPanel(panel);
      if (!type || !['display', 'message', 'repeater', 'lwc', 'section'].includes(type)) return;

      const apiNameField = _findScreenApiNameInput(panel);
      if (!apiNameField) return;
      if (apiNameField.closest('builder_platform_interaction-label-description')) return;

      _injectGenerateButtonForScreenEditor(panel, apiNameField);
      panel.setAttribute(`${INJECTED_MARKER}-screen`, 'true');
    });
  }

  function _injectGenerateButton(container, labelField, apiNameField) {
    const devNameLightningInput = container.querySelector('lightning-input.devName');
    if (!devNameLightningInput) return;

    if (devNameLightningInput.querySelector('.' + GENERATE_BTN_CLASS)) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = GENERATE_BTN_CLASS;
    btn.title = 'Generate API Name';
    btn.setAttribute('aria-label', 'Generate API Name');
    btn.innerHTML = '🏷️';

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const label = _resolveLabelForStandardContainer(container, labelField, apiNameField);
      if (!label) {
        _showToast('Enter a Label first, then generate.', 'warning');
        return;
      }

      // Special case: Flow Properties editor — resolve the flow kind.
      // _getFlowKindForCurrentFlow handles caching internally and is cheap
      // when the cache already holds a valid (non-fallback) resolution.
      // Calling it unconditionally here also means we retry the canvas
      // detection on every click, so if the first click hit before the
      // canvas rendered the Start element, a later click will pick it up.
      const onFlowProperties = container.closest('builder_platform_interaction-flow-properties-editor');
      if (onFlowProperties) {
        try {
          await _getFlowKindForCurrentFlow();
        } catch (err) {
          // Already handled inside _getFlowKindForCurrentFlow; continue with fallback.
        }
      }

      const elementType = _detectElementTypeFromPanel(container);
      const apiName = _generateAPIName(label, elementType, _namingPattern);
      _setInputValue(apiNameField, apiName);
      _showToast(`API Name generated: ${apiName}`);
    });

    const labelEl = devNameLightningInput.querySelector('label');
    if (labelEl) {
      labelEl.style.display = 'inline-flex';
      labelEl.style.alignItems = 'center';
      labelEl.style.gap = '4px';
      labelEl.appendChild(btn);
    } else {
      devNameLightningInput.appendChild(btn);
    }
  }

  /**
   * Injection path for Screen component editors that do not use lightning-input.devName.
   */
  function _injectGenerateButtonForScreenEditor(editor, apiNameField) {
    const labelEl = _findApiNameLabelForInput(apiNameField, editor);
    if (!labelEl) return;
    if (labelEl.querySelector('.' + GENERATE_BTN_CLASS)) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = GENERATE_BTN_CLASS;
    btn.title = 'Generate API Name';
    btn.setAttribute('aria-label', 'Generate API Name');
    btn.innerHTML = '🏷️';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const label = _resolveLabelForScreenEditor(editor, apiNameField);
      if (!label) {
        _showToast('Enter a label or API Name first, then generate.', 'warning');
        return;
      }

      const elementType = _detectElementTypeFromPanel(editor);
      const apiName = _generateAPIName(label, elementType, _namingPattern);
      _setInputValue(apiNameField, apiName);
      _showToast(`API Name generated: ${apiName}`);
    });

    labelEl.style.display = 'inline-flex';
    labelEl.style.alignItems = 'center';
    labelEl.style.gap = '4px';
    labelEl.appendChild(btn);
  }

  /**
   * Sets an input's value and dispatches the events Salesforce's LWC framework
   * needs to recognise the change.
   */
  function _setInputValue(inputEl, value) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;

    if (!nativeInputValueSetter) {
      inputEl.value = value;
    } else {
      nativeInputValueSetter.call(inputEl, value);
    }

    inputEl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    inputEl.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
  }

  /**
   * Detects the element/resource type from the current configuration context.
   */
  function _detectElementTypeFromPanel(labelDescContainer) {
    if (!labelDescContainer) return null;

    // Outcome detail editors are nested inside the broader Decision panel.
    if (labelDescContainer.closest('builder_platform_interaction-outcome')) {
      return 'outcome';
    }

    // Flow Properties editor — the label-description inside this panel belongs
    // to the Flow itself (not to an element). Detection is synchronous by
    // design; the flow kind is resolved via a cache that's warmed at init().
    // If the cache isn't populated yet (unusual — only happens on a very fresh
    // load before metadata returns), we fall back to the generic 'flow' key,
    // which maps to the "Flow" prefix in the JSON.
    if (labelDescContainer.closest('builder_platform_interaction-flow-properties-editor')) {
      return _flowKindCache.kind || 'flow';
    }

    const panel = labelDescContainer.closest('.panelContainer') ||
                  labelDescContainer.closest('.modal-body') ||
                  labelDescContainer.closest('.properties-container') ||
                  labelDescContainer.closest('[class*="property-editor"]') ||
                  labelDescContainer.parentElement?.parentElement;

    if (!panel) return null;

    // Detect orchestration subtypes first (Stage, Step, etc.)
    const orchestrationSubtype = _detectOrchestrationSubtypeFromPanel(panel);
    if (orchestrationSubtype) return orchestrationSubtype;

    // --- Resource modals (Variable, Formula, Constant, etc.) ---
    // These must be checked BEFORE screen subtypes because resource editors
    // also contain builder_platform_interaction-label-description, and the
    // screen subtype fallback would otherwise misclassify them as 'input'.
    const resourceTypeBtn = panel.querySelector(
      'lightning-combobox button[data-value][aria-label="Resource Type"]'
    );
    if (resourceTypeBtn) {
      const resourceType = (resourceTypeBtn.getAttribute('data-value') || '').trim();
      return _resolveResourceTypeKey(panel, resourceType);
    }

    const resourceEditor = panel.querySelector('builder_platform_interaction-resource-editor');
    if (resourceEditor) {
      const editorType =
        panel.querySelector('builder_platform_interaction-formula-editor') ? 'Formula' :
        panel.querySelector('builder_platform_interaction-variable-constant-editor') ? 'Variable' :
        null;

      if (editorType) {
        return _resolveResourceTypeKey(panel, editorType);
      }
    }

    // Method 1: Read the header title text
    const headerTitle = panel.querySelector('h2.header-title, h2.slds-panel__header-title');
    if (headerTitle) {
      const titleText = (headerTitle.textContent || '').trim().toLowerCase();
      const prefixEntry = APINamePrefixes.getByType(titleText);
      if (prefixEntry) return titleText;
    }

    // Method 2: Read the icon-name attribute
    const icon = panel.querySelector('builder_platform_interaction-element-icon lightning-icon');
    if (icon) {
      const iconName = icon.getAttribute('icon-name');
      const typeKey = APINamePrefixes.getTypeFromIconName(iconName);
      if (typeKey) return typeKey;
    }

    // Method 3: Check for specific editor components
    const editorMap = {
      'builder_platform_interaction-record-lookup-editor': 'get records',
      'builder_platform_interaction-record-create-editor': 'create records',
      'builder_platform_interaction-record-update-editor': 'update records',
      'builder_platform_interaction-record-delete-editor': 'delete records',
      'builder_platform_interaction-decision-editor': 'decision',
      'builder_platform_interaction-assignment-editor': 'assignment',
      'builder_platform_interaction-screen-editor': 'screen',
      'builder_platform_interaction-loop-editor': 'loop',
      'builder_platform_interaction-subflow-editor': 'subflow',
      'builder_platform_interaction-wait-editor': 'wait'
    };

    for (const [selector, typeKey] of Object.entries(editorMap)) {
      if (panel.querySelector(selector)) return typeKey;
    }

    // Detect named screen component subtypes (Display, Message, Repeater,
    // Section, LWC) via their specific editor selectors within the panel.
    const screenSubtype = _detectScreenSubtypeFromPanel(panel);
    if (screenSubtype) return screenSubtype;

    // --- Screen Input detection (last resort) ---
    // Screen input components (Text, Number, Email, Date, Toggle, Picklist, etc.)
    // use the same label-description + devName pattern as standard elements, so
    // they can't be identified from the panel content alone.
    //
    // Instead of searching within `panel` (whose scope is unreliable — it can be
    // too narrow, too broad, or stale), we trace directly from the original
    // labelDescContainer element. If the label-description is inside a screen
    // field/component properties editor, it's a screen input. This is precise
    // because .closest() follows the ACTUAL DOM ancestry, not an arbitrary scope.
    if (
      labelDescContainer.closest('builder_platform_interaction-screen-field-properties-editor') ||
      labelDescContainer.closest('builder_platform_interaction-screen-component-properties-editor')
    ) {
      return 'input';
    }

    // The Screen element itself (not a component inside it) — its label-description
    // is inside a screen-editor but NOT inside a field/component properties editor.
    if (labelDescContainer.closest('builder_platform_interaction-screen-editor')) {
      return 'screen';
    }

    return null;
  }

  // ===== Flow Kind Detection =====

  /**
   * Maps a fetched Flow Tooling API record onto one of the prefix-table
   * "type" keys (lowercase to match APINamePrefixes.getByType's lookup).
   *
   * Resolution order mirrors the logic in utils/flow-health-normalizer.js
   * to stay consistent across the toolkit:
   *   1. Orchestrations — any Orchestrator processType
   *   2. Screen Flows — detected by presence of screens[] in the metadata
   *      (processType alone is insufficient because Screen Flows use
   *      processType: "Flow" just like old autolaunched flows)
   *   3. Platform Event-Triggered Flows — triggerType indicates a platform event
   *   4. Schedule-Triggered Flows — triggerType === "Scheduled" OR start.schedule present
   *   5. Record-Triggered Flows — recordTriggerType present OR triggerType indicates record trigger
   *   6. Autolaunched Flows — AutoLaunchedFlow with no trigger
   *   7. Generic Flow — anything else
   *
   * @param {Object} record - The Flow record returned by SalesforceAPI.getFlowMetadata
   * @returns {string} A lowercase type key for APINamePrefixes.getByType
   */
  function _resolveFlowKind(record) {
    if (!record) return 'flow';

    const processType = (record.ProcessType || '').trim();
    const metadata = record.Metadata || {};
    const start = metadata.start || {};
    const screens = metadata.screens || [];

    // 1. Orchestrations
    if (processType === 'Orchestrator' || processType === 'RecordTriggeredOrchestrator') {
      return 'orchestration';
    }

    // 2. Screen Flows — the definitive signal is presence of screens
    if (screens.length > 0) {
      return 'screen flow';
    }

    // From here down, we're looking at non-screen, non-orchestration flows.
    const triggerType = String(start.triggerType || '').toLowerCase();
    const recordTriggerType = String(start.recordTriggerType || '').toLowerCase();

    // 3. Platform Event-Triggered
    if (triggerType === 'platformevent' || triggerType.includes('platformevent')) {
      return 'platform event-triggered flow';
    }

    // 4. Schedule-Triggered
    if (triggerType === 'scheduled' || start.schedule) {
      return 'schedule-triggered flow';
    }

    // 5. Automation Event-Triggered (CRM data-change / invocable event)
    if (
      triggerType === 'datachangeevent' ||
      triggerType.includes('datachange') ||
      triggerType === 'crmchangeevent' ||
      processType === 'CrmDataChangeEvent' ||
      processType === 'DataCloudDataChange'
    ) {
      return 'automation event-triggered flow';
    }

    // 6. Record-Triggered — check for Approval Process subtype first
    if (recordTriggerType || triggerType === 'recordaftersave' || triggerType === 'recordbeforesave') {
      if (
        processType === 'RecordTriggeredApprovalProcess' ||
        processType.includes('ApprovalProcess')
      ) {
        return 'record-triggered flow - approval process';
      }
      return 'record-triggered flow';
    }

    // 7. Autolaunched — check for Approval Process subtype first
    if (processType === 'AutoLaunchedFlow' || processType === 'Workflow' || processType === 'Flow') {
      if (processType === 'AutoLaunchedApprovalProcess' || processType.includes('ApprovalProcess')) {
        return 'autolaunched flow - approval process';
      }
      return 'autolaunched flow';
    }

    // 7. Generic fallback
    return 'flow';
  }

  /**
   * Resolves the flow kind for the currently-open flow and caches it.
   * Returns a Promise that resolves to a type key. Concurrent calls are
   * deduped via an in-flight promise so we never fire the metadata fetch
   * more than once in parallel.
   *
   * Safe to call from init() as a best-effort warm-up — if the user is on
   * a brand-new unsaved flow (no flowId yet), this resolves to 'flow'
   * (the generic fallback) without attempting a fetch.
   *
   * @returns {Promise<string>} A type key
   */
  /**
   * Attempts to resolve the flow kind synchronously from the canvas DOM.
   *
   * The Start element card carries an aria-label of the form:
   *   "START_ELEMENT element, Record-Triggered Flow"
   *   "START_ELEMENT element, Screen Flow"
   *   "START_ELEMENT element, Schedule-Triggered Flow"
   *   "START_ELEMENT element, Platform Event-Triggered Flow"
   *   "START_ELEMENT element, Autolaunched Flow"
   *   "START_ELEMENT element, Record-Triggered Orchestration"
   *   etc.
   *
   * This text matches the type keys we ship in default-prefixes.json
   * (except orchestration variants, which collapse into 'orchestration').
   * Returns null if no Start element is found or the label format is
   * unexpected — caller should fall back to the Tooling API path.
   *
   * This is the primary detection path because it works for brand-new
   * unsaved flows that don't yet have a flowId in the URL.
   *
   * @returns {string|null} A type key, or null if not resolvable
   */
  function _resolveFlowKindFromCanvas() {
    // ── Component-based detection ────────────────────────────────────────────
    // Some flow types don't expose a useful type name via the START_ELEMENT
    // aria-label, so we probe for unique editor components that are always
    // present in the page DOM while that flow type is open.

    // Automation Event-Triggered Flows render a CRM data-change editor.
    // This component is unique to this flow type and is present whether the
    // start-node panel is open or closed.
    if (document.querySelector('builder_platform_interaction-crm-data-change-event-editor')) {
      return 'automation event-triggered flow';
    }

    // Schedule-Triggered Flows show the configured schedule (e.g.
    // "Sun, 19 Apr 2026, 00:00:00, Once") as the START_ELEMENT label rather
    // than the flow type name, so the aria-label path below is useless for
    // them. Detect via the schedule-trigger-editor component instead.
    if (document.querySelector('builder_platform_interaction-schedule-trigger-editor')) {
      return 'schedule-triggered flow';
    }

    // ── START_ELEMENT aria-label path ────────────────────────────────────────
    // Multiple elements may carry this aria-label (card + inner icon). Any will do.
    const startEl = document.querySelector('[aria-label^="START_ELEMENT element,"]');
    if (!startEl) return null;

    const ariaLabel = startEl.getAttribute('aria-label') || '';
    const commaIdx = ariaLabel.indexOf(',');
    if (commaIdx === -1) return null;

    const kindText = ariaLabel.slice(commaIdx + 1).trim();
    if (!kindText) return null;

    // Normalise em dash (—, U+2014) to a regular hyphen so that labels like
    // "Platform Event—Triggered Flow" match their prefix key counterparts.
    const lower = kindText.toLowerCase().replace(/\u2014/g, '-');

    // Collapse any orchestration variant into the single 'orchestration' bucket.
    if (lower.includes('orchestration')) return 'orchestration';

    // ── Approval Process variants ────────────────────────────────────────────
    // These carry "(No Trigger)" or similar qualifiers that prevent a direct
    // key lookup, so we match by substring before attempting the lookup.
    if (lower.includes('record-triggered') && lower.includes('approval process')) {
      return 'record-triggered flow - approval process';
    }
    if (lower.includes('autolaunched') && lower.includes('approval process')) {
      return 'autolaunched flow - approval process';
    }

    // ── Direct key lookup ────────────────────────────────────────────────────
    // Confirm the parsed text is an actual prefix entry; if so use it directly.
    // This lets future Salesforce-introduced flow kinds work without code changes
    // provided a matching JSON entry is added.
    if (typeof APINamePrefixes !== 'undefined' && APINamePrefixes.getByType) {
      if (APINamePrefixes.getByType(lower)) return lower;
    }

    // Parsed text didn't match a known prefix entry — let caller fall back.
    return null;
  }

  /**
   * Resolves the flow kind for the currently-open flow and caches it.
   * Returns a Promise that resolves to a type key. Concurrent calls are
   * deduped via an in-flight promise so we never fire the metadata fetch
   * more than once in parallel.
   *
   * Resolution order:
   *   1. Canvas DOM (works for new unsaved flows and saved flows alike,
   *      as soon as the Start element is rendered)
   *   2. Tooling API metadata (backstop for the rare case where the canvas
   *      hasn't rendered yet — requires a flowId)
   *   3. Generic 'flow' fallback (only if both above fail)
   *
   * @returns {Promise<string>} A type key
   */
  async function _getFlowKindForCurrentFlow() {
    const flowId = (typeof SalesforceAPI !== 'undefined' && SalesforceAPI.getFlowIdFromUrl)
      ? SalesforceAPI.getFlowIdFromUrl()
      : null;

    // Cache hit — but only trust the cache for a non-fallback resolution.
    // If we previously cached 'flow' (the generic fallback) it might be
    // because the canvas hadn't rendered yet; always re-check.
    //
    // When flowId is null (e.g. new flows, or flow types that don't surface
    // an ID in the URL such as Autolaunched Approval Processes), we cannot
    // reliably use the flowId as a cache key — two different flows can both
    // have flowId === null, causing stale 'orchestration' (or any other
    // previously cached kind) to bleed across. In that case we always
    // re-run the canvas detection so the current flow's DOM is inspected
    // rather than the previous flow's cached result being returned.
    if (flowId && _flowKindCache.flowId === flowId && _flowKindCache.kind && _flowKindCache.kind !== 'flow') {
      return _flowKindCache.kind;
    }

    // Cache has a different flow — invalidate
    if (flowId !== _flowKindCache.flowId) {
      _flowKindCache.flowId = flowId;
      _flowKindCache.kind = null;
      _flowKindCache.inFlight = null;
    }

    // 1. Try the canvas DOM first — works for new unsaved flows too.
    const canvasKind = _resolveFlowKindFromCanvas();
    if (canvasKind) {
      _flowKindCache.kind = canvasKind;
      console.log('[SFUT APIGen] Flow kind resolved from canvas:', canvasKind);
      return canvasKind;
    }

    // 2. No canvas signal. If we have a flowId, try the Tooling API.
    if (!flowId) {
      // Brand new unsaved flow with no Start element rendered yet — cache
      // the generic fallback but callers that re-invoke later will retry
      // the canvas (because we only short-circuit the cache for non-'flow'
      // resolutions, above).
      _flowKindCache.kind = 'flow';
      return 'flow';
    }

    // Dedupe concurrent API calls
    if (_flowKindCache.inFlight) {
      return _flowKindCache.inFlight;
    }

    _flowKindCache.inFlight = (async () => {
      try {
        if (typeof SalesforceAPI === 'undefined' || !SalesforceAPI.getFlowMetadata) {
          return 'flow';
        }
        const record = await SalesforceAPI.getFlowMetadata(flowId);
        const kind = _resolveFlowKind(record);
        _flowKindCache.kind = kind;
        console.log('[SFUT APIGen] Flow kind resolved from Tooling API:', kind, 'for flowId:', flowId);
        return kind;
      } catch (err) {
        console.warn('[SFUT APIGen] Failed to resolve flow kind, using generic fallback:', err);
        _flowKindCache.kind = 'flow';
        return 'flow';
      } finally {
        _flowKindCache.inFlight = null;
      }
    })();

    return _flowKindCache.inFlight;
  }

  /**
   * Detect orchestration-specific types before generic input fallback.
   */
  function _detectOrchestrationSubtypeFromPanel(panel) {
    if (!panel) return null;

    // Orchestration Stage
    if (panel.querySelector('builder_platform_interaction-orchestrated-stage-editor')) {
      return 'stage';
    }

    // Orchestration Step
    if (panel.querySelector('builder_platform_interaction-stage-step-editor')) {
      return 'step';
    }

    // Fallback from header text
    const headerTitle = panel.querySelector('h2.header-title, h2.slds-panel__header-title');
    const headerText = (headerTitle?.textContent || '').trim().toLowerCase();
    if (headerText === 'stage') return 'stage';
    if (headerText === 'step') return 'step';

    // Fallback from icon
    const icon = panel.querySelector('builder_platform_interaction-element-icon lightning-icon');
    const iconName = icon?.getAttribute('icon-name');
    if (iconName === 'standard:sales_path') return 'stage';
    if (iconName === 'standard:work_order_item') return 'step';

    return null;
  }

  /**
   * Detect specific Screen component types before defaulting to generic Screen.
   */
  function _detectScreenSubtypeFromPanel(panel) {
    if (!panel) return null;

    // Display Text
    if (panel.querySelector('builder_platform_interaction-screen-display-text-field-properties-editor')) {
      return 'display';
    }

    // Message
    if (panel.querySelector('flowruntime-message-editor')) {
      return 'message';
    }

    // Repeater
    if (panel.querySelector('builder_platform_interaction-screen-repeater-field-properties-editor')) {
      return 'repeater';
    }

    // Section
    if (
      panel.querySelector('builder_platform_interaction-screen-section-base-editor') ||
      panel.querySelector('builder_platform_interaction-screen-section-field-properties-editor')
    ) {
      const headerValue = _findPossibleLabelInput(panel)?.value?.trim();
      return headerValue ? 'section' : 'screen';
    }

    // Custom LWC / Screen Extension component
    if (panel.querySelector('builder_platform_interaction-screen-extension-properties-editor')) {
      return 'lwc';
    }

    // Screen input detection is NOT handled here — it's handled in
    // _detectElementTypeFromPanel using labelDescContainer.closest() which
    // is far more reliable than searching within an arbitrarily-scoped panel.
    return null;
  }

  /**
   * Resolves the compound type key for a resource (Variable/Formula/Constant)
   * by reading the Data Type combobox and Collection checkbox.
   *
   * Produces keys like "Variable (Text)", "Formula (Number)", "Collection (Record)", etc.
   */
  function _resolveResourceTypeKey(panel, resourceType) {
    if (!resourceType) return null;

    const resourceLower = resourceType.toLowerCase();

    const simpleTypes = [
      'constant',
      'texttemplate',
      'text template',
      'choice',
      'collectionchoice',
      'collection choice set',
      'dynamicrecordchoice',
      'record choice set',
      'picklistchoice',
      'picklist choice set',
      'stage'
    ];

    if (simpleTypes.includes(resourceLower)) {
      const displayMap = {
        'constant': 'Constant',
        'texttemplate': 'Text Template',
        'text template': 'Text Template',
        'choice': 'Choice',
        'collectionchoice': 'Collection Choice Set',
        'collection choice set': 'Collection Choice Set',
        'dynamicrecordchoice': 'Record Choice Set',
        'record choice set': 'Record Choice Set',
        'picklistchoice': 'Picklist Choice Set',
        'picklist choice set': 'Picklist Choice Set',
        'stage': 'Stage'
      };
      return (displayMap[resourceLower] || resourceType).toLowerCase();
    }

    const dataTypeBtn = panel.querySelector(
      'lightning-combobox button[aria-label="Data Type"]'
    );
    const rawDataType = dataTypeBtn
      ? (dataTypeBtn.getAttribute('data-value') || '').trim()
      : '';

    const dataTypeMap = {
      'String': 'Text',
      'Number': 'Number',
      'Currency': 'Currency',
      'Boolean': 'Boolean',
      'Date': 'Date',
      'DateTime': 'Date/Time',
      'Time': 'Time',
      'SObject': 'Record',
      'Picklist': 'Picklist',
      'Multipicklist': 'Multi-Select Picklist',
      'Apex': 'Apex-Defined'
    };
    const dataTypeDisplay = dataTypeMap[rawDataType] || rawDataType || null;

    const isCollection = _isCollectionChecked(panel);

    if (resourceLower === 'variable' || resourceLower === 'formula') {
      const baseName = isCollection
        ? 'Collection'
        : resourceLower === 'formula'
          ? 'Formula'
          : 'Variable';

      if (dataTypeDisplay) {
        return `${baseName} (${dataTypeDisplay})`.toLowerCase();
      }
      return baseName.toLowerCase();
    }

    return resourceType.toLowerCase();
  }

  /**
   * Checks whether the "Allow multiple values (collection)" checkbox is checked.
   */
  function _isCollectionChecked(panel) {
    const checkboxes = panel.querySelectorAll('lightning-input input[type="checkbox"]');
    for (const cb of checkboxes) {
      const label = cb.closest('lightning-input')?.querySelector('.slds-form-element__label');
      if (label && /allow multiple values/i.test(label.textContent)) {
        return cb.checked;
      }
    }

    const collLabel = panel.querySelector('label span.slds-form-element__label');
    if (collLabel && /allow multiple values/i.test(collLabel.textContent)) {
      const cb = collLabel.closest('label')?.previousElementSibling ||
                 collLabel.closest('span.slds-checkbox')?.querySelector('input[type="checkbox"]');
      return cb?.checked || false;
    }

    return false;
  }

  // ===== Name Generation Logic =====

  /**
   * Generates an API name from a label, element type, and naming pattern.
   * @param {string} label - The user-entered label text
   * @param {string|null} elementType - The element type key (e.g. 'get records')
   * @param {string} pattern - The naming pattern ('Snake_Case', 'PascalCase', 'camelCase')
   * @returns {string} The generated API name
   */
  function _generateAPIName(label, elementType, pattern) {
    const cleaned = label.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    if (!cleaned) return '';

    let words = cleaned
      .split(/\s+/)
      .flatMap(w => w.split(/(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/))
      .filter(Boolean);

    if (!words.length) return '';

    const prefix = _getPrefix(elementType, pattern);

    if (prefix && words.length > 1) {
      const prefixClean = prefix.replace(/_$/, '');
      const firstWord = words[0].toLowerCase();

      if (prefixClean.toLowerCase() === firstWord) {
        words = words.slice(1);
      }
    }

    if (!words.length) return prefix || '';

    switch (pattern) {
      case 'Snake_Case':
        return prefix + words.map(w =>
          w.charAt(0).toUpperCase() + w.slice(1)
        ).join('_');

      case 'PascalCase':
        return prefix + words.map(w =>
          w.charAt(0).toUpperCase() + w.slice(1)
        ).join('');

      case 'camelCase':
        return prefix + words.map(w =>
          w.charAt(0).toUpperCase() + w.slice(1)
        ).join('');

      default:
        return prefix + words.join('_');
    }
  }

  /**
   * Gets the prefix for an element type and naming pattern.
   * Delegates to APINamePrefixes which handles custom vs default.
   */
  function _getPrefix(elementType, pattern) {
    if (!elementType) return '';

    const entry = APINamePrefixes.getByType(elementType);
    if (!entry) return '';

    switch (pattern) {
      case 'Snake_Case':
        return entry.Snake_Case || '';
      case 'PascalCase':
        return entry.PascalCase || '';
      case 'camelCase':
        return entry.camelCase || '';
      default:
        return '';
    }
  }

  /**
   * Strips any known prefix from a value so it can be cleanly regenerated.
   */
  function _stripExistingPrefix(value) {
    if (!value) return value;

    const allPrefixes = APINamePrefixes.getAll();
    const candidates = [];

    for (const entry of allPrefixes) {
      if (entry.Snake_Case) candidates.push(entry.Snake_Case);
      if (entry.PascalCase) candidates.push(entry.PascalCase);
      if (entry.camelCase) candidates.push(entry.camelCase);
    }

    const unique = [...new Set(candidates)];
    unique.sort((a, b) => b.length - a.length);

    for (const prefix of unique) {
      if (!value.startsWith(prefix)) continue;

      const remainder = value.slice(prefix.length);

      if (prefix.endsWith('_')) {
        const clean = remainder.replace(/^_/, '');
        if (clean.length > 0) return clean;
        continue;
      }

      if (
        remainder.length > 0 &&
        remainder.charAt(0) === remainder.charAt(0).toUpperCase() &&
        remainder.charAt(0) !== remainder.charAt(0).toLowerCase()
      ) {
        return remainder;
      }
    }

    return value;
  }

  // ===== Label / API Field Helpers =====

  function _resolveLabelForStandardContainer(container, labelField, apiNameField) {
    if (labelField && labelField.value?.trim()) {
      return labelField.value.trim();
    }

    const panel = container.closest('.panelContainer') ||
                  container.closest('.properties-container') ||
                  container.closest('[class*="property-editor"]') ||
                  container.parentElement?.parentElement;

    const fallbackLabel = _resolveFallbackLabel(panel, apiNameField);
    return fallbackLabel || '';
  }

  function _resolveLabelForScreenEditor(editor, apiNameField) {
    const explicitLabel = _findPossibleLabelInput(editor)?.value?.trim();
    if (explicitLabel) return explicitLabel;

    const fallbackLabel = _resolveFallbackLabel(editor, apiNameField);
    return fallbackLabel || '';
  }

  function _resolveFallbackLabel(scope, apiNameField) {
    if (!scope) return apiNameField?.value?.trim() ? _stripExistingPrefix(apiNameField.value.trim()) : '';

    // 1. Try likely label/header fields first
    const labelField = _findPossibleLabelInput(scope);
    if (labelField?.value?.trim()) {
      return labelField.value.trim();
    }

    // 2. Try panel header title for custom screen components or component-specific editors
    const headerTitle = scope.querySelector('h2.header-title, h2.slds-panel__header-title');
    if (headerTitle?.textContent?.trim()) {
      const headerText = headerTitle.textContent.trim();

      // Avoid using generic titles as labels
      const genericTitles = new Set([
        'screen',
        'display text',
        'message',
        'repeater',
        'section',
        'input',
        'properties'
      ]);

      if (!genericTitles.has(headerText.toLowerCase())) {
        return headerText;
      }
    }

    // 3. Fall back to the existing API Name with prefix stripped
    if (apiNameField?.value?.trim()) {
      return _stripExistingPrefix(apiNameField.value.trim());
    }

    return '';
  }

  function _findPossibleLabelInput(scope) {
    if (!scope) return null;

    const selectors = [
      'lightning-input.label input',
      'input[name="label"]',
      'input[aria-label="Label"]',
      'input[placeholder="Label"]',
      'textarea[name="label"]'
    ];

    for (const selector of selectors) {
      const el = scope.querySelector(selector);
      if (el) return el;
    }

    // Heuristic: find an input under a form element whose label text looks like Label or Header
    const controls = scope.querySelectorAll('lightning-input input, input.slds-input, textarea');
    for (const input of controls) {
      const formEl = input.closest('.slds-form-element');
      const label = formEl?.querySelector('.slds-form-element__label');
      const text = (label?.textContent || '').trim().toLowerCase();

      if (text === 'label' || text === 'header' || text.includes('section header')) {
        return input;
      }
    }

    return null;
  }

  function _findScreenApiNameInput(scope) {
    if (!scope) return null;

    // Prefer API Name field by label association
    const formElements = scope.querySelectorAll('.slds-form-element');
    for (const formEl of formElements) {
      const label = formEl.querySelector('.slds-form-element__label');
      const labelText = (label?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();

      if (labelText === 'api name' || labelText.endsWith(' api name')) {
        const input = formEl.querySelector('input');
        if (input) return input;
      }
    }

    // Fallback: name="name" is commonly used by these screen property editors
    const namedInput = scope.querySelector('input[name="name"]');
    if (namedInput) return namedInput;

    return null;
  }

  function _findApiNameLabelForInput(apiNameField, scope) {
    if (!apiNameField) return null;

    const formEl = apiNameField.closest('.slds-form-element');
    if (formEl) {
      const label = formEl.querySelector('.slds-form-element__label');
      if (label && /api name/i.test(label.textContent || '')) {
        return label;
      }
    }

    if (scope) {
      const labels = scope.querySelectorAll('.slds-form-element__label');
      for (const label of labels) {
        if (/api name/i.test(label.textContent || '')) {
          return label;
        }
      }
    }

    return null;
  }


  // ===== UI Helpers =====

  function _showToast(message, type = 'success') {
    document.querySelectorAll('.sfut-toast[data-feature="apigen"]').forEach(el => el.remove());

    const toast = document.createElement('div');
    toast.className = `sfut-toast ${
      type === 'error' ? 'sfut-toast-error' :
      type === 'warning' ? 'sfut-toast-warning' : ''
    }`;
    toast.dataset.feature = 'apigen';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('sfut-toast-visible'));

    setTimeout(() => {
      toast.classList.remove('sfut-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ===== Public API =====
  return {
    init
  };

})();

// Register with the toolkit
if (typeof SFFlowUtilityToolkit !== 'undefined') {
  SFFlowUtilityToolkit.registerFeature('api-name-generator', APINameGenerator);
}