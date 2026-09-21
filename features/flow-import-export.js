/**
 * SF Flow Utility Toolkit - Import / Export Flows
 *
 * Lets Salesforce admins export and import Flow metadata without SFDX or the
 * Metadata API SOAP endpoints.
 *
 * Contexts: Flow Builder (/builder_platform_interaction/flowBuilder.app) and the
 * Setup Flows list page.
 *
 * ENTRY POINT
 *   - Side-panel modal ("Import / Export Flows"), opened from the side-button
 *     menu. The Import tab is hidden in Flow Builder, where an open flow makes
 *     importing another an invalid context — only Export applies there. Import
 *     (Phase 2) and, later, multi-flow Export (Phase 3) live in this panel.
 *
 * PHASE 2 (this file): Single-flow import.
 *   1. Pick a `.flow-meta.xml` file.
 *   2. Parse it; read DeveloperName (filename) and source <status>.
 *   3. Query the org for existing versions of that Flow.
 *   4. Resolve a compare target (active by default; prompt if a higher-numbered
 *      inactive version exists).
 *   5. Diff the imported file against the target — identical ⇒ hard block.
 *   6. Confirm a new version will be created (with an opt-in "activate" toggle
 *      when the source is marked Active; default off).
 *   7. Assemble an MDAPI deploy ZIP (package.xml + flows/<name>.flow), deploy
 *      via the Metadata REST endpoint, and poll for completion with live status.
 *
 * Deploy always creates a NEW version and imports it inactive (Draft) unless the
 * user explicitly opts to activate.
 *
 * Dependencies:
 *   - SalesforceAPI    (utils/salesforce-api.js)
 *   - FlowXmlConverter (utils/flow-xml-converter.js)
 *   - FlowDeployDiff   (utils/flow-deploy-diff.js)
 *   - JSZip            (lib/jszip.bundle.js, injected on demand)
 *   - ContextDetector, SettingsManager
 *
 * Settings:
 *   - flowImportExport.enabled (boolean) — gates the feature entirely.
 */

