/**
 * SF Flow Utility Toolkit - Settings Page Script
 *
 * Handles:
 *   - Tab navigation between General / AI Prompts / API Name Prefixes / About
 *   - Loading settings from Chrome storage and binding them to UI controls
 *   - Auto-saving changes on interaction
 *   - The Custom Prefix Configuration download / upload / reset flow
 *   - Populating the About tab from the manifest
 */

(function () {

  const DEFAULTS = {
    // Feature toggles — default off (user must enable)
    'setupTabs.enabled': false,
    'setupTabs.automationHome.enabled': false,
    'setupTabs.groupingEnabled': false,
    'missingDescriptions.enabled': true,

    // Feature toggles — default on (user can disable)
    'apiNameGenerator.enabled': true,
    'flowListSearch.enabled': true,
    'canvasSearch.enabled': true,
    'flowAIAssistant.enabled': true,
    'flowHealthCheck.enabled': true,
    'comparisonExporter.enabled': true,
    'flowVersionManager.enabled': true,
    'flowTriggerExplorerEnhancer.enabled': true,
    'scheduledFlowExplorer.enabled': true,
    'keyboardShortcuts.enabled': true,

    // Other settings
    'canvasSearch.shortcut': 'Ctrl+Shift+F',
    'canvasSearch.highlightColour': '#FFD700',
    'apiNameGenerator.namingPattern': 'Snake_Case',
    'apiNameGenerator.flowRegex': null,
    'flowHealthCheck.namingConventions.flow': null,
    'scheduledFlowExplorer.defaultView': 'list'
  };

  /**
   * Key in chrome.storage.local used to remember the last-viewed settings tab
   * so the page opens on the same tab the user was last on.
   */
  const ACTIVE_TAB_STORAGE_KEY = 'settings.activeTab';
  const DEFAULT_TAB = 'general';

  // ===== Tab navigation =====

  /**
   * Initialises the settings tab navigation.
   * Restores the previously active tab from storage, wires up click and
   * keyboard handlers, and saves the active tab whenever it changes.
   */
  function initTabs() {
    const tabs = Array.from(document.querySelectorAll('.settings-tab'));
    const panels = Array.from(document.querySelectorAll('.settings-tab-panel'));

    if (tabs.length === 0 || panels.length === 0) return;

    // Restore previously active tab (if any).
    chrome.storage.local.get(ACTIVE_TAB_STORAGE_KEY, (result) => {
      const savedTab = result[ACTIVE_TAB_STORAGE_KEY];
      const tabToActivate = _isValidTab(savedTab, tabs) ? savedTab : DEFAULT_TAB;
      _activateTab(tabToActivate, tabs, panels);
    });

    // Click to switch.
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        _activateTab(tabName, tabs, panels);
        chrome.storage.local.set({ [ACTIVE_TAB_STORAGE_KEY]: tabName });
      });
    });

    // Arrow-key navigation along the tablist for accessibility.
    tabs.forEach((tab) => {
      tab.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' &&
            e.key !== 'Home' && e.key !== 'End') {
          return;
        }
        e.preventDefault();

        const currentIndex = tabs.indexOf(tab);
        let nextIndex = currentIndex;

        if (e.key === 'ArrowRight') {
          nextIndex = (currentIndex + 1) % tabs.length;
        } else if (e.key === 'ArrowLeft') {
          nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        } else if (e.key === 'Home') {
          nextIndex = 0;
        } else if (e.key === 'End') {
          nextIndex = tabs.length - 1;
        }

        const nextTab = tabs[nextIndex];
        nextTab.focus();
        _activateTab(nextTab.dataset.tab, tabs, panels);
        chrome.storage.local.set({ [ACTIVE_TAB_STORAGE_KEY]: nextTab.dataset.tab });
      });
    });
  }

  /**
   * Activates the tab with the given name and shows its matching panel,
   * deactivating all other tabs/panels.
   * @param {string} tabName
   * @param {HTMLElement[]} tabs
   * @param {HTMLElement[]} panels
   */
  function _activateTab(tabName, tabs, panels) {
    tabs.forEach((t) => {
      const isActive = t.dataset.tab === tabName;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', String(isActive));
      t.tabIndex = isActive ? 0 : -1;
    });

    panels.forEach((p) => {
      const isActive = p.dataset.tabPanel === tabName;
      p.classList.toggle('active', isActive);
      p.hidden = !isActive;
    });
  }

  /**
   * Returns true if the given tab name corresponds to one of the rendered tabs.
   * @param {string} tabName
   * @param {HTMLElement[]} tabs
   * @returns {boolean}
   */
  function _isValidTab(tabName, tabs) {
    if (!tabName || typeof tabName !== 'string') return false;
    return tabs.some((t) => t.dataset.tab === tabName);
  }

  // ===== Settings load / save =====

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
      _setToggle('setting-apiNameGenerator', settings['apiNameGenerator.enabled']);
      _setToggle('setting-flowListSearch', settings['flowListSearch.enabled']);
      _setToggle('setting-canvasSearchEnabled', settings['canvasSearch.enabled']);
      _setToggle('setting-flowAIAssistant', settings['flowAIAssistant.enabled']);
      _setToggle('setting-flowHealthCheck', settings['flowHealthCheck.enabled']);
      _setToggle('setting-comparisonExporter', settings['comparisonExporter.enabled']);
      _setToggle('setting-flowVersionManager', settings['flowVersionManager.enabled']);
      _setToggle('setting-flowTriggerExplorerEnhancer', settings['flowTriggerExplorerEnhancer.enabled']);
      _setToggle('setting-scheduledFlowExplorer', settings['scheduledFlowExplorer.enabled']);
      _setToggle('setting-whereIsThisUsed', settings['whereIsThisUsed.enabled']);
      _setToggle('setting-unusedResources', settings['unusedResources.enabled']);
      _setToggle('setting-autosave', settings['autosave.enabled']);
      _setToggle('setting-keyboardShortcuts', settings['keyboardShortcuts.enabled']);

      // Populate inputs
      _setInput('setting-shortcut', settings['canvasSearch.shortcut']);
      _setInput('setting-highlightColour', settings['canvasSearch.highlightColour']);
      _setInput('setting-autosaveInterval', settings['autosave.intervalMinutes']);

      // Populate selects
      _setSelect('setting-namingPattern', settings['apiNameGenerator.namingPattern']);
      _setSelect('setting-scheduledFlowExplorerDefaultView', settings['scheduledFlowExplorer.defaultView']);
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

    // Number inputs (e.g. autosave interval)
    document.querySelectorAll('input[type="number"][data-key]').forEach((numInput) => {
      numInput.addEventListener('change', () => {
        const min = parseInt(numInput.min, 10) || 1;
        const max = parseInt(numInput.max, 10) || 9999;
        let val = parseInt(numInput.value, 10);
        if (isNaN(val) || val < min) val = min;
        if (val > max) val = max;
        numInput.value = val;
        _saveSetting(numInput.dataset.key, val);
      });
    });

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
    // Show reload notice when feature toggles change (not colour/shortcut settings)
    const _featureKeys = [
      'apiNameGenerator.enabled','flowListSearch.enabled','canvasSearch.enabled',
      'flowAIAssistant.enabled','flowHealthCheck.enabled','comparisonExporter.enabled',
      'flowVersionManager.enabled','flowTriggerExplorerEnhancer.enabled','scheduledFlowExplorer.enabled',
      'autosave.enabled','whereIsThisUsed.enabled','unusedResources.enabled',
      'keyboardShortcuts.enabled'
    ];
    if (_featureKeys.includes(key)) {
      const notice = document.getElementById('feature-reload-notice');
      if (notice) notice.hidden = false;
    }

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

  // ===== Prefix tables =====

  /**
   * Table definitions: id matches the "table" field in default-prefixes.json
   * and the container element IDs in settings.html.
   */
  const PREFIX_TABLES = [
    { id: 'flowApi',  label: 'Flow API Prefixes' },
    { id: 'element',  label: 'Element Prefixes' },
    { id: 'variable', label: 'Variable & Collection Prefixes' },
    { id: 'formula',  label: 'Formula Prefixes' },
    { id: 'resource', label: 'Resource Prefixes' },
  ];

  // Per-table sort state: 'default' | 'asc' | 'desc'
  const _tableSortState = {};
  PREFIX_TABLES.forEach(t => { _tableSortState[t.id] = 'default'; });

  // Tracks which row (by type string) is currently open for editing, per table.
  const _editingRow = {};   // { [tableId]: typeName | null }
  PREFIX_TABLES.forEach(t => { _editingRow[t.id] = null; });

  /**
   * Entry point: loads prefixes, renders all five tables, wires up global buttons.
   */
  async function initPrefixConfig() {
    try {
      await APINamePrefixes.load();
    } catch (err) {
      console.warn('[SFUT Settings] Failed to load prefix config:', err);
    }

    PREFIX_TABLES.forEach(t => _renderPrefixTable(t.id));
    _updatePrefixStatus();
    _attachGlobalPrefixListeners();

    // React to storage changes from other contexts (e.g. another settings page
    // instance, or the api-name-prefixes.js live-reload).
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;
        if (!Object.prototype.hasOwnProperty.call(changes, 'apiNameGenerator.prefixOverrides')) return;
        // Re-render after the module has had time to reload.
        setTimeout(() => {
          PREFIX_TABLES.forEach(t => _renderPrefixTable(t.id));
          _updatePrefixStatus();
        }, 120);
      });
    }
  }

  // ----- Table rendering -----

  /**
   * Builds or rebuilds the table for a given tableId from current prefix data.
   * Preserves the sort state and closes any open edit row.
   * @param {string} tableId
   */
  function _renderPrefixTable(tableId) {
    const container = document.getElementById(`prefix-table-${tableId}`);
    if (!container) return;

    _editingRow[tableId] = null;

    const allPrefixes = APINamePrefixes.getAll().filter(p => p.table === tableId);
    const sorted = _sortedPrefixes(allPrefixes, tableId);
    const sortState = _tableSortState[tableId];

    const table = document.createElement('table');
    table.className = 'prefix-table';

    // --- thead ---
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const headers = [
      { key: 'type',       label: 'Type',       sortable: true  },
      { key: 'master',     label: 'Master',      sortable: false },
      { key: 'Snake_Case', label: 'Snake_Case',  sortable: false },
      { key: 'PascalCase', label: 'PascalCase',  sortable: false },
      { key: 'camelCase',  label: 'camelCase',   sortable: false },
      { key: 'actions',    label: '',            sortable: false },
    ];

    headers.forEach(h => {
      const th = document.createElement('th');
      th.className = `col-${h.key}`;

      if (h.sortable) {
        th.classList.add('col-sortable');
        const indicator = document.createElement('span');
        indicator.className = 'sort-indicator';

        if (sortState === 'asc')  { th.classList.add('sort-asc');  indicator.textContent = ' ▲'; }
        if (sortState === 'desc') { th.classList.add('sort-desc'); indicator.textContent = ' ▼'; }
        if (sortState === 'default') { indicator.textContent = ' ⇅'; }

        th.textContent = h.label;
        th.appendChild(indicator);

        th.addEventListener('click', () => _handleSortClick(tableId));
      } else {
        th.textContent = h.label;
      }

      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // --- tbody ---
    const tbody = document.createElement('tbody');

    sorted.forEach(entry => {
      const isCustom = APINamePrefixes.hasOverride(entry.type);
      const master = entry.PascalCase; // PascalCase IS the master

      const tr = document.createElement('tr');
      tr.dataset.type = entry.type;
      if (isCustom) tr.classList.add('is-custom');

      // Type cell
      const tdType = document.createElement('td');
      tdType.className = 'col-type';
      tdType.textContent = entry.type;
      if (isCustom) {
        const dot = document.createElement('span');
        dot.className = 'prefix-custom-dot';
        dot.title = 'Custom override active';
        tdType.appendChild(dot);
      }
      tr.appendChild(tdType);

      // Master cell
      const tdMaster = document.createElement('td');
      tdMaster.className = 'col-master';
      tdMaster.textContent = master;
      tr.appendChild(tdMaster);

      // Snake_Case cell
      const tdSnake = document.createElement('td');
      tdSnake.className = 'col-snake';
      tdSnake.textContent = entry.Snake_Case;
      tr.appendChild(tdSnake);

      // PascalCase cell
      const tdPascal = document.createElement('td');
      tdPascal.className = 'col-pascal';
      tdPascal.textContent = entry.PascalCase;
      tr.appendChild(tdPascal);

      // camelCase cell
      const tdCamel = document.createElement('td');
      tdCamel.className = 'col-camel';
      tdCamel.textContent = entry.camelCase;
      tr.appendChild(tdCamel);

      // Actions cell
      const tdActions = document.createElement('td');
      tdActions.className = 'col-actions';

      const actions = document.createElement('div');
      actions.className = 'prefix-row-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'prefix-row-btn btn-edit';
      editBtn.title = 'Edit this prefix';
      editBtn.textContent = '✎';
      editBtn.addEventListener('click', () => _startRowEdit(tableId, entry.type));
      actions.appendChild(editBtn);

      if (isCustom) {
        const revertBtn = document.createElement('button');
        revertBtn.type = 'button';
        revertBtn.className = 'prefix-row-btn btn-revert';
        revertBtn.title = 'Revert to default';
        revertBtn.textContent = '↺';
        revertBtn.addEventListener('click', () => _handleRevertRow(tableId, entry.type));
        actions.appendChild(revertBtn);
      }

      tdActions.appendChild(actions);
      tr.appendChild(tdActions);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);

    _updateTableResetButton(tableId);
    _updateDirtyBanner();
  }

  /**
   * Returns prefixes for a table sorted according to the current sort state.
   * @param {Array} prefixes
   * @param {string} tableId
   */
  function _sortedPrefixes(prefixes, tableId) {
    const state = _tableSortState[tableId];
    if (state === 'default') return prefixes;
    return [...prefixes].sort((a, b) => {
      const cmp = a.type.localeCompare(b.type);
      return state === 'asc' ? cmp : -cmp;
    });
  }

  /**
   * Cycles sort state: default → asc → desc → default, then re-renders.
   * @param {string} tableId
   */
  function _handleSortClick(tableId) {
    const current = _tableSortState[tableId];
    _tableSortState[tableId] = current === 'default' ? 'asc'
                             : current === 'asc'     ? 'desc'
                             :                         'default';
    _renderPrefixTable(tableId);
  }

  // ----- Inline row editing -----

  /**
   * Converts a table row to edit mode.
   * @param {string} tableId
   * @param {string} type
   */
  function _startRowEdit(tableId, type) {
    // Cancel any open edit in this table first
    if (_editingRow[tableId]) {
      _cancelRowEdit(tableId, _editingRow[tableId]);
    }

    _editingRow[tableId] = type;

    const container = document.getElementById(`prefix-table-${tableId}`);
    if (!container) return;

    const tr = container.querySelector(`tr[data-type="${CSS.escape(type)}"]`);
    if (!tr) return;

    const entry = APINamePrefixes.getAll().find(p => p.type === type);
    if (!entry) return;

    tr.classList.add('is-editing');

    // Replace cell contents with inputs
    const master = entry.PascalCase;

    // Master input
    tr.children[1].innerHTML = '';
    const masterInput = _buildEditInput('master', master, type, tableId);
    masterInput.id = `prefix-input-master-${_safeId(type)}`;
    tr.children[1].appendChild(masterInput);

    // Snake_Case input
    tr.children[2].innerHTML = '';
    const snakeInput = _buildEditInput('snake', entry.Snake_Case, type, tableId);
    snakeInput.id = `prefix-input-snake-${_safeId(type)}`;
    tr.children[2].appendChild(snakeInput);

    // PascalCase input
    tr.children[3].innerHTML = '';
    const pascalInput = _buildEditInput('pascal', entry.PascalCase, type, tableId);
    pascalInput.id = `prefix-input-pascal-${_safeId(type)}`;
    tr.children[3].appendChild(pascalInput);

    // camelCase input
    tr.children[4].innerHTML = '';
    const camelInput = _buildEditInput('camel', entry.camelCase, type, tableId);
    camelInput.id = `prefix-input-camel-${_safeId(type)}`;
    tr.children[4].appendChild(camelInput);

    // Master input drives all three when edited
    masterInput.addEventListener('input', () => {
      const m = masterInput.value.trim();
      snakeInput.value  = m ? `${m}_` : '';
      pascalInput.value = m;
      camelInput.value  = m ? `${m[0].toLowerCase()}${m.slice(1)}` : '';
      _clearInputError(snakeInput);
      _clearInputError(pascalInput);
      _clearInputError(camelInput);
    });

    // Actions cell: Save + Cancel
    tr.children[5].innerHTML = '';
    const actions = document.createElement('div');
    actions.className = 'prefix-row-actions';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'prefix-row-btn btn-save';
    saveBtn.title = 'Save changes';
    saveBtn.textContent = '✔ Save';
    saveBtn.addEventListener('click', () => _saveRowEdit(tableId, type));
    actions.appendChild(saveBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'prefix-row-btn btn-cancel';
    cancelBtn.title = 'Cancel edit';
    cancelBtn.textContent = '✕';
    cancelBtn.addEventListener('click', () => _cancelRowEdit(tableId, type));
    actions.appendChild(cancelBtn);

    tr.children[5].appendChild(actions);

    _updateDirtyBanner();
    masterInput.focus();
    masterInput.select();
  }

  /**
   * Cancels an in-progress row edit and re-renders the table.
   * @param {string} tableId
   * @param {string} type
   */
  function _cancelRowEdit(tableId, type) {
    _editingRow[tableId] = null;
    _renderPrefixTable(tableId);
  }

  /**
   * Validates and persists the edited row values.
   * @param {string} tableId
   * @param {string} type
   */
  async function _saveRowEdit(tableId, type) {
    const safeType = _safeId(type);
    const snakeEl  = document.getElementById(`prefix-input-snake-${safeType}`);
    const pascalEl = document.getElementById(`prefix-input-pascal-${safeType}`);
    const camelEl  = document.getElementById(`prefix-input-camel-${safeType}`);

    if (!snakeEl || !pascalEl || !camelEl) return;

    const snake  = snakeEl.value.trim();
    const pascal = pascalEl.value.trim();
    const camel  = camelEl.value.trim();

    // Per-case validation
    let valid = true;
    if (!_validateSnake(snake))  { _setInputError(snakeEl,  'Must be alphanumeric and end with _'); valid = false; }
    if (!_validatePascal(pascal)) { _setInputError(pascalEl, 'Must start with an uppercase letter'); valid = false; }
    if (!_validateCamel(camel))  { _setInputError(camelEl,  'Must start with a lowercase letter'); valid = false; }
    if (!valid) return;

    // Check whether values actually differ from the default
    const def = APINamePrefixes.getDefaults().find(d => d.type === type);
    const isUnchanged = def
      && snake  === def.Snake_Case
      && pascal === def.PascalCase
      && camel  === def.camelCase;

    if (isUnchanged) {
      // Values match the default — remove any existing override instead of saving
      await APINamePrefixes.resetRow(type);
    } else {
      await APINamePrefixes.saveRowOverride(type, { Snake_Case: snake, PascalCase: pascal, camelCase: camel });
    }

    _editingRow[tableId] = null;
    _renderPrefixTable(tableId);
    _updatePrefixStatus();

    const overrideCount = Object.keys(APINamePrefixes.getOverrides()).length;
    _showSaveToast(isUnchanged
      ? `${type}: reverted to default`
      : `${type}: prefix saved (${overrideCount} override${overrideCount !== 1 ? 's' : ''} active)`
    );
  }

  /**
   * Reverts a single row to its default and re-renders.
   * @param {string} tableId
   * @param {string} type
   */
  async function _handleRevertRow(tableId, type) {
    await APINamePrefixes.resetRow(type);
    _renderPrefixTable(tableId);
    _updatePrefixStatus();
    _showSaveToast(`${type}: reverted to default`);
  }

  // ----- Validation helpers -----

  /** Snake_Case: alphanumeric + underscores, must end with _ */
  function _validateSnake(val) {
    return val.length > 0 && /^[A-Za-z][A-Za-z0-9_]*_$/.test(val);
  }

  /** PascalCase: starts with uppercase letter, alphanumeric only */
  function _validatePascal(val) {
    return val.length > 0 && /^[A-Z][A-Za-z0-9]*$/.test(val);
  }

  /** camelCase: starts with lowercase letter, alphanumeric only */
  function _validateCamel(val) {
    return val.length > 0 && /^[a-z][A-Za-z0-9]*$/.test(val);
  }

  function _setInputError(input, message) {
    input.classList.add('is-error');
    let msg = input.nextElementSibling;
    if (!msg || !msg.classList.contains('prefix-error-msg')) {
      msg = document.createElement('div');
      msg.className = 'prefix-error-msg';
      input.parentNode.insertBefore(msg, input.nextSibling);
    }
    msg.textContent = message;
  }

  function _clearInputError(input) {
    input.classList.remove('is-error');
    const msg = input.nextElementSibling;
    if (msg && msg.classList.contains('prefix-error-msg')) {
      msg.remove();
    }
  }

  function _buildEditInput(colKey, value, type, tableId) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'prefix-edit-input';
    input.value = value;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')  _saveRowEdit(tableId, type);
      if (e.key === 'Escape') _cancelRowEdit(tableId, type);
    });
    // Per-column live validation (except master which drives the others)
    if (colKey === 'snake') {
      input.addEventListener('input', () => {
        if (_validateSnake(input.value.trim())) _clearInputError(input);
      });
    } else if (colKey === 'pascal') {
      input.addEventListener('input', () => {
        if (_validatePascal(input.value.trim())) _clearInputError(input);
      });
    } else if (colKey === 'camel') {
      input.addEventListener('input', () => {
        if (_validateCamel(input.value.trim())) _clearInputError(input);
      });
    }
    return input;
  }

  /** Converts a type string to a safe DOM id fragment. */
  function _safeId(type) {
    return type.replace(/[^A-Za-z0-9]/g, '_');
  }

  // ----- Status + button state -----

  /**
   * Updates the "Currently using" status line and the Reset All button visibility.
   */
  function _updatePrefixStatus() {
    const statusEl  = document.getElementById('prefix-status-value');
    const resetAll  = document.getElementById('prefix-reset-all-btn');

    if (!statusEl) return;

    const isCustom = APINamePrefixes.isCustom();
    const overrides = Object.keys(APINamePrefixes.getOverrides()).length;

    if (isCustom) {
      statusEl.textContent = `Custom (${overrides} override${overrides !== 1 ? 's' : ''} active)`;
      statusEl.classList.add('is-custom');
      if (resetAll) resetAll.hidden = false;
    } else {
      statusEl.textContent = `Default prefixes`;
      statusEl.classList.remove('is-custom');
      if (resetAll) resetAll.hidden = true;
    }
  }

  /**
   * Shows or hides the per-table reset button based on whether that table
   * has any active overrides.
   * @param {string} tableId
   */
  function _updateTableResetButton(tableId) {
    const btn = document.getElementById(`prefix-reset-table-${tableId}`);
    if (!btn) return;
    const tableHasOverrides = APINamePrefixes.getAll()
      .filter(p => p.table === tableId)
      .some(p => APINamePrefixes.hasOverride(p.type));
    btn.hidden = !tableHasOverrides;
  }

  /**
   * Shows the dirty banner if any table has an open edit row.
   */
  function _updateDirtyBanner() {
    const banner = document.getElementById('prefix-dirty-banner');
    if (!banner) return;
    const anyDirty = Object.values(_editingRow).some(v => v !== null);
    banner.hidden = !anyDirty;
  }

  // ----- Global button listeners -----

  function _attachGlobalPrefixListeners() {
    // Per-table reset buttons
    PREFIX_TABLES.forEach(t => {
      const btn = document.getElementById(`prefix-reset-table-${t.id}`);
      if (btn) {
        btn.addEventListener('click', () => _handleTableReset(t.id, t.label));
      }
    });

    // Download
    const downloadBtn = document.getElementById('prefix-download-btn');
    if (downloadBtn) downloadBtn.addEventListener('click', _handlePrefixDownload);

    // Upload
    const uploadBtn  = document.getElementById('prefix-upload-btn');
    const fileInput  = document.getElementById('prefix-file-input');
    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', () => { fileInput.value = ''; fileInput.click(); });
      fileInput.addEventListener('change', _handlePrefixUpload);
    }

    // Reset All
    const resetAllBtn = document.getElementById('prefix-reset-all-btn');
    if (resetAllBtn) resetAllBtn.addEventListener('click', _handleResetAll);
  }

  /**
   * Resets all overrides for a single named table after confirmation.
   * @param {string} tableId
   * @param {string} tableLabel
   */
  async function _handleTableReset(tableId, tableLabel) {
    const confirmed = window.confirm(
      `Reset ${tableLabel} to defaults?\n\nAll custom overrides in this table will be cleared.`
    );
    if (!confirmed) return;

    try {
      await APINamePrefixes.resetTable(tableId);
      _renderPrefixTable(tableId);
      _updatePrefixStatus();
      _showSaveToast(`${tableLabel} reset to defaults`);
    } catch (err) {
      console.warn('[SFUT Settings] Table reset failed:', err);
      _showSaveToast('Reset failed', true);
    }
  }

  /**
   * Resets all overrides across every table after confirmation.
   */
  async function _handleResetAll() {
    const confirmed = window.confirm(
      'Reset all prefix tables to defaults?\n\nEvery custom prefix override across all five tables will be cleared. This cannot be undone.'
    );
    if (!confirmed) return;

    try {
      await APINamePrefixes.resetToDefaults();
      PREFIX_TABLES.forEach(t => _renderPrefixTable(t.id));
      _updatePrefixStatus();
      _showSaveToast('All prefixes reset to defaults');
    } catch (err) {
      console.warn('[SFUT Settings] Reset all failed:', err);
      _showSaveToast('Reset failed', true);
    }
  }

  /**
   * Downloads the full merged prefix configuration as a JSON file.
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
   * Handles the file picker change event for uploading a custom prefix config.
   * Imports the file and re-renders all tables to reflect the new overrides.
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
        PREFIX_TABLES.forEach(t => _renderPrefixTable(t.id));
        _updatePrefixStatus();
        _showSaveToast(`Imported from ${file.name} — ${result.count} override${result.count !== 1 ? 's' : ''} applied`);
      } else {
        _showSaveToast(`Import failed: ${result.error}`, true);
      }
    } catch (err) {
      console.warn('[SFUT Settings] Prefix import failed:', err);
      _showSaveToast(`Import failed: ${err.message || 'unknown error'}`, true);
    } finally {
      fileInput.value = '';
    }
  }

  // ===== About tab =====

  /**
   * Populates the About tab's dynamic fields (currently just version)
   * from the manifest so the number never drifts.
   */
  function initAboutTab() {
    const versionEl = document.getElementById('about-version');
    if (!versionEl) return;

    try {
      const manifest = chrome.runtime.getManifest();
      versionEl.textContent = `v${manifest.version}`;
    } catch (err) {
      console.warn('[SFUT Settings] Could not read manifest for About tab:', err);
      versionEl.textContent = '—';
    }
  }

  // ============================================================
  // ===== AI Prompts tab ========================================
  // ============================================================

  /**
   * State for the prompt form modal. When editingId is null the form
   * is in "create" mode; when set, it's editing the custom prompt with
   * that id.
   */
  const _promptForm = {
    editingId: null
  };

  /**
   * State for the import flow. pendingJson holds the raw file contents
   * between preview and commit so the user can confirm before we write.
   */
  const _import = {
    pendingJson: null,
    hasConflicts: false
  };

  /**
   * Initialises the AI Prompts tab — loads the library, renders both
   * lists, wires up the toolbar and modal event handlers, and watches
   * for storage changes so other tabs / contexts can trigger re-renders.
   */
  async function initAIPromptsTab() {
    try {
      await AIPromptLibrary.load();
    } catch (err) {
      console.warn('[SFUT Settings] Failed to load prompt library:', err);
    }

    _renderStandardPrompts();
    _renderCustomPrompts();
    _attachPromptToolbarListeners();
    _attachPromptFormModalListeners();
    _attachImportResultsModalListeners();
    _populatePromptFormCategories();

    // Re-render if library state changes from another context.
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;
        const relevant = ['aiPromptLibrary.disabledStandardIds',
                          'aiPromptLibrary.customPrompts',
                          'aiPromptLibrary.defaultPromptId']
          .some(k => Object.prototype.hasOwnProperty.call(changes, k));
        if (!relevant) return;

        // The library has its own listener that reloads cache; give it
        // a beat to finish so our reads see the new state.
        setTimeout(() => {
          _renderStandardPrompts();
          _renderCustomPrompts();
        }, 50);
      });
    }
  }

  // ----- Rendering -----

  function _renderStandardPrompts() {
    const container = document.getElementById('standard-prompts-list');
    if (!container) return;

    const standards = AIPromptLibrary.getStandardPrompts();
    container.innerHTML = '';
    standards.forEach(p => container.appendChild(_buildPromptRow(p, 'standard')));
  }

  function _renderCustomPrompts() {
    const container = document.getElementById('custom-prompts-list');
    if (!container) return;

    const customs = AIPromptLibrary.getCustomPrompts();
    container.innerHTML = '';

    if (customs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'prompts-empty-state';
      empty.innerHTML = 'You haven\'t created any custom prompts yet.<br>' +
                        'Click <strong>+ New Prompt</strong> to get started, ' +
                        'or <strong>Import JSON</strong> to load a shared library.';
      container.appendChild(empty);
      return;
    }

    customs.forEach(p => container.appendChild(_buildPromptRow(p, 'custom')));
  }

  /**
   * Builds a single prompt row. Type is 'standard' or 'custom' — controls
   * which action buttons appear and which toggle handler is wired up.
   * @param {object} prompt
   * @param {'standard'|'custom'} type
   * @returns {HTMLElement}
   */
  function _buildPromptRow(prompt, type) {
    const row = document.createElement('div');
    row.className = 'prompt-row';
    row.dataset.promptId = prompt.id;
    if (!prompt.enabled) row.classList.add('is-disabled');

    // Toggle
    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'toggle-switch';
    toggleLabel.title = prompt.enabled ? 'Active — click to deactivate' : 'Inactive — click to activate';

    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = !!prompt.enabled;
    toggleInput.addEventListener('change', () => {
      if (type === 'standard') {
        _handleStandardToggle(prompt.id, toggleInput.checked);
      } else {
        _handleCustomToggle(prompt.id, toggleInput.checked);
      }
    });

    const toggleSlider = document.createElement('span');
    toggleSlider.className = 'toggle-slider';

    toggleLabel.appendChild(toggleInput);
    toggleLabel.appendChild(toggleSlider);
    row.appendChild(toggleLabel);

    // Main (title, description, meta)
    const main = document.createElement('div');
    main.className = 'prompt-main';

    const title = document.createElement('div');
    title.className = 'prompt-title';
    title.textContent = prompt.title;
    main.appendChild(title);

    if (prompt.description) {
      const desc = document.createElement('div');
      desc.className = 'prompt-description';
      desc.textContent = prompt.description;
      main.appendChild(desc);
    }

    const meta = document.createElement('div');
    meta.className = 'prompt-meta';

    if (prompt.category) {
      const badge = document.createElement('span');
      badge.className = 'category-badge';
      badge.textContent = prompt.category;
      meta.appendChild(badge);
    }

    main.appendChild(meta);
    row.appendChild(main);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'prompt-actions';

    // Star toggle: sets this prompt as the default for the AI Assistant.
    // Shown on both standard and custom rows. Clicking a disabled row's
    // star also enables the prompt (single-intent action — "I want this
    // one as my default" implies it must be active).
    //
    // We display the RAW stored default id rather than the resolved one
    // so the star stays put when a prompt is temporarily disabled — the
    // user's preference is preserved across toggles, and when they
    // re-enable the prompt it's their default again automatically.
    const storedDefaultId = AIPromptLibrary.getStoredDefaultPromptId();
    const isDefault = prompt.id === storedDefaultId;

    const starBtn = document.createElement('button');
    starBtn.type = 'button';
    starBtn.className = 'prompt-star-btn';
    if (isDefault) starBtn.classList.add('is-default');
    starBtn.textContent = isDefault ? '★' : '☆';
    starBtn.setAttribute('aria-label',
      isDefault ? 'Default prompt' : 'Set as default prompt');
    starBtn.title = isDefault
      ? (prompt.enabled
          ? 'This is the default prompt for the AI Assistant.'
          : 'This is your default prompt, but it is currently disabled. Re-enable to use it.')
      : 'Set as default prompt for the AI Assistant.' +
        (prompt.enabled ? '' : ' Will also enable this prompt.');
    starBtn.addEventListener('click', () => _handleSetDefault(prompt.id));
    actions.appendChild(starBtn);

    if (type === 'standard') {
      const cloneBtn = document.createElement('button');
      cloneBtn.type = 'button';
      cloneBtn.className = 'prompt-action-btn';
      cloneBtn.textContent = 'Clone to Custom';
      cloneBtn.title = 'Duplicate this prompt as a custom prompt you can edit. Disables the original so your clone takes its place.';
      cloneBtn.addEventListener('click', () => _handleCloneStandard(prompt.id));
      actions.appendChild(cloneBtn);
    } else {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'prompt-action-btn';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => _openPromptFormModal(prompt.id));
      actions.appendChild(editBtn);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'prompt-action-btn is-danger';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => _handleDeleteCustom(prompt.id));
      actions.appendChild(delBtn);
    }

    row.appendChild(actions);
    return row;
  }

  // ----- Toggle / clone / delete handlers -----

  /**
   * Stars a prompt as the default used by the AI Assistant. If the prompt
   * is currently disabled, it's enabled as part of the same action — the
   * user's intent ("make this my default") implies it must be available.
   *
   * Clicking the star of the already-default prompt is a no-op (no toast,
   * no storage write) to avoid confusing "default re-set" feedback.
   */
  async function _handleSetDefault(id) {
    const prompt = AIPromptLibrary.getById(id);
    if (!prompt) return;

    // Ignore re-clicks on a prompt that's already starred AND enabled —
    // there's nothing meaningful to change. If it's starred but currently
    // disabled, fall through so clicking re-enables it.
    const storedDefaultId = AIPromptLibrary.getStoredDefaultPromptId();
    if (storedDefaultId === id && prompt.enabled) return;

    try {
      // If the prompt is disabled, enable it first. The default write
      // must happen while the prompt is enabled so it's a meaningful
      // runtime pick rather than immediate fallback.
      const wasDisabled = !prompt.enabled;
      if (wasDisabled) {
        if (prompt._type === 'standard') {
          await AIPromptLibrary.setStandardEnabled(id, true);
        } else {
          await AIPromptLibrary.updateCustom(id, { enabled: true });
        }
      }

      await AIPromptLibrary.setDefaultPromptId(id);

      // Re-render both lists so star state updates on whichever row
      // previously held the default.
      _renderStandardPrompts();
      _renderCustomPrompts();

      _showSaveToast(
        wasDisabled
          ? 'Prompt enabled and set as default'
          : 'Default prompt updated'
      );
    } catch (err) {
      console.warn('[SFUT Settings] Failed to set default prompt:', err);
      _showSaveToast('Could not update default prompt', true);
      _renderStandardPrompts();
      _renderCustomPrompts();
    }
  }

  async function _handleStandardToggle(id, enabled) {
    try {
      await AIPromptLibrary.setStandardEnabled(id, enabled);
      _renderStandardPrompts();
      _showSaveToast(enabled ? 'Prompt enabled' : 'Prompt disabled');
    } catch (err) {
      console.warn('[SFUT Settings] Failed to toggle standard prompt:', err);
      _showSaveToast('Could not update prompt', true);
      _renderStandardPrompts();
    }
  }

  async function _handleCustomToggle(id, enabled) {
    try {
      await AIPromptLibrary.updateCustom(id, { enabled });
      _renderCustomPrompts();
      _showSaveToast(enabled ? 'Prompt enabled' : 'Prompt disabled');
    } catch (err) {
      console.warn('[SFUT Settings] Failed to toggle custom prompt:', err);
      _showSaveToast('Could not update prompt', true);
      _renderCustomPrompts();
    }
  }

  async function _handleCloneStandard(id) {
    try {
      const clone = await AIPromptLibrary.cloneToCustom(id);
      _renderStandardPrompts();
      _renderCustomPrompts();
      _showSaveToast(`Cloned as "${clone.title}"`);
    } catch (err) {
      console.warn('[SFUT Settings] Failed to clone standard prompt:', err);
      _showSaveToast('Could not clone prompt', true);
    }
  }

  async function _handleDeleteCustom(id) {
    const prompt = AIPromptLibrary.getById(id);
    if (!prompt) return;

    const confirmed = window.confirm(
      `Delete the custom prompt "${prompt.title}"?\n\nThis cannot be undone. If you want to keep a backup, use Export JSON first.`
    );
    if (!confirmed) return;

    try {
      await AIPromptLibrary.deleteCustom(id);
      _renderCustomPrompts();
      _showSaveToast('Prompt deleted');
    } catch (err) {
      console.warn('[SFUT Settings] Failed to delete custom prompt:', err);
      _showSaveToast('Could not delete prompt', true);
    }
  }

  // ----- Toolbar buttons -----

  function _attachPromptToolbarListeners() {
    const newBtn = document.getElementById('custom-prompt-new-btn');
    const importBtn = document.getElementById('custom-prompt-import-btn');
    const exportBtn = document.getElementById('custom-prompt-export-btn');
    const fileInput = document.getElementById('custom-prompt-file-input');

    if (newBtn) newBtn.addEventListener('click', () => _openPromptFormModal(null));
    if (exportBtn) exportBtn.addEventListener('click', _handleExportCustoms);
    if (importBtn && fileInput) {
      importBtn.addEventListener('click', () => {
        fileInput.value = '';
        fileInput.click();
      });
      fileInput.addEventListener('change', _handleImportFileSelected);
    }
  }

  function _handleExportCustoms() {
    try {
      const customs = AIPromptLibrary.getCustomPrompts();
      if (customs.length === 0) {
        _showSaveToast('No custom prompts to export', true);
        return;
      }

      const json = AIPromptLibrary.exportCustomsAsJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'sf-flow-utility-toolkit-custom-prompts.json';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      _showSaveToast(`Exported ${customs.length} prompt(s)`);
    } catch (err) {
      console.warn('[SFUT Settings] Export failed:', err);
      _showSaveToast('Export failed', true);
    }
  }

  async function _handleImportFileSelected(e) {
    const fileInput = e.target;
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      // Dry-run with 'skip' just to get validation + conflict counts.
      // The actual conflictMode chosen by the user is applied on commit.
      const preview = await AIPromptLibrary.importCustoms(text, { conflictMode: 'skip', dryRun: true });

      _import.pendingJson = text;
      _openImportResultsModal(preview);
    } catch (err) {
      console.warn('[SFUT Settings] Import preview failed:', err);
      _showSaveToast(`Import failed: ${err.message || 'unknown error'}`, true);
    } finally {
      // Reset so re-selecting the same file re-triggers change.
      fileInput.value = '';
    }
  }

  // ----- New / Edit prompt form modal -----

  function _populatePromptFormCategories() {
    const select = document.getElementById('prompt-form-category-input');
    if (!select) return;
    select.innerHTML = '';

    // Leading placeholder option nudges the user to choose explicitly.
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— Select a category —';
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    AIPromptLibrary.getCategories().forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      select.appendChild(opt);
    });
  }

  function _attachPromptFormModalListeners() {
    const modal = document.getElementById('prompt-form-modal');
    const closeBtn = document.getElementById('prompt-form-close');
    const cancelBtn = document.getElementById('prompt-form-cancel-btn');
    const saveBtn = document.getElementById('prompt-form-save-btn');
    if (!modal) return;

    [closeBtn, cancelBtn].forEach(btn => {
      if (btn) btn.addEventListener('click', _closePromptFormModal);
    });

    // Close when clicking overlay (but not the dialog itself)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) _closePromptFormModal();
    });

    if (saveBtn) saveBtn.addEventListener('click', _handlePromptFormSave);

    // Wire up character counters
    _attachCharCounter('prompt-form-title-input', 'prompt-form-title-counter', 100);
    _attachCharCounter('prompt-form-description-input', 'prompt-form-description-counter', 500);
    _attachCharCounter('prompt-form-prompt-input', 'prompt-form-prompt-counter', 50000);
  }

  function _attachCharCounter(inputId, counterId, max) {
    const input = document.getElementById(inputId);
    const counter = document.getElementById(counterId);
    if (!input || !counter) return;

    const update = () => {
      const len = input.value.length;
      counter.textContent = `${len.toLocaleString()} / ${max.toLocaleString()}`;
      counter.classList.toggle('is-over', len > max);
    };

    input.addEventListener('input', update);
    update();
  }

  function _openPromptFormModal(editingId) {
    _promptForm.editingId = editingId;

    const modal = document.getElementById('prompt-form-modal');
    const titleEl = document.getElementById('prompt-form-title');
    const titleInput = document.getElementById('prompt-form-title-input');
    const descInput = document.getElementById('prompt-form-description-input');
    const promptInput = document.getElementById('prompt-form-prompt-input');
    const categoryInput = document.getElementById('prompt-form-category-input');
    const enabledInput = document.getElementById('prompt-form-enabled-input');

    // Reset any prior error state
    _clearFormErrors();

    if (editingId) {
      const prompt = AIPromptLibrary.getById(editingId);
      if (!prompt) {
        _showSaveToast('Prompt not found', true);
        return;
      }
      titleEl.textContent = 'Edit Custom Prompt';
      titleInput.value = prompt.title;
      descInput.value = prompt.description;
      promptInput.value = prompt.prompt;
      categoryInput.value = prompt.category || '';
      enabledInput.checked = prompt.enabled !== false;
    } else {
      titleEl.textContent = 'New Custom Prompt';
      titleInput.value = '';
      descInput.value = '';
      promptInput.value = '';
      categoryInput.value = '';
      enabledInput.checked = true;
    }

    // Refresh character counters to reflect pre-filled values
    titleInput.dispatchEvent(new Event('input'));
    descInput.dispatchEvent(new Event('input'));
    promptInput.dispatchEvent(new Event('input'));

    _openModal(modal);
    setTimeout(() => titleInput.focus(), 50);
  }

  function _closePromptFormModal() {
    _promptForm.editingId = null;
    const modal = document.getElementById('prompt-form-modal');
    _closeModal(modal);
  }

  async function _handlePromptFormSave() {
    const data = {
      title:       document.getElementById('prompt-form-title-input').value,
      description: document.getElementById('prompt-form-description-input').value,
      prompt:      document.getElementById('prompt-form-prompt-input').value,
      category:    document.getElementById('prompt-form-category-input').value,
      enabled:     document.getElementById('prompt-form-enabled-input').checked
    };

    const validation = AIPromptLibrary.validateCustomPrompt(data);
    _showFormErrors(validation.errors);
    if (!validation.valid) return;

    try {
      if (_promptForm.editingId) {
        await AIPromptLibrary.updateCustom(_promptForm.editingId, data);
        _showSaveToast('Prompt updated');
      } else {
        await AIPromptLibrary.addCustom(data);
        _showSaveToast('Prompt created');
      }
      _closePromptFormModal();
      _renderCustomPrompts();
    } catch (err) {
      console.warn('[SFUT Settings] Save failed:', err);
      _showSaveToast(`Could not save: ${err.message || 'unknown error'}`, true);
    }
  }

  function _clearFormErrors() {
    ['title', 'description', 'prompt', 'category'].forEach(field => {
      const errEl = document.getElementById(`prompt-form-${field}-error`);
      const inputEl = document.getElementById(`prompt-form-${field}-input`);
      if (errEl) {
        errEl.textContent = '';
        errEl.classList.remove('is-visible');
      }
      if (inputEl) inputEl.classList.remove('is-invalid');
    });
  }

  /**
   * Maps the library's validation error strings to the field they refer to
   * and displays them inline beneath each input.
   */
  function _showFormErrors(errors) {
    _clearFormErrors();
    if (!errors || errors.length === 0) return;

    // Bucket each error by the field its text mentions. Defaults to title
    // if the error text doesn't obviously map — shouldn't happen with the
    // library's current wording but protects against future changes.
    const buckets = { title: [], description: [], prompt: [], category: [] };

    errors.forEach(err => {
      const lower = err.toLowerCase();
      if (lower.startsWith('title'))            buckets.title.push(err);
      else if (lower.startsWith('description')) buckets.description.push(err);
      else if (lower.startsWith('prompt'))      buckets.prompt.push(err);
      else if (lower.startsWith('category'))    buckets.category.push(err);
      else                                      buckets.title.push(err);
    });

    Object.keys(buckets).forEach(field => {
      if (buckets[field].length === 0) return;
      const errEl = document.getElementById(`prompt-form-${field}-error`);
      const inputEl = document.getElementById(`prompt-form-${field}-input`);
      if (errEl) {
        errEl.textContent = buckets[field].join(' ');
        errEl.classList.add('is-visible');
      }
      if (inputEl) inputEl.classList.add('is-invalid');
    });
  }

  // ----- Import results modal -----

  function _attachImportResultsModalListeners() {
    const modal = document.getElementById('import-results-modal');
    const closeBtn = document.getElementById('import-results-close');
    const cancelBtn = document.getElementById('import-results-cancel-btn');
    const confirmBtn = document.getElementById('import-results-confirm-btn');
    if (!modal) return;

    [closeBtn, cancelBtn].forEach(btn => {
      if (btn) btn.addEventListener('click', _closeImportResultsModal);
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) _closeImportResultsModal();
    });

    if (confirmBtn) confirmBtn.addEventListener('click', _commitImport);
  }

  function _openImportResultsModal(preview) {
    const modal = document.getElementById('import-results-modal');
    const body = document.getElementById('import-results-body');
    const confirmBtn = document.getElementById('import-results-confirm-btn');
    const titleEl = document.getElementById('import-results-title');

    body.innerHTML = '';
    _import.hasConflicts = false;

    // Fatal error: file couldn't be parsed or had no prompts.
    if (preview.fatal) {
      titleEl.textContent = 'Import Failed';
      const card = _buildSummaryCard('is-error', 'Could not read file');
      const reason = document.createElement('div');
      reason.textContent = preview.fatal;
      card.appendChild(reason);
      body.appendChild(_wrapSection(null, card));
      if (confirmBtn) confirmBtn.hidden = true;
      _openModal(modal);
      return;
    }

    titleEl.textContent = 'Import Results';
    if (confirmBtn) confirmBtn.hidden = false;

    // At this point preview was run with conflictMode='skip', so imports
    // and skips are already bucketed. The conflicts are the items in
    // `skipped` (since skip mode produced them).
    const conflictCount = preview.skipped.length;
    const validCount = preview.imported.length + conflictCount;
    const errorCount = preview.errors.length;

    // Headline summary
    const summaryCard = _buildSummaryCard(
      validCount > 0 ? 'is-success' : 'is-warning',
      `Found ${validCount} valid prompt(s)`
    );
    const summaryDetail = document.createElement('div');
    summaryDetail.textContent =
      `${preview.imported.length} will import cleanly. ` +
      `${conflictCount} have id conflicts with existing prompts. ` +
      `${errorCount} will be skipped due to validation errors.`;
    summaryCard.appendChild(summaryDetail);
    body.appendChild(_wrapSection(null, summaryCard));

    // Errors
    if (errorCount > 0) {
      const card = _buildSummaryCard('is-error', `${errorCount} prompt(s) will be skipped`);
      const list = document.createElement('ul');
      list.className = 'import-summary-list';
      preview.errors.forEach(e => {
        const li = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = e.title;
        li.appendChild(title);
        const reasons = document.createElement('span');
        reasons.className = 'reasons';
        reasons.textContent = e.reasons.join(' ');
        li.appendChild(reasons);
        list.appendChild(li);
      });
      card.appendChild(list);
      body.appendChild(_wrapSection('Validation errors', card));
    }

    // Conflicts
    if (conflictCount > 0) {
      _import.hasConflicts = true;
      const card = _buildSummaryCard('is-warning', `${conflictCount} prompt(s) have id conflicts`);
      const list = document.createElement('ul');
      list.className = 'import-summary-list';
      preview.skipped.forEach(c => {
        const li = document.createElement('li');
        li.textContent = c.title;
        list.appendChild(li);
      });
      card.appendChild(list);

      const choicesHeading = document.createElement('div');
      choicesHeading.style.marginTop = '10px';
      choicesHeading.style.fontWeight = '600';
      choicesHeading.textContent = 'How should conflicts be resolved?';
      card.appendChild(choicesHeading);

      const choices = document.createElement('div');
      choices.className = 'import-conflict-choices';
      choices.appendChild(_buildConflictChoice('skip',      'Skip conflicts',      'Keep the existing prompts. Only non-conflicting prompts will be imported.', true));
      choices.appendChild(_buildConflictChoice('overwrite', 'Overwrite existing',  'Replace existing prompts with the imported versions. The existing content will be lost.', false));
      choices.appendChild(_buildConflictChoice('copy',      'Import as copies',    'Give conflicting prompts new ids so both versions are kept side-by-side.', false));
      card.appendChild(choices);
      body.appendChild(_wrapSection('ID conflicts', card));
    }

    // Successful imports list
    if (preview.imported.length > 0) {
      const card = _buildSummaryCard('is-success', `${preview.imported.length} will import cleanly`);
      const list = document.createElement('ul');
      list.className = 'import-summary-list';
      preview.imported.forEach(i => {
        const li = document.createElement('li');
        li.textContent = i.title;
        list.appendChild(li);
      });
      card.appendChild(list);
      body.appendChild(_wrapSection('Ready to import', card));
    }

    // Disable confirm if nothing to actually import
    if (confirmBtn) {
      confirmBtn.disabled = (preview.imported.length + conflictCount === 0);
      confirmBtn.textContent = conflictCount > 0 ? 'Import with chosen option' : 'Import';
    }

    _openModal(modal);
  }

  function _buildSummaryCard(severityClass, heading) {
    const card = document.createElement('div');
    card.className = `import-summary-card ${severityClass}`;
    const h = document.createElement('div');
    h.className = 'import-summary-heading';
    h.textContent = heading;
    card.appendChild(h);
    return card;
  }

  function _wrapSection(heading, card) {
    const section = document.createElement('div');
    section.className = 'import-summary-section';
    if (heading) {
      const h = document.createElement('div');
      h.className = 'import-summary-heading';
      h.textContent = heading;
      section.appendChild(h);
    }
    section.appendChild(card);
    return section;
  }

  function _buildConflictChoice(value, label, help, checked) {
    const wrap = document.createElement('label');
    wrap.className = 'import-conflict-choice';
    if (checked) wrap.classList.add('is-selected');

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'import-conflict-mode';
    input.value = value;
    if (checked) input.checked = true;
    input.addEventListener('change', () => {
      document.querySelectorAll('.import-conflict-choice').forEach(el => el.classList.remove('is-selected'));
      wrap.classList.add('is-selected');
    });

    const text = document.createElement('span');
    const labelEl = document.createElement('span');
    labelEl.className = 'choice-label';
    labelEl.textContent = label;
    const helpEl = document.createElement('span');
    helpEl.className = 'choice-help';
    helpEl.textContent = help;
    text.appendChild(labelEl);
    text.appendChild(helpEl);

    wrap.appendChild(input);
    wrap.appendChild(text);
    return wrap;
  }

  function _closeImportResultsModal() {
    _import.pendingJson = null;
    _import.hasConflicts = false;
    const modal = document.getElementById('import-results-modal');
    _closeModal(modal);
  }

  async function _commitImport() {
    if (!_import.pendingJson) {
      _closeImportResultsModal();
      return;
    }

    // Figure out which conflict mode was selected (only matters if conflicts exist)
    let conflictMode = 'skip';
    if (_import.hasConflicts) {
      const selected = document.querySelector('input[name="import-conflict-mode"]:checked');
      if (selected) conflictMode = selected.value;
    }

    try {
      const result = await AIPromptLibrary.importCustoms(_import.pendingJson, { conflictMode });
      _closeImportResultsModal();
      _renderCustomPrompts();

      const counts = [];
      if (result.imported.length)    counts.push(`${result.imported.length} imported`);
      if (result.overwritten.length) counts.push(`${result.overwritten.length} overwritten`);
      if (result.copied.length)      counts.push(`${result.copied.length} copied`);
      if (result.skipped.length)     counts.push(`${result.skipped.length} skipped`);

      _showSaveToast(counts.length ? counts.join(', ') : 'Nothing to import');
    } catch (err) {
      console.warn('[SFUT Settings] Import commit failed:', err);
      _showSaveToast(`Import failed: ${err.message || 'unknown error'}`, true);
    }
  }

  // ----- Shared modal helpers -----

  /**
   * Remembers which element had focus before a modal opened so we can
   * restore focus there on close. Keyed by modal id to support the
   * (rare) case of one modal opening another.
   */
  const _modalReturnFocus = new Map();

  function _openModal(modal) {
    if (!modal) return;

    // Remember what had focus before we stole it, so we can put it back.
    const prevFocus = document.activeElement;
    if (prevFocus && prevFocus !== document.body) {
      _modalReturnFocus.set(modal.id, prevFocus);
    }

    modal.classList.add('is-open');
    modal.inert = false;
    document.addEventListener('keydown', _handleModalEscape);
  }

  function _closeModal(modal) {
    if (!modal) return;

    // If focus is currently inside the modal, move it out before marking
    // the subtree inert. Without this, Chromium logs an accessibility
    // warning because focus momentarily sits on content that's becoming
    // hidden from assistive technology.
    const active = document.activeElement;
    if (active && modal.contains(active) && typeof active.blur === 'function') {
      active.blur();
    }

    modal.classList.remove('is-open');
    modal.inert = true;
    document.removeEventListener('keydown', _handleModalEscape);

    // Restore focus to whatever triggered the modal, when possible.
    const returnTarget = _modalReturnFocus.get(modal.id);
    _modalReturnFocus.delete(modal.id);
    if (returnTarget && document.contains(returnTarget) && typeof returnTarget.focus === 'function') {
      returnTarget.focus();
    }
  }

  function _handleModalEscape(e) {
    if (e.key !== 'Escape') return;
    // Close whichever modal is open (the prompt form takes precedence if both
    // somehow end up open, though the UI flow doesn't do that).
    const promptModal = document.getElementById('prompt-form-modal');
    const importModal = document.getElementById('import-results-modal');
    if (promptModal && promptModal.classList.contains('is-open')) _closePromptFormModal();
    else if (importModal && importModal.classList.contains('is-open')) _closeImportResultsModal();
  }

  // ===== Save toast =====

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

  // Live-sync feature toggle state when changed from outside settings
  // (e.g. clicking Hide/Show Missing Description Flags on the canvas).
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace !== 'sync') return;
      const toggleMap = {
        'setupTabs.enabled':                   'setting-setupTabs',
        'missingDescriptions.enabled':         'setting-missingDescriptions',
        'apiNameGenerator.enabled':            'setting-apiNameGenerator',
        'flowListSearch.enabled':              'setting-flowListSearch',
        'canvasSearch.enabled':               'setting-canvasSearchEnabled',
        'flowAIAssistant.enabled':            'setting-flowAIAssistant',
        'flowHealthCheck.enabled':            'setting-flowHealthCheck',
        'comparisonExporter.enabled':         'setting-comparisonExporter',
        'flowVersionManager.enabled':         'setting-flowVersionManager',
        'flowTriggerExplorerEnhancer.enabled':'setting-flowTriggerExplorerEnhancer',
        'scheduledFlowExplorer.enabled':      'setting-scheduledFlowExplorer',
        'whereIsThisUsed.enabled':            'setting-whereIsThisUsed',
        'unusedResources.enabled':            'setting-unusedResources',
        'keyboardShortcuts.enabled':          'setting-keyboardShortcuts',
      };
      Object.entries(changes).forEach(([key, { newValue }]) => {
        const id = toggleMap[key];
        if (id) _setToggle(id, newValue);
      });
    });
  }

  // ============================================================
  // ===== Keyboard Shortcuts tab ================================
  // ============================================================

  /**
   * Populates the OS-dependent shortcut displays on the Keyboard Shortcuts tab.
   * Detects whether the user is on a Mac and renders the appropriate modifier key.
   * Falls back to displaying both variants if detection is inconclusive.
   */
  function initKeyboardShortcutsTab() {
    const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

    const sidebarEl = document.getElementById('shortcut-sidebar-display');
    const saveAsEl  = document.getElementById('shortcut-saveas-display');

    if (sidebarEl) {
      sidebarEl.innerHTML = isMac
        ? '<kbd class="sfut-kbd">⌘ Cmd</kbd> + <kbd class="sfut-kbd">Shift</kbd> + <kbd class="sfut-kbd">U</kbd>'
        : '<kbd class="sfut-kbd">Ctrl</kbd> + <kbd class="sfut-kbd">Shift</kbd> + <kbd class="sfut-kbd">U</kbd>';
    }

    if (saveAsEl) {
      saveAsEl.innerHTML = isMac
        ? '<kbd class="sfut-kbd">⌘ Cmd</kbd> + <kbd class="sfut-kbd">Shift</kbd> + <kbd class="sfut-kbd">S</kbd>'
        : '<kbd class="sfut-kbd">Ctrl</kbd> + <kbd class="sfut-kbd">Shift</kbd> + <kbd class="sfut-kbd">S</kbd>';
    }
  }

  // ===== Initialise =====

  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadSettings();
    attachListeners();
    initPrefixConfig();
    initAboutTab();
    initAIPromptsTab();
    initKeyboardShortcutsTab();

    // Set footer version from manifest so it never drifts from the declared version
    const footer = document.getElementById('settings-footer');
    if (footer) {
      try {
        const { version } = chrome.runtime.getManifest();
        footer.textContent = `SF Flow Utility Toolkit v${version}`;
      } catch (err) {
        // leave default footer text
      }
    }
  });

})();