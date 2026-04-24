/**
 * SF Flow Utility Toolkit - Settings Manager
 * 
 * Handles reading and writing user preferences to Chrome storage.
 * Provides a centralised interface for all settings operations.
 */

const SettingsManager = (() => {

  // Default settings applied on first install or when a setting is missing
  const DEFAULTS = {
    // Feature toggles
    'setupTabs.enabled': false,
    'setupTabs.automationHome.enabled': false, // Optional tab for Automation App Home
    'setupTabs.groupingEnabled': false,        // Group all Setup Tabs under a single dropdown
    'missingDescriptions.enabled': false,

    // Search & Highlight
    'canvasSearch.shortcut': 'Ctrl+Shift+F',
    'canvasSearch.highlightColour': '#FFD700',

    // AI Assistant
    'aiAssistant.defaultTemplate': 'summarise',

    // API Name Generator
    'apiNameGenerator.namingPattern': 'Snake_Case'
  };

  /**
   * Retrieves a single setting value.
   * Returns the default if the setting has not been explicitly set.
   * @param {string} key - The setting key
   * @returns {Promise<any>} The setting value
   */
  async function get(key) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(key, (result) => {
        if (result[key] !== undefined) {
          resolve(result[key]);
        } else {
          resolve(DEFAULTS[key] !== undefined ? DEFAULTS[key] : null);
        }
      });
    });
  }

  /**
   * Retrieves multiple settings at once.
   * @param {string[]} keys - Array of setting keys
   * @returns {Promise<Object>} Object with key-value pairs
   */
  async function getMultiple(keys) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(keys, (result) => {
        const merged = {};
        keys.forEach((key) => {
          merged[key] = result[key] !== undefined 
            ? result[key] 
            : (DEFAULTS[key] !== undefined ? DEFAULTS[key] : null);
        });
        resolve(merged);
      });
    });
  }

  /**
   * Retrieves all settings, filling in defaults where needed.
   * @returns {Promise<Object>} Complete settings object
   */
  async function getAll() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(null, (result) => {
        const merged = { ...DEFAULTS, ...result };
        resolve(merged);
      });
    });
  }

  /**
   * Saves a single setting.
   * @param {string} key - The setting key
   * @param {any} value - The value to save
   * @returns {Promise<void>}
   */
  async function set(key, value) {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [key]: value }, () => {
        resolve();
      });
    });
  }

  /**
   * Saves multiple settings at once.
   * @param {Object} settings - Object with key-value pairs to save
   * @returns {Promise<void>}
   */
  async function setMultiple(settings) {
    return new Promise((resolve) => {
      chrome.storage.sync.set(settings, () => {
        resolve();
      });
    });
  }

  /**
   * Resets a single setting to its default value.
   * @param {string} key - The setting key to reset
   * @returns {Promise<void>}
   */
  async function reset(key) {
    if (DEFAULTS[key] !== undefined) {
      return set(key, DEFAULTS[key]);
    }
    return new Promise((resolve) => {
      chrome.storage.sync.remove(key, () => {
        resolve();
      });
    });
  }

  /**
   * Resets all settings to defaults.
   * @returns {Promise<void>}
   */
  async function resetAll() {
    return new Promise((resolve) => {
      chrome.storage.sync.clear(() => {
        chrome.storage.sync.set(DEFAULTS, () => {
          resolve();
        });
      });
    });
  }

  /**
   * Listens for setting changes and calls the callback.
   * @param {Function} callback - Called with (key, newValue, oldValue)
   */
  function onChange(callback) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync') {
        for (const [key, { oldValue, newValue }] of Object.entries(changes)) {
          callback(key, newValue, oldValue);
        }
      }
    });
  }

  // --- Public API ---
  return {
    DEFAULTS,
    get,
    getMultiple,
    getAll,
    set,
    setMultiple,
    reset,
    resetAll,
    onChange
  };

})();