/**
 * SF Flow Utility Toolkit - Flow List Search
 *
 * Adds a search and filtering toolbar to the Salesforce Setup Flows list page.
 *
 * Features:
 * 1. Waits for the Flow list view table to render
 * 2. Injects a search input above the list
 * 3. Injects Status and Type filter dropdowns
 * 4. On page load, auto-scrolls to force Salesforce to load all lazily-rendered
 *    rows before indexing and filtering — no longer waits for first interaction
 * 5. Simultaneously queries FlowDefinitionView via the REST API to get accurate
 *    status (IsActive) for all flows, keyed by ApiName — fixes status filter
 *    inconsistencies across different org types, locales, and SF versions
 * 6. Searches by Flow Label and Flow API Name
 * 7. Filters by Status and Type
 * 8. Shows a count of matching / total flows
 *
 * Designed for the Setup Flows page:
 *   https://{org}.salesforce-setup.com/lightning/setup/Flows/home
 */

const FlowListSearchFeature = (() => {
  let _enabled = true; // set by init() based on settings

  // DOM references
  let _searchContainer = null;
  let _searchInput = null;
  let _statusFilter = null;
  let _typeFilter = null;
  let _countLabel = null;
  let _clearBtn = null;

  // State
  let _allRowsLoaded = false;
  let _isScrolling = false;
  let _isActive = false;
  let _rowIndex = [];
  let _rowObserver = null;
  let _apiTotal = null;      // Total flow count from FlowDefinitionView API query
  let _apiStatusMap = null;  // Map of apiName (lowercase) → 'active'|'inactive' from API

  // Selectors — Salesforce list view DOM patterns
  const SELECTORS = {
    listViewManager: '.forceListViewManager, .forceListViewManagerGrid, [data-aura-class="forceListViewManager"]',
    tableBody: 'table tbody, .uiVirtualDataTable tbody, .slds-table tbody',
    tableRow: 'table tbody tr, .uiVirtualDataTable tbody tr, .slds-table tbody tr',
    scrollContainer: '.forceListViewManagerGrid .uiScroller.scroller-wrapper, .forceListViewManagerGrid .uiScroller, .listViewContent .uiScroller',
    listHeader: '.listViewContent .slds-page-header, .forceListViewManagerHeader, .slds-page-header',
    flowNameCell: 'th[scope="row"] a, td:first-child a, th a'
  };

  const TRIGGER_TYPE_LABELS = {
    Activation: 'Activation-Triggered Flow',
    AutomationEvent: 'Automation Event-Triggered Flow',
    Capability: 'Capability-Triggered Flow',
    Capabilitiy: 'Capability-Triggered Flow', // typo-safe mapping
    DataCloudDataChange: 'Data Cloud Data Change Flow',
    DataGraphDataChange: 'Data Graph Data Change Flow',
    EventDrivenJourney: 'Event-Driven Journey Flow',
    ExternalSystemChange: 'External System Change Flow',
    PlatformEvent: 'Platform Event-Triggered Flow',
    RecordAfterSave: 'Record-Triggered Flow (After Save)',
    RecordBeforeDelete: 'Record-Triggered Flow (Before Delete)',
    RecordBeforeSave: 'Record-Triggered Flow (Before Save)',
    Scheduled: 'Scheduled Flow',
    ScheduledJourney: 'Scheduled Journey Flow',
    Segment: 'Segment Flow'
  };

  const PROCESS_TYPE_LABELS = {
    ActionableEventManagementFlow: 'Actionable Event Management Flow',
    ActionCadenceAutolaunchedFlow: 'Action Cadence Autolaunched Flow',
    ActionCadenceStepFlow: 'Action Cadence Step Flow',
    ActivityObjectMatchingFlow: 'Activity Object Matching Flow',
    Appointments: 'Appointments Flow',
    ApprovalWorkflow: 'Approval Workflow',
    AutoLaunchedFlow: 'Autolaunched Flow',
    CheckoutFlow: 'Checkout Flow',
    ContactRequestFlow: 'Contact Request Flow',
    CustomerLifecycle: 'Customer Lifecycle Flow',
    CustomEvent: 'Custom Event Flow',
    DataCaptureFlow: 'Data Capture Flow',
    DcvrFrameworkDataCaptureFlow: 'DCVR Framework Data Capture Flow',
    EvaluationFlow: 'Evaluation Flow',
    FieldServiceMobile: 'Field Service Mobile Flow',
    FieldServiceWeb: 'Field Service Web Flow',
    Flow: 'Screen Flow',
    FSCLending: 'FSC Lending Flow',
    IdentityUserRegistrationFlow: 'Identity User Registration Flow',
    IndicatorResultFlow: 'Indicator Result Flow',
    IndividualObjectLinkingFlow: 'Individual Object Linking Flow',
    InvocableProcess: 'Invocable Process',
    Journey: 'Journey Flow',
    LoginFlow: 'Login Flow',
    LoyaltyManagementFlow: 'Loyalty Management Flow',
    Orchestrator: 'Orchestrator Flow',
    PromptFlow: 'Prompt Flow',
    RecommendationStrategy: 'Recommendation Strategy Flow',
    RoutingFlow: 'Routing Flow',
    Survey: 'Survey Flow',
    SurveyEnrich: 'Survey Enrichment Flow',
    Workflow: 'Workflow'
  };

  async function init() {
    const context = ContextDetector.detectContext();
    if (context !== ContextDetector.CONTEXTS.SETUP_FLOWS) {
      return;
    }

    const featureEnabled = await SettingsManager.get('flowListSearch.enabled');
    if (!featureEnabled) { _enabled = false; return; }
    _enabled = true;

    console.log('[SFUT FlowListSearch] Initialising...');
    await _waitForListView();
  }

  function onActivate() {
    if (_searchInput) {
      _searchInput.focus();
      _searchInput.select();
    } else {
      _waitForListView();
    }
  }

  async function _waitForListView() {
    const maxAttempts = 40;
    const intervalMs = 500;

    for (let i = 0; i < maxAttempts; i++) {
      const tableBody = document.querySelector(SELECTORS.tableBody);
      if (tableBody && tableBody.querySelectorAll('tr').length > 0) {
        _injectSearchBar();
        _indexRows();
        _populateFilterOptions();
        _applyFilters();
        _observeTableForNewRows(tableBody);
        _isActive = true;
        console.log('[SFUT FlowListSearch] Active.');

        // Kick off API data fetch and full DOM scroll immediately on page
        // load — don't wait for first user interaction.
        _fetchApiData();
        _ensureAllRowsLoaded();

        return;
      }
      await new Promise(r => setTimeout(r, intervalMs));
    }

    console.warn('[SFUT FlowListSearch] List view table not found after waiting.');
  }

  /**
   * Queries FlowDefinitionView via the REST API to fetch the active/inactive
   * status for every flow in the org in a single round trip. Also captures the
   * org-wide total for the count label.
   *
   * Storing status here — keyed by ApiName — means the status filter works
   * correctly regardless of how the DOM renders the Active column (locale,
   * Lightning version, org type, missing column header attributes, etc.).
   *
   * Handles up to 2,000 flows per call (Salesforce REST API default page size).
   * Logs a warning if the org has more — pagination support can be added as a
   * follow-up for very large orgs.
   *
   * Runs silently — failures are non-fatal and fall back to DOM-based status
   * reading.
   */
  async function _fetchApiData() {
    try {
      const result = await SalesforceAPI.restQuery(
        'SELECT ApiName, IsActive FROM FlowDefinitionView ORDER BY ApiName ASC'
      );

      if (!result || !Array.isArray(result.records)) return;

      _apiTotal = result.totalSize;

      if (result.nextRecordsUrl) {
        console.warn(
          `[SFUT FlowListSearch] Org has more than 2,000 flows — ` +
          `status filter will cover the first ${result.records.length}. ` +
          `Full pagination support can be added in a future release.`
        );
      }

      _apiStatusMap = new Map();
      result.records.forEach(record => {
        const key = (record.ApiName || '').trim().toLowerCase();
        if (key) {
          _apiStatusMap.set(key, record.IsActive ? 'active' : 'inactive');
        }
      });

      console.log(
        `[SFUT FlowListSearch] API data loaded: ${_apiStatusMap.size} flows, ` +
        `total in org: ${_apiTotal}.`
      );

      // Update the loading label if the DOM scroll is still in progress
      if (_isScrolling) {
        _updateCount(0, _apiTotal, true);
      }

      // Re-index now that accurate status data is available, but only if the
      // DOM scroll has already finished (otherwise scroll completion triggers
      // its own re-index).
      if (_allRowsLoaded) {
        _indexRows();
        _applyFilters();
      }

    } catch (e) {
      console.warn('[SFUT FlowListSearch] Could not fetch API data — falling back to DOM status reading:', e);
    }
  }

  /**
   * Watches the table body for new rows added by Salesforce's native
   * lazy-loading (triggered when the user scrolls the list view).
   * Re-indexes and updates the count whenever rows are added.
   */
  function _observeTableForNewRows(tableBody) {
    if (_rowObserver) _rowObserver.disconnect();

    let debounceTimer = null;

    _rowObserver = new MutationObserver(() => {
      if (_allRowsLoaded) return;

      // Debounce: SF may add rows in batches
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const prevCount = _rowIndex.length;
        _indexRows();

        if (_rowIndex.length !== prevCount) {
          _populateFilterOptions();
          _applyFilters();
          console.log(
            `[SFUT FlowListSearch] Lazy-load detected: ${prevCount} → ${_rowIndex.length} flows.`
          );
        }
      }, 400);
    });

    _rowObserver.observe(tableBody, { childList: true, subtree: true });
  }

  function _injectSearchBar() {
    if (document.getElementById('sfut-flow-search-container')) return;

    const header = document.querySelector(SELECTORS.listHeader);
    const listManager = document.querySelector(SELECTORS.listViewManager);
    const insertTarget = header || listManager;

    if (!insertTarget) {
      console.warn('[SFUT FlowListSearch] No suitable injection point found.');
      return;
    }

    _searchContainer = document.createElement('div');
    _searchContainer.id = 'sfut-flow-search-container';
    _searchContainer.className = 'sfut-flow-search-container';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'sfut-flow-search-icon';
    iconSpan.textContent = '🔍';
    iconSpan.setAttribute('aria-hidden', 'true');

    _searchInput = document.createElement('input');
    _searchInput.id = 'sfut-flow-search-input';
    _searchInput.className = 'sfut-flow-search-input';
    _searchInput.type = 'text';
    _searchInput.placeholder = 'Search by label or API name...';
    _searchInput.setAttribute('aria-label', 'Search flows by label or API name');
    _searchInput.setAttribute('autocomplete', 'off');
    _searchInput.setAttribute('spellcheck', 'false');

    _statusFilter = document.createElement('select');
    _statusFilter.id = 'sfut-flow-status-filter';
    _statusFilter.className = 'sfut-flow-search-filter';
    _statusFilter.setAttribute('aria-label', 'Filter flows by status');
    _statusFilter.innerHTML = `
      <option value="">All Statuses</option>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    `;

    _typeFilter = document.createElement('select');
    _typeFilter.id = 'sfut-flow-type-filter';
    _typeFilter.className = 'sfut-flow-search-filter';
    _typeFilter.setAttribute('aria-label', 'Filter flows by type');
    _typeFilter.innerHTML = `<option value="">All Types</option>`;

    _clearBtn = document.createElement('button');
    _clearBtn.className = 'sfut-flow-search-clear';
    _clearBtn.textContent = 'Clear';
    _clearBtn.title = 'Clear search and filters';
    _clearBtn.setAttribute('aria-label', 'Clear search and filters');

    _countLabel = document.createElement('span');
    _countLabel.id = 'sfut-flow-search-count';
    _countLabel.className = 'sfut-flow-search-count';
    _countLabel.textContent = '';

    _searchContainer.appendChild(iconSpan);
    _searchContainer.appendChild(_searchInput);
    _searchContainer.appendChild(_statusFilter);
    _searchContainer.appendChild(_typeFilter);
    _searchContainer.appendChild(_clearBtn);
    _searchContainer.appendChild(_countLabel);

    if (header && header.parentNode) {
      header.parentNode.insertBefore(_searchContainer, header.nextSibling);
    } else {
      insertTarget.insertBefore(_searchContainer, insertTarget.firstChild);
    }

    let debounceTimer = null;

    _searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        await _ensureAllRowsLoaded();
        _indexRows();
        _populateFilterOptions();
        _applyFilters();
      }, 150);
    });

    _searchInput.addEventListener('focus', async () => {
      await _ensureAllRowsLoaded();
    });

    _statusFilter.addEventListener('change', async () => {
      await _ensureAllRowsLoaded();
      _indexRows();
      _populateFilterOptions();
      _applyFilters();
    });

    _typeFilter.addEventListener('change', async () => {
      await _ensureAllRowsLoaded();
      _indexRows();
      _populateFilterOptions();
      _applyFilters();
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (_searchInput) {
          _searchInput.focus();
          _searchInput.select();
        }
      }
    });

    _clearBtn.addEventListener('click', async () => {
      _searchInput.value = '';
      _statusFilter.value = '';
      _typeFilter.value = '';
      await _ensureAllRowsLoaded();
      _indexRows();
      _populateFilterOptions();
      _applyFilters();
      _searchInput.focus();
    });

    _updateCount(0, 0, false);
    _updateClearButtonState();

    console.log('[SFUT FlowListSearch] Search and filter bar injected.');
  }

  async function _ensureAllRowsLoaded() {
    if (_allRowsLoaded || _isScrolling) return;
    await _autoScrollToLoadAll();
  }

  async function _autoScrollToLoadAll() {
    if (_isScrolling || _allRowsLoaded) return;
    _isScrolling = true;

    _updateCount(0, 0, true);

    const scroller = document.querySelector(SELECTORS.scrollContainer);
    if (!scroller) {
      console.warn('[SFUT FlowListSearch] Scroll container not found. Proceeding without auto-scroll.');
      _allRowsLoaded = true;
      _isScrolling = false;
      _indexRows();
      _populateFilterOptions();
      _applyFilters();
      return;
    }

    // Wait for the uiVirtualDataTable indicator div to reach its full height.
    // Salesforce sets indicator height = totalRows * rowHeight (~31px/row).
    // Until it's taller than a single row, the scroller has nothing to scroll
    // and our scrollTop changes have no effect. We scope to the flow list
    // manager to avoid matching unrelated virtual tables elsewhere on the page.
    const maxWaitMs = 10000;
    const pollMs = 200;
    let waited = 0;
    while (waited < maxWaitMs) {
      const indicator = scroller.querySelector('.uiVirtualDataTable.indicator');
      if (indicator && indicator.offsetHeight > 100) {
        console.log(`[SFUT FlowListSearch] Virtual table indicator ready: ${indicator.offsetHeight}px`);
        break;
      }
      await new Promise(r => setTimeout(r, pollMs));
      waited += pollMs;
    }

    if (waited >= maxWaitMs) {
      console.warn('[SFUT FlowListSearch] Timed out waiting for virtual table indicator — proceeding anyway.');
    }

    let previousRowCount = 0;
    let stableCount = 0;
    const maxScrollAttempts = 120;

    for (let i = 0; i < maxScrollAttempts; i++) {
      scroller.scrollTop = scroller.scrollHeight;
      scroller.dispatchEvent(new Event('scroll', { bubbles: true, cancelable: false }));

      // Yield to the browser rendering pipeline before measuring
      await new Promise(r => requestAnimationFrame(r));
      await new Promise(r => setTimeout(r, 350));

      const currentRowCount = _getAllRows().length;

      if (currentRowCount === previousRowCount) {
        stableCount++;
        if (stableCount >= 4) {
          break;
        }
      } else {
        stableCount = 0;
        previousRowCount = currentRowCount;
      }
    }

    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event('scroll', { bubbles: true, cancelable: false }));

    _allRowsLoaded = true;
    _isScrolling = false;

    _indexRows();
    _populateFilterOptions();
    _applyFilters();

    const totalRows = _rowIndex.length;
    console.log(`[SFUT FlowListSearch] All rows loaded: ${totalRows} flows found.`);
  }

  function _indexRows() {
    const rows = _getAllRows();

    // Build a column-name → index map from the table header.
    // Different orgs render the Flows list with different columns
    // (and different orderings), so we cannot rely on fixed td positions.
    const table = rows[0]?.closest('table');
    const columnMap = _buildColumnIndexMap(table);

    _rowIndex = rows
      .map(row => _extractRowData(row, columnMap))
      .filter(item => item && item.row && item.name);
  }

  function _buildColumnIndexMap(table) {
    const map = {};
    if (!table) return map;

    const headerRow = table.querySelector('thead tr');
    if (!headerRow) return map;

    const headers = Array.from(headerRow.querySelectorAll('th'));
    headers.forEach((th, index) => {
      const label = (
        th.getAttribute('title') ||
        th.getAttribute('aria-label') ||
        ''
      ).trim().toLowerCase();
      if (label && !(label in map)) {
        map[label] = index;
      }
    });

    return map;
  }

  function _extractRowData(row, columnMap) {
    // Find the flow name via a hyperlink rather than relying on th[scope="row"].
    // When "Active" is the first column, Salesforce can assign scope="row" to
    // the Active checkbox cell instead of the flow name cell, causing name
    // extraction to fail and dropping all rows from the index — which breaks
    // both the status filter and text search. Finding the first linked cell is
    // reliable regardless of column order, since Active checkbox cells never
    // contain a hyperlink.
    const nameLink = row.querySelector('th a[href], td a[href]');
    const name = nameLink
      ? (nameLink.textContent || '').trim().replace(/\s+/g, ' ')
      : '';

    if (!name) return null;

    // Use the combined th + td order so cell indices align with header indices.
    const cells = Array.from(row.querySelectorAll('th, td'));

    const cellByHeader = (headerName) => {
      const idx = columnMap[headerName.toLowerCase()];
      return idx !== undefined ? cells[idx] : null;
    };

    const apiNameCell = cellByHeader('Flow API Name');
    const processTypeCell = cellByHeader('Process Type');
    const triggerCell = cellByHeader('Trigger');
    const activeCell = cellByHeader('Active');

    const apiName = apiNameCell ? _getCellValue(apiNameCell) : '';
    const processTypeRaw = processTypeCell ? _getCellValue(processTypeCell) : '';
    const triggerTypeRaw = triggerCell ? _getCellValue(triggerCell) : '';
    const activeRaw = activeCell ? _getCheckboxValue(activeCell) : '';

    // Prefer the API-sourced status — it is accurate regardless of how the
    // org renders the Active column (locale, SF release, missing header
    // attributes, etc.). Fall back to DOM reading if the API map hasn't
    // loaded yet or doesn't contain this flow.
    const apiKey = (apiName || name).trim().toLowerCase();
    const statusNormalized =
      (_apiStatusMap && _apiStatusMap.has(apiKey))
        ? _apiStatusMap.get(apiKey)
        : _normalizeStatus(activeRaw);

    const typeRaw = (triggerTypeRaw || processTypeRaw || '').trim();
    const typeDisplay = _getTypeDisplayLabel(processTypeRaw, triggerTypeRaw);

    const searchBlob = [
      name,
      apiName,
      processTypeRaw,
      triggerTypeRaw,
      typeRaw,
      typeDisplay
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return {
      row,
      name,
      apiName,
      statusRaw: activeRaw,
      statusNormalized,
      processTypeRaw,
      triggerTypeRaw,
      typeRaw,
      typeDisplay,
      searchBlob
    };
  }

  function _getCellValue(cell) {
    if (!cell) return '';

    const titleNode = cell.querySelector('[title]');
    if (titleNode) {
      const title = (titleNode.getAttribute('title') || '').trim();
      if (title) return title;
    }

    const dataValueNode = cell.querySelector('[data-value]');
    if (dataValueNode) {
      const value = (dataValueNode.getAttribute('data-value') || '').trim();
      if (value) return value;
    }

    const ariaLabelNode = cell.querySelector('[aria-label]');
    if (ariaLabelNode) {
      const value = (ariaLabelNode.getAttribute('aria-label') || '').trim();
      if (value && value !== 'true' && value !== 'false') return value;
    }

    return _getCellText(cell);
  }

  function _getCellText(cell) {
    if (!cell) return '';
    return (cell.textContent || '').trim().replace(/\s+/g, ' ');
  }

  function _getCheckboxValue(cell) {
    if (!cell) return '';

    const checkboxLike =
      cell.querySelector('[role="checkbox"][aria-checked]') ||
      cell.querySelector('img[aria-checked]') ||
      cell.querySelector('img[alt]') ||
      cell.querySelector('[aria-label]');

    if (checkboxLike) {
      const ariaChecked = (checkboxLike.getAttribute('aria-checked') || '').trim().toLowerCase();
      if (ariaChecked === 'true' || ariaChecked === 'false') return ariaChecked;

      const alt = (checkboxLike.getAttribute('alt') || '').trim().toLowerCase();
      if (alt === 'true' || alt === 'false') return alt;

      const ariaLabel = (checkboxLike.getAttribute('aria-label') || '').trim().toLowerCase();
      if (ariaLabel === 'true' || ariaLabel === 'false') return ariaLabel;
      if (ariaLabel === 'active' || ariaLabel === 'inactive') return ariaLabel;
    }

    const text = _getCellText(cell).toLowerCase();
    if (text === 'true' || text === 'false' || text === 'active' || text === 'inactive') {
      return text;
    }

    return '';
  }

  function _getFlowNameFromLink(row) {
    const nameCell = row.querySelector(SELECTORS.flowNameCell);
    return (nameCell?.textContent || '').trim().replace(/\s+/g, ' ');
  }

  function _normalizeStatus(status) {
    const value = (status || '').trim().toLowerCase();

    if (value === 'true' || value === 'active') return 'active';
    if (value === 'false' || value === 'inactive') return 'inactive';

    return '';
  }

  function _getTypeDisplayLabel(processTypeRaw, triggerTypeRaw) {
    const triggerValue = (triggerTypeRaw || '').trim();
    const processValue = (processTypeRaw || '').trim();

    if (triggerValue) {
      return TRIGGER_TYPE_LABELS[triggerValue] || _humanizeEnum(triggerValue);
    }

    if (processValue) {
      return PROCESS_TYPE_LABELS[processValue] || _humanizeEnum(processValue);
    }

    return '';
  }

  function _humanizeEnum(value) {
    if (!value) return '';

    return value
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .trim();
  }

  function _populateFilterOptions() {
    if (!_typeFilter) return;

    const currentValue = _typeFilter.value;
    const seen = new Map();

    _rowIndex.forEach(item => {
      if (!item.typeRaw) return;
      if (!seen.has(item.typeRaw)) {
        seen.set(item.typeRaw, item.typeDisplay || item.typeRaw);
      }
    });

    const sortedOptions = Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));

    _typeFilter.innerHTML = `<option value="">All Types</option>`;

    sortedOptions.forEach(([rawValue, label]) => {
      const option = document.createElement('option');
      option.value = rawValue;
      option.textContent = label;
      option.title = rawValue;
      _typeFilter.appendChild(option);
    });

    if (Array.from(_typeFilter.options).some(option => option.value === currentValue)) {
      _typeFilter.value = currentValue;
    } else {
      _typeFilter.value = '';
    }
  }

  function _applyFilters() {
    const term = (_searchInput?.value || '').trim().toLowerCase();
    const selectedStatus = (_statusFilter?.value || '').trim().toLowerCase();
    const selectedType = (_typeFilter?.value || '').trim();

    let visibleCount = 0;

    _rowIndex.forEach(item => {
      const matchesText = !term || item.searchBlob.includes(term);
      const matchesStatus = !selectedStatus || item.statusNormalized === selectedStatus;
      const matchesType = !selectedType || item.typeRaw === selectedType;

      const isVisible = matchesText && matchesStatus && matchesType;
      item.row.style.display = isVisible ? '' : 'none';

      if (isVisible) {
        visibleCount++;
      }
    });

    _updateCount(visibleCount, _rowIndex.length, false);
    _updateClearButtonState();
  }

  function _getAllRows() {
    return Array.from(document.querySelectorAll(SELECTORS.tableRow));
  }

  function _updateRowCount() {
    _updateCount(_rowIndex.length, _rowIndex.length, false);
  }

  function _updateClearButtonState() {
    if (!_clearBtn) return;

    const hasSearch = !!(_searchInput?.value || '').trim();
    const hasStatus = !!(_statusFilter?.value || '').trim();
    const hasType = !!(_typeFilter?.value || '').trim();

    _clearBtn.style.display = (hasSearch || hasStatus || hasType) ? 'inline-block' : 'none';
  }

  function _updateCount(visible, total, loading) {
    if (!_countLabel) return;

    // Use the API-sourced org total when available — it's accurate even before
    // the DOM scroll has finished loading all rows.
    const displayTotal = (_apiTotal !== null && _apiTotal >= total) ? _apiTotal : total;

    if (loading) {
      const loadingMsg = _apiTotal !== null
        ? `Loading all flows... (${_apiTotal} in org)`
        : 'Loading all flows...';
      _countLabel.textContent = loadingMsg;
      _countLabel.classList.add('sfut-flow-search-loading');
      return;
    }

    _countLabel.classList.remove('sfut-flow-search-loading');

    if (displayTotal === 0) {
      _countLabel.textContent = '';
    } else if (visible === displayTotal) {
      _countLabel.textContent = `${displayTotal} flows`;
    } else if (visible === 0) {
      _countLabel.textContent = 'No matching flows';
    } else {
      _countLabel.textContent = `${visible} of ${displayTotal} flows`;
    }
  }

  function isEnabled() { return _enabled; }

  return {
    init,
    isEnabled,
    onActivate
  };

})();

// Register with the toolkit
SFFlowUtilityToolkit.registerFeature('flow-list-search', FlowListSearchFeature);