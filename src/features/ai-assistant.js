/**
 * SF Flow Utility Toolkit - Flow AI Assistant & Metadata
 * 
 * Combined panel providing:
 *   1. Metadata operations: Copy/Download as Raw or Clean JSON
 *   2. AI Assistant: Prompt templates populated with flow metadata
 * 
 * Context: Flow Builder (/builder_platform_interaction/flowBuilder.app)
 * 
 * Dependencies:
 *   - SalesforceAPI (utils/salesforce-api.js)
 *   - FlowMetadataCleaner (utils/flow-metadata-cleaner.js)
 *   - AIPromptLibrary (config/ai-prompt-library.js) — unified access to
 *     standard + custom prompts, respecting the user's enabled/disabled state
 */

const FlowAIAssistant = (() => {

  // State
  let _isOpen = false;
  let _rawMetadata = null;       // Raw Metadata object from Tooling API
  let _cleanedMetadata = null;   // Cleaned version
  let _flowRecord = null;        // Full Flow record (includes MasterLabel, Status, etc.)
  let _panelEl = null;
  let _overlayEl = null;
  let _escHandler = null;
  let _isLoading = false;

  // ===== Initialisation =====

  async function init() {
    const context = ContextDetector.detectContext();
    if (context !== ContextDetector.CONTEXTS.FLOW_BUILDER) return;
    console.log('[SFUT] Flow AI Assistant registered.');
  }

  /**
   * Called from the side-button menu to open the panel.
   */
  function onActivate() {
    if (_isOpen) {
      _closePanel();
    } else {
      _openPanel();
    }
  }

  // ===== Panel Lifecycle =====

  async function _openPanel() {
    if (_isOpen) return;
    _isOpen = true;

    _createPanel();
    await _fetchMetadata();
  }

  function _closePanel() {
    if (!_isOpen) return;
    _isOpen = false;

    // Remove the overlay (which contains the panel)
    if (_overlayEl && _overlayEl.parentNode) {
      _overlayEl.parentNode.removeChild(_overlayEl);
    }
    _overlayEl = null;
    _panelEl = null;

    // Clean up escape handler
    if (_escHandler) {
      document.removeEventListener('keydown', _escHandler, true);
      _escHandler = null;
    }
  }

  // ===== Metadata Fetching =====

  async function _fetchMetadata() {
    if (_isLoading) return;
    _isLoading = true;

    _setLoadingState(true);

    try {
      const flowId = SalesforceAPI.getFlowIdFromUrl();
      if (!flowId) {
        _showError('Could not determine Flow ID from the URL.');
        return;
      }

      _flowRecord = await SalesforceAPI.getFlowMetadata(flowId);

      if (!_flowRecord || !_flowRecord.Metadata) {
        _showError('No metadata returned for this Flow. The Tooling API query may have failed.');
        return;
      }

      _rawMetadata = _flowRecord.Metadata;
      _cleanedMetadata = FlowMetadataCleaner.clean(_rawMetadata);

      _renderContent();

    } catch (err) {
      console.error('[SFUT AI] Error fetching metadata:', err);
      _showError(`Failed to fetch Flow metadata: ${err.message}`);
    } finally {
      _isLoading = false;
      _setLoadingState(false);
    }
  }

  // ===== Panel UI =====

  function _createPanel() {
    // Remove existing
    const existing = document.querySelector('.sfut-ai-panel-overlay');
    if (existing) existing.remove();

    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'sfut-ai-panel-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) _closePanel();
    });

    // Panel
    const panel = document.createElement('div');
    panel.className = 'sfut-ai-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'sfut-ai-panel-header';
    header.innerHTML = `
      <span class="sfut-ai-panel-title">⚡ Flow Metadata & AI Assistant</span>
      <button class="sfut-ai-panel-close" title="Close (Escape)">✕</button>
    `;
    header.querySelector('.sfut-ai-panel-close').addEventListener('click', () => _closePanel());
    panel.appendChild(header);

    // Body (loading state initially)
    const body = document.createElement('div');
    body.className = 'sfut-ai-panel-body';
    body.innerHTML = `
      <div class="sfut-ai-loading">
        <span class="sfut-ai-spinner"></span>
        Fetching Flow metadata…
      </div>
    `;
    panel.appendChild(body);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    _overlayEl = overlay;
    _panelEl = panel;

    // Escape to close (stored on instance so _closePanel can remove it)
    _escHandler = (e) => {
      if (e.key === 'Escape' && _isOpen) {
        e.preventDefault();
        e.stopPropagation();
        _closePanel();
      }
    };
    document.addEventListener('keydown', _escHandler, true);
  }

  function _renderContent() {
    const body = _panelEl.querySelector('.sfut-ai-panel-body');
    if (!body) return;

    const summary = FlowMetadataCleaner.summarise(_rawMetadata);
    const rawJson = JSON.stringify(_rawMetadata, null, 2);
    const cleanJson = JSON.stringify(_cleanedMetadata, null, 2);
    const rawTokens = FlowMetadataCleaner.estimateTokens(rawJson);
    const cleanTokens = FlowMetadataCleaner.estimateTokens(cleanJson);
    const fileName = (_flowRecord?.FullName || _rawMetadata?.label || 'Flow')
      .replace(/[^a-zA-Z0-9_-]/g, '_');

    // Build summary line
    const summaryParts = [];
    if (summary.elements) {
      for (const [label, count] of Object.entries(summary.elements)) {
        summaryParts.push(`${count} ${label}`);
      }
    }
    const elementSummary = summaryParts.length > 0
      ? summaryParts.join(', ')
      : 'No elements';

    const resourceParts = [];
    if (summary.resources) {
      for (const [label, count] of Object.entries(summary.resources)) {
        resourceParts.push(`${count} ${label}`);
      }
    }
    const resourceSummary = resourceParts.length > 0
      ? resourceParts.join(', ')
      : 'No resources';

    const savingsPct = rawTokens > 0
      ? Math.round((1 - cleanTokens / rawTokens) * 100)
      : 0;

    body.innerHTML = `
      <!-- Flow Summary -->
      <div class="sfut-ai-section">
        <div class="sfut-ai-section-header">Flow Summary</div>
        <div class="sfut-ai-summary">
          <div class="sfut-ai-summary-row">
            <span class="sfut-ai-summary-label">Label:</span>
            <span class="sfut-ai-summary-value">${_escapeHtml(summary.label)}</span>
          </div>
          <div class="sfut-ai-summary-row">
            <span class="sfut-ai-summary-label">Type:</span>
            <span class="sfut-ai-summary-value">${_escapeHtml(summary.processType)}</span>
          </div>
          <div class="sfut-ai-summary-row">
            <span class="sfut-ai-summary-label">Status:</span>
            <span class="sfut-ai-summary-value">${_escapeHtml(summary.status)}</span>
          </div>
          <div class="sfut-ai-summary-row">
            <span class="sfut-ai-summary-label">API Version:</span>
            <span class="sfut-ai-summary-value">${summary.apiVersion}</span>
          </div>
          <div class="sfut-ai-summary-row">
            <span class="sfut-ai-summary-label">Elements (${summary.totalElements}):</span>
            <span class="sfut-ai-summary-value">${_escapeHtml(elementSummary)}</span>
          </div>
          <div class="sfut-ai-summary-row">
            <span class="sfut-ai-summary-label">Resources (${summary.totalResources}):</span>
            <span class="sfut-ai-summary-value">${_escapeHtml(resourceSummary)}</span>
          </div>
        </div>
      </div>

      <!-- Metadata Actions -->
      <div class="sfut-ai-section">
        <div class="sfut-ai-section-header">Flow Metadata</div>
        <div class="sfut-ai-meta-info">
          <span>Raw: ~${rawTokens.toLocaleString()} tokens</span>
          <span class="sfut-ai-meta-divider">|</span>
          <span>Clean: ~${cleanTokens.toLocaleString()} tokens</span>
          <span class="sfut-ai-meta-divider">|</span>
          <span>Saving: ~${savingsPct}%</span>
        </div>
        <div class="sfut-ai-button-grid">
          <button class="sfut-ai-btn sfut-ai-btn-secondary" data-action="copy-raw" title="Copy raw JSON to clipboard">
            📋 Copy Raw
          </button>
          <button class="sfut-ai-btn sfut-ai-btn-secondary" data-action="copy-clean" title="Copy cleaned JSON to clipboard">
            📋 Copy Clean
          </button>
          <button class="sfut-ai-btn sfut-ai-btn-secondary" data-action="download-raw" title="Download raw JSON file">
            💾 Download Raw
          </button>
          <button class="sfut-ai-btn sfut-ai-btn-secondary" data-action="download-clean" title="Download cleaned JSON file">
            💾 Download Clean
          </button>
        </div>
      </div>

      <!-- AI Assistant -->
      <div class="sfut-ai-section">
        <div class="sfut-ai-section-header">AI Prompt Assistant</div>
        <div class="sfut-ai-assistant">
          <div class="sfut-ai-template-row">
            <label class="sfut-ai-template-label" for="sfut-ai-template-select">Prompt Template:</label>
            <select class="sfut-ai-template-select" id="sfut-ai-template-select"></select>
          </div>
          <div class="sfut-ai-template-description" id="sfut-ai-template-desc"></div>
          <div class="sfut-ai-format-row">
            <label class="sfut-ai-format-label">Metadata format:</label>
            <label class="sfut-ai-radio-label">
              <input type="radio" name="sfut-ai-format" value="clean" checked> Clean
            </label>
            <label class="sfut-ai-radio-label">
              <input type="radio" name="sfut-ai-format" value="raw"> Raw
            </label>
            <span class="sfut-ai-token-estimate" id="sfut-ai-token-est"></span>
          </div>
          <button class="sfut-ai-btn sfut-ai-btn-primary sfut-ai-copy-prompt" data-action="copy-prompt">
            📋 Copy Prompt to Clipboard
          </button>
        </div>
      </div>

      <!-- Status toast area -->
      <div class="sfut-ai-status" id="sfut-ai-status"></div>
    `;

    // Wire up metadata action buttons
    body.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.getAttribute('data-action');
        _handleAction(action, fileName, rawJson, cleanJson);
      });
    });

    // Wire up template dropdown
    _populateTemplateDropdown(rawJson, cleanJson);

    // Wire up format radio buttons
    body.querySelectorAll('input[name="sfut-ai-format"]').forEach(radio => {
      radio.addEventListener('change', () => _updateTokenEstimate(rawJson, cleanJson));
    });

    // Initial token estimate
    _updateTokenEstimate(rawJson, cleanJson);
  }

  async function _populateTemplateDropdown(rawJson, cleanJson) {
    const select = _panelEl.querySelector('#sfut-ai-template-select');
    if (!select) return;

    // Ensure the library has read storage before we query it. Idempotent
    // across repeat panel opens.
    try {
      await AIPromptLibrary.load();
    } catch (err) {
      console.warn('[SFUT AI] Failed to load prompt library:', err);
    }

    // Get every currently-enabled prompt — standards + customs, merged.
    // A disabled prompt (standard or custom) is intentionally absent from
    // this list so users can't pick one that the settings page has turned off.
    const templates = AIPromptLibrary.getEnabled();

    // Resolved default (respects fallback cascade if the user's starred
    // default is disabled or deleted). Library self-heals if nothing is
    // enabled at all, so this is guaranteed to match a template below.
    const defaultTemplate = AIPromptLibrary.getDefaultPromptId();

    select.innerHTML = '';
    templates.forEach(t => {
      const option = document.createElement('option');
      option.value = t.id;
      option.textContent = t.title;
      if (t.id === defaultTemplate) option.selected = true;
      select.appendChild(option);
    });

    // Fallback cascade: if the saved default points to a disabled or
    // deleted prompt, nothing will have been marked selected and the
    // browser will visually show the first option. Make that explicit
    // so downstream reads of select.value are reliable.
    if (!select.value && templates.length > 0) {
      select.value = templates[0].id;
    }

    // Show description for initial selection
    _updateTemplateDescription(select.value);

    // Update on change
    select.addEventListener('change', () => {
      _updateTemplateDescription(select.value);
      _updateTokenEstimate(rawJson, cleanJson);
    });
  }

  function _updateTemplateDescription(templateId) {
    const descEl = _panelEl?.querySelector('#sfut-ai-template-desc');
    if (!descEl) return;

    const template = AIPromptLibrary.getById(templateId);
    descEl.textContent = template ? template.description : '';
  }

  function _updateTokenEstimate(rawJson, cleanJson) {
    const estEl = _panelEl?.querySelector('#sfut-ai-token-est');
    if (!estEl) return;

    const format = _getSelectedFormat();
    const json = format === 'raw' ? rawJson : cleanJson;
    const template = AIPromptLibrary.getById(
      _panelEl?.querySelector('#sfut-ai-template-select')?.value
    );

    const promptText = template ? template.prompt : '';
    const totalTokens = FlowMetadataCleaner.estimateTokens(promptText + json);
    estEl.textContent = `~${totalTokens.toLocaleString()} tokens`;
  }

  // ===== Actions =====

  function _handleAction(action, fileName, rawJson, cleanJson) {
    switch (action) {
      case 'copy-raw':
        _copyToClipboard(rawJson, 'Raw metadata copied to clipboard');
        break;

      case 'copy-clean':
        _copyToClipboard(cleanJson, 'Cleaned metadata copied to clipboard');
        break;

      case 'download-raw':
        _downloadJson(rawJson, `${fileName}_raw.json`, 'Raw metadata downloaded');
        break;

      case 'download-clean':
        _downloadJson(cleanJson, `${fileName}_clean.json`, 'Cleaned metadata downloaded');
        break;

      case 'copy-prompt':
        _copyPrompt(rawJson, cleanJson);
        break;
    }
  }

  function _copyPrompt(rawJson, cleanJson) {
    const select = _panelEl?.querySelector('#sfut-ai-template-select');
    if (!select) return;

    const format = _getSelectedFormat();
    const json = format === 'raw' ? rawJson : cleanJson;
    const assembled = AIPromptLibrary.assemble(select.value, json);

    if (!assembled) {
      _showStatus('Error: Template not found', true);
      return;
    }

    _copyToClipboard(assembled, 'Prompt copied to clipboard — paste into your AI tool');
  }

  function _getSelectedFormat() {
    const checked = _panelEl?.querySelector('input[name="sfut-ai-format"]:checked');
    return checked ? checked.value : 'clean';
  }

  // ===== Clipboard & Download =====

  async function _copyToClipboard(text, successMessage) {
    try {
      await navigator.clipboard.writeText(text);
      _showStatus(successMessage);
    } catch (err) {
      // Fallback for contexts where clipboard API is restricted
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        _showStatus(successMessage);
      } catch (e) {
        _showStatus('Failed to copy to clipboard', true);
      }
      document.body.removeChild(textarea);
    }
  }

  function _downloadJson(jsonString, filename, successMessage) {
    try {
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      _showStatus(successMessage);
    } catch (err) {
      console.error('[SFUT AI] Download error:', err);
      _showStatus('Failed to download file', true);
    }
  }

  // ===== UI Helpers =====

  function _setLoadingState(loading) {
    const loadingEl = _panelEl?.querySelector('.sfut-ai-loading');
    if (loadingEl) {
      loadingEl.style.display = loading ? 'flex' : 'none';
    }
  }

  function _showError(message) {
    const body = _panelEl?.querySelector('.sfut-ai-panel-body');
    if (!body) return;

    body.innerHTML = `
      <div class="sfut-ai-error">
        <span class="sfut-ai-error-icon">⚠️</span>
        <span>${_escapeHtml(message)}</span>
      </div>
    `;
  }

  function _showStatus(message, isError = false) {
    const statusEl = _panelEl?.querySelector('#sfut-ai-status');
    if (!statusEl) return;

    statusEl.textContent = message;
    statusEl.className = 'sfut-ai-status sfut-ai-status-visible' +
      (isError ? ' sfut-ai-status-error' : '');

    setTimeout(() => {
      statusEl.className = 'sfut-ai-status';
    }, 3000);
  }

  function _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ===== Public API =====
  return {
    init,
    onActivate
  };

})();

// Register with the toolkit
if (typeof SFFlowUtilityToolkit !== 'undefined') {
  SFFlowUtilityToolkit.registerFeature('ai-assistant', FlowAIAssistant);
}
