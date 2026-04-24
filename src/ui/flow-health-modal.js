/**
 * SF Flow Utility Toolkit - Flow Health Modal
 */

const FlowHealthModal = (() => {

  let overlay = null;

  function showLoading(flowLabel = 'Flow') {
    _ensureModal();
    const body = overlay.querySelector('.sfut-health-modal-body');

    overlay.classList.remove('sfut-hidden');
    body.innerHTML = `
      <div class="sfut-health-loading">
        <div class="sfut-health-loading-title">Running Health Check</div>
        <div class="sfut-health-loading-subtitle">${_escapeHtml(flowLabel)}</div>
        <div class="sfut-health-loading-spinner"></div>
      </div>
    `;
  }

  function showError(message) {
    _ensureModal();
    const body = overlay.querySelector('.sfut-health-modal-body');

    overlay.classList.remove('sfut-hidden');
    body.innerHTML = `
      <div class="sfut-health-error">
        <div class="sfut-health-section-title">Health Check Failed</div>
        <div class="sfut-health-error-message">${_escapeHtml(message || 'Unknown error')}</div>
      </div>
    `;
  }

  function showReport(report, handlers = {}) {
    _ensureModal();
    const body = overlay.querySelector('.sfut-health-modal-body');
    const footer = overlay.querySelector('.sfut-health-modal-footer');

    overlay.classList.remove('sfut-hidden');

    body.innerHTML = `
      <div class="sfut-health-header-block">
        <div class="sfut-health-flow-name">${_escapeHtml(report.meta.flowLabel)}</div>
        <div class="sfut-health-flow-meta">
          <span>${_escapeHtml(report.meta.flowType)}</span>
          <span>API ${_escapeHtml(String(report.meta.apiVersion ?? 'Unknown'))}</span>
          <span>${_escapeHtml(report.meta.status || 'Unknown')}</span>
        </div>
        <div class="sfut-health-score-wrap">
          <div class="sfut-health-score">${report.summary.overallScore}</div>
          <div class="sfut-health-rating">${_escapeHtml(report.summary.rating)}</div>
        </div>
      </div>

      <div class="sfut-health-summary-cards">
        ${_summaryCard('High', report.summary.severityCounts.high)}
        ${_summaryCard('Medium', report.summary.severityCounts.medium)}
        ${_summaryCard('Low', report.summary.severityCounts.low)}
        ${_summaryCard('Info', report.summary.severityCounts.info)}
      </div>

      <div class="sfut-health-section">
        <div class="sfut-health-section-title">Issue Families</div>
        <div class="sfut-health-family-list">
          ${report.issueFamilies.map(_renderFamily).join('')}
        </div>
      </div>

      <div class="sfut-health-section">
        <div class="sfut-health-section-title">Flow Profile</div>
        <div class="sfut-health-metrics-grid">
          ${_metric('Elements', report.summary.metrics.elementCount)}
          ${_metric('Decisions', report.summary.metrics.decisionCount)}
          ${_metric('Loops', report.summary.metrics.loopCount)}
          ${_metric('Data Ops', report.summary.metrics.dataOperationCount)}
          ${_metric('Dependencies', report.summary.metrics.dependencyCount)}
        </div>
      </div>

      <div class="sfut-health-section">
        <div class="sfut-health-section-title">Dependencies</div>
        <div class="sfut-health-dependency-list">
          ${report.dependencies.items.length
            ? report.dependencies.items.map((d) => `
              <div class="sfut-health-dependency-item">
                <span class="sfut-health-dependency-type">${_escapeHtml(d.type)}</span>
                <span class="sfut-health-dependency-name">${_escapeHtml(d.name)}</span>
              </div>
            `).join('')
            : '<div class="sfut-health-empty">No custom dependencies detected.</div>'
          }
        </div>
      </div>
    `;

    footer.innerHTML = `
      <button class="sfut-health-btn" id="sfut-health-copy-summary">Copy Summary</button>
      <button class="sfut-health-btn" id="sfut-health-copy-json">Copy JSON</button>
      <button class="sfut-health-btn sfut-health-btn-primary" id="sfut-health-send-improvements">Send to Improvement Prompt</button>
    `;

    footer.querySelector('#sfut-health-copy-summary')?.addEventListener('click', async () => {
      await _copyText(report.exports.markdownSummary);
    });

    footer.querySelector('#sfut-health-copy-json')?.addEventListener('click', async () => {
      await _copyText(report.exports.rawJson);
    });

    footer.querySelector('#sfut-health-send-improvements')?.addEventListener('click', async () => {
      if (handlers.onSendToImprovementPrompt) {
        handlers.onSendToImprovementPrompt(report);
      } else {
        await _copyText(report.exports.improvementPrompt);
      }
    });
  }

  function close() {
    if (!overlay) return;
    overlay.classList.add('sfut-hidden');
  }

  function _ensureModal() {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.className = 'sfut-modal-overlay sfut-hidden';
    overlay.innerHTML = `
      <div class="sfut-modal sfut-health-modal">
        <div class="sfut-modal-header">
          <span>Flow Health Check</span>
          <button class="sfut-modal-close" type="button">&times;</button>
        </div>
        <div class="sfut-modal-body sfut-health-modal-body"></div>
        <div class="sfut-modal-footer sfut-health-modal-footer"></div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('.sfut-modal-close')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  }

  function _summaryCard(label, value) {
    return `
      <div class="sfut-health-card">
        <div class="sfut-health-card-label">${_escapeHtml(label)}</div>
        <div class="sfut-health-card-value">${value}</div>
      </div>
    `;
  }

  function _metric(label, value) {
    return `
      <div class="sfut-health-metric">
        <div class="sfut-health-metric-label">${_escapeHtml(label)}</div>
        <div class="sfut-health-metric-value">${value}</div>
      </div>
    `;
  }

  function _renderFamily(family) {
    return `
      <details class="sfut-health-family">
        <summary>
          <span class="sfut-health-family-severity sfut-health-severity-${family.severity}">${family.severity.toUpperCase()}</span>
          <span class="sfut-health-family-title">${_escapeHtml(family.title)}</span>
          <span class="sfut-health-family-count">(${family.instanceCount})</span>
        </summary>
        <div class="sfut-health-family-body">
          <div class="sfut-health-family-impact">Score impact: -${family.scoreImpact}</div>
          <ul class="sfut-health-affected-list">
            ${family.affectedItems.length
              ? family.affectedItems.map((item) => `<li>${_escapeHtml(item.label)}</li>`).join('')
              : '<li>No specific items listed.</li>'
            }
          </ul>
        </div>
      </details>
    `;
  }

  async function _copyText(text) {
    try {
      await navigator.clipboard.writeText(text || '');
    } catch (e) {
      console.warn('[SFUT] Could not copy to clipboard:', e);
    }
  }

  function _escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return {
    showLoading,
    showError,
    showReport,
    close
  };

})();