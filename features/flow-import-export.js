/**
 * SF Flow Utility Toolkit - Import / Export Flows
 *
 * Lets Salesforce admins export and (in later phases) import Flow metadata
 * without SFDX or the Metadata API SOAP endpoints.
 *
 * Context: Flow Builder (/builder_platform_interaction/flowBuilder.app)
 *
 * PHASE 1 (this file): Single-Flow export.
 *   - Injects a floating "Export" action button onto the Flow Builder canvas.
 *   - Retrieves the current flow's Metadata via the Tooling API.
 *   - Converts the Metadata JSON to a `.flow-meta.xml` document.
 *   - Triggers a browser download of the file.
 *
 * Later phases will add the side-panel modal, multi-flow export (ZIP), and the
 * import + deploy pipeline. Those hooks are intentionally not present yet.
 *
 * Dependencies:
 *   - SalesforceAPI  (utils/salesforce-api.js)   — Tooling API retrieval
 *   - FlowXmlConverter (utils/flow-xml-converter.js) — JSON → XML conversion
 *   - ContextDetector, SettingsManager
 *
 * Settings:
 *   - flowImportExport.enabled (boolean) — gates the feature entirely.
 */

const FlowImportExport = (() => {
  let _enabled = true;

  // Feature-namespaced CSS classes (fie = Flow Import/Export)
  const C = {
    exportBtn: 'sfut-fie-export-btn',
    exportBtnIcon: 'sfut-fie-export-btn-icon',
    exportBtnBusy: 'sfut-fie-export-btn-busy'
  };

  const SETTING_ENABLED = 'flowImportExport.enabled';

  // Canvas anchor selectors (shared with Canvas Search).
  const CANVAS_CONTAINER_SELECTOR =
    'builder_platform_interaction-alc-canvas-container, ' +
    'builder_platform_interaction-alc-canvas';

  // How long to keep looking for the canvas before giving up (SPA render lag).
  const CANVAS_WAIT_MAX_ATTEMPTS = 40; // ~20s at 500ms
  const CANVAS_WAIT_INTERVAL_MS = 500;

  // ---------- State ----------

  const STATE = {
    isExporting: false,
    buttonEl: null
  };

  // ---------- Lifecycle ----------

  async function init() {
    const context = ContextDetector.detectContext();
    if (context !== ContextDetector.CONTEXTS.FLOW_BUILDER) return;

    const featureEnabled = await SettingsManager.get(SETTING_ENABLED);
    if (featureEnabled === false) { _enabled = false; return; }
    _enabled = true;

    _ensureButton();
    console.log('[SFUT FlowImportExport] Initialised (Phase 1: single-flow export).');
  }

  /**
   * Allows the export to be triggered programmatically (e.g. from a future
   * side-button menu entry). Phase 1 exposes only the export action.
   */
  async function onActivate() {
    await _exportCurrentFlow();
  }

  // ---------- Canvas button injection ----------

  /**
   * Injects the floating export button onto the canvas. Retries while the
   * Flow Builder canvas is still rendering, and falls back to a fixed-position
   * button on the body if the canvas container never appears.
   */
  function _ensureButton(attempt = 1) {
    if (document.getElementById('sfut-fie-export-btn')) {
      STATE.buttonEl = document.getElementById('sfut-fie-export-btn');
      return;
    }

    const container = document.querySelector(CANVAS_CONTAINER_SELECTOR);

    if (!container) {
      if (attempt >= CANVAS_WAIT_MAX_ATTEMPTS) {
        // Fallback: attach to the body with fixed positioning so the feature
        // still works even if the canvas web component structure changes.
        _createButton(document.body, true);
        return;
      }
      setTimeout(() => _ensureButton(attempt + 1), CANVAS_WAIT_INTERVAL_MS);
      return;
    }

    // The canvas container must be a positioned ancestor for absolute placement.
    container.style.position = container.style.position || 'relative';
    _createButton(container, false);
  }

  /**
   * Builds and appends the export button element.
   * @param {HTMLElement} parent
   * @param {boolean} fixed - Use fixed positioning (body fallback) vs absolute.
   */
  function _createButton(parent, fixed) {
    const btn = document.createElement('button');
    btn.id = 'sfut-fie-export-btn';
    btn.type = 'button';
    btn.className = C.exportBtn;
    if (fixed) btn.classList.add('sfut-fie-export-btn-fixed');
    btn.title = 'Export this Flow as .flow-meta.xml';
    btn.setAttribute('aria-label', 'Export this Flow');
    btn.innerHTML = `
      <span class="${C.exportBtnIcon}" aria-hidden="true">⬇</span>
      <span>Export Flow</span>
    `;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      _exportCurrentFlow();
    });

    parent.appendChild(btn);
    STATE.buttonEl = btn;
  }

  function _setButtonBusy(busy) {
    if (!STATE.buttonEl) return;
    STATE.buttonEl.classList.toggle(C.exportBtnBusy, busy);
    STATE.buttonEl.disabled = busy;
  }

  // ---------- Export ----------

  async function _exportCurrentFlow() {
    if (STATE.isExporting) {
      _showToast('Export already in progress…', 'warning');
      return;
    }

    const flowId = SalesforceAPI.getFlowIdFromUrl();
    if (!flowId) {
      _showToast('Could not determine the current Flow from the URL.', 'error');
      return;
    }

    STATE.isExporting = true;
    _setButtonBusy(true);

    try {
      _showToast('Retrieving Flow metadata…');
      const record = await SalesforceAPI.getFlowMetadata(flowId);

      if (!record || !record.Metadata) {
        throw new Error('The Flow record did not include a Metadata payload.');
      }

      const xml = FlowXmlConverter.flowMetadataToXml(record.Metadata);
      const developerName = _deriveDeveloperName(record);
      const filename = `${developerName}.flow-meta.xml`;

      _downloadXml(xml, filename);
      _showToast(`Exported ${filename}`);
    } catch (err) {
      console.error('[SFUT FlowImportExport] Export failed:', err);
      _showToast(`Export failed: ${err.message}`, 'error');
    } finally {
      STATE.isExporting = false;
      _setButtonBusy(false);
    }
  }

  /**
   * Derives the Flow's API developer name (without namespace version suffix)
   * for use as the export filename.
   * @param {Object} record - Tooling API Flow record.
   * @returns {string}
   */
  function _deriveDeveloperName(record) {
    // Preferred: the Definition's DeveloperName (the stable API name).
    const defName = record.Definition && record.Definition.DeveloperName;
    if (defName) return defName;

    // Fallback: strip the trailing "-<versionNumber>" from FullName.
    if (record.FullName) {
      return String(record.FullName).replace(/-\d+$/, '');
    }

    // Last resort: the MasterLabel sanitised to a safe filename token.
    const label = record.MasterLabel || 'Flow';
    return String(label).replace(/[^a-zA-Z0-9_]/g, '_');
  }

  /**
   * Triggers a browser download of the XML string. Uses an anchor-click on a
   * blob URL from the content script (no downloads permission required), the
   * same approach used by the Comparison Exporter.
   * @param {string} xml
   * @param {string} filename
   */
  function _downloadXml(xml, filename) {
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // ---------- Toast ----------

  function _showToast(message, type = 'success') {
    document.querySelectorAll('.sfut-toast[data-feature="fie"]').forEach(el => el.remove());

    const toast = document.createElement('div');
    toast.className = `sfut-toast ${
      type === 'error' ? 'sfut-toast-error' :
      type === 'warning' ? 'sfut-toast-warning' : ''
    }`;
    toast.dataset.feature = 'fie';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('sfut-toast-visible'));

    setTimeout(() => {
      toast.classList.remove('sfut-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ---------- Public API ----------
  function isEnabled() { return _enabled; }

  return {
    init,
    onActivate,
    isEnabled
  };

})();

// Register with the toolkit
if (typeof SFFlowUtilityToolkit !== 'undefined') {
  SFFlowUtilityToolkit.registerFeature('flow-import-export', FlowImportExport);
}
