/**
 * SF Flow Utility Toolkit - AI Prompt Library
 *
 * Unified API over the shipped default prompts (AIPromptTemplates) and
 * any user-created custom prompts stored in chrome.storage.local.
 *
 * This module is the primary surface for any consumer that needs to
 * list, assemble, or manage prompts. Consumers should prefer this over
 * calling AIPromptTemplates directly, because only this module is aware
 * of:
 *   - Which standard prompts the user has disabled
 *   - The user's custom prompt library
 *   - The currently-selected default prompt
 *
 * Storage keys (chrome.storage.local):
 *   aiPromptLibrary.disabledStandardIds  array<string>
 *   aiPromptLibrary.customPrompts        array<CustomPrompt>
 *   aiPromptLibrary.defaultPromptId      string — the prompt the user
 *                                         has starred as default. May
 *                                         point at a standard or custom
 *                                         prompt. _resolveDefault() falls
 *                                         back gracefully if this id
 *                                         refers to something disabled
 *                                         or deleted.
 *   aiPromptLibrary.migratedFromSync     boolean — sentinel set once the
 *                                         one-time migration of the old
 *                                         `aiAssistant.defaultTemplate`
 *                                         sync key has completed.
 *
 * Returned prompt shape (from getAll / getById / etc.):
 *   id                 string
 *   title              string
 *   description        string
 *   prompt             string
 *   category           string (one of getCategories())
 *   contexts           array<string> (currently always ['flow-canvas'])
 *   enabled            boolean (computed at read-time)
 *   _type              'standard' | 'custom'
 *   _isFallbackDefault boolean (standards only)
 *   createdAt          string (ISO, customs only)
 *   modifiedAt         string (ISO, customs only)
 */

