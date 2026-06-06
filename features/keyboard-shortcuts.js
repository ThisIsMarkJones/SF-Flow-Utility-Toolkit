/**
 * SF Flow Utility Toolkit - Keyboard Shortcuts
 *
 * Provides keyboard shortcuts for common Flow Builder canvas actions.
 * All canvas shortcuts use Shift + Letter and are scoped to the Flow Builder
 * canvas context only. A single global shortcut (Cmd/Ctrl+Shift+U) toggles
 * the Utility Sidebar from anywhere the side button is present.
 *
 * Canvas shortcuts (active when Flow Builder canvas is loaded):
 *   Shift+S — Save
 *   Shift+D — Debug
 *   Shift+R — Run
 *   Shift+E — Create New Element
 *   Shift+V — Create New Resource (opens toolbox if hidden)
 *   Shift+M — Open Manager (Toggle Toolbox)
 *   Shift+F — Open Errors panel → Errors tab
 *   Shift+W — Open Errors panel → Warnings tab
 *   Shift+X — Open Settings (View Properties)
 *   Shift+A — Select Elements
 *   Shift+Z — Undo
 *   Shift+Y — Redo
 *   Shift+T — Activate / Deactivate toggle
 *   Shift+H — Show / Hide Advanced (in Settings panel)
 *
 * Global shortcut (handled by ui/side-button.js — active on all supported pages):
 *   Cmd+Shift+U / Ctrl+Shift+U — Open Utility Sidebar
 *
 * Documented native shortcut (no implementation required):
 *   Cmd+Shift+S / Ctrl+Shift+S — Save As New Version (native Salesforce behaviour)
 *
 * Guards:
 *   - Shortcuts do not fire when the user is focused inside a text input,
 *     textarea, or contenteditable element.
 *   - If the target button is absent or disabled, a toast message is shown.
 */

