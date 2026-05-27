/**
 * SF Flow Utility Toolkit - Scheduled Flow Explorer
 *
 * Lists active Schedule-Triggered Flows in an org and shows when
 * each will run next. Provides a List View and a Calendar View.
 *
 * Lifecycle:
 *   - init():      Registers Setup Flows page button injection (when on that page)
 *   - onActivate(): Opens the explorer modal (called from the side button menu)
 *
 * The modal is a full-screen overlay reusing the toolkit's existing
 * `sfut-modal-overlay` / `sfut-hidden` pattern, sized large with internal
 * scrolling. State is reset on each open.
 *
 * Settings (read from SettingsManager):
 *   - scheduledFlowExplorer.enabled       (boolean) — gates the feature entirely
 *   - scheduledFlowExplorer.defaultView   ('list' | 'calendar') — initial tab
 */

const ScheduledFlowExplorer = (() => {
  let _enabled = true;

  // Settings keys
  const SETTING_ENABLED = 'scheduledFlowExplorer.enabled';
  const SETTING_DEFAULT_VIEW = 'scheduledFlowExplorer.defaultView';

  // ---------- State ----------

  const STATE = {
    isInitialised: false,
    overlay: null,            // Root modal overlay element
    isOpen: false,
    flows: [],                // Discovered flows (post-parse)
    errors: [],               // Discovery errors
    isLoading: false,
    fatalError: null,         // Non-null string when discovery failed fatally
    loadProgress: null,       // { processed, total } during streaming load
    view: 'list',             // 'list' | 'calendar'
    listSearchTerm: '',
    listFrequencyFilter: 'all',  // 'all' | 'Once' | 'Daily' | 'Weekly'
    listSortColumn: 'nextRun',   // 'name' | 'frequency' | 'nextRun' | 'object'
    listSortDirection: 'asc',
    calYear: 0,
    calMonth: 0,
    orgTimeZone: null
  };

  // CSS class namespace — sfe = Scheduled Flow Explorer
  const C = {
    overlay: 'sfut-sfe-overlay',
    surface: 'sfut-sfe-surface',
    header: 'sfut-sfe-header',
    headerTitle: 'sfut-sfe-header-title',
    tzBadge: 'sfut-sfe-tz-badge',
    closeBtn: 'sfut-sfe-close',
    tabs: 'sfut-sfe-tabs',
    tab: 'sfut-sfe-tab',
    tabActive: 'sfut-sfe-tab-active',
    body: 'sfut-sfe-body',
    footer: 'sfut-sfe-footer',
    toolbar: 'sfut-sfe-toolbar',
    toolbarLeft: 'sfut-sfe-toolbar-left',
    toolbarRight: 'sfut-sfe-toolbar-right',
    search: 'sfut-sfe-search',
    pill: 'sfut-sfe-pill',
    pillActive: 'sfut-sfe-pill-active',
    count: 'sfut-sfe-count',
    refreshBtn: 'sfut-sfe-refresh',
    loading: 'sfut-sfe-loading',
    spinner: 'sfut-sfe-spinner',
    progress: 'sfut-sfe-progress',
    empty: 'sfut-sfe-empty',
    errorBanner: 'sfut-sfe-error-banner',
    table: 'sfut-sfe-table',
    row: 'sfut-sfe-row',
    rowExpired: 'sfut-sfe-row-expired',
    flowName: 'sfut-sfe-flow-name',
    flowDesc: 'sfut-sfe-flow-desc',
    badge: 'sfut-sfe-badge',
    badgeOnce: 'sfut-sfe-badge-once',
    badgeDaily: 'sfut-sfe-badge-daily',
    badgeWeekly: 'sfut-sfe-badge-weekly',
    badgeExpired: 'sfut-sfe-badge-expired',
    nextRunPrimary: 'sfut-sfe-next-run',
    nextRunRelative: 'sfut-sfe-next-run-rel',
    filterText: 'sfut-sfe-filter-text',
    calToolbar: 'sfut-sfe-cal-toolbar',
    calNav: 'sfut-sfe-cal-nav',
    calArrow: 'sfut-sfe-cal-arrow',
    calTitle: 'sfut-sfe-cal-title',
    calLegend: 'sfut-sfe-cal-legend',
    calLegendItem: 'sfut-sfe-cal-legend-item',
    calLegendSwatch: 'sfut-sfe-cal-legend-swatch',
    calGrid: 'sfut-sfe-cal-grid',
    calHeader: 'sfut-sfe-cal-header',
    calCell: 'sfut-sfe-cal-cell',
    calCellOther: 'sfut-sfe-cal-cell-other',
    calCellToday: 'sfut-sfe-cal-cell-today',
    calDate: 'sfut-sfe-cal-date',
    calDateNum: 'sfut-sfe-cal-date-num',
    calChips: 'sfut-sfe-cal-chips',
    chip: 'sfut-sfe-chip',
    chipOnce: 'sfut-sfe-chip-once',
    chipDaily: 'sfut-sfe-chip-daily',
    chipWeekly: 'sfut-sfe-chip-weekly',
    chipExpired: 'sfut-sfe-chip-expired',
    chipMore: 'sfut-sfe-chip-more',

    // Details modal
    detailModal: 'sfut-sfe-detail-modal',
    detailHeader: 'sfut-sfe-detail-header',
    detailTitle: 'sfut-sfe-detail-title',
    detailSubtitle: 'sfut-sfe-detail-subtitle',
    detailBody: 'sfut-sfe-detail-body',
    detailFooter: 'sfut-sfe-detail-footer',
    detailSection: 'sfut-sfe-detail-section',
    detailSectionTitle: 'sfut-sfe-detail-section-title',
    detailSummary: 'sfut-sfe-detail-summary',
    detailField: 'sfut-sfe-detail-field',
    detailFieldLabel: 'sfut-sfe-detail-field-label',
    detailFieldValue: 'sfut-sfe-detail-field-value',
    detailRunsList: 'sfut-sfe-detail-runs-list',

    // Day modal (for "+N more")
    dayModal: 'sfut-sfe-day-modal',
    dayList: 'sfut-sfe-day-list',
    dayItem: 'sfut-sfe-day-item',
    dayTime: 'sfut-sfe-day-time',
    dayName: 'sfut-sfe-day-name'
  };

  // ---------- Settings helpers ----------

  async function _isFeatureEnabled() {
    try {
      const value = await SettingsManager.get(SETTING_ENABLED);
      // Default to true if SettingsManager returns null/undefined (e.g. first run)
      return value !== false;
    } catch (err) {
      console.warn('[SFUT ScheduledFlowExplorer] Could not read enabled setting; assuming enabled.', err);
      return true;
    }
  }

  async function _getDefaultView() {
    try {
      const value = await SettingsManager.get(SETTING_DEFAULT_VIEW);
      if (value === 'calendar') return 'calendar';
      return 'list'; // Default
    } catch (err) {
      console.warn('[SFUT ScheduledFlowExplorer] Could not read default-view setting; using List.', err);
      return 'list';
    }
  }

  // ---------- Lifecycle ----------

  async function init() {
    if (STATE.isInitialised) return;
    STATE.isInitialised = true;

    // Honour the feature toggle.
    const enabled = await _isFeatureEnabled();
    if (!enabled) {
      console.log('[SFUT ScheduledFlowExplorer] Feature is disabled in settings; skipping init.');
      return;
    }

    // The explorer is launched exclusively from the side button menu.
    // No page injection is performed.
    console.log('[SFUT ScheduledFlowExplorer] Initialised.');
  }

  /**
   * Called when the user clicks the side button menu item.
   */
  async function onActivate() {
    // Re-check the toggle here too, in case the user disabled it after the
    // page loaded but the menu item is still visible from a stale build.
    const enabled = await _isFeatureEnabled();
    if (!enabled) {
      _showToast('Scheduled Flow Explorer is disabled in Settings.', 'warning');
      return;
    }
    await openExplorer();
  }

  /**
   * Opens the explorer modal and triggers a fresh discovery (or uses cache).
   */
  async function openExplorer({ forceRefresh = false } = {}) {
    _ensureModal();

    // Read default view BEFORE resetting state, so the reset can apply it
    const defaultView = await _getDefaultView();
    _resetState(defaultView);
    _show();

    STATE.isLoading = true;
    _renderLoading();

    // Kick off the timezone fetch and the discovery in parallel
    const tzPromise = ScheduledFlowDiscovery.getOrgTimeZone();

    try {
      await ScheduledFlowDiscovery.discoverScheduledFlows({
        forceRefresh,
        onBatch: ({ flows, errors, processedCandidates, totalCandidates, isComplete }) => {
          STATE.flows = flows;
          STATE.errors = errors;
          STATE.loadProgress = isComplete ? null : { processed: processedCandidates, total: totalCandidates };

          // While loading: keep showing the spinner (but progress text updates).
          // When complete: switch to the real view.
          if (isComplete) {
            STATE.isLoading = false;
            _renderCurrentView();
          } else {
            _renderLoading();
          }
        }
      });
    } catch (err) {
      STATE.isLoading = false;
      STATE.fatalError = err?.message || 'Could not load scheduled flows.';
      console.error('[SFUT ScheduledFlowExplorer] Discovery failed:', err);
      _renderCurrentView();
      return;
    }

    STATE.orgTimeZone = await tzPromise;
    _renderCurrentView(); // Re-render with TZ badge populated
  }

  function close() {
    _hide();
  }

  // ---------- Modal scaffolding ----------

  function _ensureModal() {
    if (STATE.overlay) return;

    STATE.overlay = document.createElement('div');
    STATE.overlay.className = `sfut-modal-overlay ${C.overlay} sfut-hidden`;
    STATE.overlay.innerHTML = `
      <div class="${C.surface}">
        <div class="${C.header}">
          <div class="${C.headerTitle}">
            <span aria-hidden="true">⏰</span>
            <span>Scheduled Flow Explorer</span>
            <span class="${C.tzBadge}" id="sfut-sfe-tz-badge"></span>
          </div>
          <button type="button" class="${C.closeBtn}" title="Close (Esc)" aria-label="Close">&times;</button>
        </div>
        <div class="${C.tabs}">
          <button type="button" class="${C.tab}" data-view="list">List View</button>
          <button type="button" class="${C.tab}" data-view="calendar">Calendar View</button>
        </div>
        <div class="${C.body}" id="sfut-sfe-body"></div>
        <div class="${C.footer}">
          <button type="button" class="sfut-btn" id="sfut-sfe-footer-close">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(STATE.overlay);

    // Close handlers
    STATE.overlay.querySelector(`.${C.closeBtn}`).addEventListener('click', close);
    STATE.overlay.querySelector('#sfut-sfe-footer-close').addEventListener('click', close);
    STATE.overlay.addEventListener('click', (e) => {
      if (e.target === STATE.overlay) close();
    });

    // Tab switching
    STATE.overlay.querySelectorAll(`.${C.tab}`).forEach((tabEl) => {
      tabEl.addEventListener('click', () => _switchView(tabEl.dataset.view));
    });

    // ESC to close (delegated globally — only acts when our modal is open)
    document.addEventListener('keydown', _handleKeyDown);
  }

  function _handleKeyDown(e) {
    if (!STATE.isOpen) return;
    if (e.key === 'Escape') {
      // If a child modal (details / day) is open, close that first
      const childOpen = STATE.overlay.querySelector(`.${C.detailModal}, .${C.dayModal}`);
      if (childOpen) {
        childOpen.remove();
        return;
      }
      close();
    }
  }

  function _show() {
    STATE.overlay.classList.remove('sfut-hidden');
    STATE.isOpen = true;
  }

  function _hide() {
    if (!STATE.overlay) return;
    STATE.overlay.classList.add('sfut-hidden');
    STATE.isOpen = false;
    // Remove any child modals
    STATE.overlay.querySelectorAll(`.${C.detailModal}, .${C.dayModal}`).forEach(el => el.remove());
  }

  /**
   * Resets the explorer state. Honours the user's default-view setting.
   *
   * @param {string} defaultView - 'list' or 'calendar'
   */
  function _resetState(defaultView = 'list') {
    STATE.flows = [];
    STATE.fatalError = null;
    
    STATE.errors = [];
    STATE.isLoading = false;
    STATE.loadProgress = null;
    STATE.view = defaultView === 'calendar' ? 'calendar' : 'list';
    STATE.listSearchTerm = '';
    STATE.listFrequencyFilter = 'all';
    STATE.listSortColumn = 'nextRun';
    STATE.listSortDirection = 'asc';

    const now = new Date();
    STATE.calYear = now.getFullYear();
    STATE.calMonth = now.getMonth();

    // Reset tab visuals
    if (STATE.overlay) {
      STATE.overlay.querySelectorAll(`.${C.tab}`).forEach((t) => {
        t.classList.toggle(C.tabActive, t.dataset.view === STATE.view);
      });
    }
  }

  // ---------- View switching ----------

  function _switchView(view) {
    if (view !== 'list' && view !== 'calendar') return;
    STATE.view = view;
    STATE.overlay.querySelectorAll(`.${C.tab}`).forEach((t) => {
      t.classList.toggle(C.tabActive, t.dataset.view === view);
    });
    _renderCurrentView();
  }

  function _renderCurrentView() {
    _renderTzBadge();
    if (STATE.isLoading) {
      _renderLoading();
      return;
    }
    if (STATE.fatalError) {
      _renderFatalError(STATE.fatalError);
      return;
    }
    if (STATE.flows.length === 0 && STATE.errors.length === 0) {
      _renderEmpty();
      return;
    }
    if (STATE.view === 'list') {
      _renderListView();
    } else {
      _renderCalendarView();
    }
  }

  function _renderTzBadge() {
    const badge = STATE.overlay.querySelector('#sfut-sfe-tz-badge');
    if (!badge) return;
    if (STATE.orgTimeZone) {
      badge.textContent = `Org Timezone: ${STATE.orgTimeZone}`;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  // ---------- Loading state ----------

  function _renderLoading() {
    const body = _getBody();
    let progressLine = '';
    if (STATE.loadProgress && STATE.loadProgress.total > 0) {
      progressLine = `
        <div class="${C.progress}">
          Loading ${STATE.loadProgress.processed} of ${STATE.loadProgress.total} flows...
        </div>
      `;
    }
    body.innerHTML = `
      <div class="${C.loading}">
        <div class="${C.spinner}" aria-hidden="true"></div>
        <div>Loading scheduled flows...</div>
        ${progressLine}
      </div>
    `;
  }

  function _renderFatalError(message) {
    const body = _getBody();
    body.innerHTML = `
      <div class="${C.empty}">
        <div style="font-size:32px;">⚠️</div>
        <h3>Could not load scheduled flows</h3>
        <p>${_escapeHtml(message)}</p>
        <button type="button" class="sfut-btn sfut-btn-primary" id="sfut-sfe-retry-btn">
          Retry
        </button>
      </div>
    `;
    body.querySelector('#sfut-sfe-retry-btn').addEventListener('click', () => {
      openExplorer({ forceRefresh: true });
    });
  }

  function _renderEmpty() {
    const body = _getBody();
    body.innerHTML = `
      <div class="${C.empty}">
        <div style="font-size:48px;">📅</div>
        <h3>No Schedule-Triggered Flows found</h3>
        <p>
          Schedule-Triggered Flows run on a recurring schedule (Once, Daily, or Weekly)
          without needing user interaction. Create one in Flow Builder using a
          Scheduled Trigger to see it here.
        </p>
        <p>
          <a href="https://help.salesforce.com/s/articleView?id=platform.flow_concepts_trigger_scheduled.htm&type=5"
             target="_blank" rel="noopener noreferrer">
            Learn more about Scheduled Flows ↗
          </a>
        </p>
      </div>
    `;
  }

  // ---------- Error banner ----------

  function _renderErrorBanner(container) {
    if (STATE.errors.length === 0) return;

    const banner = document.createElement('div');
    banner.className = C.errorBanner;
    const count = STATE.errors.length;
    banner.innerHTML = `
      <span>
        ${count} flow${count === 1 ? '' : 's'} couldn't be loaded.
        <a href="#" class="sfut-sfe-error-toggle">View details</a>
      </span>
      <button type="button" class="sfut-btn">Retry</button>
    `;

    const toggle = banner.querySelector('.sfut-sfe-error-toggle');
    let expanded = false;
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      expanded = !expanded;
      const existing = banner.querySelector('.sfut-sfe-error-list');
      if (existing) {
        existing.remove();
      }
      if (expanded) {
        toggle.textContent = 'Hide details';
        const list = document.createElement('ul');
        list.className = 'sfut-sfe-error-list';
        list.innerHTML = STATE.errors.map((err) => `
          <li>
            <strong>${_escapeHtml(err.developerName || err.activeVersionId || err.flowDefinitionId)}</strong>
            — ${_escapeHtml(err.message)}
          </li>
        `).join('');
        banner.appendChild(list);
      } else {
        toggle.textContent = 'View details';
      }
    });

    banner.querySelector('button').addEventListener('click', () => {
      openExplorer({ forceRefresh: true });
    });

    container.insertBefore(banner, container.firstChild);
  }

  // ---------- List View ----------

  function _renderListView() {
    const body = _getBody();
    body.innerHTML = `
      <div class="${C.toolbar}">
        <div class="${C.toolbarLeft}">
          <input type="text"
                 class="${C.search}"
                 placeholder="Search by flow label or API name..."
                 value="${_escapeHtml(STATE.listSearchTerm)}"
                 aria-label="Search flows">
          <button type="button" class="${C.pill} ${STATE.listFrequencyFilter === 'all' ? C.pillActive : ''}" data-filter="all">All</button>
          <button type="button" class="${C.pill} ${STATE.listFrequencyFilter === 'Once' ? C.pillActive : ''}" data-filter="Once">Once</button>
          <button type="button" class="${C.pill} ${STATE.listFrequencyFilter === 'Daily' ? C.pillActive : ''}" data-filter="Daily">Daily</button>
          <button type="button" class="${C.pill} ${STATE.listFrequencyFilter === 'Weekly' ? C.pillActive : ''}" data-filter="Weekly">Weekly</button>
        </div>
        <div class="${C.toolbarRight}">
          <span class="${C.count}" id="sfut-sfe-row-count"></span>
          <button type="button" class="sfut-btn ${C.refreshBtn}" title="Refresh from Salesforce">↻ Refresh</button>
        </div>
      </div>
      <div id="sfut-sfe-list-container"></div>
    `;

    _renderErrorBanner(body);

    const searchInput = body.querySelector(`.${C.search}`);
    searchInput.addEventListener('input', (e) => {
      STATE.listSearchTerm = e.target.value;
      _renderListTable();
    });

    body.querySelectorAll(`.${C.pill}`).forEach((btn) => {
      btn.addEventListener('click', () => {
        STATE.listFrequencyFilter = btn.dataset.filter;
        _renderListView(); // Full re-render so the active pill state updates
      });
    });

    body.querySelector(`.${C.refreshBtn}`).addEventListener('click', () => {
      openExplorer({ forceRefresh: true });
    });

    _renderListTable();
  }

  function _renderListTable() {
    const container = STATE.overlay.querySelector('#sfut-sfe-list-container');
    if (!container) return;

    const visible = _getVisibleFlows();

    const countEl = STATE.overlay.querySelector('#sfut-sfe-row-count');
    if (countEl) {
      const total = STATE.flows.length;
      if (visible.length === total) {
        countEl.textContent = `${total} flow${total === 1 ? '' : 's'}`;
      } else {
        countEl.textContent = `${visible.length} of ${total} flow${total === 1 ? '' : 's'}`;
      }
    }

    if (visible.length === 0) {
      container.innerHTML = `
        <div class="${C.empty}" style="padding:40px;">
          <div style="font-size:32px;">🔍</div>
          <p>No scheduled flows match the current filters.</p>
        </div>
      `;
      return;
    }

    const sortIndicator = (col) => {
      if (STATE.listSortColumn !== col) return '⇅';
      return STATE.listSortDirection === 'asc' ? '▲' : '▼';
    };

    container.innerHTML = `
      <table class="${C.table}">
        <thead>
          <tr>
            <th data-sort="name">Name <span aria-hidden="true">${sortIndicator('name')}</span></th>
            <th data-sort="frequency">Frequency <span aria-hidden="true">${sortIndicator('frequency')}</span></th>
            <th data-sort="nextRun">Next Run <span aria-hidden="true">${sortIndicator('nextRun')}</span></th>
            <th data-sort="object">Object</th>
            <th>Filter</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    `;

    const tbody = container.querySelector('tbody');
    const now = new Date();

    visible.forEach((flow) => {
      const nextRun = ScheduledFlowCalculator.calculateNextRun(
        flow.parsedSchedule, flow.activationDate, now
      );
      const expired = nextRun === null;

      const tr = document.createElement('tr');
      tr.className = `${C.row} ${expired ? C.rowExpired : ''}`;
      tr.tabIndex = 0;

      const badgeClass = expired
        ? C.badgeExpired
        : `${C.badge} ${_freqBadgeClass(flow.parsedSchedule.frequency)}`;
      const badgeText = expired ? 'Expired' : flow.parsedSchedule.frequency;

      const nextRunCell = expired
        ? `<div style="color: #747474;">Will not run</div>
           <div class="${C.nextRunRelative}">Past start date</div>`
        : `<div class="${C.nextRunPrimary}">${ScheduledFlowCalculator.formatDateTimeLong(nextRun)}</div>
           <div class="${C.nextRunRelative}">${ScheduledFlowCalculator.formatRelative(nextRun, now)}</div>`;

      const objectCell = flow.parsedSchedule.targetObject
        ? _escapeHtml(flow.parsedSchedule.targetObject)
        : '<span style="color:#747474;">—</span>';

      let filterCell;
      if (flow.parsedSchedule.filters && flow.parsedSchedule.filters.length > 0) {
        const text = ScheduledFlowCalculator.formatFilters(flow.parsedSchedule);
        filterCell = `<div class="${C.filterText}" title="${_escapeHtml(text)}">${_escapeHtml(text)}</div>`;
      } else if (flow.parsedSchedule.targetObject) {
        filterCell = '<span style="color:#747474;">All records</span>';
      } else {
        filterCell = '<span style="color:#747474;">No filter</span>';
      }

      tr.innerHTML = `
        <td>
          <div class="${C.flowName}">${_escapeHtml(flow.label)}</div>
          ${flow.description ? `<div class="${C.flowDesc}">${_escapeHtml(flow.description)}</div>` : ''}
        </td>
        <td><span class="${C.badge} ${badgeClass}">${_escapeHtml(badgeText)}</span></td>
        <td>${nextRunCell}</td>
        <td>${objectCell}</td>
        <td>${filterCell}</td>
      `;

      tr.addEventListener('click', () => _openDetailsModal(flow));
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          _openDetailsModal(flow);
        }
      });

      tbody.appendChild(tr);
    });

    // Header sorting
    container.querySelectorAll('th[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (STATE.listSortColumn === col) {
          STATE.listSortDirection = STATE.listSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          STATE.listSortColumn = col;
          STATE.listSortDirection = 'asc';
        }
        _renderListTable();
      });
    });
  }

  function _getVisibleFlows() {
    const term = STATE.listSearchTerm.trim().toLowerCase();
    const freq = STATE.listFrequencyFilter;
    const now = new Date();

    let result = STATE.flows.slice();

    if (term) {
      result = result.filter((f) =>
        (f.label || '').toLowerCase().includes(term) ||
        (f.developerName || '').toLowerCase().includes(term)
      );
    }

    if (freq !== 'all') {
      result = result.filter((f) => f.parsedSchedule.frequency === freq);
    }

    // Sort: expired flows always at the bottom, regardless of sort direction
    result.sort((a, b) => {
      const aNext = ScheduledFlowCalculator.calculateNextRun(a.parsedSchedule, a.activationDate, now);
      const bNext = ScheduledFlowCalculator.calculateNextRun(b.parsedSchedule, b.activationDate, now);
      const aExpired = aNext === null;
      const bExpired = bNext === null;
      if (aExpired !== bExpired) return aExpired ? 1 : -1;

      let cmp;
      switch (STATE.listSortColumn) {
        case 'name':
          cmp = (a.label || '').localeCompare(b.label || '');
          break;
        case 'frequency':
          cmp = (a.parsedSchedule.frequency).localeCompare(b.parsedSchedule.frequency);
          break;
        case 'object':
          cmp = (a.parsedSchedule.targetObject || '').localeCompare(b.parsedSchedule.targetObject || '');
          break;
        case 'nextRun':
        default:
          if (aNext && bNext) cmp = aNext - bNext;
          else if (aNext) cmp = -1;
          else if (bNext) cmp = 1;
          else cmp = 0;
      }
      return STATE.listSortDirection === 'asc' ? cmp : -cmp;
    });

    return result;
  }

  function _freqBadgeClass(frequency) {
    if (frequency === 'Once') return C.badgeOnce;
    if (frequency === 'Daily') return C.badgeDaily;
    if (frequency === 'Weekly') return C.badgeWeekly;
    return '';
  }

  // ---------- Calendar View ----------

  function _renderCalendarView() {
    const body = _getBody();
    body.innerHTML = `
      <div class="${C.calToolbar}">
        <div class="${C.calNav}">
          <button type="button" class="${C.calArrow}" data-nav="-1" aria-label="Previous month">◀</button>
          <div class="${C.calTitle}" id="sfut-sfe-cal-title"></div>
          <button type="button" class="${C.calArrow}" data-nav="1" aria-label="Next month">▶</button>
          <button type="button" class="sfut-btn" data-nav="today">Today</button>
        </div>
        <div class="${C.calLegend}">
          <span class="${C.calLegendItem}"><span class="${C.calLegendSwatch} ${C.chipOnce}"></span> Once</span>
          <span class="${C.calLegendItem}"><span class="${C.calLegendSwatch} ${C.chipDaily}"></span> Daily</span>
          <span class="${C.calLegendItem}"><span class="${C.calLegendSwatch} ${C.chipWeekly}"></span> Weekly</span>
          <span class="${C.calLegendItem}"><span class="${C.calLegendSwatch} ${C.chipExpired}"></span> Past</span>
          <button type="button" class="sfut-btn ${C.refreshBtn}" title="Refresh from Salesforce">↻ Refresh</button>
        </div>
      </div>
      <div id="sfut-sfe-cal-grid-wrap"></div>
    `;

    _renderErrorBanner(body);

    body.querySelectorAll(`.${C.calArrow}, [data-nav]`).forEach((btn) => {
      btn.addEventListener('click', () => {
        const nav = btn.dataset.nav;
        if (nav === 'today') {
          const now = new Date();
          STATE.calYear = now.getFullYear();
          STATE.calMonth = now.getMonth();
        } else {
          STATE.calMonth += parseInt(nav, 10);
          if (STATE.calMonth < 0) { STATE.calMonth = 11; STATE.calYear--; }
          else if (STATE.calMonth > 11) { STATE.calMonth = 0; STATE.calYear++; }
        }
        _renderCalendarGrid();
      });
    });

    body.querySelector(`.${C.refreshBtn}`).addEventListener('click', () => {
      openExplorer({ forceRefresh: true });
    });

    _renderCalendarGrid();
  }

  function _renderCalendarGrid() {
    const wrap = STATE.overlay.querySelector('#sfut-sfe-cal-grid-wrap');
    const titleEl = STATE.overlay.querySelector('#sfut-sfe-cal-title');
    if (!wrap || !titleEl) return;

    titleEl.textContent = `${ScheduledFlowCalculator.MONTHS_LONG[STATE.calMonth]} ${STATE.calYear}`;

    // Monday-first day-of-week conversion: JS getDay() Sunday=0..Saturday=6;
    // we want Monday=0..Sunday=6.
    const mondayFirstIdx = (jsDay) => (jsDay + 6) % 7;
    const dayHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const firstOfMonth = new Date(STATE.calYear, STATE.calMonth, 1);
    const lastOfMonth = new Date(STATE.calYear, STATE.calMonth + 1, 0);
    const startOffset = mondayFirstIdx(firstOfMonth.getDay());
    const endOffset = 6 - mondayFirstIdx(lastOfMonth.getDay());

    const gridStart = new Date(STATE.calYear, STATE.calMonth, 1 - startOffset);
    const gridEnd = new Date(STATE.calYear, STATE.calMonth, lastOfMonth.getDate() + endOffset);
    gridEnd.setHours(23, 59, 59, 999);

    // Collect all runs for the visible window
    const allRuns = [];
    STATE.flows.forEach((flow) => {
      const runs = ScheduledFlowCalculator.getRunsInRange(
        flow.parsedSchedule, flow.activationDate, gridStart, gridEnd
      );
      runs.forEach((when) => allRuns.push({ flow, when }));
    });

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

    // Build the grid HTML
    let html = `<div class="${C.calGrid}">`;

    // Day headers
    dayHeaders.forEach((d) => {
      html += `<div class="${C.calHeader}">${d}</div>`;
    });

    // Cells (we'll attach event listeners after innerHTML insertion)
    const cur = new Date(gridStart);
    const cellCount = Math.round((gridEnd - gridStart) / (24 * 60 * 60 * 1000)) + 1;
    const cellEntries = []; // For attaching listeners later

    for (let i = 0; i < cellCount; i++) {
      const cellDate = new Date(cur);
      const inOtherMonth = cellDate.getMonth() !== STATE.calMonth;
      const cellKey = `${cellDate.getFullYear()}-${cellDate.getMonth()}-${cellDate.getDate()}`;
      const isToday = cellKey === todayKey;

      const dayRuns = allRuns
        .filter((r) =>
          r.when.getFullYear() === cellDate.getFullYear() &&
          r.when.getMonth() === cellDate.getMonth() &&
          r.when.getDate() === cellDate.getDate()
        )
        .sort((a, b) => a.when - b.when);

      const maxVisibleChips = 3;
      const visibleRuns = dayRuns.slice(0, maxVisibleChips);
      const overflow = dayRuns.length - maxVisibleChips;

      let cellClass = C.calCell;
      if (inOtherMonth) cellClass += ` ${C.calCellOther}`;
      if (isToday) cellClass += ` ${C.calCellToday}`;

      let chipsHtml = '';
      visibleRuns.forEach((r, idx) => {
        const isPast = r.when < today;
        const freqClass = isPast ? C.chipExpired :
          r.flow.parsedSchedule.frequency === 'Once' ? C.chipOnce :
          r.flow.parsedSchedule.frequency === 'Daily' ? C.chipDaily :
          C.chipWeekly;
        chipsHtml += `
          <div class="${C.chip} ${freqClass}"
               data-cell="${i}" data-chip-idx="${idx}"
               title="${_escapeHtml(r.flow.label)} — ${ScheduledFlowCalculator.formatTime(r.when.getHours(), r.when.getMinutes())}">
            ${ScheduledFlowCalculator.formatTime(r.when.getHours(), r.when.getMinutes())} ${_escapeHtml(r.flow.label)}
          </div>
        `;
      });
      if (overflow > 0) {
        chipsHtml += `<div class="${C.chipMore}" data-cell="${i}" data-overflow="1">+${overflow} more</div>`;
      }

      html += `
        <div class="${cellClass}">
          <div class="${C.calDate}"><span class="${C.calDateNum}">${cellDate.getDate()}</span></div>
          <div class="${C.calChips}">${chipsHtml}</div>
        </div>
      `;

      cellEntries.push({ cellIndex: i, dayRuns });
      cur.setDate(cur.getDate() + 1);
    }

    html += '</div>';
    wrap.innerHTML = html;

    // Wire chip click handlers
    wrap.querySelectorAll(`.${C.chip}`).forEach((chipEl) => {
      const cellIdx = parseInt(chipEl.dataset.cell, 10);
      const chipIdx = parseInt(chipEl.dataset.chipIdx, 10);
      const entry = cellEntries[cellIdx];
      const run = entry.dayRuns[chipIdx];
      if (run) {
        chipEl.addEventListener('click', (e) => {
          e.stopPropagation();
          _openDetailsModal(run.flow);
        });
      }
    });

    wrap.querySelectorAll(`.${C.chipMore}`).forEach((moreEl) => {
      const cellIdx = parseInt(moreEl.dataset.cell, 10);
      const entry = cellEntries[cellIdx];
      moreEl.addEventListener('click', (e) => {
        e.stopPropagation();
        _openDayModal(entry.dayRuns);
      });
    });
  }

  // ---------- Details modal ----------

  function _openDetailsModal(flow) {
    // Remove any existing child modal first
    STATE.overlay.querySelectorAll(`.${C.detailModal}, .${C.dayModal}`).forEach(el => el.remove());

    const now = new Date();
    const nextRun = ScheduledFlowCalculator.calculateNextRun(
      flow.parsedSchedule, flow.activationDate, now
    );
    const expired = nextRun === null;

    const upcoming = [];
    if (!expired && nextRun) {
      let cursor = new Date(nextRun.getTime() - 1000); // back off by 1s for first iteration
      for (let i = 0; i < 5; i++) {
        const r = ScheduledFlowCalculator.calculateNextRun(
          flow.parsedSchedule, flow.activationDate, cursor
        );
        if (!r) break;
        upcoming.push(r);
        cursor = new Date(r.getTime() + 1000);
      }
    }

    const summary = ScheduledFlowCalculator.buildSummarySentence(flow.parsedSchedule);

    const filterText = (flow.parsedSchedule.filters || []).length > 0
      ? ScheduledFlowCalculator.formatFilters(flow.parsedSchedule)
      : (flow.parsedSchedule.targetObject ? 'No filter — runs against all records' : 'Not applicable');

    const objectText = flow.parsedSchedule.targetObject || 'None (runs without a target object)';

    const activeUrl = _buildFlowBuilderUrl(flow.activeVersionId);
    const latestUrl = _buildFlowBuilderUrl(flow.latestVersionId);
    const sameVersion = flow.activeVersionId === flow.latestVersionId;

    const upcomingHtml = expired || upcoming.length === 0 ? '' : `
      <div class="${C.detailSection}">
        <div class="${C.detailSectionTitle}">Upcoming Runs (Next ${upcoming.length})</div>
        <ul class="${C.detailRunsList}">
          ${upcoming.map((d) => `
            <li>
              <span>${_escapeHtml(ScheduledFlowCalculator.formatDateTimeLong(d))}</span>
              <span style="color:#747474;font-size:11px;">${_escapeHtml(ScheduledFlowCalculator.formatRelative(d, now))}</span>
            </li>
          `).join('')}
        </ul>
      </div>
    `;

    const modal = document.createElement('div');
    modal.className = `sfut-modal-overlay ${C.detailModal}`;
    modal.innerHTML = `
      <div class="sfut-modal">
        <div class="sfut-modal-header ${C.detailHeader}">
          <div>
            <div class="${C.detailTitle}">${_escapeHtml(flow.label)}</div>
            <div class="${C.detailSubtitle}">${_escapeHtml(flow.developerName)}${expired ? ' &mdash; Expired' : ''}</div>
          </div>
          <button type="button" class="sfut-modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="sfut-modal-body ${C.detailBody}">
          <div class="${C.detailSection}">
            <div class="${C.detailSectionTitle}">Summary</div>
            <div class="${C.detailSummary}">${_escapeHtml(summary)}</div>
          </div>
          <div class="${C.detailSection}">
            <div class="${C.detailSectionTitle}">Schedule</div>
            <div class="${C.detailField}">
              <div class="${C.detailFieldLabel}">Frequency</div>
              <div class="${C.detailFieldValue}">${_escapeHtml(flow.parsedSchedule.frequency)}${
                flow.parsedSchedule.frequency === 'Weekly'
                  ? ` (every ${ScheduledFlowCalculator.DAYS_LONG[flow.parsedSchedule.weeklyDayOfWeek]})`
                  : ''
              }</div>
            </div>
            <div class="${C.detailField}">
              <div class="${C.detailFieldLabel}">Start Date</div>
              <div class="${C.detailFieldValue}">${_escapeHtml(ScheduledFlowCalculator.formatDateLong(flow.parsedSchedule.startDate))}</div>
            </div>
            <div class="${C.detailField}">
              <div class="${C.detailFieldLabel}">Start Time</div>
              <div class="${C.detailFieldValue}">${_escapeHtml(ScheduledFlowCalculator.formatTime(flow.parsedSchedule.startTimeHours, flow.parsedSchedule.startTimeMinutes))}
                <span style="color:#747474;font-size:11px;">(Org timezone)</span>
              </div>
            </div>
            <div class="${C.detailField}">
              <div class="${C.detailFieldLabel}">Activated</div>
              <div class="${C.detailFieldValue}">${
                flow.activationDate
                  ? _escapeHtml(ScheduledFlowCalculator.formatDateTimeLong(flow.activationDate))
                  : '<span style="color:#747474;">Unknown</span>'
              }</div>
            </div>
            <div class="${C.detailField}">
              <div class="${C.detailFieldLabel}">Next Run</div>
              <div class="${C.detailFieldValue}">${
                expired
                  ? '<span style="color:#747474;">Will not run</span>'
                  : `${_escapeHtml(ScheduledFlowCalculator.formatDateTimeLong(nextRun))} <span style="color:#747474;font-size:11px;">(${_escapeHtml(ScheduledFlowCalculator.formatRelative(nextRun, now))})</span>`
              }</div>
            </div>
          </div>
          <div class="${C.detailSection}">
            <div class="${C.detailSectionTitle}">Target Data</div>
            <div class="${C.detailField}">
              <div class="${C.detailFieldLabel}">Object</div>
              <div class="${C.detailFieldValue}">${_escapeHtml(objectText)}</div>
            </div>
            <div class="${C.detailField}">
              <div class="${C.detailFieldLabel}">Filter</div>
              <div class="${C.detailFieldValue}">${_escapeHtml(filterText)}</div>
            </div>
          </div>
          ${upcomingHtml}
        </div>
        <div class="sfut-modal-footer ${C.detailFooter}">
          <button type="button" class="sfut-btn" data-action="close">Close</button>
          ${sameVersion
            ? `<a href="${_escapeHtml(activeUrl)}" target="_blank" rel="noopener" class="sfut-btn sfut-btn-primary">Open Active Version</a>`
            : `
              <a href="${_escapeHtml(latestUrl)}" target="_blank" rel="noopener" class="sfut-btn">Open Latest Version</a>
              <a href="${_escapeHtml(activeUrl)}" target="_blank" rel="noopener" class="sfut-btn sfut-btn-primary">Open Active Version</a>
            `}
        </div>
      </div>
    `;
    STATE.overlay.appendChild(modal);

    modal.querySelector('.sfut-modal-close').addEventListener('click', () => modal.remove());
    modal.querySelector('[data-action="close"]').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  // ---------- Day modal ("+N more") ----------

  function _openDayModal(dayRuns) {
    STATE.overlay.querySelectorAll(`.${C.detailModal}, .${C.dayModal}`).forEach(el => el.remove());

    if (dayRuns.length === 0) return;
    const day = dayRuns[0].when;

    const modal = document.createElement('div');
    modal.className = `sfut-modal-overlay ${C.dayModal}`;
    modal.innerHTML = `
      <div class="sfut-modal">
        <div class="sfut-modal-header">
          <div>
            <div class="${C.detailTitle}">${_escapeHtml(ScheduledFlowCalculator.formatDateLong(day))}</div>
            <div class="${C.detailSubtitle}">${dayRuns.length} scheduled runs</div>
          </div>
          <button type="button" class="sfut-modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="sfut-modal-body">
          <ul class="${C.dayList}"></ul>
        </div>
      </div>
    `;
    STATE.overlay.appendChild(modal);

    const list = modal.querySelector(`.${C.dayList}`);
    dayRuns.forEach((r) => {
      const li = document.createElement('li');
      li.className = C.dayItem;
      li.tabIndex = 0;
      li.innerHTML = `
        <span class="${C.dayTime}">${_escapeHtml(ScheduledFlowCalculator.formatTime(r.when.getHours(), r.when.getMinutes()))}</span>
        <span class="${C.dayName}">${_escapeHtml(r.flow.label)}</span>
        <span class="${C.badge} ${_freqBadgeClass(r.flow.parsedSchedule.frequency)}">${_escapeHtml(r.flow.parsedSchedule.frequency)}</span>
      `;
      const open = () => {
        modal.remove();
        _openDetailsModal(r.flow);
      };
      li.addEventListener('click', open);
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
      list.appendChild(li);
    });

    modal.querySelector('.sfut-modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  // ---------- Helpers ----------

  function _getBody() {
    return STATE.overlay.querySelector('#sfut-sfe-body');
  }

  function _buildFlowBuilderUrl(flowVersionId) {
    if (!flowVersionId) return '#';
    // Standard Lightning Flow Builder URL pattern
    const origin = window.location.origin;
    return `${origin}/builder_platform_interaction/flowBuilder.app?flowId=${encodeURIComponent(flowVersionId)}`;
  }

  function _escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Lightweight toast using the existing sfut-toast CSS classes from toolkit.css.
   * Used when we need to inform the user (e.g. feature disabled).
   *
   * @param {string} message
   * @param {string} type - 'info' | 'warning' | 'error'
   */
  function _showToast(message, type = 'info') {
    document.querySelectorAll('.sfut-toast[data-feature="sfe"]').forEach(el => el.remove());

    const toast = document.createElement('div');
    toast.className = `sfut-toast ${
      type === 'error' ? 'sfut-toast-error' :
      type === 'warning' ? 'sfut-toast-warning' : ''
    }`;
    toast.dataset.feature = 'sfe';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('sfut-toast-visible'));

    setTimeout(() => {
      toast.classList.remove('sfut-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ---------- Public API ----------


  function isEnabled() { return _enabled; }
  return {
    init,
    onActivate,
    openExplorer,
    close,
    isEnabled
  };

})();

// Register with the toolkit
SFFlowUtilityToolkit.registerFeature('scheduled-flow-explorer', ScheduledFlowExplorer);