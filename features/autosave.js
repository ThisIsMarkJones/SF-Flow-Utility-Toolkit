/**
 * SF Flow Utility Toolkit - Autosave
 *
 * Monitors the Flow Builder canvas for unsaved changes on inactive (draft) flows.
 * After a configurable period of inactivity, injects a countdown timer into the
 * toolbar and then programmatically triggers the native Salesforce Save button.
 *
 * Behaviour:
 * - Only activates on the FLOW_BUILDER context (inactive/draft flows only)
 * - Watches the Save button (.test-toolbar-save button) via MutationObserver
 * - When Save becomes enabled, starts an inactivity timer
 * - Any keyboard input or click within the Flow Builder canvas resets the inactivity timer
 * - Mouse movement and scrolling do NOT reset the timer (prevents screenshot interference)
 * - When the inactivity window elapses, a 30-second countdown appears in the toolbar
 * - If the user interacts during the countdown, the countdown is cancelled and
 *   the inactivity timer resets from zero
 * - On countdown completion, the native Save button is clicked
 * - A toast confirms the autosave occurred
 * - The observer resets, ready to watch for the next unsaved change
 *
 * Toolbar pill states:
 * - idle:      Save disabled — "Autosave: On" (muted, always visible when enabled)
 * - armed:     Save enabled, inactivity timer running — "Autosave: On"
 * - countdown: Counting down — "Saving in 0:28…"
 * - saved:     Briefly after save — "Saved ✓"
 */

