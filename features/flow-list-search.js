/**
 * SF Flow Utility Toolkit - Flow List Search
 *
 * Adds a search and filtering toolbar to the Salesforce Setup Flows list page.
 *
 * Features:
 * 1. Waits for the Flow list view table to render
 * 2. Injects a search input above the list
 * 3. Injects Status and Type filter dropdowns
 * 4. On first focus / input / filter interaction, auto-scrolls to force Salesforce
 *    to load all lazily-rendered rows before indexing and filtering
 * 5. Searches by Flow Label and Flow API Name
 * 6. Filters by Status and Type
 * 7. Shows a count of matching / total flows
 *
 * Designed for the Setup Flows page:
 *   https://{org}.salesforce-setup.com/lightning/setup/Flows/home
 */

const FlowListSearchFeature = (() => {

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

  // Selectors — Salesforce list view DOM patterns
  const SELECTORS = {
    listViewManager: '.forceListViewManager, .forceListViewManagerGrid, [data-aura-class="forceListViewManager"]',
    tableBody: 'table tbody, .uiVirtualDataTable tbody, .slds-table tbody',
    tableRow: 'table tbody tr, .uiVirtualDataTable tbody tr, .slds-table tbody tr',
    scrollContainer: '.uiScroller .scroller-inner, .uiScroller, .slds-scrollable_y, .listViewContent, [data-aura-class="uiScroller"]',
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
        return;
      }
      await new Promise(r => setTimeout(r, intervalMs));
    }

    console.warn('[SFUT FlowListSearch] List view table not found after waiting.');
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
      if (_isScrolling || _allRowsLoaded) return;

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
      _updateRowCount();
      return;
    }

    let previousRowCount = 0;
    let stableCount = 0;
    const maxScrollAttempts = 100;

    for (let i = 0; i < maxScrollAttempts; i++) {
      scroller.scrollTop = scroller.scrollHeight;
      await new Promise(r => setTimeout(r, 300));

      const currentRowCount = _getAllRows().length;

      if (currentRowCount === previousRowCount) {
        stableCount++;
        if (stableCount >= 3) {
          break;
        }
      } else {
        stableCount = 0;
        previousRowCount = currentRowCount;
      }
    }

    scroller.scrollTop = 0;

    _allRowsLoaded = true;
    _isScrolling = false;

    _indexRows();
    _populateFilterOptions();

    const totalRows = _rowIndex.length;
    console.log(`[SFUT FlowListSearch] All rows loaded: ${totalRows} flows found.`);
    _updateCount(totalRows, totalRows, false);
  }

  function _indexRows() {
    const rows = _getAllRows();
    _rowIndex = rows
      .map(row => _extractRowData(row))
      .filter(item => item && item.row && item.name);
  }

  function _extractRowData(row) {
    const rowHeader = row.querySelector('th[scope="row"]');
    if (!rowHeader) return null;

    const tds = Array.from(row.querySelectorAll('td'));

    // Expected row order from the provided HTML:
    // td[0] = item number
    // th    = flow label
    // td[1] = Flow API Name
    // td[2] = Process Type
    // td[3] = Trigger
    // td[4] = Active
    const name = _getFlowNameFromLink(row) || _getCellText(rowHeader);
    const apiName = _getCellValue(tds[1]);
    const processTypeRaw = _getCellValue(tds[2]);
    const triggerTypeRaw = _getCellValue(tds[3]);
    const activeRaw = _getCheckboxValue(tds[4]);
    const statusNormalized = _normalizeStatus(activeRaw);

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

    if (loading) {
      _countLabel.textContent = 'Loading all flows...';
      _countLabel.classList.add('sfut-flow-search-loading');
      return;
    }

    _countLabel.classList.remove('sfut-flow-search-loading');

    if (total === 0) {
      _countLabel.textContent = '';
    } else if (visible === total) {
      _countLabel.textContent = `${total} flows`;
    } else if (visible === 0) {
      _countLabel.textContent = 'No matching flows';
    } else {
      _countLabel.textContent = `${visible} of ${total} flows`;
    }
  }

  return {
    init,
    onActivate
  };

})();

// Register with the toolkit
SFFlowUtilityToolkit.registerFeature('flow-list-search', FlowListSearchFeature);