const FlowImportExport = (() => {
  let _enabled = true;

  const API_VERSION_NUMERIC = '67.0';
  const POLL_INTERVAL_MS = 2000;
  const POLL_MAX_ATTEMPTS = 150; // 5 minutes at 2s

  // Feature-namespaced CSS classes (fie = Flow Import/Export)
  const C = {
    overlay: 'sfut-fie-overlay',
    surface: 'sfut-fie-surface',
    header: 'sfut-fie-header',
    headerTitle: 'sfut-fie-header-title',
    closeBtn: 'sfut-fie-close',
    tabs: 'sfut-fie-tabs',
    tab: 'sfut-fie-tab',
    tabActive: 'sfut-fie-tab-active',
    body: 'sfut-fie-body',
    footer: 'sfut-fie-footer',

    dropzone: 'sfut-fie-dropzone',
    step: 'sfut-fie-step',
    stepTitle: 'sfut-fie-step-title',
    stepText: 'sfut-fie-step-text',
    spinner: 'sfut-fie-spinner',
    fileMeta: 'sfut-fie-file-meta',
    choiceList: 'sfut-fie-choice-list',
    choice: 'sfut-fie-choice',
    banner: 'sfut-fie-banner',
    bannerBlock: 'sfut-fie-banner-block',
    bannerWarn: 'sfut-fie-banner-warn',
    changeList: 'sfut-fie-change-list',
    activateBox: 'sfut-fie-activate-box',
    progress: 'sfut-fie-progress',
    resultOk: 'sfut-fie-result-ok',
    resultFail: 'sfut-fie-result-fail',
    errorList: 'sfut-fie-error-list'
  };

  const SETTING_ENABLED = 'flowImportExport.enabled';

  const FLOW_NAMESPACE = 'http://soap.sforce.com/2006/04/metadata';

  // ---------- State ----------

  const STATE = {
    isExporting: false,
    overlay: null,
    isOpen: false,
    view: 'import',      // 'import' | 'export'
    importAllowed: true, // false in Flow Builder — the open flow makes import an invalid context
    jsZipLoaded: false,
    // Import wizard state (reset on each open / new file)
    imp: null
  };

  function _freshImportState() {
    return {
      step: 'pick',        // pick | analyzing | chooseTarget | blocked | confirm | deploying | result
      fileName: '',
      developerName: '',
      xmlText: '',
      sourceStatus: null,
      isNewFlow: false,
      versions: [],
      targetChoices: null, // { active, draft } when a choice is required
      compareTarget: null, // chosen { Id, VersionNumber, Status }
      diff: null,
      activate: false,
      nextVersionNumber: 1,
      error: null,
      deploy: { requestId: null, status: null, result: null, error: null, pollAttempts: 0, cancelled: false }
    };
  }

  // ---------- Lifecycle ----------

  async function init() {
    // Available in both Flow Builder and the Setup Flows list page (import does
    // not require an open flow). main.js only calls init() for the contexts
    // where ContextDetector lists this feature, so no context guard is needed
    // here — we just honour the settings toggle. The panel is the only entry
    // point (opened from the side-button menu).
    const featureEnabled = await SettingsManager.get(SETTING_ENABLED);
    if (featureEnabled === false) { _enabled = false; return; }
    _enabled = true;

    console.log('[SFUT FlowImportExport] Initialised (panel entry point).');
  }

  /**
   * Side-button menu entry point — opens the panel.
   */
  async function onActivate() {
    _openPanel();
  }

  // ---------- Export (single flow — Canvas Export tab) ----------

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
    }
  }

  function _deriveDeveloperName(record) {
    const defName = record.Definition && record.Definition.DeveloperName;
    if (defName) return defName;
    if (record.FullName) return String(record.FullName).replace(/-\d+$/, '');
    const label = record.MasterLabel || 'Flow';
    return String(label).replace(/[^a-zA-Z0-9_]/g, '_');
  }

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

  // ---------- Panel scaffolding ----------

  function _ensurePanel() {
    if (STATE.overlay) return;

    STATE.overlay = document.createElement('div');
    STATE.overlay.className = `sfut-modal-overlay ${C.overlay} sfut-hidden`;
    STATE.overlay.innerHTML = `
      <div class="${C.surface}">
        <div class="${C.header}">
          <div class="${C.headerTitle}">
            <span aria-hidden="true">📦</span>
            <span>Import / Export Flows</span>
          </div>
          <button type="button" class="${C.closeBtn}" title="Close (Esc)" aria-label="Close">&times;</button>
        </div>
        <div class="${C.tabs}">
          <button type="button" class="${C.tab}" data-view="import">Import</button>
          <button type="button" class="${C.tab}" data-view="export">Export</button>
        </div>
        <div class="${C.body}" id="sfut-fie-body"></div>
        <div class="${C.footer}">
          <button type="button" class="sfut-btn" id="sfut-fie-footer-close">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(STATE.overlay);

    STATE.overlay.querySelector(`.${C.closeBtn}`).addEventListener('click', _closePanel);
    STATE.overlay.querySelector('#sfut-fie-footer-close').addEventListener('click', _closePanel);
    STATE.overlay.addEventListener('click', (e) => {
      if (e.target === STATE.overlay) _closePanel();
    });

    STATE.overlay.querySelectorAll(`.${C.tab}`).forEach((tabEl) => {
      tabEl.addEventListener('click', () => _switchTab(tabEl.dataset.view));
    });

    document.addEventListener('keydown', _handleKeyDown);
  }

  function _handleKeyDown(e) {
    if (!STATE.isOpen) return;
    if (e.key === 'Escape') _closePanel();
  }

  function _openPanel() {
    _ensurePanel();
    STATE.imp = _freshImportState();

    // Import is only offered where there is no open flow. In Flow Builder the
    // canvas already holds a flow, so importing another is an invalid context —
    // only export applies there.
    const context = ContextDetector.detectContext();
    STATE.importAllowed = context !== ContextDetector.CONTEXTS.FLOW_BUILDER;

    _applyTabVisibility();
    STATE.view = STATE.importAllowed ? 'import' : 'export';
    _syncTabs();
    STATE.overlay.classList.remove('sfut-hidden');
    STATE.isOpen = true;
    _renderView();
  }

  /**
   * Shows or hides the Import tab based on the current context.
   */
  function _applyTabVisibility() {
    const importTab = STATE.overlay.querySelector(`.${C.tab}[data-view="import"]`);
    if (importTab) importTab.hidden = !STATE.importAllowed;
  }

  function _closePanel() {
    if (!STATE.overlay) return;
    // Stop any in-flight polling.
    if (STATE.imp && STATE.imp.deploy) STATE.imp.deploy.cancelled = true;
    STATE.overlay.classList.add('sfut-hidden');
    STATE.isOpen = false;
  }

  function _switchTab(view) {
    if (view !== 'import' && view !== 'export') return;
    if (view === 'import' && !STATE.importAllowed) return;
    STATE.view = view;
    _syncTabs();
    _renderView();
  }

  function _syncTabs() {
    if (!STATE.overlay) return;
    STATE.overlay.querySelectorAll(`.${C.tab}`).forEach((t) => {
      t.classList.toggle(C.tabActive, t.dataset.view === STATE.view);
    });
  }

  function _getBody() {
    return STATE.overlay.querySelector('#sfut-fie-body');
  }

  function _renderView() {
    if (STATE.view === 'export') {
      _renderExport();
    } else {
      _renderImport();
    }
  }

  function _renderExport() {
    const body = _getBody();

    // Setup context (import allowed): multi-flow selection + ZIP export is a
    // Phase 3 placeholder — there is no single open flow to export here.
    if (STATE.importAllowed) {
      body.innerHTML = `
        <div class="${C.step}">
          <div style="font-size:40px;">📤</div>
          <div class="${C.stepTitle}">Multi-flow export</div>
          <p class="${C.stepText}">
            Selecting and exporting multiple flows as a ZIP is coming in a later release.
          </p>
        </div>
      `;
      return;
    }

    // Canvas context: working single-flow export of the open flow.
    body.innerHTML = `
      <div class="${C.step}">
        <div style="font-size:40px;">📤</div>
        <div class="${C.stepTitle}">Export this flow</div>
        <p class="${C.stepText}">
          Download the flow currently open in the canvas as a <code>.flow-meta.xml</code> file.
        </p>
        <div>
          <button type="button" class="sfut-btn sfut-btn-primary" id="sfut-fie-export-flow-btn">
            Export Flow
          </button>
        </div>
      </div>
    `;

    const btn = body.querySelector('#sfut-fie-export-flow-btn');
    btn.addEventListener('click', async () => {
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Exporting…';
      try {
        await _exportCurrentFlow();
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  }

  // ---------- Import wizard ----------

  function _renderImport() {
    const imp = STATE.imp;
    switch (imp.step) {
      case 'analyzing':   return _renderAnalyzing();
      case 'chooseTarget':return _renderChooseTarget();
      case 'blocked':     return _renderBlocked();
      case 'confirm':     return _renderConfirm();
      case 'deploying':   return _renderDeploying();
      case 'result':      return _renderResult();
      case 'pick':
      default:            return _renderPick();
    }
  }

  function _renderPick() {
    const body = _getBody();
    const imp = STATE.imp;
    body.innerHTML = `
      <div class="${C.step}">
        <div class="${C.dropzone}" id="sfut-fie-dropzone">
          <div style="font-size:40px;">⬆️</div>
          <div class="${C.stepTitle}">Import a Flow</div>
          <p class="${C.stepText}">
            Choose a <code>.flow-meta.xml</code> file to deploy as a new version.
            The import is checked against the org before anything is created, and
            always imports as an inactive draft unless you choose to activate it.
          </p>
          <button type="button" class="sfut-btn sfut-btn-primary" id="sfut-fie-pick-btn">Choose File…</button>
          <input type="file" id="sfut-fie-file-input" accept=".flow-meta.xml,.xml" style="display:none;">
          ${imp.error ? `<div class="${C.banner} ${C.bannerBlock}">${_escapeHtml(imp.error)}</div>` : ''}
        </div>
      </div>
    `;

    const input = body.querySelector('#sfut-fie-file-input');
    body.querySelector('#sfut-fie-pick-btn').addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      if (input.files && input.files[0]) _onFileChosen(input.files[0]);
    });

    // Drag & drop
    const zone = body.querySelector('#sfut-fie-dropzone');
    ['dragover', 'dragenter'].forEach((ev) =>
      zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('sfut-fie-dropzone-over'); }));
    ['dragleave', 'drop'].forEach((ev) =>
      zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('sfut-fie-dropzone-over'); }));
    zone.addEventListener('drop', (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) _onFileChosen(file);
    });
  }

  function _renderAnalyzing() {
    const body = _getBody();
    body.innerHTML = `
      <div class="${C.step}">
        <div class="${C.spinner}" aria-hidden="true"></div>
        <div class="${C.stepTitle}">Checking the org…</div>
        <p class="${C.stepText}">Comparing <strong>${_escapeHtml(STATE.imp.fileName)}</strong> against existing versions.</p>
      </div>
    `;
  }

  function _renderChooseTarget() {
    const body = _getBody();
    const { active, draft } = STATE.imp.targetChoices;
    body.innerHTML = `
      <div class="${C.step}">
        <div class="${C.stepTitle}">Which version should we compare against?</div>
        <p class="${C.stepText}">
          A newer inactive version exists. Choose the version to check the imported
          file against before creating a new version.
        </p>
        <div class="${C.choiceList}">
          <label class="${C.choice}">
            <input type="radio" name="sfut-fie-target" value="active" checked>
            <span><strong>Active</strong> — Version ${active.VersionNumber} (${_escapeHtml(active.Status)})</span>
          </label>
          <label class="${C.choice}">
            <input type="radio" name="sfut-fie-target" value="draft">
            <span><strong>Latest inactive</strong> — Version ${draft.VersionNumber} (${_escapeHtml(draft.Status)})</span>
          </label>
        </div>
      </div>
      <div class="${C.footer}" style="border:0;padding:16px 0 0;">
        <button type="button" class="sfut-btn" id="sfut-fie-target-back">Back</button>
        <button type="button" class="sfut-btn sfut-btn-primary" id="sfut-fie-target-next">Continue</button>
      </div>
    `;

    body.querySelector('#sfut-fie-target-back').addEventListener('click', _resetToPick);
    body.querySelector('#sfut-fie-target-next').addEventListener('click', () => {
      const val = body.querySelector('input[name="sfut-fie-target"]:checked').value;
      STATE.imp.compareTarget = val === 'draft' ? draft : active;
      _runDiff();
    });
  }

  function _renderBlocked() {
    const body = _getBody();
    const t = STATE.imp.compareTarget;
    body.innerHTML = `
      <div class="${C.step}">
        <div style="font-size:40px;">🛑</div>
        <div class="${C.stepTitle}">No differences found</div>
        <div class="${C.banner} ${C.bannerBlock}">
          <strong>${_escapeHtml(STATE.imp.developerName)}</strong> is identical to Version
          ${t.VersionNumber} (${_escapeHtml(t.Status)}) already in this org. Importing it
          would create an unnecessary duplicate version, so this import is blocked.
        </div>
        <button type="button" class="sfut-btn" id="sfut-fie-blocked-back">Choose a different file</button>
      </div>
    `;
    body.querySelector('#sfut-fie-blocked-back').addEventListener('click', _resetToPick);
  }

  function _renderConfirm() {
    const body = _getBody();
    const imp = STATE.imp;
    const isActiveSource = imp.sourceStatus === 'Active';

    let summaryHtml;
    if (imp.isNewFlow) {
      summaryHtml = `
        <div class="${C.banner} ${C.bannerWarn}">
          No existing Flow named <strong>${_escapeHtml(imp.developerName)}</strong> was found.
          A new Flow will be created as <strong>Version 1</strong>.
        </div>`;
    } else {
      const s = imp.diff.summary;
      const t = imp.compareTarget;
      summaryHtml = `
        <div class="${C.banner} ${C.bannerWarn}">
          This will create <strong>Version ${imp.nextVersionNumber}</strong> of
          <strong>${_escapeHtml(imp.developerName)}</strong>, compared against Version
          ${t.VersionNumber} (${_escapeHtml(t.Status)}).
          <strong>${imp.diff.totalChanges}</strong> element change${imp.diff.totalChanges === 1 ? '' : 's'} detected.
        </div>
        ${_renderChangeList(s)}
      `;
    }

    body.innerHTML = `
      <div class="${C.step}">
        <div class="${C.stepTitle}">Confirm import</div>
        ${summaryHtml}
        ${isActiveSource ? `
          <label class="${C.activateBox}">
            <input type="checkbox" id="sfut-fie-activate">
            <span>
              The source flow is marked <strong>Active</strong>. Activate this new version
              on import? <em>Default: no — imported as an inactive draft.</em>
            </span>
          </label>
        ` : `
          <p class="${C.stepText}">The new version will be imported as an inactive draft.</p>
        `}
      </div>
      <div class="${C.footer}" style="border:0;padding:16px 0 0;">
        <button type="button" class="sfut-btn" id="sfut-fie-confirm-back">Back</button>
        <button type="button" class="sfut-btn sfut-btn-primary" id="sfut-fie-confirm-deploy">Create New Version</button>
      </div>
    `;

    body.querySelector('#sfut-fie-confirm-back').addEventListener('click', _resetToPick);
    body.querySelector('#sfut-fie-confirm-deploy').addEventListener('click', () => {
      const cb = body.querySelector('#sfut-fie-activate');
      STATE.imp.activate = !!(cb && cb.checked);
      _deploy();
    });
  }

  function _renderChangeList(summary) {
    const section = (label, items) => {
      if (!items.length) return '';
      const shown = items.slice(0, 12).map((k) => `<li>${_escapeHtml(k)}</li>`).join('');
      const more = items.length > 12 ? `<li>…and ${items.length - 12} more</li>` : '';
      return `<div><div class="${C.stepText}"><strong>${label} (${items.length})</strong></div><ul class="${C.changeList}">${shown}${more}</ul></div>`;
    };
    return `
      ${section('Changed', summary.changed)}
      ${section('Added', summary.added)}
      ${section('Removed', summary.removed)}
    `;
  }

  function _renderDeploying() {
    const body = _getBody();
    const d = STATE.imp.deploy;
    const statusText = d.status || 'Uploading…';
    body.innerHTML = `
      <div class="${C.step}">
        <div class="${C.spinner}" aria-hidden="true"></div>
        <div class="${C.stepTitle}">Deploying…</div>
        <div class="${C.progress}">Status: <strong>${_escapeHtml(statusText)}</strong></div>
        <p class="${C.stepText}">Creating a new version of <strong>${_escapeHtml(STATE.imp.developerName)}</strong>. This can take a moment.</p>
      </div>
    `;
  }

  function _renderResult() {
    const body = _getBody();
    const d = STATE.imp.deploy;

    if (d.error || (d.result && d.result.success === false)) {
      const failures = _collectComponentFailures(d.result);
      body.innerHTML = `
        <div class="${C.step}">
          <div style="font-size:40px;">❌</div>
          <div class="${C.stepTitle} ${C.resultFail}">Import failed</div>
          ${d.error ? `<div class="${C.banner} ${C.bannerBlock}">${_escapeHtml(d.error)}</div>` : ''}
          ${failures.length ? `<ul class="${C.errorList}">${failures.map((f) => `<li>${_escapeHtml(f)}</li>`).join('')}</ul>` : ''}
          <button type="button" class="sfut-btn" id="sfut-fie-result-back">Try another file</button>
        </div>
      `;
    } else {
      body.innerHTML = `
        <div class="${C.step}">
          <div style="font-size:40px;">✅</div>
          <div class="${C.stepTitle} ${C.resultOk}">Import complete</div>
          <div class="${C.banner}">
            A new version of <strong>${_escapeHtml(STATE.imp.developerName)}</strong> was created
            ${STATE.imp.activate ? 'and <strong>activated</strong>' : 'as an <strong>inactive draft</strong>'}.
            Refresh the Flow list or Flow Builder to see it.
          </div>
          <button type="button" class="sfut-btn sfut-btn-primary" id="sfut-fie-result-back">Import another</button>
        </div>
      `;
    }

    body.querySelector('#sfut-fie-result-back').addEventListener('click', _resetToPick);
  }

  function _resetToPick() {
    STATE.imp = _freshImportState();
    _renderImport();
  }

  // ---------- Import orchestration ----------

  async function _onFileChosen(file) {
    const imp = STATE.imp;
    imp.error = null;
    imp.fileName = file.name;

    // Validate the whole filename against Salesforce API-name rules: the
    // DeveloperName starts with a letter, followed by letters, numbers, or
    // underscores, and carries the .flow-meta.xml suffix. The capture group
    // is the DeveloperName used as the package.xml member and deploy path.
    const nameMatch = file.name.match(/^([a-zA-Z][a-zA-Z0-9_]*)\.flow-meta\.xml$/);
    if (!nameMatch) {
      imp.error = `"${file.name}" is not a valid Flow file name. Expected <DeveloperName>.flow-meta.xml, where the name starts with a letter and uses only letters, numbers, and underscores.`;
      imp.step = 'pick';
      _renderImport();
      return;
    }
    const developerName = nameMatch[1];

    let text;
    try {
      text = await _readFileText(file);
    } catch (err) {
      imp.error = `Could not read the file: ${err.message}`;
      imp.step = 'pick';
      _renderImport();
      return;
    }

    // Validate it parses and is a Flow document.
    let sourceStatus;
    try {
      const doc = _parseXml(text);
      if (doc.documentElement.localName !== 'Flow') {
        throw new Error('The root element is not <Flow>.');
      }
      sourceStatus = _readFlowStatus(doc);
    } catch (err) {
      imp.error = `This does not look like a valid Flow file: ${err.message}`;
      imp.step = 'pick';
      _renderImport();
      return;
    }

    imp.developerName = developerName;
    imp.xmlText = text;
    imp.sourceStatus = sourceStatus;
    imp.step = 'analyzing';
    _renderImport();

    try {
      await _analyze();
    } catch (err) {
      console.error('[SFUT FlowImportExport] Analysis failed:', err);
      imp.error = `Could not check the org: ${err.message}`;
      imp.step = 'pick';
      _renderImport();
    }
  }

  async function _analyze() {
    const imp = STATE.imp;
    const versions = await SalesforceAPI.getFlowVersions(imp.developerName);
    imp.versions = versions;

    if (versions.length === 0) {
      imp.isNewFlow = true;
      imp.nextVersionNumber = 1;
      imp.step = 'confirm';
      _renderImport();
      return;
    }

    const highestVersion = versions[0].VersionNumber; // ordered DESC
    imp.nextVersionNumber = highestVersion + 1;

    const active = versions.find((v) => v.Status === 'Active') || null;
    const higherInactive = versions.filter(
      (v) => v.Status !== 'Active' && (!active || v.VersionNumber > active.VersionNumber)
    );

    if (active && higherInactive.length > 0) {
      imp.targetChoices = { active, draft: higherInactive[0] }; // higherInactive[0] is highest (DESC)
      imp.step = 'chooseTarget';
      _renderImport();
      return;
    }

    imp.compareTarget = active || versions[0];
    await _runDiff();
  }

  async function _runDiff() {
    const imp = STATE.imp;
    imp.step = 'analyzing';
    _renderImport();

    const targetRecord = await SalesforceAPI.getFlowMetadataByVersionId(imp.compareTarget.Id);
    if (!targetRecord || !targetRecord.Metadata) {
      throw new Error('The compare-target version has no Metadata payload.');
    }
    const targetXml = FlowXmlConverter.flowMetadataToXml(targetRecord.Metadata);

    imp.diff = FlowDeployDiff.diffFlows(imp.xmlText, targetXml);

    imp.step = imp.diff.identical ? 'blocked' : 'confirm';
    _renderImport();
  }

  // ---------- Deploy ----------

  async function _deploy() {
    const imp = STATE.imp;
    imp.step = 'deploying';
    imp.deploy = { requestId: null, status: 'Preparing…', result: null, error: null, pollAttempts: 0, cancelled: false };
    _renderImport();

    try {
      await _ensureJsZipLoaded();

      const statusToSet = imp.activate ? 'Active' : 'Draft';
      const deployXml = _setFlowStatus(imp.xmlText, statusToSet);
      const packageXml = FlowXmlConverter.buildFlowPackageXml(imp.developerName, API_VERSION_NUMERIC);

      const zip = new JSZip();
      zip.file('package.xml', packageXml);
      zip.file(`flows/${imp.developerName}.flow`, deployXml);
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      imp.deploy.status = 'Uploading…';
      _renderImport();

      const resp = await SalesforceAPI.deployMetadata(zipBlob);
      const requestId = resp && (resp.id || (resp.deployResult && resp.deployResult.id));
      if (!requestId) {
        throw new Error('Deploy request did not return an id.');
      }
      imp.deploy.requestId = requestId;

      await _pollDeploy(requestId);
    } catch (err) {
      console.error('[SFUT FlowImportExport] Deploy failed:', err);
      imp.deploy.error = err.message;
      imp.step = 'result';
      _renderImport();
    }
  }

  async function _pollDeploy(requestId) {
    const imp = STATE.imp;

    while (imp.deploy.pollAttempts < POLL_MAX_ATTEMPTS) {
      if (imp.deploy.cancelled || !STATE.isOpen) return;

      imp.deploy.pollAttempts += 1;
      const resp = await SalesforceAPI.getDeployStatus(requestId);
      const result = (resp && resp.deployResult) || resp || {};
      imp.deploy.result = result;
      imp.deploy.status = result.status || 'InProgress';

      if (STATE.imp === imp && imp.step === 'deploying') _renderImport();

      const done = result.done === true ||
        ['Succeeded', 'SucceededPartial', 'Failed', 'Canceled'].includes(result.status);

      if (done) {
        imp.step = 'result';
        if (STATE.imp === imp) _renderImport();
        return;
      }

      await _sleep(POLL_INTERVAL_MS);
    }

    imp.deploy.error = 'Timed out waiting for the deploy to finish.';
    imp.step = 'result';
    if (STATE.imp === imp) _renderImport();
  }

  function _collectComponentFailures(result) {
    if (!result) return [];
    const details = result.details || {};
    let failures = details.componentFailures || [];
    if (!Array.isArray(failures)) failures = [failures];
    const messages = failures
      .filter(Boolean)
      .map((f) => {
        const name = f.fullName || f.fileName || 'component';
        return `${name}: ${f.problem || f.problemType || 'Unknown error'}`;
      });
    if (messages.length === 0 && result.errorMessage) messages.push(result.errorMessage);
    return messages;
  }

  // ---------- XML helpers ----------

  function _parseXml(xmlString) {
    const doc = new DOMParser().parseFromString(String(xmlString), 'application/xml');
    const err = doc.querySelector('parsererror');
    if (err) throw new Error(err.textContent.trim().split('\n')[0]);
    if (!doc.documentElement) throw new Error('No root element.');
    return doc;
  }

  function _readFlowStatus(doc) {
    const statusEl = Array.from(doc.documentElement.children).find((c) => c.localName === 'status');
    return statusEl ? (statusEl.textContent || '').trim() : null;
  }

  /**
   * Returns a copy of the flow XML with the top-level <status> set to the given
   * value (creating the element if absent). Drives active-vs-draft on import.
   */
  function _setFlowStatus(xmlText, status) {
    const doc = _parseXml(xmlText);
    const root = doc.documentElement;
    let statusEl = Array.from(root.children).find((c) => c.localName === 'status');
    if (!statusEl) {
      statusEl = doc.createElementNS(root.namespaceURI || FLOW_NAMESPACE, 'status');
      root.appendChild(statusEl);
    }
    statusEl.textContent = status;

    // XMLSerializer omits the XML declaration; Salesforce's own .flow files
    // carry one, so prepend it for consistency.
    let serialized = new XMLSerializer().serializeToString(doc);
    if (!/^\s*<\?xml/.test(serialized)) {
      serialized = `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`;
    }
    return serialized;
  }

  // ---------- JSZip loading ----------

  async function _ensureJsZipLoaded() {
    if (STATE.jsZipLoaded && typeof JSZip !== 'undefined') return;
    if (typeof JSZip !== 'undefined') { STATE.jsZipLoaded = true; return; }

    const resp = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'injectJsZipLib' }, (r) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(r || { ok: false, error: 'No response from background' });
        }
      });
    });

    if (!resp.ok) throw new Error(`Failed to load JSZip: ${resp.error}`);

    await _sleep(100);

    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip injected but not available on the page.');
    }
    STATE.jsZipLoaded = true;
  }

  // ---------- Misc helpers ----------

  function _readFileText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('read error'));
      reader.readAsText(file);
    });
  }

  const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function _escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

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
