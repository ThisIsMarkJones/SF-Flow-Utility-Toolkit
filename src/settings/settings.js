/**
 * SF Flow Utility Toolkit - Settings Page Script
 * 
 * Handles loading settings from Chrome storage,
 * binding them to UI elements, and saving changes automatically.
 */

(function () {

  const DEFAULTS = {
    'setupTabs.enabled': false,
    'setupTabs.automationHome.enabled': false,
    'setupTabs.groupingEnabled': false,
    'missingDescriptions.enabled': false,
    'canvasSearch.shortcut': 'Ctrl+Shift+F',
    'canvasSearch.highlightColour': '#FFD700',
    'aiAssistant.defaultTemplate': 'summarise',
    'apiNameGenerator.namingPattern': 'Snake_Case',
    'apiNameGenerator.flowRegex': null,
    'flowHealthCheck.namingConventions.flow': null
  };

  /**
   * Loads all settings from Chrome storage and populates the UI.
   */
  async function loadSettings() {
    chrome.storage.sync.get(null, (result) => {
      const settings = { ...DEFAULTS, ...result };

      // Populate toggles
      _setToggle('setting-setupTabs', settings['setupTabs.enabled']);
      _setToggle('setting-automationHomeTab', settings['setupTabs.automationHome.enabled']);
      _setToggle('setting-setupTabsGrouping', settings['setupTabs.groupingEnabled']);
      _setToggle('setting-missingDescriptions', settings['missingDescriptions.enabled']);

      // Populate inputs
      _setInput('setting-shortcut', settings['canvasSearch.shortcut']);
      _setInput('setting-highlightColour', settings['canvasSearch.highlightColour']);

      // Populate selects
      _setSelect('setting-defaultTemplate', settings['aiAssistant.defaultTemplate']);
      _setSelect('setting-namingPattern', settings['apiNameGenerator.namingPattern']);
    });
  }

  /**
   * Attaches event listeners to all setting controls for auto-save.
   */
  function attachListeners() {
    // Toggle switches
    document.querySelectorAll('.toggle-switch input').forEach((toggle) => {
      toggle.addEventListener('change', () => {
        _saveSetting(toggle.dataset.key, toggle.checked);
      });
    });

    // Select dropdowns
    document.querySelectorAll('.setting-select').forEach((select) => {
      select.addEventListener('change', () => {
        _saveSetting(select.dataset.key, select.value);
      });
    });

    // Colour picker
    const colourPicker = document.getElementById('setting-highlightColour');
    if (colourPicker) {
      colourPicker.addEventListener('input', () => {
        _saveSetting(colourPicker.dataset.key, colourPicker.value);
      });
    }

    // Keyboard shortcut capture
    const shortcutInput = document.getElementById('setting-shortcut');
    if (shortcutInput) {
      shortcutInput.addEventListener('click', () => {
        shortcutInput.value = 'Press shortcut keys...';
        shortcutInput.classList.add('capturing');
      });

      shortcutInput.addEventListener('keydown', (e) => {
        if (!shortcutInput.classList.contains('capturing')) return;

        e.preventDefault();

        const keys = [];
        if (e.ctrlKey) keys.push('Ctrl');
        if (e.shiftKey) keys.push('Shift');
        if (e.altKey) keys.push('Alt');
        if (e.metaKey) keys.push('Cmd');

        // Only capture if a modifier is pressed along with a regular key
        if (keys.length > 0 && e.key !== 'Control' && e.key !== 'Shift' && 
            e.key !== 'Alt' && e.key !== 'Meta') {
          keys.push(e.key.toUpperCase());
          const shortcut = keys.join('+');
          shortcutInput.value = shortcut;
          shortcutInput.classList.remove('capturing');
          _saveSetting(shortcutInput.dataset.key, shortcut);
        }
      });

      // Cancel capture on blur
      shortcutInput.addEventListener('blur', () => {
        if (shortcutInput.classList.contains('capturing')) {
          shortcutInput.classList.remove('capturing');
          // Restore previous value
          chrome.storage.sync.get('canvasSearch.shortcut', (result) => {
            shortcutInput.value = result['canvasSearch.shortcut'] || DEFAULTS['canvasSearch.shortcut'];
          });
        }
      });
    }
  }

  /**
   * Saves a setting to Chrome storage and shows confirmation.
   * @param {string} key - The setting key
   * @param {any} value - The value to save
   */
  function _saveSetting(key, value) {
    chrome.storage.sync.set({ [key]: value }, () => {
      _showSaveToast();
    });
  }

  /**
   * Sets a toggle switch value.
   * @param {string} id - The element ID
   * @param {boolean} value - The checked state
   */
  function _setToggle(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.checked = !!value;
    }
  }

  /**
   * Sets an input field value.
   * @param {string} id - The element ID
   * @param {string} value - The input value
   */
  function _setInput(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.value = value || '';
    }
  }

  /**
   * Sets a select dropdown value.
   * @param {string} id - The element ID
   * @param {string} value - The selected value
   */
  function _setSelect(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.value = value || '';
    }
  }

  // ===== Custom Prefix Configuration =====

  /**
   * Initialises the Custom Prefix Configuration section.
   * Loads the current prefix state, updates the status line, and wires up
   * the Download / Upload / Reset buttons.
   */
  async function initPrefixConfig() {
    try {
      await APINamePrefixes.load();
    } catch (err) {
      console.warn('[SFUT Settings] Failed to load prefix config:', err);
    }

    _updatePrefixStatus();
    _attachPrefixListeners();

    // Watch for changes made elsewhere (other settings tabs, or from within
    // the APINamePrefixes module's internal reload) and refresh the status
    // line when that happens. The small delay lets APINamePrefixes complete
    // its own reload before we re-read its state.
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;
        if (!Object.prototype.hasOwnProperty.call(changes, 'apiNameGenerator.customPrefixes')) return;

        setTimeout(_updatePrefixStatus, 100);
      });
    }
  }

  /**
   * Updates the status line and toggles the Reset button visibility.
   */
  function _updatePrefixStatus() {
    const statusEl = document.getElementById('prefix-status-value');
    const resetBtn = document.getElementById('prefix-reset-btn');

    if (!statusEl) return;

    const isCustom = APINamePrefixes.isCustom();
    const count = APINamePrefixes.getAll().length;

    if (isCustom) {
      statusEl.textContent = `Custom prefixes (${count} entries)`;
      statusEl.classList.add('is-custom');
      if (resetBtn) resetBtn.hidden = false;
    } else {
      statusEl.textContent = `Default prefixes (${count} entries)`;
      statusEl.classList.remove('is-custom');
      if (resetBtn) resetBtn.hidden = true;
    }
  }

  /**
   * Attaches click handlers to the prefix config buttons.
   */
  function _attachPrefixListeners() {
    const downloadBtn = document.getElementById('prefix-download-btn');
    const uploadBtn = document.getElementById('prefix-upload-btn');
    const resetBtn = document.getElementById('prefix-reset-btn');
    const fileInput = document.getElementById('prefix-file-input');

    if (downloadBtn) {
      downloadBtn.addEventListener('click', _handlePrefixDownload);
    }

    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', () => {
        fileInput.value = '';
        fileInput.click();
      });
      fileInput.addEventListener('change', _handlePrefixUpload);
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', _handlePrefixReset);
    }
  }

  /**
   * Downloads the currently active prefix configuration as a JSON file.
   */
  function _handlePrefixDownload() {
    try {
      const json = APINamePrefixes.exportAsJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = APINamePrefixes.isCustom()
        ? 'flow-api-name-prefixes-custom.json'
        : 'flow-api-name-prefixes-default.json';
      anchor.style.display = 'none';

      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      _showSaveToast('Configuration downloaded');
    } catch (err) {
      console.warn('[SFUT Settings] Prefix download failed:', err);
      _showSaveToast('Download failed', true);
    }
  }

  /**
   * Handles the file picker change event for uploading a custom config.
   * @param {Event} e
   */
  async function _handlePrefixUpload(e) {
    const fileInput = e.target;
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const result = await APINamePrefixes.importCustom(text);

      if (result.success) {
        _updatePrefixStatus();
        _showSaveToast(`Imported ${result.count} prefix(es) from ${file.name}`);
      } else {
        _showSaveToast(`Import failed: ${result.error}`, true);
      }
    } catch (err) {
      console.warn('[SFUT Settings] Prefix import failed:', err);
      _showSaveToast(`Import failed: ${err.message || 'unknown error'}`, true);
    } finally {
      // Clear the input so uploading the same file again still triggers change.
      fileInput.value = '';
    }
  }

  /**
   * Clears the custom prefix configuration and reverts to defaults.
   */
  async function _handlePrefixReset() {
    const confirmed = window.confirm(
      'Reset to default prefixes?\n\nThis will clear your custom configuration and revert to the shipped defaults. You can re-import your custom config later if you still have the JSON file.'
    );
    if (!confirmed) return;

    try {
      await APINamePrefixes.resetToDefaults();
      _updatePrefixStatus();
      _showSaveToast('Reset to defaults');
    } catch (err) {
      console.warn('[SFUT Settings] Prefix reset failed:', err);
      _showSaveToast('Reset failed', true);
    }
  }

  /**
   * Shows a brief save confirmation toast.
   * @param {string} [message] - Optional override message
   * @param {boolean} [isError] - If true, styles the toast as an error
   */
  function _showSaveToast(message, isError = false) {
    const toast = document.getElementById('save-toast');
    if (!toast) return;

    if (message) {
      toast.textContent = message;
    } else {
      toast.textContent = 'Settings saved';
    }

    toast.classList.toggle('is-error', !!isError);
    toast.classList.add('visible');

    setTimeout(() => {
      toast.classList.remove('visible');
    }, isError ? 3500 : 1500);
  }

  // --- Initialise ---
  document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    attachListeners();
    initPrefixConfig();

    // Set version from manifest so it never drifts from the declared version
    const footer = document.getElementById('settings-footer');
    if (footer) {
      const { version } = chrome.runtime.getManifest();
      footer.textContent = `SF Flow Utility Toolkit v${version}`;
    }
  });

})();