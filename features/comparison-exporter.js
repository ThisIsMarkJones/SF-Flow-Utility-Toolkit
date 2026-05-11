/**
 * SF Flow Utility Toolkit - Flow Comparison Exporter
 *
 * Exports Salesforce Flow Version Comparison results to an XLSX file
 * based on a template with named ranges.
 *
 * Context: Compare Flows page (Setup > Flows > Compare Versions)
 *
 * Flow:
 *   1. User opens Compare Versions page and selects two versions
 *   2. User clicks "Comparison Exporter" in the side-button menu
 *   3. Extension scrapes the comparison DOM (selections, results, changes table)
 *   4. Optionally clicks each "View Details" button to scrape detail panels
 *   5. Loads the XLSX template, populates named ranges and changes table
 *   6. Triggers a browser download of the populated XLSX
 *
 * Dependencies:
 *   - window.SFUT_XLSX (from lib/xlsx.bundle.js, loaded on demand)
 *   - Template XLSX (assets/Flow Comparison Documentation Template.xlsx)
 */

const ComparisonExporter = (() => {

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let _isExporting = false;
  let _xlsxLoaded = false;

  // ===== Initialisation =====

  async function init() {
    const context = ContextDetector.detectContext();
    if (context !== ContextDetector.CONTEXTS.COMPARE_FLOWS) return;
    console.log('[SFUT CompExport] Registered for Compare Flows page.');
  }

  async function onActivate() {
    if (_isExporting) {
      _showToast('Export already in progress…', 'warning');
      return;
    }
    await _runExport();
  }

  // ===== Main Export Flow =====

  async function _runExport() {
    _isExporting = true;

    try {
      // 1. Ensure SheetJS is loaded
      _showToast('Loading XLSX library…');
      await _ensureXlsxLoaded();

      // 2. Ask user about details via styled modal
      const includeDetails = await _showExportOptionsModal();
      if (includeDetails === null) {
        // User cancelled
        return;
      }

      // 3. Scrape the page
      _showToast('Scraping comparison data…');
      const selections = _scrapeCompareSelections();
      const results = _scrapeComparisonResults(selections);
      const basicTable = _scrapeChangesTableBasic();

      let rows = basicTable.rows;
      if (includeDetails && rows.length > 0) {
        _showToast(`Scraping details for ${rows.length} changes…`);
        rows = await _scrapeDetailsForRows(rows);
      }

      if (basicTable.error) {
        console.warn('[SFUT CompExport] Scrape warning:', basicTable.error);
      }

      // 4. Generate and download XLSX
      _showToast('Generating XLSX…');
      await _exportXlsx({ selections, results, rows });

      _showToast('Export complete — download started.');

    } catch (err) {
      console.error('[SFUT CompExport] Export failed:', err);
      _showToast(`Export failed: ${err.message}`, 'error');
    } finally {
      _isExporting = false;
    }
  }

  /**
   * Shows a styled modal with export options.
   * @returns {Promise<boolean|null>} true = include details, false = skip details, null = cancelled
   */
  function _showExportOptionsModal() {
    return new Promise((resolve) => {
      // Remove any existing modal
      document.querySelector('.sfut-comp-export-overlay')?.remove();

      const overlay = document.createElement('div');
      overlay.className = 'sfut-comp-export-overlay';

      overlay.innerHTML = `
        <div class="sfut-comp-export-modal">
          <div class="sfut-comp-export-modal-header">
            <span class="sfut-comp-export-modal-title">📊 Export Flow Comparison</span>
            <button class="sfut-comp-export-modal-close" title="Cancel">✕</button>
          </div>
          <div class="sfut-comp-export-modal-body">
            <p class="sfut-comp-export-modal-text">
              Export the comparison results and changes table to an XLSX file.
            </p>
            <label class="sfut-comp-export-checkbox-label">
              <input type="checkbox" id="sfut-comp-include-details" checked />
              <span>Include "View Details" panel text</span>
            </label>
            <p class="sfut-comp-export-modal-hint">
              When enabled, the extension will open each "View Details" panel and capture the 
              change details. This is slower but produces a more complete export.
            </p>
          </div>
          <div class="sfut-comp-export-modal-footer">
            <button class="sfut-ai-btn sfut-ai-btn-secondary sfut-comp-export-cancel">Cancel</button>
            <button class="sfut-ai-btn sfut-ai-btn-primary sfut-comp-export-confirm">Export XLSX</button>
          </div>
        </div>
      `;

      const cleanup = () => {
        overlay.remove();
        document.removeEventListener('keydown', escHandler, true);
      };

      const escHandler = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cleanup();
          resolve(null);
        }
      };

      // Close on overlay click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { cleanup(); resolve(null); }
      });

      // Close button
      overlay.querySelector('.sfut-comp-export-modal-close').addEventListener('click', () => {
        cleanup(); resolve(null);
      });

      // Cancel button
      overlay.querySelector('.sfut-comp-export-cancel').addEventListener('click', () => {
        cleanup(); resolve(null);
      });

      // Export button
      overlay.querySelector('.sfut-comp-export-confirm').addEventListener('click', () => {
        const checked = overlay.querySelector('#sfut-comp-include-details').checked;
        cleanup();
        resolve(checked);
      });

      document.addEventListener('keydown', escHandler, true);
      document.body.appendChild(overlay);

      // Focus the export button
      overlay.querySelector('.sfut-comp-export-confirm').focus();
    });
  }

  // ===== SheetJS Loading =====

  async function _ensureXlsxLoaded() {
    if (_xlsxLoaded && window.SFUT_XLSX) return;

    // MV3 content scripts can't use eval/new Function() due to CSP, and
    // <script> tags inject into the main world (not our isolated world).
    // Solution: ask the background service worker to inject the SheetJS
    // bundle into this tab's ISOLATED world via chrome.scripting.executeScript.
    const resp = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'injectXlsxLib' }, (r) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(r || { ok: false, error: 'No response from background' });
        }
      });
    });

    if (!resp.ok) {
      throw new Error(`Failed to inject SheetJS: ${resp.error}`);
    }

    // Give the injected script a moment to execute
    await new Promise((r) => setTimeout(r, 100));

    if (!window.SFUT_XLSX) {
      throw new Error('SheetJS injected but SFUT_XLSX not found on window');
    }

    _xlsxLoaded = true;
    console.log('[SFUT CompExport] SheetJS loaded:', window.SFUT_XLSX.version);
  }

  // ===== DOM Scraping (adapted from original content.js) =====

  function _norm(s) {
    return (s || '')
      .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function _scrapeCompareSelections() {
    const readPicker = (testId) => {
      const root = document.querySelector(`[data-testid="${testId}"]`);
      if (!root) return { apiName: '', version: '' };

      const labels = Array.from(root.querySelectorAll('.slds-pill__label'))
        .map((el) => _norm(el.getAttribute('title') || el.textContent))
        .filter(Boolean);

      const apiName = labels[0] || '';
      const rootText = _norm(root.innerText);
      const m = rootText.match(/Version\s+\d+(?:\s*\(Latest\))?/);
      const version =
        labels.find((t) => /^Version\s+\d+/.test(t)) ||
        (m ? _norm(m[0]) : '');

      return { apiName, version };
    };

    const x = readPicker('baseFlowCompareVersionSelect');
    const y = readPicker('secondaryFlowCompareVersionSelect');

    return {
      xFlowApiName: x.apiName,
      xFlowVersion: x.version,
      yFlowApiName: y.apiName,
      yFlowVersion: y.version
    };
  }

  function _scrapeComparisonResults(selections) {
    const labelToValue = {};
    const containers = Array.from(document.querySelectorAll('[part="input-text"][populated]'));

    for (const c of containers) {
      const label = _norm(c.querySelector('label')?.textContent);
      const input = c.querySelector('input.slds-input, input');
      const value = _norm(input?.value);
      if (label) labelToValue[label] = value || '';
    }

    const findExact = (label) => labelToValue[label] ?? '';
    const findBySuffix = (suffix) => {
      const k = Object.keys(labelToValue).find((x) => x.endsWith(suffix));
      return k ? labelToValue[k] : '';
    };
    const findByLabel = (targetLabel) => {
      const k = Object.keys(labelToValue).find((x) => x === targetLabel);
      return k ? labelToValue[k] : '';
    };

    const xVer = selections?.xFlowVersion || '';
    const yVer = selections?.yFlowVersion || '';
    const xNum = (xVer.match(/Version\s+(\d+)/) || [])[1] || '';
    const yNum = (yVer.match(/Version\s+(\d+)/) || [])[1] || '';

    const findStatusForVersionNum = (num) => {
      if (!num) return '';
      const k = Object.keys(labelToValue).find(
        (lbl) => lbl.endsWith('Status') && lbl.includes(`Version ${num}`)
      );
      return k ? labelToValue[k] : '';
    };

    const xStatusLabel = xVer ? `${xVer} Status` : '';
    const yStatusLabel = yVer ? `${yVer} Status` : '';
    const yLastModDateLabel = yVer ? `${yVer} Last Modified Date` : '';
    const yLastModByLabel = yVer ? `${yVer} Last Modified By` : '';

    const out = {
      'Analysis Time': findExact('Analysis Time'),
      'Version Y Last Modified Date':
        (yLastModDateLabel ? findByLabel(yLastModDateLabel) : '') || findBySuffix('Last Modified Date'),
      'Version Y Last Modified By':
        (yLastModByLabel ? findByLabel(yLastModByLabel) : '') || findBySuffix('Last Modified By'),
      'Version X Status':
        (xStatusLabel ? findByLabel(xStatusLabel) : '') || findStatusForVersionNum(xNum),
      'Version Y Status':
        (yStatusLabel ? findByLabel(yStatusLabel) : '') || findStatusForVersionNum(yNum) || findBySuffix('Status'),
      'Added Items': findExact('Added Items'),
      'Updated Items': findExact('Updated Items'),
      'Changed Connectors': findExact('Changed Connectors'),
      'Removed Items': findExact('Removed Items')
    };

    return out;
  }

  function _scrapeChangesTableBasic() {
    const table = document.querySelector('table[role="grid"], table.slds-table');
    if (!table) return { rows: [], error: 'Could not find changes table.' };

    const tbody = table.querySelector('tbody');
    const trs = Array.from((tbody || table).querySelectorAll('tr[role="row"], tr'));

    const getCellText = (tr, dataLabel) => {
      const cell = tr.querySelector(`[data-label="${dataLabel}"]`);
      if (!cell) return '';
      const ft = cell.querySelector('lightning-formatted-text');
      return _norm(ft?.textContent || cell.textContent);
    };

    const rows = trs
      .map((tr) => {
        const label = getCellText(tr, 'Label');
        const apiName = getCellText(tr, 'API Name');
        const changeType = getCellText(tr, 'Change Type');
        if (!label && !apiName && !changeType) return null;
        return { label, apiName, changeType, details: '' };
      })
      .filter(Boolean);

    return { rows };
  }

  async function _scrapeDetailsForRows(rows) {
    const table = document.querySelector('table[role="grid"], table.slds-table');
    if (!table) return rows;

    const tbody = table.querySelector('tbody');
    const trs = Array.from((tbody || table).querySelectorAll('tr[role="row"], tr'));

    const isBadOverlay = (t) => {
      const x = _norm(t);
      return x.includes('Sorry to interrupt') || x.includes('CSS Error') || x.includes('Refresh');
    };

    const extractCompareDetailsText = () => {
      const newVals = Array.from(document.querySelectorAll('.test-compare-new-value'))
        .map((el) => _norm(el.textContent))
        .filter(Boolean);

      const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,[role="heading"]'))
        .map((el) => _norm(el.textContent))
        .filter((t) => t && (t.includes('Changed') || t.includes('Connections') || t.includes('Element')));

      if (newVals.length) {
        const head = headings[0] ? `${headings[0]} | ` : '';
        return head + newVals.join(' | ');
      }

      const candidate = Array.from(document.querySelectorAll('aside, section, div'))
        .map((el) => ({ el, t: _norm(el.innerText) }))
        .filter(({ t }) => t.includes('Next Elements in Path') || t.includes('Changed Element Connections'))
        .sort((a, b) => b.t.length - a.t.length)[0];

      return candidate ? candidate.t : '';
    };

    for (let i = 0; i < Math.min(rows.length, trs.length); i++) {
      const tr = trs[i];
      const btn = tr.querySelector('[data-label="Change Details"] button');
      if (!btn) continue;

      btn.scrollIntoView({ block: 'center' });
      btn.click();

      let details = '';
      for (let attempt = 0; attempt < 10; attempt++) {
        await sleep(250);
        details = extractCompareDetailsText();
        if (details && !isBadOverlay(details)) break;
      }

      if (details && isBadOverlay(details)) details = '';
      rows[i].details = details;

      // Close modal
      const dialog = document.querySelector('[role="dialog"], section[role="dialog"]');
      if (dialog) {
        const closeBtn =
          dialog.querySelector('button[title="Close"], button[aria-label="Close"], button.slds-modal__close') ||
          document.querySelector('button[title="Close"], button[aria-label="Close"], button.slds-modal__close');
        if (closeBtn) {
          closeBtn.click();
          await sleep(150);
        }
      }
    }

    return rows;
  }

  // ===== XLSX Generation =====

  async function _exportXlsx(scrape) {
    const XLSX = window.SFUT_XLSX;
    if (!XLSX) throw new Error('SheetJS not loaded');

    // Load template via background worker (content scripts can't always
    // fetch chrome-extension:// URLs due to web_accessible_resources restrictions)
    const templateResp = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'fetchExtensionFile', path: 'assets/Flow Comparison Documentation Template.xlsx' },
        (r) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(r || { ok: false, error: 'No response' });
          }
        }
      );
    });

    if (!templateResp.ok) {
      throw new Error(`Failed to load template: ${templateResp.error}`);
    }

    // Decode base64 to Uint8Array
    const binary = atob(templateResp.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const wb = XLSX.read(bytes, { type: 'array' });

    // Helper: set a named range value
    const setNamedRange = (name, value) => {
      const names = wb?.Workbook?.Names || [];
      const def = names.find((n) => n.Name === name);
      if (!def) return false;

      const ref = def.Ref;
      const m = ref.match(/^'?([^']+)'?!\$?([A-Z]+)\$?(\d+)/);
      if (!m) return false;

      const ws = wb.Sheets[m[1]];
      if (!ws) return false;

      const a1 = `${m[2]}${m[3]}`;
      XLSX.utils.sheet_add_aoa(ws, [[value]], { origin: a1 });
      return true;
    };

    // Helper: find named range cell location
    const findNamedRange = (name) => {
      const names = wb?.Workbook?.Names || [];
      const def = names.find((n) => n.Name === name);
      if (!def) return null;

      const ref = def.Ref;
      const m = ref.match(/^'?([^']+)'?!\$?([A-Z]+)\$?(\d+)/);
      if (!m) return null;

      return { sheet: m[1], col: m[2], row: Number(m[3]) };
    };

    // Populate named ranges - selections
    const xVersion = scrape.selections.xFlowVersion || '';
    const yVersion = scrape.selections.yFlowVersion || '';

    setNamedRange('FC_X_FlowApiName', scrape.selections.xFlowApiName || '');
    setNamedRange('FC_X_FlowVersion', xVersion);
    setNamedRange('FC_Y_FlowApiName', scrape.selections.yFlowApiName || '');
    setNamedRange('FC_Y_FlowVersion', yVersion);

    // Populate named ranges - results
    const r = scrape.results || {};
    setNamedRange('FC_AnalysisTime', r['Analysis Time'] || '');
    setNamedRange('FC_Y_LastModifiedDate', r['Version Y Last Modified Date'] || '');
    setNamedRange('FC_Y_LastModifiedBy', r['Version Y Last Modified By'] || '');
    setNamedRange('FC_X_Status', r['Version X Status'] || '');
    setNamedRange('FC_Y_Status', r['Version Y Status'] || '');
    setNamedRange('FC_AddedItems', r['Added Items'] || '');
    setNamedRange('FC_UpdatedItems', r['Updated Items'] || '');
    setNamedRange('FC_ChangedConnectors', r['Changed Connectors'] || '');

    // SheetJS drops formula cells on read (it has no formula engine).
    // Manually write the label cells that originally used formulas referencing
    // the version named ranges. These appear on both Descriptors and Summary sheets.
    const writeCell = (sheetName, a1, value) => {
      const ws = wb.Sheets[sheetName];
      if (ws) XLSX.utils.sheet_add_aoa(ws, [[value]], { origin: a1 });
    };

    // Comparison Descriptors - column A labels (rows 3-6) and column B descriptors (rows 3-10)
    const descSheet = 'Comparison Descriptors';
    writeCell(descSheet, 'A3', `${yVersion} Last Modified Date`);
    writeCell(descSheet, 'B3', `The date/time when ${yVersion} was last saved/modified in Salesforce.`);
    writeCell(descSheet, 'A4', `${yVersion} Last Modified By`);
    writeCell(descSheet, 'B4', `The user who last saved/modified ${yVersion} in Salesforce.`);
    writeCell(descSheet, 'A5', `${yVersion} Status`);
    writeCell(descSheet, 'B5', `The status of ${yVersion}.`);
    writeCell(descSheet, 'A6', `${xVersion} Status`);
    writeCell(descSheet, 'B6', `The status of ${xVersion}.`);
    writeCell(descSheet, 'B7', `Number of added items in ${yVersion}.`);
    writeCell(descSheet, 'B8', `Number of updated items in ${yVersion}.`);
    writeCell(descSheet, 'B9', `Number of changed connectors in ${yVersion}.`);
    writeCell(descSheet, 'B10', `Number of removed items in ${yVersion}.`);

    // Comparison Summary and Results - column A labels (rows 8-11)
    const summarySheet = 'Comparison Summary and Results';
    writeCell(summarySheet, 'A8', `${yVersion} Last Modified Date`);
    writeCell(summarySheet, 'A9', `${yVersion} Last Modified By`);
    writeCell(summarySheet, 'A10', `${xVersion} Status`);
    writeCell(summarySheet, 'A11', `${yVersion} Status`);
    setNamedRange('FC_RemovedItems', r['Removed Items'] || '');

    // Populate changes table
    const first = findNamedRange('FC_Changes_FirstDataRow');
    if (!first) throw new Error('Named range FC_Changes_FirstDataRow not found in template.');

    const ws = wb.Sheets[first.sheet];
    if (!ws) throw new Error(`Worksheet not found: ${first.sheet}`);

    const startRow = first.row;
    const startCol = XLSX.utils.decode_col(first.col);
    const rows = scrape.rows || [];

    rows.forEach((row, idx) => {
      const r = startRow + idx;
      const values = [row.label || '', row.apiName || '', row.changeType || '', row.details || ''];
      XLSX.utils.sheet_add_aoa(ws, [values], { origin: { r: r - 1, c: startCol } });
    });

    // Update table range
    if (rows.length > 0) {
      const headerRow = startRow - 1;
      const endRow = startRow + rows.length - 1;
      _resizeTable(wb, first.sheet, 'FC_ChangesTable', headerRow, startCol + 1, endRow, startCol + 4);
    }

    // Write and download
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);

    const filename = _buildFilename(scrape.selections);

    // Download via anchor click (no downloads permission needed)
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function _resizeTable(wb, sheetName, tableName, startRow, startCol, endRow, endCol) {
    const ws = wb.Sheets[sheetName];
    if (!ws) return;

    const a1From = (row, colIdx) => {
      let col = '';
      let n = colIdx;
      while (n > 0) {
        const r = (n - 1) % 26;
        col = String.fromCharCode(65 + r) + col;
        n = Math.floor((n - 1) / 26);
      }
      return `${col}${row}`;
    };

    const ref = `${a1From(startRow, startCol)}:${a1From(endRow, endCol)}`;

    if (ws['!tables'] && Array.isArray(ws['!tables'])) {
      const t = ws['!tables'].find((x) => x.name === tableName) || ws['!tables'][0];
      if (t) t.ref = ref;
    }

    if (wb.Workbook && Array.isArray(wb.Workbook.Tables)) {
      const t = wb.Workbook.Tables.find((x) => x.name === tableName) || wb.Workbook.Tables[0];
      if (t) t.ref = ref;
    }

    const range = SFUT_XLSX.utils.decode_range(ws['!ref'] || ref);
    const newRange = SFUT_XLSX.utils.decode_range(ref);
    range.s.r = Math.min(range.s.r, newRange.s.r);
    range.s.c = Math.min(range.s.c, newRange.s.c);
    range.e.r = Math.max(range.e.r, newRange.e.r);
    range.e.c = Math.max(range.e.c, newRange.e.c);
    ws['!ref'] = SFUT_XLSX.utils.encode_range(range);
    ws['!autofilter'] = { ref };
  }

  function _buildFilename(selections) {
    const safe = (s) => (s || '').replace(/[^a-z0-9\-_. ]/gi, '').trim().replace(/\s+/g, '_');
    const xV = safe(selections?.xFlowVersion || 'X');
    const yV = safe(selections?.yFlowVersion || 'Y');
    const api = safe(selections?.xFlowApiName || selections?.yFlowApiName || 'Flow');
    return `FlowCompare_${api}_${xV}_to_${yV}.xlsx`;
  }

  // ===== UI =====

  function _showToast(message, type = 'success') {
    // Remove existing toasts from this feature
    document.querySelectorAll('.sfut-toast[data-feature="comp-export"]').forEach(el => el.remove());

    const toast = document.createElement('div');
    toast.className = `sfut-toast ${
      type === 'error' ? 'sfut-toast-error' :
      type === 'warning' ? 'sfut-toast-warning' : ''
    }`;
    toast.dataset.feature = 'comp-export';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('sfut-toast-visible'));

    setTimeout(() => {
      toast.classList.remove('sfut-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ===== Public API =====
  return {
    init,
    onActivate
  };

})();

// Register with the toolkit
if (typeof SFFlowUtilityToolkit !== 'undefined') {
  SFFlowUtilityToolkit.registerFeature('comparison-exporter', ComparisonExporter);
}