const Autosave = (() => {

  // ─── Constants ────────────────────────────────────────────────────────────

  const SELECTORS = {
    saveButtonHost:  '.test-toolbar-save',
    saveButton:      '.test-toolbar-save button',
    toolbarActions:  '.slds-builder-toolbar__actions',
  };

  const CLASS_NAMES = {
    pill:          'sfut-autosave-pill',
    pillIdle:      'sfut-autosave-pill--idle',
    pillArmed:     'sfut-autosave-pill--armed',
    pillCountdown: 'sfut-autosave-pill--countdown',
    pillSaved:     'sfut-autosave-pill--saved',
    icon:          'sfut-autosave-pill__icon',
    label:         'sfut-autosave-pill__label',
  };

  const COUNTDOWN_SECONDS   = 30;
  const SAVED_DISPLAY_MS    = 2500;   // How long "Saved ✓" stays visible
  const TOOLBAR_POLL_MS     = 500;    // Interval for waiting for toolbar to appear
  const TOOLBAR_MAX_ATTEMPTS = 40;    // Max ~20s wait

  // ─── State ────────────────────────────────────────────────────────────────

  let _enabled          = false;
  let _intervalMinutes  = 3;

  let _pill             = null;      // The injected toolbar pill element
  let _pillLabel        = null;      // The text span inside the pill

  let _saveObserver     = null;      // MutationObserver on the Save button
  let _inactivityTimer  = null;      // setTimeout handle for inactivity window
  let _countdownTimer   = null;      // setInterval handle for the 30s countdown
  let _countdownSeconds = 0;         // Remaining seconds in countdown

  let _saveArmed        = false;     // True when Save button is currently enabled
  let _countingDown     = false;     // True when countdown is active

  // ─── Init ─────────────────────────────────────────────────────────────────

  async function init() {
    try {
      const settings = await SettingsManager.getMultiple([
        'autosave.enabled',
        'autosave.intervalMinutes'
      ]);
      _enabled         = settings['autosave.enabled'] ?? false;
      _intervalMinutes = settings['autosave.intervalMinutes'] ?? 3;
    } catch (e) {
      console.warn('[SFUT Autosave] Could not read settings, using defaults:', e);
      _enabled         = false;
      _intervalMinutes = 3;
    }

    if (!_enabled) {
      console.log('[SFUT Autosave] Disabled in settings.');
      return;
    }

    await _waitForToolbarAndInit();
    console.log('[SFUT Autosave] Initialised.');
  }

  async function onActivate() {
    _enabled = !_enabled;
    await SettingsManager.set('autosave.enabled', _enabled);

    if (_enabled) {
      await _waitForToolbarAndInit();
      _showToast('Autosave enabled.');
    } else {
      _teardown();
      _showToast('Autosave disabled.');
    }
  }

  // ─── Setup ────────────────────────────────────────────────────────────────

  async function _waitForToolbarAndInit() {
    for (let attempt = 1; attempt <= TOOLBAR_MAX_ATTEMPTS; attempt++) {
      const toolbar = document.querySelector(SELECTORS.toolbarActions);
      const saveBtn = document.querySelector(SELECTORS.saveButton);

      if (toolbar && saveBtn) {
        _injectPill(toolbar);
        _attachSaveObserver(saveBtn);
        _attachInteractionListeners();
        _syncPillToSaveState(saveBtn);
        return;
      }

      await new Promise(r => setTimeout(r, TOOLBAR_POLL_MS));
    }

    console.warn('[SFUT Autosave] Toolbar not found after waiting. Autosave not started.');
  }

  // ─── Pill ─────────────────────────────────────────────────────────────────

  function _injectPill(toolbar) {
    // Remove any existing pill (e.g. after SPA navigation)
    _removePill();

    _pill = document.createElement('div');
    _pill.className = `${CLASS_NAMES.pill} ${CLASS_NAMES.pillIdle}`;

    const icon = document.createElement('span');
    icon.className = CLASS_NAMES.icon;
    icon.textContent = '💾';
    icon.setAttribute('aria-hidden', 'true');

    _pillLabel = document.createElement('span');
    _pillLabel.className = CLASS_NAMES.label;
    _pillLabel.textContent = 'Autosave: On';

    _pill.appendChild(icon);
    _pill.appendChild(_pillLabel);

    // Insert before the Save button host so it sits to its left
    const saveHost = toolbar.querySelector(SELECTORS.saveButtonHost);
    if (saveHost) {
      toolbar.insertBefore(_pill, saveHost);
    } else {
      toolbar.appendChild(_pill);
    }
  }

  function _removePill() {
    if (_pill && _pill.parentNode) {
      _pill.parentNode.removeChild(_pill);
    }
    _pill      = null;
    _pillLabel = null;
  }

  function _setPillState(state) {
    if (!_pill) return;

    _pill.classList.remove(
      CLASS_NAMES.pillIdle,
      CLASS_NAMES.pillArmed,
      CLASS_NAMES.pillCountdown,
      CLASS_NAMES.pillSaved
    );

    switch (state) {
      case 'idle':
        _pill.classList.add(CLASS_NAMES.pillIdle);
        _pillLabel.textContent = 'Autosave: On';
        break;
      case 'armed':
        _pill.classList.add(CLASS_NAMES.pillArmed);
        _pillLabel.textContent = 'Autosave: On';
        break;
      case 'countdown':
        _pill.classList.add(CLASS_NAMES.pillCountdown);
        // Label updated per-tick by countdown logic
        break;
      case 'saved':
        _pill.classList.add(CLASS_NAMES.pillSaved);
        _pillLabel.textContent = 'Saved ✓';
        break;
    }
  }

  // ─── MutationObserver: Watch Save button enabled/disabled state ───────────

  function _attachSaveObserver(saveBtn) {
    if (_saveObserver) {
      _saveObserver.disconnect();
      _saveObserver = null;
    }

    _saveObserver = new MutationObserver(() => {
      _syncPillToSaveState(saveBtn);
    });

    // Observe the inner <button> for attribute changes (disabled, aria-disabled)
    _saveObserver.observe(saveBtn, { attributes: true, attributeFilter: ['disabled', 'aria-disabled'] });

    // Also observe the parent lightning-button for style changes (pointer-events: none)
    const host = saveBtn.closest(SELECTORS.saveButtonHost);
    if (host) {
      _saveObserver.observe(host, { attributes: true, attributeFilter: ['style'] });
    }
  }

  function _syncPillToSaveState(saveBtn) {
    const isEnabled = !saveBtn.disabled && saveBtn.getAttribute('aria-disabled') !== 'true';

    if (isEnabled && !_saveArmed) {
      // Save just became available — arm
      _saveArmed = true;
      _startInactivityTimer();
      _setPillState('armed');

    } else if (!isEnabled && _saveArmed) {
      // Save just became unavailable (saved externally, or Activated)
      _saveArmed = false;
      _cancelCountdown();
      _stopInactivityTimer();
      _setPillState('idle');
    }
  }

  // ─── Inactivity Timer ─────────────────────────────────────────────────────

  function _startInactivityTimer() {
    _stopInactivityTimer();
    const ms = (_intervalMinutes || 3) * 60 * 1000;
    _inactivityTimer = setTimeout(() => {
      if (_saveArmed) {
        _beginCountdown();
      }
    }, ms);
  }

  function _stopInactivityTimer() {
    if (_inactivityTimer) {
      clearTimeout(_inactivityTimer);
      _inactivityTimer = null;
    }
  }

  function _resetInactivityTimer() {
    if (!_saveArmed) return;

    if (_countingDown) {
      // User interacted during countdown — cancel it and restart inactivity window
      _cancelCountdown();
      _setPillState('armed');
    }

    _startInactivityTimer();
  }

  // ─── Countdown ────────────────────────────────────────────────────────────

  function _beginCountdown() {
    _countingDown     = true;
    _countdownSeconds = COUNTDOWN_SECONDS;

    _setPillState('countdown');
    _updateCountdownLabel();

    _countdownTimer = setInterval(() => {
      _countdownSeconds--;

      if (_countdownSeconds <= 0) {
        _fireAutosave();
      } else {
        _updateCountdownLabel();
      }
    }, 1000);
  }

  function _updateCountdownLabel() {
    if (!_pillLabel) return;
    const mins = Math.floor(_countdownSeconds / 60);
    const secs = _countdownSeconds % 60;
    const display = mins > 0
      ? `${mins}:${String(secs).padStart(2, '0')}`
      : `0:${String(secs).padStart(2, '0')}`;
    _pillLabel.textContent = `Saving in ${display}…`;
  }

  function _cancelCountdown() {
    if (_countdownTimer) {
      clearInterval(_countdownTimer);
      _countdownTimer = null;
    }
    _countingDown     = false;
    _countdownSeconds = 0;
  }

  // ─── Fire Save ────────────────────────────────────────────────────────────

  function _fireAutosave() {
    _cancelCountdown();
    _stopInactivityTimer();
    _saveArmed = false;

    const saveBtn = document.querySelector(SELECTORS.saveButton);
    if (saveBtn && !saveBtn.disabled) {
      saveBtn.click();
      console.log('[SFUT Autosave] Save triggered.');

      _setPillState('saved');
      _showToast('Flow automatically saved.');

      // Return to idle after brief "Saved ✓" display
      setTimeout(() => {
        _setPillState('idle');

        // Re-arm the observer — the Save button should now be disabled again.
        // MutationObserver is already watching; just ensure state is in sync.
        const btn = document.querySelector(SELECTORS.saveButton);
        if (btn) _syncPillToSaveState(btn);
      }, SAVED_DISPLAY_MS);

    } else {
      // Save button disappeared or became disabled before we could click
      console.warn('[SFUT Autosave] Save button unavailable when countdown completed.');
      _setPillState('idle');
    }
  }

  // ─── Interaction Listeners ────────────────────────────────────────────────

  /**
   * Only resets the inactivity timer on signals that indicate the user is
   * actively editing the flow. Intentionally excludes mousemove, scroll, and
   * unfocused clicks so that:
   *   - Taking a screenshot does not cancel the countdown
   *   - Moving the cursor across the screen does not perpetually defer saving
   *
   * Signals treated as "editing":
   *   1. keydown anywhere on the document — typing in a field, using shortcuts,
   *      Undo (Ctrl+Z), Redo (Ctrl+Y/Ctrl+Shift+Z)
   *   2. mousedown on the canvas or toolbar — clicking elements, panels, buttons
   *      within the Flow Builder UI itself (scoped to avoid OS-level captures)
   */
  function _attachInteractionListeners() {
    let _throttle = false;

    const _onInteraction = () => {
      if (_throttle) return;
      _throttle = true;
      setTimeout(() => { _throttle = false; }, 500);
      _resetInactivityTimer();
    };

    // Keyboard: any keypress indicates active editing or use of shortcuts
    document.addEventListener('keydown', _onInteraction, { passive: true });

    // Mouse: only clicks within the Flow Builder container reset the timer.
    // The canvas is rooted at builder_platform_interaction-flow-builder or
    // the .flow-builder-container div. Clicks outside (e.g. browser chrome,
    // OS screenshot tools) do not fire mousedown on document reliably in
    // extension contexts, but scoping to the canvas gives an extra safety net.
    const _onCanvasMousedown = (e) => {
      const canvas = document.querySelector(
        '.flow-builder-container, builder_platform_interaction-flow-builder'
      );
      if (canvas && canvas.contains(e.target)) {
        _onInteraction();
      }
    };

    document.addEventListener('mousedown', _onCanvasMousedown, { passive: true });
  }

  // ─── Teardown ─────────────────────────────────────────────────────────────

  function _teardown() {
    _cancelCountdown();
    _stopInactivityTimer();

    if (_saveObserver) {
      _saveObserver.disconnect();
      _saveObserver = null;
    }

    _removePill();
    _saveArmed = false;
  }

  // ─── Toast ────────────────────────────────────────────────────────────────

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

  SFFlowUtilityToolkit.registerFeature('autosave', { init, onActivate });

  return { init, onActivate };

})();