const AIPromptLibrary = (() => {

  const STORAGE_KEY_DISABLED  = 'aiPromptLibrary.disabledStandardIds';
  const STORAGE_KEY_CUSTOMS   = 'aiPromptLibrary.customPrompts';
  const STORAGE_KEY_DEFAULT   = 'aiPromptLibrary.defaultPromptId';
  const STORAGE_KEY_MIGRATED  = 'aiPromptLibrary.migratedFromSync';

  // Legacy key in chrome.storage.sync that v1.0 used for the default prompt.
  // We migrate its value into STORAGE_KEY_DEFAULT once, then delete it.
  const LEGACY_SYNC_KEY_DEFAULT = 'aiAssistant.defaultTemplate';

  const CUSTOM_ID_PREFIX      = 'custom_';
  const MAX_TITLE_LEN         = 100;
  const MAX_DESCRIPTION_LEN   = 500;
  const MAX_PROMPT_LEN        = 50000;

  // Predefined categories. Users request additions via GitHub.
  const CATEGORIES = Object.freeze([
    'Documentation',
    'Debugging',
    'Analysis',
    'Optimization',
    'Diagramming',
    'Testing',
    'Explanation'
  ]);

  // v1 of the contexts model: every prompt is Flow-Canvas-only.
  // When the AI Assistant expands into Setup or other surfaces, this
  // list will grow and the custom-prompt form will expose the field.
  const DEFAULT_CONTEXTS = Object.freeze(['flow-canvas']);

  // ===== Internal cache =====

  let _disabledIds = [];   // array<string>
  let _customs     = [];   // array<CustomPrompt>
  let _defaultId   = null; // string | null
  let _loaded      = false;

  // ===== Loading =====

  /**
   * Reads library state from storage into the in-memory cache.
   * Safe to call repeatedly; subsequent calls are idempotent until
   * storage changes invalidate the cache.
   * @returns {Promise<void>}
   */
  async function load() {
    if (_loaded) return;
    await _migrateFromSyncIfNeeded();
    await _readFromStorage();
    _loaded = true;
  }

  /**
   * Forces a fresh read from storage. Primarily used by the storage
   * change listener below so in-flight writes do not race with reads.
   * @returns {Promise<void>}
   */
  async function reload() {
    _loaded = false;
    await load();
  }

  function _readFromStorage() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        [STORAGE_KEY_DISABLED, STORAGE_KEY_CUSTOMS, STORAGE_KEY_DEFAULT],
        (result) => {
          _disabledIds = Array.isArray(result[STORAGE_KEY_DISABLED])
            ? result[STORAGE_KEY_DISABLED].slice()
            : [];
          _customs = Array.isArray(result[STORAGE_KEY_CUSTOMS])
            ? result[STORAGE_KEY_CUSTOMS].map(_normaliseCustom).filter(Boolean)
            : [];
          _defaultId = typeof result[STORAGE_KEY_DEFAULT] === 'string'
            ? result[STORAGE_KEY_DEFAULT]
            : null;
          resolve();
        }
      );
    });
  }

  /**
   * One-time migration of the legacy `aiAssistant.defaultTemplate` key
   * (chrome.storage.sync) into `aiPromptLibrary.defaultPromptId`
   * (chrome.storage.local). Runs at most once — a flag in local storage
   * records completion so the migration is skipped on every subsequent
   * load, including across browser restarts and extension updates.
   *
   * Safe to run even when the legacy key never existed (e.g. fresh
   * installs): the read comes back empty and nothing is written.
   *
   * The new key is only populated if the caller hasn't already set one
   * directly — we never overwrite an explicit newer choice.
   */
  async function _migrateFromSyncIfNeeded() {
    if (typeof chrome === 'undefined' || !chrome.storage) return;

    // Has the migration already run?
    const local = await new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY_MIGRATED, STORAGE_KEY_DEFAULT], resolve);
    });
    if (local[STORAGE_KEY_MIGRATED]) return;

    // Read the legacy sync value (may be undefined on fresh installs).
    const sync = await new Promise((resolve) => {
      chrome.storage.sync.get(LEGACY_SYNC_KEY_DEFAULT, resolve);
    });
    const legacyDefault = sync[LEGACY_SYNC_KEY_DEFAULT];

    // Always set the migrated flag. Only port the default if a legacy
    // value existed and the new key hasn't already been written.
    const updates = { [STORAGE_KEY_MIGRATED]: true };
    if (typeof legacyDefault === 'string' && legacyDefault && !local[STORAGE_KEY_DEFAULT]) {
      updates[STORAGE_KEY_DEFAULT] = legacyDefault;
    }

    await new Promise((resolve) => {
      chrome.storage.local.set(updates, resolve);
    });

    // Clean up the old sync key so it doesn't linger forever across
    // logged-in browsers. If this fails (e.g. quota, offline), the
    // migration is still considered complete — we won't try again.
    try {
      await new Promise((resolve, reject) => {
        chrome.storage.sync.remove(LEGACY_SYNC_KEY_DEFAULT, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
    } catch (err) {
      console.warn('[SFUT PromptLib] Legacy sync key removal failed:', err);
    }
  }

  function _writeDisabled() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY_DISABLED]: _disabledIds }, resolve);
    });
  }

  function _writeCustoms() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY_CUSTOMS]: _customs }, resolve);
    });
  }

  // ===== Read API =====

  /**
   * Returns the predefined category list.
   * @returns {ReadonlyArray<string>}
   */
  function getCategories() {
    return CATEGORIES;
  }

  /**
   * Returns all prompts (standards + customs) in display order,
   * each annotated with its runtime `enabled` state and `_type`.
   * @returns {Array<object>}
   */
  function getAll() {
    const standards = _getStandards();
    const customs = _getCustoms();
    return standards.concat(customs);
  }

  /**
   * Returns only the currently-enabled prompts. Consumers rendering
   * the AI Assistant dropdown should use this rather than getAll().
   * @returns {Array<object>}
   */
  function getEnabled() {
    return getAll().filter(p => p.enabled);
  }

  /**
   * Returns just the standard prompts with enabled state attached.
   * @returns {Array<object>}
   */
  function getStandardPrompts() {
    return _getStandards();
  }

  /**
   * Returns just the custom prompts.
   * @returns {Array<object>}
   */
  function getCustomPrompts() {
    return _getCustoms();
  }

  /**
   * Returns a single prompt by id, or null.
   * @param {string} id
   * @returns {object|null}
   */
  function getById(id) {
    if (!id) return null;
    return getAll().find(p => p.id === id) || null;
  }

  /**
   * Returns the current default prompt id (or the fallback if none set).
   * The returned id is guaranteed to resolve to an enabled prompt, unless
   * nothing is enabled (in which case the fallback is force-enabled as a
   * side effect — see _resolveDefault below).
   *
   * Consumers that actually need to run a prompt (e.g. the AI Assistant)
   * should use this. Consumers that need to reflect the user's stored
   * preference — such as the settings UI drawing star icons — should use
   * getStoredDefaultPromptId() instead.
   * @returns {string}
   */
  function getDefaultPromptId() {
    return _resolveDefault();
  }

  /**
   * Returns the raw stored default id without any resolution. Null if
   * the user has never picked a default. This is the right call for UI
   * code that needs to show "which prompt did the user star?" — it
   * preserves intent through temporary disables and deletes.
   * @returns {string|null}
   */
  function getStoredDefaultPromptId() {
    return _defaultId;
  }

  /**
   * Sets the default prompt id. Accepts any id known to the library.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async function setDefaultPromptId(id) {
    await load();
    const prompt = getById(id);
    if (!prompt) throw new Error(`Unknown prompt id: ${id}`);
    _defaultId = id;
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY_DEFAULT]: id }, resolve);
    });
  }

  /**
   * Assembles the full prompt text by concatenating the template's
   * instruction block with the supplied JSON metadata. Mirrors
   * AIPromptTemplates.assemble for drop-in replacement.
   * @param {string} id
   * @param {string} metadataJson
   * @returns {string|null}
   */
  function assemble(id, metadataJson) {
    const prompt = getById(id);
    if (!prompt) return null;
    return prompt.prompt + metadataJson;
  }

  // ===== Standard prompt actions =====

  /**
   * Enables or disables a standard prompt.
   * @param {string} id
   * @param {boolean} enabled
   * @returns {Promise<void>}
   */
  async function setStandardEnabled(id, enabled) {
    await load();
    if (!_isKnownStandardId(id)) {
      throw new Error(`Unknown standard prompt id: ${id}`);
    }

    const currentlyDisabled = _disabledIds.includes(id);
    if (enabled && currentlyDisabled) {
      _disabledIds = _disabledIds.filter(x => x !== id);
      await _writeDisabled();
    } else if (!enabled && !currentlyDisabled) {
      _disabledIds = _disabledIds.concat(id);
      await _writeDisabled();
    }
  }

  /**
   * Creates a new custom prompt from a clone of an existing standard
   * prompt. The clone gets a fresh custom_* id, a " (Custom)" title
   * suffix, and becomes enabled. The source standard is automatically
   * disabled so the clone "takes its place" — without this, the user
   * ends up with two near-identical prompts, which is rarely what they
   * want when the intent is to customise the source.
   * @param {string} standardId
   * @returns {Promise<object>} The newly created custom prompt.
   */
  async function cloneToCustom(standardId) {
    await load();
    const source = AIPromptTemplates.getById(standardId);
    if (!source) throw new Error(`Unknown standard prompt id: ${standardId}`);

    const now = new Date().toISOString();
    const custom = {
      id:          _generateCustomId(),
      title:       `${source.title} (Custom)`,
      description: source.description,
      prompt:      source.prompt,
      category:    source.category,
      contexts:    (source.contexts || DEFAULT_CONTEXTS).slice(),
      enabled:     true,
      createdAt:   now,
      modifiedAt:  now
    };

    _customs.push(custom);
    await _writeCustoms();
    await setStandardEnabled(standardId, false);

    return _shapeCustom(custom);
  }

  // ===== Custom prompt actions =====

  /**
   * Creates a new custom prompt.
   * @param {object} data - partial prompt; title, description, prompt, category required.
   * @returns {Promise<object>} The newly created prompt.
   */
  async function addCustom(data) {
    await load();

    const validation = validateCustomPrompt(data);
    if (!validation.valid) {
      throw new Error('Invalid custom prompt: ' + validation.errors.join('; '));
    }

    const now = new Date().toISOString();
    const custom = {
      id:          _generateCustomId(),
      title:       data.title.trim(),
      description: data.description.trim(),
      prompt:      data.prompt,
      category:    data.category,
      contexts:    _normaliseContexts(data.contexts),
      enabled:     data.enabled !== false,
      createdAt:   now,
      modifiedAt:  now
    };

    _customs.push(custom);
    await _writeCustoms();
    return _shapeCustom(custom);
  }

  /**
   * Updates an existing custom prompt.
   * @param {string} id
   * @param {object} updates - any subset of editable fields.
   * @returns {Promise<object>} The updated prompt.
   */
  async function updateCustom(id, updates) {
    await load();
    const index = _customs.findIndex(c => c.id === id);
    if (index === -1) throw new Error(`Unknown custom prompt id: ${id}`);

    const current = _customs[index];
    const merged = {
      ...current,
      title:       updates.title        !== undefined ? String(updates.title).trim()       : current.title,
      description: updates.description  !== undefined ? String(updates.description).trim() : current.description,
      prompt:      updates.prompt       !== undefined ? String(updates.prompt)             : current.prompt,
      category:    updates.category     !== undefined ? updates.category                   : current.category,
      contexts:    updates.contexts     !== undefined ? _normaliseContexts(updates.contexts) : current.contexts,
      enabled:     updates.enabled      !== undefined ? !!updates.enabled                  : current.enabled,
      modifiedAt:  new Date().toISOString()
    };

    const validation = validateCustomPrompt(merged);
    if (!validation.valid) {
      throw new Error('Invalid custom prompt: ' + validation.errors.join('; '));
    }

    _customs[index] = merged;
    await _writeCustoms();
    return _shapeCustom(merged);
  }

  /**
   * Deletes a custom prompt.
   * @param {string} id
   * @returns {Promise<boolean>} True if deleted, false if no such prompt.
   */
  async function deleteCustom(id) {
    await load();
    const before = _customs.length;
    _customs = _customs.filter(c => c.id !== id);
    if (_customs.length === before) return false;
    await _writeCustoms();

    // If this prompt was set as default, clear the default so
    // getDefaultPromptId() falls back correctly.
    if (_defaultId === id) {
      _defaultId = null;
      await new Promise((resolve) => {
        chrome.storage.local.remove(STORAGE_KEY_DEFAULT, resolve);
      });
    }
    return true;
  }

  // ===== Import / Export =====

  /**
   * Serialises the current custom prompt library to a JSON string.
   * @returns {string}
   */
  function exportCustomsAsJson() {
    const payload = {
      version:    1,
      exportedAt: new Date().toISOString(),
      prompts:    _customs.map(_stripInternalFields)
    };
    return JSON.stringify(payload, null, 2);
  }

  /**
   * Imports custom prompts from a JSON string.
   *
   * @param {string} jsonText
   * @param {object} [options]
   * @param {'skip'|'overwrite'|'copy'} [options.conflictMode='skip']
   *        How to handle prompts whose id matches an existing custom.
   * @param {boolean} [options.dryRun=false]
   *        If true, return the same result shape but do not persist
   *        changes to storage. Used by the settings UI to preview a
   *        file before asking the user to confirm.
   * @returns {Promise<{imported:object[], skipped:object[], overwritten:object[], copied:object[], errors:object[], fatal:string|null}>}
   */
  async function importCustoms(jsonText, options) {
    await load();
    const conflictMode = (options && options.conflictMode) || 'skip';
    const dryRun = !!(options && options.dryRun);

    const result = {
      imported:    [],
      skipped:     [],
      overwritten: [],
      copied:      [],
      errors:      [],
      fatal:       null
    };

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      result.fatal = 'File is not valid JSON: ' + e.message;
      return result;
    }

    const prompts = Array.isArray(parsed)
      ? parsed
      : (parsed && Array.isArray(parsed.prompts) ? parsed.prompts : null);

    if (!prompts) {
      result.fatal = 'Expected a JSON object with a "prompts" array, or a JSON array of prompts.';
      return result;
    }

    // We mutate a shallow copy of _customs so a mid-import failure
    // doesn't leave partial state.
    const working = _customs.slice();
    const now = new Date().toISOString();

    for (let i = 0; i < prompts.length; i++) {
      const raw = prompts[i];
      const label = (raw && raw.title) ? String(raw.title).slice(0, 60) : `item[${i}]`;

      const validation = validateCustomPrompt(raw);
      if (!validation.valid) {
        result.errors.push({ title: label, reasons: validation.errors });
        continue;
      }

      const candidate = {
        id:          (typeof raw.id === 'string' && raw.id.startsWith(CUSTOM_ID_PREFIX)) ? raw.id : _generateCustomId(),
        title:       String(raw.title).trim(),
        description: String(raw.description).trim(),
        prompt:      String(raw.prompt),
        category:    raw.category,
        contexts:    _normaliseContexts(raw.contexts),
        enabled:     raw.enabled !== false,
        createdAt:   typeof raw.createdAt === 'string' ? raw.createdAt : now,
        modifiedAt:  now
      };

      const conflictIndex = working.findIndex(c => c.id === candidate.id);

      if (conflictIndex === -1) {
        working.push(candidate);
        result.imported.push({ id: candidate.id, title: candidate.title });
        continue;
      }

      if (conflictMode === 'skip') {
        result.skipped.push({ id: candidate.id, title: candidate.title, reason: 'ID already exists' });
      } else if (conflictMode === 'overwrite') {
        working[conflictIndex] = candidate;
        result.overwritten.push({ id: candidate.id, title: candidate.title });
      } else if (conflictMode === 'copy') {
        candidate.id = _generateCustomId();
        working.push(candidate);
        result.copied.push({ id: candidate.id, title: candidate.title });
      } else {
        result.errors.push({ title: label, reasons: [`Unknown conflictMode: ${conflictMode}`] });
      }
    }

    if (!dryRun) {
      _customs = working;
      await _writeCustoms();
    }
    return result;
  }

  // ===== Validation =====

  /**
   * Validates a custom prompt shape. Returns a structured result rather
   * than throwing so the UI can show per-field errors.
   * @param {object} data
   * @returns {{valid:boolean, errors:string[]}}
   */
  function validateCustomPrompt(data) {
    const errors = [];
    if (!data || typeof data !== 'object') {
      return { valid: false, errors: ['Prompt must be an object.'] };
    }

    const title       = typeof data.title       === 'string' ? data.title.trim()       : '';
    const description = typeof data.description === 'string' ? data.description.trim() : '';
    const prompt      = typeof data.prompt      === 'string' ? data.prompt             : '';
    const category    = typeof data.category    === 'string' ? data.category           : '';

    if (!title)                      errors.push('Title is required.');
    else if (title.length > MAX_TITLE_LEN)
                                     errors.push(`Title must be ${MAX_TITLE_LEN} characters or fewer.`);

    if (!description)                errors.push('Description is required.');
    else if (description.length > MAX_DESCRIPTION_LEN)
                                     errors.push(`Description must be ${MAX_DESCRIPTION_LEN} characters or fewer.`);

    if (!prompt || !prompt.trim())   errors.push('Prompt text is required.');
    else if (prompt.length > MAX_PROMPT_LEN)
                                     errors.push(`Prompt must be ${MAX_PROMPT_LEN} characters or fewer.`);

    if (!category)                   errors.push('Category is required.');
    else if (!CATEGORIES.includes(category))
                                     errors.push(`Category must be one of: ${CATEGORIES.join(', ')}.`);

    if (data.id !== undefined && data.id !== null) {
      if (typeof data.id !== 'string' || !data.id.startsWith(CUSTOM_ID_PREFIX)) {
        errors.push(`Custom prompt id must be a string starting with "${CUSTOM_ID_PREFIX}".`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // ===== Internal helpers =====

  function _getStandards() {
    const standards = AIPromptTemplates.getAll();
    return standards.map(std => ({
      id:                 std.id,
      title:              std.title,
      description:        std.description,
      prompt:             std.prompt,
      category:           std.category || 'Documentation',
      contexts:           Array.isArray(std.contexts) ? std.contexts.slice() : DEFAULT_CONTEXTS.slice(),
      enabled:            !_disabledIds.includes(std.id),
      _type:              'standard',
      _isFallbackDefault: !!std.isFallbackDefault
    }));
  }

  function _getCustoms() {
    return _customs.map(_shapeCustom);
  }

  function _shapeCustom(custom) {
    return {
      id:          custom.id,
      title:       custom.title,
      description: custom.description,
      prompt:      custom.prompt,
      category:    custom.category,
      contexts:    custom.contexts.slice(),
      enabled:     custom.enabled !== false,
      createdAt:   custom.createdAt,
      modifiedAt:  custom.modifiedAt,
      _type:       'custom'
    };
  }

  /**
   * Strips fields that shouldn't appear in export JSON (none currently,
   * but this lets us evolve the wire format independently of storage).
   */
  function _stripInternalFields(custom) {
    return {
      id:          custom.id,
      title:       custom.title,
      description: custom.description,
      prompt:      custom.prompt,
      category:    custom.category,
      contexts:    custom.contexts.slice(),
      enabled:     custom.enabled !== false,
      createdAt:   custom.createdAt,
      modifiedAt:  custom.modifiedAt
    };
  }

  /**
   * Validates and tidies a raw custom prompt read from storage.
   * Returns null if the entry is unsalvageable, which protects the UI
   * from corrupt storage state.
   */
  function _normaliseCustom(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (typeof raw.id !== 'string' || !raw.id.startsWith(CUSTOM_ID_PREFIX)) return null;
    if (typeof raw.title !== 'string' || !raw.title.trim()) return null;
    if (typeof raw.prompt !== 'string' || !raw.prompt) return null;

    return {
      id:          raw.id,
      title:       raw.title.trim(),
      description: typeof raw.description === 'string' ? raw.description.trim() : '',
      prompt:      raw.prompt,
      category:    CATEGORIES.includes(raw.category) ? raw.category : 'Documentation',
      contexts:    _normaliseContexts(raw.contexts),
      enabled:     raw.enabled !== false,
      createdAt:   typeof raw.createdAt  === 'string' ? raw.createdAt  : new Date().toISOString(),
      modifiedAt:  typeof raw.modifiedAt === 'string' ? raw.modifiedAt : new Date().toISOString()
    };
  }

  function _normaliseContexts(contexts) {
    if (!Array.isArray(contexts) || contexts.length === 0) {
      return DEFAULT_CONTEXTS.slice();
    }
    return contexts.filter(c => typeof c === 'string' && c);
  }

  function _isKnownStandardId(id) {
    return !!AIPromptTemplates.getById(id);
  }

  /**
   * Resolves the current default prompt id.
   *
   * Precedence:
   *   1. Stored defaultId IF it resolves to an enabled prompt.
   *   2. First enabled prompt in array order.
   *   3. The fallback-default standard (force-enable it if disabled).
   */
  function _resolveDefault() {
    const all = getAll();

    if (_defaultId) {
      const current = all.find(p => p.id === _defaultId);
      if (current && current.enabled) return current.id;
    }

    const firstEnabled = all.find(p => p.enabled);
    if (firstEnabled) return firstEnabled.id;

    // Nothing enabled. Re-enable the fallback-default standard so the
    // AI Assistant never opens with zero options. This is a self-heal.
    const fallback = AIPromptTemplates.getAll().find(t => t.isFallbackDefault)
                  || AIPromptTemplates.getAll()[0];
    if (fallback) {
      _disabledIds = _disabledIds.filter(x => x !== fallback.id);
      _writeDisabled();
      return fallback.id;
    }

    return null;
  }

  function _generateCustomId() {
    // 8 hex chars via crypto so collisions are effectively impossible.
    const bytes = new Uint8Array(4);
    (crypto || self.crypto).getRandomValues(bytes);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return CUSTOM_ID_PREFIX + hex;
  }

  // ===== Storage change listener =====

  /**
   * When storage is updated from another context (e.g. the user edits a
   * custom prompt in the settings page while Flow Builder is open in
   * another tab), invalidate our cache so the next read picks up the
   * change without requiring a refresh.
   */
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace !== 'local') return;
      const relevant = Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY_DISABLED)
                    || Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY_CUSTOMS)
                    || Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY_DEFAULT);
      if (!relevant) return;

      reload().catch(err => {
        console.warn('[SFUT PromptLib] Failed to reload after storage change:', err);
      });
    });
  }

  // --- Public API ---
  return {
    load,
    reload,

    getCategories,
    getAll,
    getEnabled,
    getStandardPrompts,
    getCustomPrompts,
    getById,
    getDefaultPromptId,
    getStoredDefaultPromptId,
    setDefaultPromptId,
    assemble,

    setStandardEnabled,
    cloneToCustom,
    addCustom,
    updateCustom,
    deleteCustom,

    exportCustomsAsJson,
    importCustoms,
    validateCustomPrompt
  };

})();
