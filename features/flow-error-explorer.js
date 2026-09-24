// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Mark Jones. SF Flow Utility Toolkit.
/**
 * SF Flow Utility Toolkit - Flow Error Explorer
 *
 * Main feature module for the Flow Error Explorer.
 *
 * Lifecycle:
 *   init()       — Checks settings, then starts FlowErrorDetector observation
 *                  if the current session is an error debug session (guid in URL).
 *   onActivate() — Called from the sidebar menu item. Opens the modal directly
 *                  using whatever error context was last detected.
 *   isEnabled()  — Returns whether the feature is enabled in settings.
 *
 * Listens for the 'sfut-explore-error-open' custom event dispatched by
 * FlowErrorDetector when the toolbar button is clicked.
 *
 * Depends on:
 *   utils/flow-error-dictionary.js
 *   utils/flow-error-translator.js
 *   utils/flow-error-detector.js
 *   ui/flow-error-modal.js
 *   utils/salesforce-api.js
 *   utils/settings-manager.js
 */

const FlowErrorExplorer = (() => {

  const SETTING_ENABLED = 'flowErrorExplorer.enabled';

  let _enabled = true;
  let _initialised = false;

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async function init() {
    if (_initialised) return;
    _initialised = true;

    const featureEnabled = await SettingsManager.get(SETTING_ENABLED);
    if (featureEnabled === false) {
      _enabled = false;
      return;
    }
    _enabled = true;

    // Only activate the detector if we are in Flow Builder context.
    // ContextDetector guards this at the feature-list level, but we double-check
    // here because the detector itself is lightweight and safe to call either way.
    FlowErrorDetector.observe(_onErrorDetected);

    // Listen for toolbar button clicks dispatched by the detector.
    document.addEventListener('sfut-explore-error-open', (e) => {
      const context = e.detail?.context || FlowErrorDetector.getErrorContext();
      if (context) _openModal(context);
    });

    console.log('[SFUT FlowErrorExplorer] Initialised.');
  }

  /**
   * Called from the sidebar menu item.
   * Opens the modal with the last known error context.
   */
  async function onActivate() {
    if (!_enabled) return;

    const context = FlowErrorDetector.getErrorContext();

    if (!context) {
      // No error context yet — could mean the panel hasn't fully rendered.
      // Attempt a fresh extraction.
      const fresh = FlowErrorDetector.extractErrorContext();
      if (fresh) {
        await _openModal(fresh);
      } else {
        FlowErrorModal.showError(
          'No flow error was detected in the current debug session. ' +
          'Please ensure you opened Flow Builder via a fault debug link ' +
          'and that the debug panel has finished loading.'
        );
      }
      return;
    }

    await _openModal(context);
  }

  function isEnabled() {
    return _enabled;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  /**
   * Callback fired by FlowErrorDetector when the error state is confirmed.
   * Refreshes the sidebar menu to show the "Explore Error" item.
   *
   * @param {Object} context
   */
  function _onErrorDetected(context) {
    console.log('[SFUT FlowErrorExplorer] Error context received:', context.exceptionCode);

    // Refresh the side button so "Explore Error" appears in the menu.
    if (typeof SideButton !== 'undefined' && typeof SideButton.refresh === 'function') {
      SideButton.refresh();
    }
  }

  /**
   * Opens the Error Explorer modal, enriching the context with flow metadata
   * if not already present.
   *
   * @param {Object} context
   */
  async function _openModal(context) {
    FlowErrorModal.showLoading();

    try {
      // Resolve the flow metadata if not yet loaded.
      if (!context.flowMetadata && context.flowId) {
        try {
          const result = await SalesforceAPI.getFlowMetadata(context.flowId);
          context.flowMetadata = result || null;

          // Attempt to resolve the element API name from metadata.
          if (result?.Metadata) {
            context.elementApiName = _resolveElementApiName(
              result.Metadata,
              context.elementLabel
            );
          }
        } catch (metaErr) {
          // Non-fatal — the modal works without metadata.
          console.warn('[SFUT FlowErrorExplorer] Could not load flow metadata:', metaErr);
        }
      }

      FlowErrorModal.showReport(context, {
        buildPrompt: _buildAIPrompt
      });

    } catch (err) {
      console.error('[SFUT FlowErrorExplorer] Failed to open modal:', err);
      FlowErrorModal.showError(err?.message || 'Unexpected error opening Flow Error Explorer.');
    }
  }

  /**
   * Attempts to resolve the element API name from flow metadata by matching
   * the element label against the normalised nodes.
   *
   * This is a best-effort lookup — label matching can have collisions in
   * edge cases. If the normalizer is available we use it; otherwise we walk
   * the raw metadata directly.
   *
   * @param {Object} metadata   Raw flow Metadata object from the Tooling API.
   * @param {string} label      The element label extracted from the DOM.
   * @returns {string|null}
   */
  function _resolveElementApiName(metadata, label) {
    if (!metadata || !label) return null;

    // If the normalizer is available, use its output for consistency.
    if (
      typeof FlowHealthNormalizer !== 'undefined' &&
      typeof FlowHealthNormalizer.normalize === 'function'
    ) {
      try {
        const normalized = FlowHealthNormalizer.normalize(metadata, {});
        const match = (normalized.nodes || []).find(
          (n) => n.label === label || n.apiName === label
        );
        return match?.apiName || null;
      } catch (e) {
        // Fall through to manual walk.
      }
    }

    // Manual walk: check common element collection keys in the metadata.
    const elementCollections = [
      'recordUpdates', 'recordCreates', 'recordDeletes', 'recordLookups',
      'actionCalls', 'subflows', 'screens', 'decisions', 'loops', 'assignments'
    ];

    for (const key of elementCollections) {
      const items = metadata[key];
      if (!Array.isArray(items)) continue;
      const match = items.find((item) => item.label === label || item.name === label);
      if (match) return match.name || null;
    }

    return null;
  }

  /**
   * Builds the AI prompt from the error context.
   * Uses the prompt library if available, falling back to a hardcoded template.
   *
   * @param {Object} context
   * @returns {string}
   */
  function _buildAIPrompt(context) {
    // Attempt to use the prompt library template for flow-error-explorer.
    try {
      if (
        typeof AIPromptLibrary !== 'undefined' &&
        typeof AIPromptLibrary.getById === 'function'
      ) {
        const template = AIPromptLibrary.getById('flow-error-explorer');
        if (template?.prompt) {
          return _interpolatePrompt(template.prompt, context);
        }
      }
    } catch (e) {
      console.warn('[SFUT FlowErrorExplorer] Could not load AI prompt template:', e);
    }

    // Fallback template.
    const { translation, elementType, elementLabel, rawFaultString } = context;
    const { exceptionCode, humanMessage, entry } = translation;
    const flowLabel = context.flowMetadata?.MasterLabel
      || context.flowMetadata?.meta?.flowLabel
      || 'Unknown Flow';

    // Include affected record IDs if the translator extracted any from the fault string.
    const recordIds = context.translation?.recordIds || [];
    const recordIdLine = recordIds.length > 0
      ? `**Affected Record ID(s):** ${recordIds.join(', ')}`
      : null;

    return [
      `I am debugging a Salesforce Flow that encountered a runtime error and need help resolving it.`,
      ``,
      `**Flow:** ${flowLabel}`,
      `**Faulted Element:** ${elementType} — "${elementLabel}"`,
      `**Error Code:** ${exceptionCode}`,
      `**Error Message:** ${humanMessage}`,
      `**Error Category:** ${entry.category}`,
      recordIdLine,
      ``,
      `**Raw Fault Message:**`,
      rawFaultString,
      ``,
      `Please provide:`,
      `1. A clear explanation of why this specific error occurred in a Flow context.`,
      `2. Step-by-step remediation instructions tailored to this error type and element.`,
      `3. The fault path pattern I should add to this element to handle this error gracefully in future.`,
      `4. Any related best practices that would prevent this class of error from occurring.`
    ].filter(line => line !== null).join('\n');
  }

  /**
   * Interpolates known placeholders in a prompt template string.
   *
   * @param {string} template
   * @param {Object} context
   * @returns {string}
   */
  function _interpolatePrompt(template, context) {
    const { translation, elementType, elementLabel, rawFaultString } = context;
    const flowLabel = context.flowMetadata?.MasterLabel || 'Unknown Flow';

    const recordIds = (context.translation?.recordIds || []).join(', ') || 'None identified';

    return template
      .replace(/\{\{flowLabel\}\}/g, flowLabel)
      .replace(/\{\{elementType\}\}/g, elementType)
      .replace(/\{\{elementLabel\}\}/g, elementLabel)
      .replace(/\{\{exceptionCode\}\}/g, translation.exceptionCode)
      .replace(/\{\{humanMessage\}\}/g, translation.humanMessage)
      .replace(/\{\{rawFaultString\}\}/g, rawFaultString)
      .replace(/\{\{recordIds\}\}/g, recordIds);
  }

  return {
    init,
    onActivate,
    isEnabled
  };

})();

SFFlowUtilityToolkit.registerFeature('flow-error-explorer', FlowErrorExplorer);