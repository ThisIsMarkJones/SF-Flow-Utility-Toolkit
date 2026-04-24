/**
 * SF Flow Utility Toolkit - Flow Version Manager
 *
 * Adds row-level checkboxes plus a "Delete Selected Versions" action
 * to the Salesforce Flow details / versions page in Setup.
 *
 * Target page:
 * - Visualforce-style Flow Details page
 * - Versions table id: view:lists:versions
 */

const FlowVersionManager = (() => {
  const SELECTORS = {
    versionsTable: 'table.list[id="view:lists:versions"]',
    versionsTbody: 'tbody[id="view:lists:versions:tb"]',
    versionRows: 'tbody[id="view:lists:versions:tb"] > tr.dataRow',
    headerRow: 'table.list[id="view:lists:versions"] > thead > tr.headerRow',
    headerCells: 'th.headerRow',
    bodyCells: 'td.dataCell',
    buttonBar: 'td[id="view:form:thePageBlock:pageBlockButtons"]',
    rowDeleteLink: 'a[id$=":deleteLink"]',
    rowActionForm: 'form[id$=":actionLinkForm"]'
  };

  const CLASS_NAMES = {
    checkboxCell: 'sfut-version-select-cell',
    checkbox: 'sfut-version-select-checkbox',
    rowSelected: 'sfut-version-selected',
    rowDisabled: 'sfut-version-row-disabled',
    deleteButton: 'sfut-version-manager-delete-btn',
    modalBackdrop: 'sfut-version-manager-backdrop',
    modal: 'sfut-version-manager-modal',
    modalHeader: 'sfut-version-manager-modal-header',
    modalTitle: 'sfut-version-manager-modal-title',
    modalClose: 'sfut-version-manager-modal-close',
    modalBody: 'sfut-version-manager-modal-body',
    modalIntro: 'sfut-version-manager-modal-intro',
    modalWarning: 'sfut-version-manager-modal-warning',
    modalList: 'sfut-version-manager-modal-list',
    modalConfirmRow: 'sfut-version-manager-modal-confirm-row',
    modalConfirmLabel: 'sfut-version-manager-modal-confirm-label',
    modalConfirmInput: 'sfut-version-manager-modal-confirm-input',
    modalError: 'sfut-version-manager-error',
    modalFooter: 'sfut-version-manager-modal-footer',
    cancelButton: 'sfut-version-manager-btn-secondary',
    confirmButton: 'sfut-version-manager-btn-danger'
  };

  const STORAGE_KEYS = {
    deleteQueue: 'sfut_flow_version_delete_queue',
    completionToast: 'sfut_flow_version_delete_toast'
  };

  const STATE = {
    observer: null,
    refreshTimer: null,
    isInitialised: false,
    versionTable: null,
    headerInjected: false,
    toolbarButton: null,
    selectedVersionIds: new Set(),
    rowMap: new Map(),
    isDeleting: false,
    queueResumeAttempted: false
  };

  async function init() {
    if (STATE.isInitialised) {
      _refresh(true);
      _resumeQueuedDeleteIfNeeded();
      _showDeferredToastIfNeeded();
      return;
    }

    const hasVersionsTable = !!document.querySelector(SELECTORS.versionsTable);
    const context = typeof ContextDetector !== 'undefined'
      ? ContextDetector.detectContext()
      : null;

    if (!hasVersionsTable && context && context !== ContextDetector.CONTEXTS.FLOW_DETAILS) {
      return;
    }

    if (!_isLikelyFlowVersionsPage()) {
      console.log('[SFUT] Flow Version Manager: page did not match Flow Details heuristics.');
      return;
    }

    _refresh(true);
    _startObserver();

    STATE.isInitialised = true;
    console.log('[SFUT] Flow Version Manager initialised.');

    _resumeQueuedDeleteIfNeeded();
    _showDeferredToastIfNeeded();
  }

  async function onActivate() {
    _refresh(true);
    _resumeQueuedDeleteIfNeeded();
    _showDeferredToastIfNeeded();
  }

  async function refresh() {
    _refresh(true);
    _resumeQueuedDeleteIfNeeded();
    _showDeferredToastIfNeeded();
  }

  function _isLikelyFlowVersionsPage() {
    const hasDirectTable = !!document.querySelector(SELECTORS.versionsTable);
    if (hasDirectTable) return true;

    const url = window.location.href;
    return (
      url.includes('lightning/setup/Flows/page') ||
      url.includes('/udd/FlowDefinition/viewFlowDefinition.apexp')
    );
  }

  function _startObserver() {
    if (STATE.observer) return;

    STATE.observer = new MutationObserver(() => {
      clearTimeout(STATE.refreshTimer);
      STATE.refreshTimer = setTimeout(() => _refresh(), 200);
    });

    STATE.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function _refresh(force = false) {
    const table = _findVersionTable();

    if (!table) {
      if (force) {
        console.log('[SFUT] Flow Version Manager: versions table not found.');
      }
      return;
    }

    if (STATE.versionTable !== table) {
      STATE.versionTable = table;
      STATE.headerInjected = false;
      STATE.toolbarButton = null;
      STATE.rowMap.clear();
      STATE.selectedVersionIds.clear();
    }

    _ensureHeaderCheckboxColumn(table);
    _processRows(table);
    _pruneStaleRows();
    _ensureToolbarButton();
    _updateToolbarState();
  }

  function _findVersionTable() {
    return document.querySelector(SELECTORS.versionsTable);
  }

  function _ensureHeaderCheckboxColumn(table) {
    if (STATE.headerInjected) return;

    const headerRow = table.querySelector(SELECTORS.headerRow);
    if (!headerRow) return;

    if (headerRow.querySelector(`.${CLASS_NAMES.checkboxCell}`)) {
      STATE.headerInjected = true;
      return;
    }

    const firstHeaderCell = headerRow.querySelector(SELECTORS.headerCells);
    if (!firstHeaderCell) return;

    const th = document.createElement('th');
    th.className = `headerRow ${CLASS_NAMES.checkboxCell}`;
    th.setAttribute('scope', 'col');
    th.setAttribute('data-sfut-column', 'version-select');
    th.innerHTML = '<div><span class="slds-assistive-text">Select versions</span></div>';

    headerRow.insertBefore(th, firstHeaderCell);
    STATE.headerInjected = true;
  }

  function _processRows(table) {
    const rows = Array.from(table.querySelectorAll(SELECTORS.versionRows));
    for (const row of rows) {
      _decorateRow(row);
    }
  }

  function _decorateRow(row) {
    const rowMeta = _extractRowMetadata(row);
    if (!rowMeta.versionId) return;

    STATE.rowMap.set(rowMeta.versionId, rowMeta);

    const existingCell = row.querySelector(`.${CLASS_NAMES.checkboxCell}`);
    if (existingCell) {
      _syncRowUi(row, rowMeta, existingCell.querySelector(`.${CLASS_NAMES.checkbox}`));
      return;
    }

    const firstCell = row.querySelector(SELECTORS.bodyCells);
    if (!firstCell) return;

    const checkboxCell = document.createElement('td');
    checkboxCell.className = `dataCell ${CLASS_NAMES.checkboxCell}`;
    checkboxCell.setAttribute('data-sfut-column', 'version-select');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = CLASS_NAMES.checkbox;
    checkbox.dataset.versionId = rowMeta.versionId;
    checkbox.title = rowMeta.canDelete
      ? `Select ${rowMeta.versionLabel}`
      : rowMeta.disabledReason;

    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        STATE.selectedVersionIds.add(rowMeta.versionId);
      } else {
        STATE.selectedVersionIds.delete(rowMeta.versionId);
      }

      _syncRowUi(row, rowMeta, checkbox);
      _updateToolbarState();
    });

    checkboxCell.appendChild(checkbox);
    row.insertBefore(checkboxCell, firstCell);

    _syncRowUi(row, rowMeta, checkbox);
  }

  function _extractRowMetadata(row) {
    const cells = Array.from(row.querySelectorAll(SELECTORS.bodyCells));
    if (!cells.length) return { versionId: null };

    const cellTexts = cells.map((cell) => (cell.textContent || '').replace(/\s+/g, ' ').trim());

    const flowLabel = _extractFlowLabel(cells[1]) || cellTexts[1] || 'Unknown Flow';
    const versionNumber = _extractVersionNumber(cells[2]) || (cells[2]?.textContent || '').replace(/\s+/g, ' ').trim() || null;
    const status = ((cells[7]?.textContent || '').replace(/\s+/g, ' ').trim() || 'unknown').toLowerCase();
    const progressStatus = ((cells[8]?.textContent || '').replace(/\s+/g, ' ').trim() || '').toLowerCase();

    const deleteLink = row.querySelector(SELECTORS.rowDeleteLink);
    const form = row.querySelector(SELECTORS.rowActionForm);

    const currentVersionId = _extractCurrentVersionId(row, deleteLink);
    const versionId = currentVersionId || _hashRowIdentity(flowLabel, versionNumber, status, progressStatus);

    const canDelete = !!deleteLink && !!form && status !== 'active';
    const disabledReason = canDelete ? '' : 'Active versions cannot be deleted';

    return {
      versionId,
      currentVersionId,
      versionLabel: versionNumber ? `Version ${versionNumber}` : flowLabel,
      flowLabel,
      versionNumber,
      status,
      progressStatus,
      canDelete,
      disabledReason,
      deleteLink,
      form,
      row,
      cells: cellTexts
    };
  }

  function _extractFlowLabel(cell) {
    if (!cell) return '';

    const linkText = Array.from(cell.querySelectorAll('a'))
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .find(Boolean);
    if (linkText) return linkText;

    const strongText = Array.from(cell.querySelectorAll('b, strong'))
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .find(Boolean);
    if (strongText) return strongText;

    const cloned = cell.cloneNode(true);
    cloned.querySelectorAll('script, style, .helpButton, .mouseovertips, img').forEach((el) => el.remove());
    return (cloned.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function _extractVersionNumber(cell) {
    if (!cell) return '';
    const text = (cell.textContent || '').replace(/\s+/g, ' ').trim();
    const match = text.match(/\d+/);
    return match ? match[0] : text;
  }

  function _extractCurrentVersionId(row, deleteLink) {
    const link = deleteLink || row.querySelector(SELECTORS.rowDeleteLink);
    const onclick = link?.getAttribute('onclick') || '';

    const match = onclick.match(/currVersionId,([0-9A-Za-z]{15,18})/);
    return match ? match[1] : null;
  }

  function _hashRowIdentity(flowLabel, versionNumber, status, progressStatus) {
    const source = `${flowLabel}::${versionNumber}::${status}::${progressStatus}`;
    let hash = 0;

    for (let i = 0; i < source.length; i += 1) {
      hash = ((hash << 5) - hash) + source.charCodeAt(i);
      hash |= 0;
    }

    return `sfut-ver-${Math.abs(hash)}`;
  }

  function _syncRowUi(row, rowMeta, checkbox) {
    if (!checkbox) return;

    const isSelected = STATE.selectedVersionIds.has(rowMeta.versionId);

    checkbox.checked = isSelected;
    checkbox.disabled = !rowMeta.canDelete || STATE.isDeleting;

    row.classList.toggle(CLASS_NAMES.rowSelected, isSelected);
    row.classList.toggle(CLASS_NAMES.rowDisabled, !rowMeta.canDelete);
  }

  function _pruneStaleRows() {
    for (const versionId of Array.from(STATE.rowMap.keys())) {
      const meta = STATE.rowMap.get(versionId);
      if (!meta?.row || !document.contains(meta.row)) {
        STATE.rowMap.delete(versionId);
        STATE.selectedVersionIds.delete(versionId);
      }
    }
  }

  function _ensureToolbarButton() {
    if (STATE.toolbarButton && document.contains(STATE.toolbarButton)) {
      return;
    }

    const buttonBar = document.querySelector(SELECTORS.buttonBar);
    if (!buttonBar) {
      console.log('[SFUT] Flow Version Manager: button bar not found.');
      return;
    }

    let button = buttonBar.querySelector(`.${CLASS_NAMES.deleteButton}`);
    if (!button) {
      button = document.createElement('input');
      button.type = 'button';
      button.value = 'Delete Selected Versions';
      button.className = `btnDisabled ${CLASS_NAMES.deleteButton}`;
      button.disabled = true;
      button.style.marginLeft = '4px';

      button.addEventListener('click', _handleBulkDeleteClick);
      buttonBar.appendChild(button);
    }

    STATE.toolbarButton = button;
  }

  function _updateToolbarState() {
    if (!STATE.toolbarButton) return;

    const selectedCount = STATE.selectedVersionIds.size;
    const label = selectedCount > 0
      ? `Delete Selected Versions (${selectedCount})`
      : 'Delete Selected Versions';

    STATE.toolbarButton.disabled = selectedCount === 0 || STATE.isDeleting;
    STATE.toolbarButton.value = label;
    STATE.toolbarButton.className = STATE.toolbarButton.disabled
      ? `btnDisabled ${CLASS_NAMES.deleteButton}`
      : `btn ${CLASS_NAMES.deleteButton}`;
  }

  async function _handleBulkDeleteClick() {
    if (STATE.isDeleting) return;

    const selected = Array.from(STATE.selectedVersionIds)
      .map((id) => STATE.rowMap.get(id))
      .filter(Boolean);

    if (!selected.length) return;

    const confirmed = await _openConfirmationModal(selected);
    if (!confirmed) return;

    try {
      _storeDeleteQueue(selected);
      _triggerNextQueuedDelete();
    } catch (error) {
      console.error('[SFUT] Flow Version Manager queue start failed:', error);
      _showToast(error?.message || 'Unable to start deleting selected versions.', 'error');
    }
  }

  function _refreshRowDisables() {
    for (const meta of STATE.rowMap.values()) {
      const checkbox = meta.row?.querySelector(`.${CLASS_NAMES.checkbox}`);
      if (checkbox) {
        _syncRowUi(meta.row, meta, checkbox);
      }
    }
  }

  function _openConfirmationModal(selected) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = CLASS_NAMES.modalBackdrop;

      const modal = document.createElement('div');
      modal.className = CLASS_NAMES.modal;
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'sfut-version-manager-title');

      modal.innerHTML = `
        <div class="${CLASS_NAMES.modalHeader}">
          <h2 id="sfut-version-manager-title" class="${CLASS_NAMES.modalTitle}">Delete Selected Versions</h2>
          <button type="button" class="${CLASS_NAMES.modalClose}" aria-label="Close">×</button>
        </div>
        <div class="${CLASS_NAMES.modalBody}">
          <p class="${CLASS_NAMES.modalIntro}">
            Are you sure you want to delete the selected flow versions?
          </p>
          <div class="${CLASS_NAMES.modalWarning}">
            If interviews are in progress on any selected version, those interviews may fail.
            We recommend deleting flow versions only during off-peak hours. Active versions cannot be deleted.
          </div>
          <ul class="${CLASS_NAMES.modalList}"></ul>
          <div class="${CLASS_NAMES.modalConfirmRow}">
            <label class="${CLASS_NAMES.modalConfirmLabel}" for="sfut-version-manager-confirm-input">
              Type <strong>DELETE</strong> to continue.
            </label>
            <input
              id="sfut-version-manager-confirm-input"
              type="text"
              class="${CLASS_NAMES.modalConfirmInput}"
              autocomplete="off"
              spellcheck="false"
            />
            <div class="${CLASS_NAMES.modalError}" hidden>
              Please type DELETE to confirm.
            </div>
          </div>
        </div>
        <div class="${CLASS_NAMES.modalFooter}">
          <button type="button" class="${CLASS_NAMES.cancelButton} sfut-version-manager-cancel">Cancel</button>
          <button type="button" class="${CLASS_NAMES.confirmButton} sfut-version-manager-confirm" disabled>
            Delete Selected Versions
          </button>
        </div>
      `;

      const list = modal.querySelector(`.${CLASS_NAMES.modalList}`);
      selected.forEach((meta) => {
        const li = document.createElement('li');
        li.textContent = `${meta.versionLabel} — ${meta.status}`;
        list.appendChild(li);
      });

      const cancelBtn = modal.querySelector('.sfut-version-manager-cancel');
      const confirmBtn = modal.querySelector('.sfut-version-manager-confirm');
      const closeBtn = modal.querySelector(`.${CLASS_NAMES.modalClose}`);
      const input = modal.querySelector(`.${CLASS_NAMES.modalConfirmInput}`);
      const error = modal.querySelector(`.${CLASS_NAMES.modalError}`);

      const updateConfirmState = () => {
        const isValid = (input.value || '').trim() === 'DELETE';
        confirmBtn.disabled = !isValid;
        if (isValid) {
          error.hidden = true;
        }
      };

      const cleanup = (result) => {
        backdrop.remove();
        resolve(result);
      };

      cancelBtn.addEventListener('click', () => cleanup(false));
      closeBtn.addEventListener('click', () => cleanup(false));

      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) cleanup(false);
      });

      input.addEventListener('input', updateConfirmState);

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !confirmBtn.disabled) confirmBtn.click();
        if (e.key === 'Escape') cleanup(false);
      });

      confirmBtn.addEventListener('click', () => {
        if (confirmBtn.disabled) return;
        cleanup(true);
      });

      updateConfirmState();

      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
      setTimeout(() => input.focus(), 0);
    });
  }

  function _storeDeleteQueue(selected) {
    const queue = selected.map((meta) => ({
      versionId: meta.versionId,
      currentVersionId: meta.currentVersionId,
      versionLabel: meta.versionLabel
    }));

    sessionStorage.setItem(STORAGE_KEYS.deleteQueue, JSON.stringify({
      items: queue,
      total: queue.length,
      completed: 0
    }));
  }

  function _readDeleteQueue() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEYS.deleteQueue);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn('[SFUT] Failed to parse delete queue:', error);
      return null;
    }
  }

  function _writeDeleteQueue(queue) {
    sessionStorage.setItem(STORAGE_KEYS.deleteQueue, JSON.stringify(queue));
  }

  function _clearDeleteQueue() {
    sessionStorage.removeItem(STORAGE_KEYS.deleteQueue);
  }

  function _storeCompletionToast(message) {
    sessionStorage.setItem(STORAGE_KEYS.completionToast, message);
  }

  function _showDeferredToastIfNeeded() {
    const message = sessionStorage.getItem(STORAGE_KEYS.completionToast);
    if (!message) return;

    sessionStorage.removeItem(STORAGE_KEYS.completionToast);
    setTimeout(() => _showToast(message, 'success'), 300);
  }

  function _resumeQueuedDeleteIfNeeded() {
    if (STATE.queueResumeAttempted) return;
    STATE.queueResumeAttempted = true;

    const queue = _readDeleteQueue();
    if (!queue || !Array.isArray(queue.items) || queue.items.length === 0) {
      return;
    }

    setTimeout(() => {
      try {
        _triggerNextQueuedDelete();
      } catch (error) {
        console.error('[SFUT] Failed resuming queued delete:', error);
        _clearDeleteQueue();
        _showToast(error?.message || 'Unable to resume deleting selected versions.', 'error');
      }
    }, 250);
  }

  function _triggerNextQueuedDelete() {
    const queue = _readDeleteQueue();

    if (!queue || !Array.isArray(queue.items) || queue.items.length === 0) {
      return;
    }

    if (queue.items.length === 0) {
      _clearDeleteQueue();
      return;
    }

    const nextItem = queue.items[0];
    const rowMeta = _findRowMetaByQueuedItem(nextItem);

    if (!rowMeta || !rowMeta.deleteLink) {
      _clearDeleteQueue();
      throw new Error(`Could not find native delete action for ${nextItem.versionLabel || 'a queued version'}.`);
    }

    queue.items.shift();
    queue.completed = (queue.completed || 0) + 1;

    if (queue.items.length === 0) {
      _storeCompletionToast(`Deleted ${queue.completed} version(s).`);
      _clearDeleteQueue();
    } else {
      _writeDeleteQueue(queue);
    }

    _invokeNativeDelete(rowMeta.deleteLink);
  }

  function _findRowMetaByQueuedItem(item) {
    for (const meta of STATE.rowMap.values()) {
      if (
        (item.currentVersionId && meta.currentVersionId === item.currentVersionId) ||
        meta.versionId === item.versionId
      ) {
        return meta;
      }
    }
    return null;
  }

  function _invokeNativeDelete(deleteLink) {
    const originalConfirmDelete = window.confirmDelete;
    const originalConfirm = window.confirm;

    window.confirmDelete = () => true;
    window.confirm = () => true;

    try {
      if (typeof deleteLink.onclick === 'function') {
        deleteLink.onclick();
      } else {
        deleteLink.click();
      }
    } finally {
      setTimeout(() => {
        window.confirmDelete = originalConfirmDelete;
        window.confirm = originalConfirm;
      }, 1000);
    }
  }

  function _showToast(message, variant = 'info') {
    const existing = document.getElementById('sfut-version-manager-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'sfut-version-manager-toast';
    toast.className = `sfut-version-manager-toast sfut-version-manager-toast--${variant}`;
    toast.textContent = message;

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  return {
    init,
    onActivate,
    refresh
  };
})();

if (typeof SFFlowUtilityToolkit !== 'undefined') {
  SFFlowUtilityToolkit.registerFeature('flow-version-manager', FlowVersionManager);
}