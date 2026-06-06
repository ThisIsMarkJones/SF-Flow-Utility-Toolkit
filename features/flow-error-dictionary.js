/**
 * SF Flow Utility Toolkit - Flow Error Dictionary (Feature)
 *
 * Standalone Setup page feature that opens the Error Dictionary modal.
 * Appears in the sidebar menu on Setup pages (SETUP_FLOWS, SETUP_OTHER).
 *
 * Distinct from the Error Dictionary tab inside the Error Explorer modal.
 * This module enables proactive, out-of-context access to the dictionary —
 * useful for learning, preparation, or sharing with a team.
 *
 * Lifecycle:
 *   init()       — Reads enabled setting.
 *   onActivate() — Opens FlowErrorModal in dictionary-only mode.
 *   isEnabled()  — Returns whether the feature is enabled in settings.
 *
 * Depends on:
 *   utils/flow-error-dictionary.js
 *   ui/flow-error-modal.js
 *   utils/settings-manager.js
 */

const FlowErrorDictionaryFeature = (() => {

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

    console.log('[SFUT FlowErrorDictionaryFeature] Initialised.');
  }

  /**
   * Opens the Error Dictionary modal in standalone (no analysis) mode.
   * Called from the sidebar menu item on Setup pages.
   */
  async function onActivate() {
    if (!_enabled) return;
    FlowErrorModal.showDictionary();
  }

  function isEnabled() {
    return _enabled;
  }

  return {
    init,
    onActivate,
    isEnabled
  };

})();

SFFlowUtilityToolkit.registerFeature('flow-error-dictionary', FlowErrorDictionaryFeature);