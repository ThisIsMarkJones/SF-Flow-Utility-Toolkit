/**
 * SF Flow Utility Toolkit - Unused Resources Modal
 *
 * Renders the modal report produced by UnusedResourcesAnalyser.
 *
 * States:
 *   - showLoading(flowLabel)              — spinner while metadata is fetched/scanned
 *   - showError(message)                  — terminal error display
 *   - showReport(report, handlers)        — grouped list of unused resources
 *
 * Click handlers:
 *   - handlers.onResourceClick(resource)  — invoked when a resource row is clicked,
 *                                           used by the feature module to attempt
 *                                           navigation in the Manager tab.
 */

const UnusedResourcesModal = (() => {

  let overlay = null;

  function showLoading(flowLabel = 'Flow') {
    _ensureModal();
    const body = overlay.querySelector('.sfut-unused-modal-body');

    overlay.classList.remove('sfut-hidden');
    body.innerHTML = `
      <div class="sfut-unused-loading">
        <div class="sfut-unused-loading-title">Scanning for Unused Resources</div>
        <div class="sfut-unused-loading-subtitle">${_escapeHtml(flowLabel)}</div>
        <div class="sfut-unused-loading-spinner"></div>
      </div>
    `;
  }

  function showError(message) {
    _ensureModal();
    const body = overlay.querySelector('.sfut-unused-modal-body');

    overlay.classList.remove('sfut-hidden');
    body.innerHTML = `
      <div class="sfut-unused-error">
        <div class="sfut-unused-section-title">Couldn't Find Unused Resources</div>
        <div class="sfut-unused-error-message">${_escapeHtml(message || 'Unknown error')}</div>
      </div>
    `;
  }

  /**
   * Renders the report.
   *
   * @param {Object} report - { flowLabel, totalResources, totalUnused, groups }
   * @param {Object} handlers - { onResourceClick(resource) }
   */
  function showReport(report, handlers = {}) {
    _ensureModal();
    const body = overlay.querySelector('.sfut-unused-modal-body');

    overlay.classList.remove('sfut-hidden');

    const flowLabel = report.flowLabel || 'Current Flow';

    if (report.totalResources === 0) {
      body.innerHTML = `
        <div class="sfut-unused-header-block">
          <div class="sfut-unused-flow-name">${_escapeHtml(flowLabel)}</div>
        </div>
        <div class="sfut-unused-empty">
          <div class="sfut-unused-empty-icon">📭</div>
          <div class="sfut-unused-empty-title">No resources to check</div>
          <div class="sfut-unused-empty-message">
            This Flow doesn't have any user-authored resources in scope
            (Variables, Constants, Formulas, Text Templates, Choices,
            Choice Sets, or Stages).
          </div>
        </div>
      `;
      return;
    }

    if (report.totalUnused === 0) {
      body.innerHTML = `
        <div class="sfut-unused-header-block">
          <div class="sfut-unused-flow-name">${_escapeHtml(flowLabel)}</div>
          <div class="sfut-unused-flow-meta">
            <span>${report.totalResources} resource${report.totalResources === 1 ? '' : 's'} scanned</span>
          </div>
        </div>
        <div class="sfut-unused-empty sfut-unused-empty-success">
          <div class="sfut-unused-empty-icon">✨</div>
          <div class="sfut-unused-empty-title">No unused resources found</div>
          <div class="sfut-unused-empty-message">
            Every resource in this Flow is referenced somewhere.
          </div>
        </div>
      `;
      return;
    }

    body.innerHTML = `
      <div class="sfut-unused-header-block">
        <div class="sfut-unused-flow-name">${_escapeHtml(flowLabel)}</div>
        <div class="sfut-unused-summary-line">
          <span class="sfut-unused-count-num">${report.totalUnused}</span>
          unused resource${report.totalUnused === 1 ? '' : 's'} found
          out of ${report.totalResources} scanned
        </div>
      </div>

      <div class="sfut-unused-hint">
        Click a resource to open it in the Manager tab.
      </div>

      <div class="sfut-unused-groups">
        ${report.groups.map(_renderGroup).join('')}
      </div>
    `;

    // Wire up row clicks — uses event delegation so a single listener handles
    // every row regardless of how many groups are rendered.
    body.querySelectorAll('.sfut-unused-item').forEach((row) => {
      row.addEventListener('click', () => {
        const name = row.dataset.resourceName;
        const metadataKey = row.dataset.metadataKey;
        if (!name || !handlers.onResourceClick) return;

        handlers.onResourceClick({ name, metadataKey });
      });
    });
  }

  function close() {
    if (!overlay) return;
    overlay.classList.add('sfut-hidden');
  }

  function isOpen() {
    return overlay && !overlay.classList.contains('sfut-hidden');
  }

  // --- Internals ---

  function _ensureModal() {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.className = 'sfut-modal-overlay sfut-hidden';
    overlay.innerHTML = `
      <div class="sfut-modal sfut-unused-modal">
        <div class="sfut-modal-header">
          <span>Find Unused Resources</span>
          <button class="sfut-modal-close" type="button" aria-label="Close">&times;</button>
        </div>
        <div class="sfut-modal-body sfut-unused-modal-body"></div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('.sfut-modal-close')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  }

  function _renderGroup(group) {
    return `
      <div class="sfut-unused-group">
        <div class="sfut-unused-group-header">
          <span class="sfut-unused-group-title">${_escapeHtml(group.typePlural)}</span>
          <span class="sfut-unused-group-count">${group.count}</span>
        </div>
        <ul class="sfut-unused-list">
          ${group.items.map((item) => _renderItem(item, group.metadataKey)).join('')}
        </ul>
      </div>
    `;
  }

  function _renderItem(item, metadataKey) {
    const dataType = item.dataType
      ? `<span class="sfut-unused-item-datatype">${_escapeHtml(item.dataType)}</span>`
      : '';

    const description = item.description
      ? `<div class="sfut-unused-item-desc">${_escapeHtml(item.description)}</div>`
      : '';

    return `
      <li class="sfut-unused-item"
          data-resource-name="${_escapeHtml(item.name)}"
          data-metadata-key="${_escapeHtml(metadataKey)}"
          tabindex="0"
          role="button"
          title="Open ${_escapeHtml(item.name)} in the Manager">
        <div class="sfut-unused-item-main">
          <span class="sfut-unused-item-name">${_escapeHtml(item.name)}</span>
          ${dataType}
        </div>
        ${description}
        <span class="sfut-unused-item-arrow" aria-hidden="true">→</span>
      </li>
    `;
  }

  function _escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- Public API ---
  return {
    showLoading,
    showError,
    showReport,
    close,
    isOpen
  };

})();