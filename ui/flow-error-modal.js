// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Mark Jones. SF Flow Utility Toolkit.
/**
 * SF Flow Utility Toolkit - Flow Error Modal
 *
 * Renders the Flow Error Explorer modal with two tabs:
 *   - Tab 1: Error Analysis  — translation, element info, recommendations,
 *                              AI escalation, and record IDs.
 *   - Tab 2: Error Dictionary — full searchable reference, pre-filtered
 *                               to the current error code on open.
 *
 * Follows the same structural pattern as flow-health-modal.js:
 *   _ensureModal(), showLoading(), showError(), showReport(), close()
 *
 * Depends on:
 *   flow-error-dictionary.js
 *   flow-error-translator.js  (indirectly — via the context object)
 */

const FlowErrorModal = (() => {

  // CSS class namespace — fee = Flow Error Explorer
  const C = {
    overlay:        'sfut-fee-overlay',
    surface:        'sfut-fee-surface',
    header:         'sfut-fee-header',
    headerTitle:    'sfut-fee-header-title',
    headerMeta:     'sfut-fee-header-meta',
    closeBtn:       'sfut-fee-close',
    tabs:           'sfut-fee-tabs',
    tab:            'sfut-fee-tab',
    tabActive:      'sfut-fee-tab--active',
    body:           'sfut-fee-body',
    panel:          'sfut-fee-panel',
    panelActive:    'sfut-fee-panel--active',
    footer:         'sfut-fee-footer',
    // Analysis tab
    badge:          'sfut-fee-badge',
    badgeHigh:      'sfut-fee-badge--high',
    badgeMedium:    'sfut-fee-badge--medium',
    badgeLow:       'sfut-fee-badge--low',
    section:        'sfut-fee-section',
    sectionTitle:   'sfut-fee-section-title',
    elementCard:    'sfut-fee-element-card',
    elementType:    'sfut-fee-element-type',
    elementLabel:   'sfut-fee-element-label',
    errorBox:       'sfut-fee-error-box',
    errorCode:      'sfut-fee-error-code',
    errorMsg:       'sfut-fee-error-message',
    cascadeBanner:  'sfut-fee-cascade-banner',
    recList:        'sfut-fee-rec-list',
    recItem:        'sfut-fee-rec-item',
    recNum:         'sfut-fee-rec-num',
    recText:        'sfut-fee-rec-text',
    recordIds:      'sfut-fee-record-ids',
    // Dictionary tab
    dictSearch:     'sfut-fee-dict-search',
    dictFilter:     'sfut-fee-dict-filter',
    dictControls:   'sfut-fee-dict-controls',
    dictList:       'sfut-fee-dict-list',
    dictEntry:      'sfut-fee-dict-entry',
    dictEntryCode:  'sfut-fee-dict-entry-code',
    dictEntryTitle: 'sfut-fee-dict-entry-title',
    dictEntryBody:  'sfut-fee-dict-entry-body',
    dictHighlight:  'sfut-fee-dict-entry--highlight',
    dictEmpty:      'sfut-fee-dict-empty',
    // Loading / error states
    loading:        'sfut-fee-loading',
    errorState:     'sfut-fee-error-state',
    // Footer buttons
    btn:            'sfut-fee-btn',
    btnPrimary:     'sfut-fee-btn--primary',
    btnSecondary:   'sfut-fee-btn--secondary'
  };

  // -------------------------------------------------------------------------
  // Module state
  // -------------------------------------------------------------------------

  let _overlay = null;
  let _activeTab = 'analysis';
  let _currentContext = null;

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Shows the loading state while error context is being resolved.
   */
  function showLoading() {
    _ensureModal();
    _setBody(`
      <div class="${C.loading}">
        <div class="sfut-fee-loading-spinner"></div>
        <div class="sfut-fee-loading-text">Analysing error…</div>
      </div>
    `);
    _setFooter('');
    _overlay.classList.remove('sfut-hidden');
  }

  /**
   * Shows an error state when the feature itself fails to load.
   * @param {string} message
   */
  function showError(message) {
    _ensureModal();
    _setBody(`
      <div class="${C.errorState}">
        <div class="sfut-fee-error-state-icon">⚠️</div>
        <div class="sfut-fee-error-state-msg">${_esc(message || 'An unexpected error occurred.')}</div>
      </div>
    `);
    _setFooter('');
    _overlay.classList.remove('sfut-hidden');
  }

  /**
   * Renders the full two-tab Error Explorer modal.
   *
   * @param {Object} context    The error context object from FlowErrorDetector.
   * @param {Object} [handlers] Optional callbacks: { buildPrompt }
   */
  function showReport(context, handlers = {}) {
    _ensureModal();
    _currentContext = context;
    _activeTab = 'analysis';

    _renderTabs();
    _renderAnalysisPanel(context, handlers);
    _renderDictionaryPanel(context.translation.exceptionCode);
    _renderFooter(context, handlers);

    _switchTab('analysis');
    _overlay.classList.remove('sfut-hidden');
  }

  /**
   * Opens the dictionary tab directly, optionally pre-filtered to a code.
   * Used when opening the Error Dictionary standalone from Setup.
   *
   * @param {string} [filterCode]  Exception code to pre-filter to.
   */
  function showDictionary(filterCode) {
    _ensureModal();
    _currentContext = null;
    _activeTab = 'dictionary';

    _renderTabs(true);
    _renderAnalysisPanel(null, {});
    _renderDictionaryPanel(filterCode || null);
    _renderFooter(null, {});

    _switchTab('dictionary');
    _overlay.classList.remove('sfut-hidden');
  }

  /**
   * Closes the modal.
   */
  function close() {
    if (!_overlay) return;
    _overlay.classList.add('sfut-hidden');
  }

  // -------------------------------------------------------------------------
  // Private — modal shell
  // -------------------------------------------------------------------------

  function _ensureModal() {
    if (_overlay) return;

    _overlay = document.createElement('div');
    _overlay.className = `${C.overlay} sfut-hidden`;
    _overlay.innerHTML = `
      <div class="${C.surface}" role="dialog" aria-modal="true" aria-label="Flow Error Explorer">

        <div class="${C.header}">
          <div>
            <div class="${C.headerTitle}">🔍 Flow Error Explorer</div>
            <div class="${C.headerMeta}" id="sfut-fee-header-meta"></div>
          </div>
          <button class="${C.closeBtn}" type="button" title="Close" aria-label="Close">×</button>
        </div>

        <div class="${C.tabs}" id="sfut-fee-tabs" role="tablist">
          <button class="${C.tab}" id="sfut-fee-tab-analysis" role="tab"
                  aria-controls="sfut-fee-panel-analysis" data-tab="analysis">
            Error Analysis
          </button>
          <button class="${C.tab}" id="sfut-fee-tab-dictionary" role="tab"
                  aria-controls="sfut-fee-panel-dictionary" data-tab="dictionary">
            Error Dictionary
          </button>
        </div>

        <div class="${C.body}">
          <div class="${C.panel}" id="sfut-fee-panel-analysis" role="tabpanel"
               aria-labelledby="sfut-fee-tab-analysis"></div>
          <div class="${C.panel}" id="sfut-fee-panel-dictionary" role="tabpanel"
               aria-labelledby="sfut-fee-tab-dictionary"></div>
        </div>

        <div class="${C.footer}" id="sfut-fee-footer"></div>
      </div>
    `;

    document.body.appendChild(_overlay);

    // Close on backdrop click.
    _overlay.addEventListener('click', (e) => {
      if (e.target === _overlay) close();
    });

    // Close button.
    _overlay.querySelector(`.${C.closeBtn}`).addEventListener('click', close);

    // Tab switching.
    _overlay.querySelectorAll(`.${C.tab}`).forEach((tab) => {
      tab.addEventListener('click', () => _switchTab(tab.dataset.tab));
    });
  }

  function _setBody(html) {
    const analysis = _overlay.querySelector('#sfut-fee-panel-analysis');
    if (analysis) analysis.innerHTML = html;
  }

  function _setFooter(html) {
    const footer = _overlay.querySelector(`#sfut-fee-footer`);
    if (footer) footer.innerHTML = html;
  }

  function _switchTab(tabName) {
    _activeTab = tabName;

    _overlay.querySelectorAll(`.${C.tab}`).forEach((t) => {
      const isActive = t.dataset.tab === tabName;
      t.classList.toggle(C.tabActive, isActive);
      t.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    _overlay.querySelectorAll(`.${C.panel}`).forEach((p) => {
      p.classList.toggle(C.panelActive, p.id === `sfut-fee-panel-${tabName}`);
    });
  }

  // -------------------------------------------------------------------------
  // Private — tab rendering
  // -------------------------------------------------------------------------

  function _renderTabs(dictionaryOnly = false) {
    const tabAnalysis   = _overlay.querySelector('#sfut-fee-tab-analysis');
    const tabDictionary = _overlay.querySelector('#sfut-fee-tab-dictionary');
    // In dictionary-only mode (opened from Setup), hide the Error Analysis tab —
    // there is no error context to show there.
    if (tabAnalysis)   tabAnalysis.style.display   = dictionaryOnly ? 'none' : '';
    if (tabDictionary) tabDictionary.style.display = '';
  }

  // -------------------------------------------------------------------------
  // Private — Error Analysis panel
  // -------------------------------------------------------------------------

  function _renderAnalysisPanel(context, handlers) {
    const panel = _overlay.querySelector('#sfut-fee-panel-analysis');
    if (!panel) return;

    if (!context) {
      panel.innerHTML = `
        <div class="${C.errorState}">
          <div class="sfut-fee-error-state-icon">📖</div>
          <div class="sfut-fee-error-state-msg">
            Open the Error Dictionary from the sidebar or from Setup to browse all error types.
          </div>
        </div>`;
      return;
    }

    const { translation, elementType, elementLabel, elementApiName, recordIds } = context;
    const { entry, exceptionCode, humanMessage, isCascade } = translation;

    // Update header meta.
    const headerMeta = _overlay.querySelector('#sfut-fee-header-meta');
    if (headerMeta) {
      headerMeta.textContent = context.flowMetadata?.meta?.flowLabel
        ? `Flow: ${context.flowMetadata.meta.flowLabel}`
        : '';
    }

    panel.innerHTML = `

      ${isCascade ? `
        <div class="${C.cascadeBanner}">
          ⚠️ <strong>Cascade failure detected.</strong>
          This error may have originated in a called flow, trigger, or process —
          not in this element directly. See recommendations below.
        </div>
      ` : ''}

      <div class="${C.section}">
        <div class="${C.sectionTitle}">Faulted Element</div>
        <div class="${C.elementCard}">
          <span class="${C.elementType}">${_esc(elementType)}</span>
          <span class="${C.elementLabel}">${_esc(elementLabel)}</span>
          ${elementApiName ? `<span class="sfut-fee-api-name">${_esc(elementApiName)}</span>` : ''}
        </div>
      </div>

      <div class="${C.section}">
        <div class="${C.sectionTitle}">
          Error
          <span class="${C.badge} ${_severityClass(entry.severity)}">${_esc(entry.severity.toUpperCase())}</span>
          <span class="sfut-fee-category-pill">${_esc(entry.category)}</span>
        </div>
        <div class="${C.errorBox}">
          <div class="${C.errorCode}">${_esc(exceptionCode)}</div>
          <div class="${C.errorMsg}">${_esc(humanMessage)}</div>
        </div>
      </div>

      <div class="${C.section}">
        <div class="${C.sectionTitle}">What This Means</div>
        <p class="sfut-fee-description">${_esc(entry.description)}</p>
      </div>

      <div class="${C.section}">
        <div class="${C.sectionTitle}">Recommendations</div>
        <ol class="${C.recList}">
          ${(entry.recommendations || []).map((rec, i) => `
            <li class="${C.recItem}">
              <span class="${C.recNum}">${i + 1}</span>
              <span class="${C.recText}">${_esc(rec)}</span>
            </li>
          `).join('')}
        </ol>
      </div>

      ${(recordIds && recordIds.length > 0) ? `
        <div class="${C.section}">
          <div class="${C.sectionTitle}">Affected Record IDs</div>
          <div class="${C.recordIds}">
            ${recordIds.map((id) => `<code class="sfut-fee-record-id">${_esc(id)}</code>`).join('')}
          </div>
        </div>
      ` : ''}

      ${(entry.relatedCodes && entry.relatedCodes.length > 0) ? `
        <div class="${C.section}">
          <div class="${C.sectionTitle}">Related Error Types</div>
          <div class="sfut-fee-related-codes">
            ${entry.relatedCodes.map((code) => `
              <button class="sfut-fee-related-code-btn" data-code="${_esc(code)}">${_esc(code)}</button>
            `).join('')}
          </div>
        </div>
      ` : ''}

    `;

    // Wire up related code buttons to open the dictionary tab at that entry.
    panel.querySelectorAll('.sfut-fee-related-code-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        _renderDictionaryPanel(btn.dataset.code);
        _switchTab('dictionary');
      });
    });
  }

  // -------------------------------------------------------------------------
  // Private — Error Dictionary panel
  // -------------------------------------------------------------------------

  function _renderDictionaryPanel(highlightCode) {
    const panel = _overlay.querySelector('#sfut-fee-panel-dictionary');
    if (!panel) return;

    const categories = FlowErrorDictionary.getCategories();

    panel.innerHTML = `
      <div class="${C.dictControls}">
        <input
          type="search"
          class="${C.dictSearch}"
          id="sfut-fee-dict-search-input"
          placeholder="Search errors…"
          aria-label="Search error dictionary"
        />
        <select class="${C.dictFilter}" id="sfut-fee-dict-filter-select" aria-label="Filter by category">
          <option value="">All Categories</option>
          ${categories.map((cat) => `<option value="${_esc(cat)}">${_esc(cat)}</option>`).join('')}
        </select>
      </div>
      <div class="${C.dictList}" id="sfut-fee-dict-list" role="list"></div>
    `;

    _populateDictionary(null, null, highlightCode);

    // Wire up search and filter.
    const searchInput  = panel.querySelector('#sfut-fee-dict-search-input');
    const filterSelect = panel.querySelector('#sfut-fee-dict-filter-select');

    let searchTimer = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        _populateDictionary(searchInput.value, filterSelect.value, highlightCode);
      }, 200);
    });

    filterSelect.addEventListener('change', () => {
      _populateDictionary(searchInput.value, filterSelect.value, highlightCode);
    });

    // If there's a highlight code, pre-scroll to it after a short render delay.
    if (highlightCode) {
      setTimeout(() => {
        const target = panel.querySelector(`[data-entry-code="${CSS.escape(highlightCode)}"]`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }

  function _populateDictionary(searchTerm, categoryFilter, highlightCode) {
    const listEl = _overlay.querySelector('#sfut-fee-dict-list');
    if (!listEl) return;

    let entries = searchTerm
      ? FlowErrorDictionary.search(searchTerm)
      : FlowErrorDictionary.getAll().filter((e) => !e.code.startsWith('*'));

    if (categoryFilter) {
      entries = entries.filter((e) => e.category === categoryFilter);
    }

    if (entries.length === 0) {
      listEl.innerHTML = `<div class="${C.dictEmpty}">No matching entries found.</div>`;
      return;
    }

    listEl.innerHTML = entries.map((entry) => {
      const isHighlight = entry.code === highlightCode;
      return `
        <div
          class="${C.dictEntry} ${isHighlight ? C.dictHighlight : ''}"
          data-entry-code="${_esc(entry.code)}"
          role="listitem"
        >
          <button class="sfut-fee-dict-toggle" data-target="sfut-fee-entry-body-${_esc(entry.code)}"
                  aria-expanded="${isHighlight ? 'true' : 'false'}">
            <span>${_esc(entry.title)}</span>
            <span>${isHighlight ? '▲' : '▼'}</span>
          </button>
          <div class="sfut-fee-dict-entry-header">
            <code class="${C.dictEntryCode}">${_esc(entry.code)}</code>
            <span class="${C.badge} ${_severityClass(entry.severity)}">${_esc(entry.severity.toUpperCase())}</span>
            <span class="sfut-fee-category-pill">${_esc(entry.category)}</span>
          </div>
          <div class="${C.dictEntryBody} sfut-fee-dict-entry-body--collapsed" id="sfut-fee-entry-body-${_esc(entry.code)}">
            <p class="sfut-fee-description">${_esc(entry.description)}</p>
            <div class="sfut-fee-dict-causes">
              <strong>Common Causes</strong>
              <ul>
                ${(entry.causes || []).map((c) => `<li>${_esc(c)}</li>`).join('')}
              </ul>
            </div>
            <div class="sfut-fee-dict-recs">
              <strong>Recommendations</strong>
              <ol>
                ${(entry.recommendations || []).map((r) => `<li>${_esc(r)}</li>`).join('')}
              </ol>
            </div>
            ${entry.example ? `
              <div class="sfut-fee-dict-example">
                <strong>Example</strong>
                <code class="sfut-fee-dict-example-code">${_esc(entry.example)}</code>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    // If the highlight entry should be expanded on open, expand it.
    if (highlightCode) {
      const body = listEl.querySelector(`#sfut-fee-entry-body-${CSS.escape(highlightCode)}`);
      if (body) body.classList.remove('sfut-fee-dict-entry-body--collapsed');
    }

    // Wire up expand/collapse toggles.
    listEl.querySelectorAll('.sfut-fee-dict-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        if (!target) return;
        const isCollapsed = target.classList.contains('sfut-fee-dict-entry-body--collapsed');
        target.classList.toggle('sfut-fee-dict-entry-body--collapsed', !isCollapsed);
        btn.setAttribute('aria-expanded', isCollapsed ? 'true' : 'false');
        // Update only the arrow span (last child), leaving the title span intact.
        const arrowSpan = btn.querySelector('span:last-child');
        if (arrowSpan) arrowSpan.textContent = isCollapsed ? '▲' : '▼';
      });
    });
  }

  // -------------------------------------------------------------------------
  // Private — footer
  // -------------------------------------------------------------------------

  function _renderFooter(context, handlers) {
    const footer = _overlay.querySelector('#sfut-fee-footer');
    if (!footer) return;

    footer.innerHTML = '';

    if (context) {
      const copyBtn = document.createElement('button');
      copyBtn.className = `${C.btn} ${C.btnSecondary}`;
      copyBtn.textContent = 'Copy Error Detail';
      copyBtn.addEventListener('click', async () => {
        await _copyErrorDetail(context);
        _showToast('Error detail copied to clipboard.');
      });
      footer.appendChild(copyBtn);

      // Copy Error Prompt — copies a structured AI prompt to the clipboard.
      // Does not attempt to open the AI Assistant directly.
      if (typeof handlers.buildPrompt === 'function') {
        const promptBtn = document.createElement('button');
        promptBtn.className = `${C.btn} ${C.btnPrimary}`;
        promptBtn.textContent = '📋 Copy Error Prompt';
        promptBtn.addEventListener('click', async () => {
          promptBtn.disabled = true;
          try {
            const prompt = handlers.buildPrompt(context);
            await _writeToClipboard(prompt);
            _showToast('Error prompt copied to clipboard.');
          } catch (e) {
            _showToast('Could not copy to clipboard.', true);
          } finally {
            promptBtn.disabled = false;
          }
        });
        footer.appendChild(promptBtn);
      }
    } else {
      // Standalone dictionary mode — just a Close button.
      const closeBtn = document.createElement('button');
      closeBtn.className = `${C.btn} ${C.btnSecondary}`;
      closeBtn.textContent = 'Close';
      closeBtn.addEventListener('click', close);
      footer.appendChild(closeBtn);
    }
  }

  // -------------------------------------------------------------------------
  // Private — actions
  // -------------------------------------------------------------------------

  /**
   * Shared clipboard helper — tries navigator.clipboard first, falls back
   * to the execCommand approach for restricted content script environments.
   * Throws on total failure so callers can show an error toast.
   *
   * @param {string} text
   */
  async function _writeToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (e) {
      // Fall through to execCommand fallback.
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e2) {
      console.warn('[SFUT FlowErrorModal] Both clipboard methods failed:', e2);
      throw e2;
    }
  }

  async function _copyErrorDetail(context) {
    const { translation, elementType, elementLabel, elementApiName } = context;
    const { exceptionCode, humanMessage, entry } = translation;

    const lines = [
      `Flow Error Explorer — Error Detail`,
      ``,
      `Element: ${elementType}: ${elementLabel}${elementApiName ? ` (${elementApiName})` : ''}`,
      `Error Code: ${exceptionCode}`,
      `Error: ${humanMessage}`,
      `Category: ${entry.category}`,
      `Severity: ${entry.severity.toUpperCase()}`,
      ``,
      `What This Means:`,
      entry.description,
      ``,
      `Recommendations:`,
      ...(entry.recommendations || []).map((r, i) => `${i + 1}. ${r}`),
      ``,
      `Raw Fault Message:`,
      context.rawFaultString
    ];

    await _writeToClipboard(lines.join('\n'));
  }

  /**
   * Shows a brief toast notification inside the modal footer.
   * Auto-dismisses after 2.5 seconds.
   *
   * @param {string}  message
   * @param {boolean} [isError]
   */
  function _showToast(message, isError = false) {
    const existing = _overlay.querySelector('.sfut-fee-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'sfut-fee-toast' + (isError ? ' sfut-fee-toast--error' : '');
    toast.textContent = message;

    const footer = _overlay.querySelector('#sfut-fee-footer');
    if (footer) footer.insertBefore(toast, footer.firstChild);

    setTimeout(() => {
      toast.classList.add('sfut-fee-toast--fade');
      setTimeout(() => toast.remove(), 400);
    }, 2500);
  }

  // -------------------------------------------------------------------------
  // Private — utilities
  // -------------------------------------------------------------------------

  function _severityClass(severity) {
    switch ((severity || '').toLowerCase()) {
      case 'high':   return C.badgeHigh;
      case 'medium': return C.badgeMedium;
      case 'low':    return C.badgeLow;
      default:       return C.badgeLow;
    }
  }

  function _esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  return {
    showLoading,
    showError,
    showReport,
    showDictionary,
    close
  };

})();