const KeyboardShortcuts = (() => {

  // ─── Constants ────────────────────────────────────────────────────────────

  /**
   * Canvas shortcuts — Shift + key only.
   * Each entry maps a key (uppercase) to a button selector and a friendly
   * label used in the toast message when the action cannot be performed.
   *
   * Special keys handled outside this table:
   *   E — Add Element (multiple buttons, uses first visible/enabled)
   *   V — New Resource (requires toolbox open guard)
   *   F — Errors tab (requires panel open + tab navigation)
   *   W — Warnings tab (requires panel open + tab navigation)
   *   T — Activate/Deactivate toggle (two possible button titles)
   *   H — Show/Hide Advanced toggle (two possible button titles)
   */
  const CANVAS_SHORTCUTS = [
    { key: 'S', selector: 'button[title="Save"]',            label: 'Save',            disabledMessage: 'Nothing to save — make a change first.' },
    { key: 'D', selector: 'button[title="Debug"]',           label: 'Debug',           disabledMessage: 'Debug is not available in the current flow state.' },
    { key: 'R', selector: 'button[title="Run"]',             label: 'Run',             disabledMessage: 'Run is not available in the current flow state.' },
    { key: 'M', selector: 'button[title="Toggle Toolbox"]',  label: 'Toggle Toolbox',  disabledMessage: 'Toggle Toolbox is not available right now.' },
    { key: 'X', selector: 'button[title="View properties"]', label: 'View Properties', disabledMessage: 'View Properties is not available right now.' },
    { key: 'A', selector: 'button[title="Select Elements"]', label: 'Select Elements', disabledMessage: 'Select Elements is not available right now.' },
    { key: 'Z', selector: 'button[title="Undo"]',            label: 'Undo',            disabledMessage: 'Nothing to undo.' },
    { key: 'Y', selector: 'button[title="Redo"]',            label: 'Redo',            disabledMessage: 'Nothing to redo.' },
  ];

  // ─── State ────────────────────────────────────────────────────────────────
  const ERRORS_PANEL_BUTTON_SELECTOR = 'button[title="Show errors panel"]';

  // ─── State ────────────────────────────────────────────────────────────────

  let _isFlowBuilderContext = false;
  let _listenerAttached     = false;
  let _enabled              = true;

  // ─── Init ─────────────────────────────────────────────────────────────────

  async function init() {
    _enabled = (await SettingsManager.get('keyboardShortcuts.enabled')) ?? true;

    if (!_enabled) {
      console.log('[SFUT KeyboardShortcuts] Disabled in settings.');
      return;
    }

    _isFlowBuilderContext = true;

    if (!_listenerAttached) {
      document.addEventListener('keydown', _handleKeyDown);
      _listenerAttached = true;
    }

    console.log('[SFUT KeyboardShortcuts] Initialised for Flow Builder context.');
  }

  // ─── Keydown Handler ──────────────────────────────────────────────────────

  /**
   * Central keydown handler. Evaluates whether the event matches a canvas
   * shortcut (Shift+Letter, no Ctrl/Cmd/Alt) or the global sidebar shortcut
   * (Cmd/Ctrl+Shift+U), and dispatches accordingly.
   *
   * @param {KeyboardEvent} e
   */
  function _handleKeyDown(e) {
    // Never fire shortcuts when the user is typing in an input field.
    if (_isTypingTarget(e.target)) return;

    const key = e.key.toUpperCase();
    const shiftOnly = e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;

    // ── Canvas shortcuts: Shift+Letter ──
    if (!_isFlowBuilderContext) return;
    if (!shiftOnly) return;

    e.preventDefault();

    switch (key) {

      // Add Element — multiple connector buttons; click first visible/enabled one
      case 'E':
        _triggerAddElement();
        break;

      // New Resource — ensure toolbox is open before clicking
      case 'V':
        _triggerNewResource();
        break;

      // Errors panel → Errors tab
      case 'F':
        _triggerErrorsPanelTab('errorsTab', 'Errors');
        break;

      // Errors panel → Warnings tab
      case 'W':
        _triggerErrorsPanelTab('warningsTab', 'Warnings');
        break;

      // Activate / Deactivate toggle — only one button present at a time
      case 'T':
        _triggerToggleButton(
          'button[title="Activate"], button[title="Deactivate"]',
          'Activate/Deactivate',
          'Activate/Deactivate is not available — the flow may have unsaved changes.'
        );
        break;

      // Show / Hide Advanced toggle — only one button present at a time
      case 'H':
        _triggerToggleButton(
          'button[title="Show Advanced"], button[title="Hide Advanced"]',
          'Show/Hide Advanced',
          'Show/Hide Advanced is not available — open Flow Settings first (Shift+X).'
        );
        break;

      // Standard shortcuts — simple selector lookup
      default: {
        const shortcut = CANVAS_SHORTCUTS.find(s => s.key === key);
        if (shortcut) _triggerCanvasAction(shortcut);
        break;
      }
    }
  }

  // ─── Action Dispatchers ───────────────────────────────────────────────────

  /**
   * Standard canvas action — finds button by selector and clicks it.
   * Shows a warning toast if the button is absent or disabled.
   *
   * @param {{ selector: string, disabledMessage: string }} shortcut
   */
  function _triggerCanvasAction(shortcut) {
    const button = document.querySelector(shortcut.selector);

    if (!button || _isDisabled(button)) {
      _showToast(shortcut.disabledMessage, 'warning');
      return;
    }

    button.click();
  }

  /**
   * Add Element — clicks the first visible, enabled connector button.
   * There are multiple Add Element buttons on the canvas (one per connector).
   */
  function _triggerAddElement() {
    const buttons = document.querySelectorAll('button[aria-label="Add element"]');
    for (const btn of buttons) {
      if (!_isDisabled(btn) && _isVisible(btn)) {
        btn.click();
        return;
      }
    }
    _showToast('No element connector is available to click.', 'warning');
  }

  /**
   * New Resource — ensures the Toolbox is open before clicking the
   * New Resource button. Mirrors the approach used in unused-resources.js
   * to handle the case where the toolbar panel is hidden.
   */
  async function _triggerNewResource() {
    await _ensureToolboxOpen();

    // Brief wait for the toolbox panel to render after opening
    await _wait(300);

    const button = document.querySelector('button[title="New Resource"]');
    if (!button || _isDisabled(button)) {
      _showToast('New Resource is not available right now.', 'warning');
      return;
    }

    button.click();
  }

  /**
   * Opens the Errors/Warnings panel (if not already open) and then
   * navigates to the specified tab within it.
   *
   * @param {'errorsTab'|'warningsTab'} tabValue - The data-tab-value to activate
   * @param {string} tabLabel - Human-readable label for toast messages
   */
  async function _triggerErrorsPanelTab(tabValue, tabLabel) {
    // Open the errors panel if it isn't already visible
    const panelButton = document.querySelector(ERRORS_PANEL_BUTTON_SELECTOR);
    if (!panelButton) {
      _showToast('The errors panel is not available right now.', 'warning');
      return;
    }

    // Only click the panel button if the panel isn't already open.
    // Detect by checking whether the tab anchor already exists in the DOM.
    const panelAlreadyOpen = !!document.querySelector(`a[data-tab-value="${tabValue}"]`);
    if (!panelAlreadyOpen) {
      panelButton.click();
      // Wait for the panel to render before navigating to the tab
      await _wait(250);
    }

    const tabAnchor = document.querySelector(`a[data-tab-value="${tabValue}"]`);
    if (!tabAnchor) {
      _showToast(`Could not find the ${tabLabel} tab in the errors panel.`, 'warning');
      return;
    }

    tabAnchor.click();
  }

  /**
   * Toggle button — handles pairs of mutually exclusive buttons where only
   * one is present in the DOM at a time (e.g. Activate/Deactivate,
   * Show Advanced/Hide Advanced).
   *
   * @param {string} selector - CSS selector covering both button states
   * @param {string} label - Human-readable label for logging
   * @param {string} disabledMessage - Toast message when neither button is found
   */
  function _triggerToggleButton(selector, label, disabledMessage) {
    const button = document.querySelector(selector);

    if (!button || _isDisabled(button)) {
      _showToast(disabledMessage, 'warning');
      return;
    }

    button.click();
  }

  // ─── Toolbox Helper ───────────────────────────────────────────────────────

  /**
   * Ensures the Toolbox panel is open. If the Toggle Toolbox button reports
   * aria-pressed="false", clicks it to open the panel.
   * Mirrors the _activateManagerTab() pattern in unused-resources.js.
   */
  async function _ensureToolboxOpen() {
    const toggleBtn = document.querySelector('button[title="Toggle Toolbox"]');
    if (toggleBtn && toggleBtn.getAttribute('aria-pressed') === 'false') {
      toggleBtn.click();
      await _wait(400);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Returns true if the event target is an element where keyboard input
   * should take precedence over shortcuts (text fields, textareas,
   * contenteditable nodes, and select elements).
   *
   * @param {EventTarget} target
   * @returns {boolean}
   */
  function _isTypingTarget(target) {
    if (!target || !(target instanceof Element)) return false;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (target.isContentEditable) return true;
    return false;
  }

  /**
   * Returns true if the button is disabled via the disabled attribute,
   * aria-disabled, or if its nearest lightning-button host has
   * pointer-events: none applied (Salesforce's pattern for soft-disabling).
   *
   * @param {HTMLElement} button
   * @returns {boolean}
   */
  function _isDisabled(button) {
    if (button.disabled) return true;
    if (button.getAttribute('aria-disabled') === 'true') return true;

    // Salesforce wraps buttons in a lightning-button with pointer-events:none
    // when they are effectively disabled but the inner button lacks disabled attr.
    const host = button.closest('lightning-button, lightning-button-icon');
    if (host && host.style.pointerEvents === 'none') return true;

    return false;
  }

  /**
   * Returns true if the element is visible in the DOM (has layout dimensions).
   *
   * @param {HTMLElement} el
   * @returns {boolean}
   */
  function _isVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  /**
   * Returns a Promise that resolves after the given number of milliseconds.
   *
   * @param {number} ms
   * @returns {Promise<void>}
   */
  function _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ─── Toast ────────────────────────────────────────────────────────────────

  /**
   * Displays a brief toast notification.
   * Reuses the existing SFUT toast pattern from other feature modules.
   *
   * @param {string} message
   * @param {'success'|'warning'|'error'} [type='success']
   */
  function _showToast(message, type = 'success') {
    const existing = document.querySelector('.sfut-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'sfut-toast';
    if (type === 'warning') toast.classList.add('sfut-toast-warning');
    if (type === 'error')   toast.classList.add('sfut-toast-error');
    toast.textContent = message;

    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('sfut-toast-visible'));
    });

    setTimeout(() => {
      toast.classList.remove('sfut-toast-visible');
      setTimeout(() => toast.remove(), 350);
    }, 3000);
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  SFFlowUtilityToolkit.registerFeature('keyboard-shortcuts', { init });

  return { init };

})();