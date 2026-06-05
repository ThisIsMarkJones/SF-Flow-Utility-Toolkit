/**
 * SF Flow Utility Toolkit - Where Is This Used?
 *
 * Adds a "Where Is This Used?" button to the Flow details page in Setup.
 * Scans all active flows, quick actions, and Lightning pages for references
 * to the current flow, and displays results in a styled modal.
 *
 * Reference types detected from flows:
 *   - Subflow element       (metadata.subflows[].flowName)
 *   - Screen Action         (metadata.screens[].actions[] where actionType === 'flow',
 *                            no flow__screenfieldclick trigger pointing to it)
 *   - Action Button         (metadata.screens[].actions[] where actionType === 'flow',
 *                            has flow__screenfieldclick trigger pointing to it)
 *   - Flow Action           (metadata.actionCalls[] where actionType === 'flow')
 *
 * Reference types detected from other metadata:
 *   - Quick Action          (QuickActionDefinition where Type = 'Flow')
 *   - Lightning Page        (FlexiPage component properties)
 *   - LWC Component        (LightningComponentResource HTML scanned for flow-api-name attribute;
 *                           page locations enriched from FlexiPage itemInstances tree)
 *   - Button / Link        (WebLink Url field scanned for flow API name; covers both
 *                           URL-type and JavaScript-type buttons as both use the Url field)
 */

const WhereIsThisUsed = (() => {

  // ─── Selectors ────────────────────────────────────────────────────────────

  const SELECTORS = {
    buttonBar: 'td[id="view:form:thePageBlock:pageBlockButtons"]'
  };

  // ─── CSS class names ──────────────────────────────────────────────────────

  const CLASS_NAMES = {
    triggerButton:    'sfut-witu-trigger-btn',
    modalBackdrop:    'sfut-witu-backdrop',
    modal:            'sfut-witu-modal',
    modalHeader:      'sfut-witu-modal-header',
    modalTitle:       'sfut-witu-modal-title',
    modalClose:       'sfut-witu-modal-close',
    modalBody:        'sfut-witu-modal-body',
    modalFooter:      'sfut-witu-modal-footer',
    closeButton:      'sfut-witu-btn-secondary',
    progressWrap:     'sfut-witu-progress',
    progressText:     'sfut-witu-progress-text',
    progressBar:      'sfut-witu-progress-bar',
    progressFill:     'sfut-witu-progress-fill',
    resultsTable:     'sfut-witu-table',
    emptyState:       'sfut-witu-empty',
    errorState:       'sfut-witu-error',
    badge:            'sfut-witu-badge',
    badgeSubflow:     'sfut-witu-badge--subflow',
    badgeAction:      'sfut-witu-badge--action',
    badgeButton:      'sfut-witu-badge--button',
    badgeFlowAction:  'sfut-witu-badge--flow-action',
    badgeQuickAction: 'sfut-witu-badge--quick-action',
    badgeLightning:   'sfut-witu-badge--lightning-page',
    badgeLwc:         'sfut-witu-badge--lwc',
    locationPages:    'sfut-witu-location-pages',
    locationToggle:   'sfut-witu-location-toggle',
    badgeWeblink:     'sfut-witu-badge--weblink',
    csvButton:        'sfut-witu-btn-csv'
  };

  // ─── State ────────────────────────────────────────────────────────────────

  const STATE = {
    buttonInjected: false,
    observer:       null,
    observerTimer:  null
  };

  let _enabled = true;

  // Holds the most recent scan results for CSV export
  let _lastMatches = [];
  let _lastApiName = '';
  let _lastLabel   = '';

  // ─── Batch size for parallel Metadata fetches ─────────────────────────────

  const BATCH_SIZE = 5;

  // ─── Init ─────────────────────────────────────────────────────────────────

  async function init() {
    try {
      const featureEnabled = (await SettingsManager.get('whereIsThisUsed.enabled')) ?? true;
      if (!featureEnabled) { _enabled = false; return; }
      _enabled = true;
    } catch (e) {
      console.warn('[SFUT WITU] Could not read feature setting, defaulting to enabled:', e);
      _enabled = true;
    }

    if (!_enabled) return;

    // Only proceed if this looks like the Flow Details VF page.
    if (!_isLikelyFlowDetailsPage()) return;

    _waitForButtonBar();
    console.log('[SFUT] Where Is This Used initialised.');
  }

  // ─── Page guard ───────────────────────────────────────────────────────────

  function _isLikelyFlowDetailsPage() {
    if (document.querySelector(SELECTORS.buttonBar)) return true;
    const url = window.location.href;
    return (
      url.includes('lightning/setup/Flows/page') ||
      url.includes('lightning/setup/InteractionProcesses/page') ||
      url.includes('/udd/FlowDefinition/viewFlowDefinition.apexp')
    );
  }

  // ─── Wait for the VF button bar to appear ─────────────────────────────────

  function _waitForButtonBar() {
    if (_tryInjectButton()) return;

    STATE.observer = new MutationObserver(() => {
      if (_tryInjectButton()) {
        STATE.observer.disconnect();
        STATE.observer = null;
        clearTimeout(STATE.observerTimer);
      }
    });

    STATE.observer.observe(document.body, { childList: true, subtree: true });

    STATE.observerTimer = setTimeout(() => {
      if (STATE.observer) {
        STATE.observer.disconnect();
        STATE.observer = null;
      }
    }, 15000);
  }

  function _tryInjectButton() {
    if (STATE.buttonInjected) return true;
    const bar = document.querySelector(SELECTORS.buttonBar);
    if (!bar) return false;

    _injectButton(bar);
    STATE.buttonInjected = true;
    return true;
  }

  // ─── Button injection ─────────────────────────────────────────────────────

  function _injectButton(bar) {
    const btn = document.createElement('a');
    btn.href        = 'javascript:void(0)';
    btn.textContent = 'Where Is This Used?';
    // 'btn' is the native Salesforce VF button class
    btn.className   = `btn ${CLASS_NAMES.triggerButton}`;
    bar.appendChild(btn);

    // Document-level delegation — more reliable than direct element listeners
    // in Chrome MV3 isolated worlds when appending to pre-existing page DOM nodes.
    document.addEventListener('click', e => {
      if (e.target && e.target.classList.contains(CLASS_NAMES.triggerButton)) {
        e.preventDefault();
        e.stopPropagation();
        _onButtonClick();
      }
    }, true);
  }

  // ─── Button click handler ─────────────────────────────────────────────────

  async function _onButtonClick() {
    _showModal();
    _showProgress('Resolving current flow…', 0);

    let currentApiName;
    let currentLabel;
    try {
      let flowId = SalesforceAPI.getFlowIdFromUrl?.();

      if (!flowId) {
        // Fallback 1: id= query param (viewFlowDefinition.apexp?id=<id>)
        const idParam = new URLSearchParams(window.location.search).get('id');
        if (idParam && /^[a-zA-Z0-9]{15,18}$/.test(idParam)) flowId = idParam;
      }

      if (!flowId) {
        // Fallback 2: extract 15/18-char Salesforce ID from the path
        const pathMatch = window.location.pathname.match(/\/([a-zA-Z0-9]{15,18})(?:\/|$)/);
        if (pathMatch) flowId = pathMatch[1];
      }

      if (!flowId) {
        // Fallback 3: check the address query param (Lightning frame URL)
        const addressParam = new URLSearchParams(window.location.search).get('address');
        if (addressParam) {
          const decoded = decodeURIComponent(addressParam);
          const idMatch = decoded.match(/\/([a-zA-Z0-9]{15,18})(?:\?|$)/);
          if (idMatch) flowId = idMatch[1];
        }
      }

      if (!flowId) throw new Error('Could not determine flow ID from URL.');

      const flowMeta = await SalesforceAPI.getFlowMetadata(flowId);
      currentApiName = (flowMeta.FullName || '').replace(/-\d+$/, '');
      currentLabel   = flowMeta.MasterLabel || currentApiName;
      if (!currentApiName) throw new Error('Could not resolve flow API name.');
    } catch (e) {
      _showError(`Could not resolve the current flow: ${e.message}`);
      return;
    }

    const allMatches = [];

    // ── Phase 1: Active flows ──────────────────────────────────────────────
    _showProgress('Scanning flows…', 5);

    try {
      const result = await SalesforceAPI.toolingQuery(
        `SELECT Id, MasterLabel, ProcessType, Status FROM Flow WHERE Status = 'Active'`
      );
      const allFlows = result.records || [];

      const total = allFlows.length;
      let processed = 0;

      for (let i = 0; i < allFlows.length; i += BATCH_SIZE) {
        const batch = allFlows.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(flow => _fetchAndCheckFlow(flow, currentApiName))
        );
        batchResults.forEach(r => { if (r) allMatches.push(r); });
        processed += batch.length;
        const pct = 5 + Math.round((processed / total) * 50);
        _showProgress(`Scanning flows… (${processed} / ${total})`, pct);
      }
    } catch (e) {
      console.warn('[SFUT WITU] Flow scan failed:', e);
    }

    // ── Phase 2: Quick Actions ─────────────────────────────────────────────
    _showProgress('Scanning quick actions…', 57);

    try {
      // Step 1: fetch stubs only — Metadata can't be fetched for multiple rows
      const listResult = await SalesforceAPI.toolingQuery(
        `SELECT Id, Label, SobjectType FROM QuickActionDefinition WHERE Type = 'Flow'`
      );
      const quickActions = listResult.records || [];

      // Step 2: fetch Metadata one at a time
      await Promise.all(quickActions.map(async qa => {
        try {
          const detail = await SalesforceAPI.toolingQuery(
            `SELECT Id, Metadata FROM QuickActionDefinition WHERE Id = '${qa.Id}'`
          );
          const metadata = detail.records?.[0]?.Metadata;
          if (!metadata) return;

          const flowName = metadata.flowDefinition || metadata.flowName;
          if (!flowName) return;

          // Strip namespace prefix for comparison
          const bare = flowName.replace(/^[a-zA-Z0-9]+__/, '');
          if (bare !== currentApiName && flowName !== currentApiName) return;

          allMatches.push({
            sourceType:  'quick-action',
            id:          qa.Id,
            label:       qa.Label || qa.Id,
            objectType:  qa.SobjectType || 'Global',
            references:  ['Quick Action']
          });
        } catch (e) {
          console.warn(`[SFUT WITU] Could not fetch QuickAction metadata for ${qa.Id}:`, e);
        }
      }));
    } catch (e) {
      console.warn('[SFUT WITU] Quick action scan failed:', e);
    }

    // ── Phase 3: Lightning Pages ───────────────────────────────────────────
    _showProgress('Scanning Lightning pages… (this may take a moment)', 62);

    // lwcPageMap: developerName (lowercase) → array of page labels that contain it.
    // Built here during the FlexiPage walk so Phase 4 can enrich LWC matches
    // without any additional API calls.
    const lwcPageMap = new Map();

    try {
      // Step 1: fetch all FlexiPage stubs (no Metadata — can't batch Metadata)
      const listResult = await SalesforceAPI.toolingQuery(
        `SELECT Id, MasterLabel, Type, EntityDefinitionId FROM FlexiPage`
      );
      const pages = listResult.records || [];
      const total = pages.length;
      let processed = 0;

      // Step 2: fetch Metadata one at a time (Tooling API limitation)
      for (let i = 0; i < pages.length; i += BATCH_SIZE) {
        const batch = pages.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async page => {
          try {
            const detail = await SalesforceAPI.toolingQuery(
              `SELECT Id, Metadata FROM FlexiPage WHERE Id = '${page.Id}'`
            );
            const metadata = detail.records?.[0]?.Metadata;
            if (!metadata) return;

            if (_flexiPageReferencesFlow(metadata, currentApiName)) {
              allMatches.push({
                sourceType:         'lightning-page',
                id:                 page.Id,
                label:              page.MasterLabel,
                pageType:           page.Type,
                entityDefinitionId: page.EntityDefinitionId,
                references:         ['Lightning Page']
              });
            }

            // Collect every LWC component name used on this page so Phase 4
            // can map bundle → pages without extra API calls.
            const lwcNames = _extractLwcNamesFromFlexiPage(metadata);
            for (const name of lwcNames) {
              const key = name.toLowerCase();
              if (!lwcPageMap.has(key)) lwcPageMap.set(key, []);
              lwcPageMap.get(key).push(page.MasterLabel);
            }
          } catch (e) {
            console.warn(`[SFUT WITU] Could not fetch FlexiPage metadata for ${page.Id}:`, e);
          }
        }));

        processed += batch.length;
        const pct = 62 + Math.round((processed / total) * 28);
        _showProgress(`Scanning Lightning pages… (${processed} / ${total})`, pct);
      }
    } catch (e) {
      console.warn('[SFUT WITU] Lightning page scan failed:', e);
    }


    // ── Phase 4: LWC Components ───────────────────────────────────────────
    _showProgress('Scanning LWC components…', 90);

    try {
      const bundleResult = await SalesforceAPI.toolingQuery(
        `SELECT Id, MasterLabel, DeveloperName FROM LightningComponentBundle`
      );
      const bundles = bundleResult.records || [];
      const lwcTotal = bundles.length;
      let lwcProcessed = 0;

      for (let i = 0; i < bundles.length; i += BATCH_SIZE) {
        const batch = bundles.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async bundle => {
          try {
            const resourceResult = await SalesforceAPI.toolingQuery(
              `SELECT Id, Source FROM LightningComponentResource ` +
              `WHERE LightningComponentBundleId = '${bundle.Id}' AND Format = 'html'`
            );
            const htmlResource = resourceResult.records?.[0];
            if (!htmlResource?.Source) return;

            if (_lwcReferencesFlow(htmlResource.Source, currentApiName)) {
              // Enrich with Lightning page locations collected during Phase 3.
              // Match on developerName (case-insensitive) — that is what
              // FlexiPage metadata stores as the component reference name.
              const devNameKey = (bundle.DeveloperName || '').toLowerCase();
              const pages = lwcPageMap.get(devNameKey) || [];

              allMatches.push({
                sourceType:    'lwc',
                id:            bundle.Id,
                label:         bundle.MasterLabel || bundle.DeveloperName,
                developerName: bundle.DeveloperName,
                pages:         pages,
                references:    ['LWC Component']
              });
            }
          } catch (e) {
            console.warn(`[SFUT WITU] Could not fetch LWC resources for ${bundle.Id}:`, e);
          }
        }));

        lwcProcessed += batch.length;
        const pct = 90 + Math.round((lwcProcessed / lwcTotal) * 9);
        _showProgress(`Scanning LWC components… (${lwcProcessed} / ${lwcTotal})`, pct);
      }
    } catch (e) {
      console.warn('[SFUT WITU] LWC scan failed:', e);
    }

    // ── Phase 5: Buttons & Links (WebLink) ───────────────────────────────────
    _showProgress('Scanning buttons and links…', 97);

    try {
      const wlResult = await SalesforceAPI.toolingQuery(
        `SELECT Id, Name, MasterLabel, EntityDefinitionId, DisplayType, Url
         FROM WebLink`
      );
      const webLinks = wlResult.records || [];

      for (const wl of webLinks) {
        const refType = _webLinkReferencesFlow(wl, currentApiName);
        if (!refType) continue;

        allMatches.push({
          sourceType:        'weblink',
          id:                wl.Id,
          label:             wl.MasterLabel || wl.Name,
          entityDefinitionId: wl.EntityDefinitionId || 'Global',
          references:        [refType]
        });
      }
    } catch (e) {
      console.warn('[SFUT WITU] WebLink scan failed:', e);
    }

    _showProgress('Done.', 100);
    _renderResults(allMatches, currentApiName);

    // Store matches for CSV export and reveal the Download CSV button
    _lastMatches = allMatches;
    _lastApiName = currentApiName;
    _lastLabel   = currentLabel;
    const csvBtn = document.getElementById('sfut-witu-csv-btn');
    if (csvBtn && allMatches.length > 0) csvBtn.style.display = 'inline-flex';
  }

  // ─── Fetch one flow's Metadata and check for references ───────────────────

  async function _fetchAndCheckFlow(flow, targetApiName) {
    try {
      const result = await SalesforceAPI.toolingQuery(
        `SELECT Id, MasterLabel, Metadata FROM Flow WHERE Id = '${flow.Id}'`
      );
      const record   = result.records?.[0];
      const metadata = record?.Metadata;
      if (!metadata) return null;

      const refs = _findFlowReferences(metadata, targetApiName);
      if (refs.length === 0) return null;

      return {
        sourceType:  'flow',
        id:          flow.Id,
        label:       flow.MasterLabel,
        processType: flow.ProcessType,
        references:  refs
      };
    } catch (e) {
      console.warn(`[SFUT WITU] Could not fetch metadata for flow ${flow.Id}:`, e);
      return null;
    }
  }

  // ─── Reference detection: flows ───────────────────────────────────────────

  function _findFlowReferences(metadata, targetApiName) {
    const found = new Set();

    // 1. Subflow elements
    const subflows = metadata.subflows || [];
    for (const sf of subflows) {
      if (sf.flowName === targetApiName) {
        found.add('Subflow');
        break;
      }
    }

    // 2. Screen-level actions (Screen Actions and Action Buttons)
    const screens = metadata.screens || [];
    for (const screen of screens) {
      const actions  = screen.actions  || [];
      const triggers = screen.triggers || [];

      for (const action of actions) {
        if (action.actionType !== 'flow') continue;
        if (action.actionName !== targetApiName) continue;

        const isActionButton = triggers.some(t =>
          t.eventName === 'flow__screenfieldclick' &&
          (t.handlers || []).some(h => h.screenActionName === action.name)
        );

        found.add(isActionButton ? 'Action Button' : 'Screen Action');
      }
    }

    // 3. Flow Action elements (invocable actions calling another flow)
    const actionCalls = metadata.actionCalls || [];
    for (const call of actionCalls) {
      if (call.actionType !== 'flow') continue;
      if (call.actionName === targetApiName) {
        found.add('Flow Action');
        break;
      }
    }

    return [...found];
  }

  // ─── Reference detection: FlexiPage ───────────────────────────────────────

  function _flexiPageReferencesFlow(metadata, targetApiName) {
    if (!metadata) return false;

    // Walk regions → components recursively
    const regions = metadata.flexiPageRegions || metadata.regions || [];
    if (_searchComponentsForFlow(regions, targetApiName)) return true;

    // Nuclear fallback: deep search the entire metadata object
    return _flexiPageDeepSearch(metadata, targetApiName);
  }

  function _searchComponentsForFlow(regions, targetApiName) {
    for (const region of regions) {
      // FlexiPage metadata uses "itemInstances" — fall back to "components"
      // for any older or alternate structures.
      const items = region.itemInstances || region.components || [];
      for (const item of items) {
        const component = item.componentInstance ? item : item;
        if (_componentReferencesFlow(item, targetApiName)) return true;
        // Recurse into nested regions
        const nested = item.componentInstance?.regions || item.regions || [];
        if (_searchComponentsForFlow(nested, targetApiName)) return true;
      }
    }
    return false;
  }

  function _componentReferencesFlow(component, targetApiName) {
    // Check componentInstanceProperties for known flow property names
    const props = component.componentInstanceProperties || [];
    for (const prop of props) {
      if (prop.value === targetApiName) return true;
    }

    // Check componentInstance.componentInstanceProperties (alternate structure)
    const innerProps = component.componentInstance?.componentInstanceProperties || [];
    for (const prop of innerProps) {
      if (prop.value === targetApiName) return true;
    }

    // Full-text search — catches any property name or nesting Salesforce may use
    try {
      const raw = JSON.stringify(component);
      if (raw.includes('"' + targetApiName + '"')) return true;
    } catch (e) { /* ignore */ }

    return false;
  }

  function _flexiPageDeepSearch(obj, targetApiName) {
    // Recursively search any object/array structure for the API name as a value
    if (!obj || typeof obj !== 'object') return false;
    if (Array.isArray(obj)) {
      return obj.some(item => _flexiPageDeepSearch(item, targetApiName));
    }
    for (const [key, val] of Object.entries(obj)) {
      if (val === targetApiName) return true;
      if (typeof val === 'object' && val !== null) {
        if (_flexiPageDeepSearch(val, targetApiName)) return true;
      }
    }
    return false;
  }


  // ─── LWC name extraction from FlexiPage ──────────────────────────────────

  function _extractLwcNamesFromFlexiPage(metadata) {
    // Returns a Set of LWC developer names (without namespace) referenced
    // anywhere in the page's component tree.
    //
    // FlexiPage structure (confirmed from Tooling API):
    //   flexiPageRegions[]
    //     .itemInstances[]            <-- NOT .components[]
    //       .componentInstance
    //         .componentName          e.g. "c:lwcGeneratePDFFlowWrapper"
    //
    // Component name formats observed:
    //   "c:localName"                 (colon-separated, default org namespace)
    //   "ns__localName"               (double-underscore, managed namespace)
    //   "force:highlightsPanel"       (standard Salesforce components)
    const names = new Set();
    const regions = metadata.flexiPageRegions || metadata.regions || [];
    _collectLwcNames(regions, names);
    return names;
  }

  function _collectLwcNames(regions, names) {
    for (const region of regions) {
      // FlexiPage metadata uses "itemInstances", not "components"
      const items = region.itemInstances || region.components || [];
      for (const item of items) {
        const componentName = item.componentInstance?.componentName || '';
        if (componentName) {
          let local = componentName;
          if (componentName.includes(':'))       local = componentName.split(':').pop();
          else if (componentName.includes('__')) local = componentName.split('__').pop();
          if (local) names.add(local.toLowerCase());
        }

        // Recurse into nested regions if present
        const nestedRegions = item.componentInstance?.regions || [];
        if (nestedRegions.length) _collectLwcNames(nestedRegions, names);
      }
    }
  }

  // ─── Reference detection: LWC components ──────────────────────────────────

  function _lwcReferencesFlow(htmlSource, targetApiName) {
    if (!htmlSource) return false;
    // Matches: flow-api-name="sfGeneratePDFDocument" (with optional whitespace around =)
    // Note: dynamic bindings (flow-api-name={prop}) cannot be detected statically.
    const pattern = new RegExp(
      `flow-api-name\\s*=\\s*["']${targetApiName}["']`, 'i'
    );
    return pattern.test(htmlSource);
  }

  // ─── Reference detection: WebLink buttons and links ─────────────────────────

  function _webLinkReferencesFlow(webLink, targetApiName) {
    // Returns the reference type label if this WebLink references the flow,
    // or null if it does not.
    //
    // Both URL-type and JavaScript-type buttons store their content in the
    // Url field in the Tooling API — there is no separate Markup field.
    //
    // Word-boundary check prevents "sfGeneratePDF" matching "sfGeneratePDFDocument".
    // We look for the name preceded and followed by non-alphanumeric / non-underscore chars.
    const pattern = new RegExp(`(?<![A-Za-z0-9_])${_escapeRegex(targetApiName)}(?![A-Za-z0-9_])`);

    const url = webLink.Url || '';
    if (!pattern.test(url)) return null;

    // Determine badge label from DisplayType (confirmed values from Tooling API):
    //   'B' = detail page button
    //   'M' = list view button (not 'L' as Metadata API docs suggest)
    const dt = (webLink.DisplayType || '').toUpperCase();
    if (dt === 'M') return 'List Button';
    if (dt === 'B') return 'Detail Button';
    return 'Button / Link';
  }

  function _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ─── Modal ────────────────────────────────────────────────────────────────

  function _showModal() {
    _removeModal();

    const backdrop = document.createElement('div');
    backdrop.className = CLASS_NAMES.modalBackdrop;
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) _removeModal();
    });

    const modal = document.createElement('div');
    modal.className = CLASS_NAMES.modal;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'sfut-witu-title');

    // Header
    const header = document.createElement('div');
    header.className = CLASS_NAMES.modalHeader;

    const title = document.createElement('h2');
    title.id        = 'sfut-witu-title';
    title.className = CLASS_NAMES.modalTitle;
    title.textContent = 'Where Is This Used?';

    const closeBtn = document.createElement('button');
    closeBtn.className   = CLASS_NAMES.modalClose;
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.type = 'button';

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Body
    const body = document.createElement('div');
    body.className = CLASS_NAMES.modalBody;
    body.id        = 'sfut-witu-body';

    // Footer
    const footer = document.createElement('div');
    footer.className = CLASS_NAMES.modalFooter;

    const csvFooterBtn = document.createElement('button');
    csvFooterBtn.className   = CLASS_NAMES.csvButton;
    csvFooterBtn.textContent = 'Download CSV';
    csvFooterBtn.type        = 'button';
    csvFooterBtn.style.display = 'none'; // hidden until results are ready
    csvFooterBtn.id = 'sfut-witu-csv-btn';

    const closeFooterBtn = document.createElement('button');
    closeFooterBtn.className   = CLASS_NAMES.closeButton;
    closeFooterBtn.textContent = 'Close';
    closeFooterBtn.type        = 'button';

    footer.appendChild(csvFooterBtn);
    footer.appendChild(closeFooterBtn);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    closeBtn.addEventListener('click', _removeModal);
    closeFooterBtn.addEventListener('click', _removeModal);
    csvFooterBtn.addEventListener('click', () => _exportCsv());

    document.addEventListener('keydown', _onEscapeKey);
  }

  function _onEscapeKey(e) {
    if (e.key === 'Escape') _removeModal();
  }

  function _removeModal() {
    const backdrop = document.querySelector(`.${CLASS_NAMES.modalBackdrop}`);
    if (backdrop) backdrop.remove();
    document.removeEventListener('keydown', _onEscapeKey);
  }

  function _getBody() {
    return document.getElementById('sfut-witu-body');
  }

  // ─── Progress indicator ───────────────────────────────────────────────────

  function _showProgress(message, pct) {
    const body = _getBody();
    if (!body) return;

    let wrap = body.querySelector(`.${CLASS_NAMES.progressWrap}`);
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = CLASS_NAMES.progressWrap;

      const text = document.createElement('p');
      text.className = CLASS_NAMES.progressText;
      wrap.appendChild(text);

      const barOuter = document.createElement('div');
      barOuter.className = CLASS_NAMES.progressBar;

      const fill = document.createElement('div');
      fill.className = CLASS_NAMES.progressFill;
      barOuter.appendChild(fill);
      wrap.appendChild(barOuter);

      body.innerHTML = '';
      body.appendChild(wrap);
    }

    wrap.querySelector(`.${CLASS_NAMES.progressText}`).textContent = message;
    wrap.querySelector(`.${CLASS_NAMES.progressFill}`).style.width  = `${pct}%`;
  }

  // ─── Results rendering ────────────────────────────────────────────────────

  function _renderResults(matches, currentApiName) {
    const body = _getBody();
    if (!body) return;

    body.innerHTML = '';

    if (matches.length === 0) {
      const empty = document.createElement('p');
      empty.className   = CLASS_NAMES.emptyState;
      empty.textContent = 'This flow is not referenced anywhere.';
      body.appendChild(empty);
      return;
    }

    const intro = document.createElement('p');
    intro.className   = 'sfut-witu-intro';
    intro.textContent = `Found ${matches.length} reference${matches.length === 1 ? '' : 's'} to this flow.`;
    body.appendChild(intro);

    const table = document.createElement('table');
    table.className = CLASS_NAMES.resultsTable;

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Name</th>
        <th>Type</th>
        <th>Referenced As</th>
        <th>Location</th>
      </tr>`;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    for (const match of matches) {
      for (const refType of match.references) {
        const tr = document.createElement('tr');

        // Name — linked where possible
        const tdLabel = document.createElement('td');
        const link    = document.createElement('a');
        link.textContent = match.label;
        link.target      = '_blank';
        link.rel         = 'noopener noreferrer';
        link.href        = _buildUrl(match);
        tdLabel.appendChild(link);

        // Type column
        const tdType = document.createElement('td');
        tdType.textContent = _formatType(match);

        // Reference badge
        const tdRef  = document.createElement('td');
        const badge  = document.createElement('span');
        badge.className   = `${CLASS_NAMES.badge} ${_badgeClass(refType)}`;
        badge.textContent = refType;
        tdRef.appendChild(badge);

        // Location column
        const tdLoc = document.createElement('td');
        _renderLocation(tdLoc, match);

        tr.appendChild(tdLabel);
        tr.appendChild(tdType);
        tr.appendChild(tdRef);
        tr.appendChild(tdLoc);
        tbody.appendChild(tr);
      }
    }

    table.appendChild(tbody);
    body.appendChild(table);
  }

  function _showError(message) {
    const body = _getBody();
    if (!body) return;
    body.innerHTML = '';
    const err = document.createElement('p');
    err.className   = CLASS_NAMES.errorState;
    err.textContent = message;
    body.appendChild(err);
  }

  // ─── Location cell renderer ─────────────────────────────────────────────────

  // Threshold above which a "show more" toggle is rendered instead of the
  // full comma-separated list.
  const LOCATION_SHOW_LIMIT = 2;

  function _renderLocation(td, match) {
    const text = _formatLocation(match);

    // For LWC matches with multiple pages, render a collapsible list.
    if (match.sourceType === 'lwc' && match.pages && match.pages.length > LOCATION_SHOW_LIMIT) {
      const pages   = match.pages;
      const visible = pages.slice(0, LOCATION_SHOW_LIMIT);
      const hidden  = pages.slice(LOCATION_SHOW_LIMIT);

      const wrap = document.createElement('span');
      wrap.className = CLASS_NAMES.locationPages;

      // Always-visible portion
      const visibleSpan = document.createElement('span');
      visibleSpan.textContent = visible.join(', ') + ', ';
      wrap.appendChild(visibleSpan);

      // Hidden overflow portion
      const hiddenSpan = document.createElement('span');
      hiddenSpan.textContent = hidden.join(', ');
      hiddenSpan.style.display = 'none';
      wrap.appendChild(hiddenSpan);

      // Toggle link
      const toggle = document.createElement('a');
      toggle.href      = 'javascript:void(0)';
      toggle.className = CLASS_NAMES.locationToggle;
      toggle.textContent = `+${hidden.length} more`;
      toggle.addEventListener('click', () => {
        const expanded = hiddenSpan.style.display !== 'none';
        hiddenSpan.style.display = expanded ? 'none' : 'inline';
        // Patch the visible prefix to remove trailing comma when expanded
        visibleSpan.textContent = expanded
          ? visible.join(', ') + ', '
          : visible.join(', ') + ', ';
        toggle.textContent = expanded ? `+${hidden.length} more` : 'show less';
      });
      wrap.appendChild(toggle);

      td.appendChild(wrap);
    } else {
      td.textContent = text;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function _buildUrl(match) {
    const base = window.location.origin;
    if (match.sourceType === 'flow') {
      return `${base}/lightning/setup/Flows/page?address=%2F${match.id}`;
    }
    if (match.sourceType === 'quick-action') {
      return `${base}/lightning/setup/GlobalActions/home`;
    }
    if (match.sourceType === 'lightning-page') {
      return `${base}/lightning/setup/FlexiPageList/home`;
    }
    if (match.sourceType === 'lwc') {
      return `${base}/lightning/setup/LightningComponentBundles/home`;
    }
    if (match.sourceType === 'weblink') {
      const obj = match.entityDefinitionId && match.entityDefinitionId !== 'Global'
        ? match.entityDefinitionId : null;
      return obj
        ? `${base}/lightning/setup/ObjectManager/${obj}/ButtonsLinksActions/home`
        : `${base}/lightning/setup/GlobalActions/home`;
    }
    return '#';
  }

  function _formatType(match) {
    if (match.sourceType === 'flow')          return _formatProcessType(match.processType);
    if (match.sourceType === 'quick-action')  return 'Quick Action';
    if (match.sourceType === 'lightning-page') return _formatPageType(match.pageType);
    if (match.sourceType === 'lwc')          return 'LWC Component';
    if (match.sourceType === 'weblink')      return 'Button / Link';
    return '';
  }

  function _formatLocation(match) {
    if (match.sourceType === 'quick-action') {
      return match.objectType && match.objectType !== 'Global'
        ? match.objectType
        : 'Global';
    }
    if (match.sourceType === 'lightning-page') {
      return match.entityDefinitionId || '—';
    }
    if (match.sourceType === 'lwc') {
      return match.pages && match.pages.length > 0
        ? match.pages.join(', ')
        : '—';
    }
    if (match.sourceType === 'weblink') {
      return match.entityDefinitionId && match.entityDefinitionId !== 'Global'
        ? match.entityDefinitionId
        : 'Global';
    }
    return '—';
  }

  function _formatProcessType(processType) {
    const map = {
      'Flow':               'Screen Flow',
      'AutoLaunchedFlow':   'Autolaunched Flow',
      'Workflow':           'Workflow',
      'InvocableProcess':   'Invocable Process',
      'CustomEvent':        'Platform Event',
      'ManagedContentFlow': 'CMS Flow',
      'CheckoutFlow':       'Checkout Flow',
      'Survey':             'Survey',
      'ApprovalWorkflow':   'Approval',
      'OrchestrationFlow':  'Orchestration',
      'RoutingFlow':        'Routing Flow'
    };
    return map[processType] || processType;
  }

  function _formatPageType(pageType) {
    const map = {
      'AppPage':            'App Page',
      'RecordPage':         'Record Page',
      'HomePage':           'Home Page',
      'UtilityBar':         'Utility Bar',
      'Overlay':            'Overlay',
      'RecordPreviewPage':  'Record Preview',
      'CommAppPage':        'Experience App Page',
      'CommRecordPage':     'Experience Record Page',
      'CommRelatedListPage':'Experience Related List'
    };
    return map[pageType] || pageType || 'Lightning Page';
  }

  function _badgeClass(refType) {
    const map = {
      'Subflow':       CLASS_NAMES.badgeSubflow,
      'Action Button': CLASS_NAMES.badgeButton,
      'Flow Action':   CLASS_NAMES.badgeFlowAction,
      'Quick Action':  CLASS_NAMES.badgeQuickAction,
      'Lightning Page':CLASS_NAMES.badgeLightning,
      'LWC Component': CLASS_NAMES.badgeLwc,
      'Detail Button': CLASS_NAMES.badgeWeblink,
      'List Button':   CLASS_NAMES.badgeWeblink,
      'Button / Link': CLASS_NAMES.badgeWeblink
    };
    return map[refType] || CLASS_NAMES.badgeAction; // Screen Action fallback
  }

  // ─── CSV export ──────────────────────────────────────────────────────────────

  function _exportCsv() {
    if (!_lastMatches.length) return;

    const headers = ['Name', 'Type', 'Referenced As', 'Location'];

    const rows = [];
    for (const match of _lastMatches) {
      for (const refType of match.references) {
        rows.push([
          match.label,
          _formatType(match),
          refType,
          _formatLocationPlain(match)
        ]);
      }
    }

    const escape = val => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const csv = [
      headers.map(escape).join(','),
      ...rows.map(row => row.map(escape).join(','))
    ].join('\r\n');

    const safeName = (_lastLabel || _lastApiName).replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    const filename  = `${safeName} - Where Is This Used ${_isoDate()}.csv`;

    // Content scripts run in an isolated world where Chrome ignores the
    // `download` attribute on blob URLs. To honour the filename we inject
    // a one-shot function into the MAIN world via the background service
    // worker — the same technique used by comparison-exporter.js.
    chrome.runtime.sendMessage(
      { action: 'downloadCsv', csv, filename },
      (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
          console.warn('[SFUT WITU] CSV download via background failed, falling back:',
            chrome.runtime.lastError?.message || response?.error);
          // Fallback: blob anchor in isolated world (browser may ignore filename)
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const url  = URL.createObjectURL(blob);
          const a    = document.createElement('a');
          a.href     = url;
          a.download = filename;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        }
      }
    );
  }

  function _formatLocationPlain(match) {
    // Plain-text version of location for CSV — no DOM, no toggle widget.
    if (match.sourceType === 'quick-action') {
      return match.objectType && match.objectType !== 'Global'
        ? match.objectType : 'Global';
    }
    if (match.sourceType === 'lightning-page') {
      return match.entityDefinitionId || '—';
    }
    if (match.sourceType === 'lwc') {
      return match.pages && match.pages.length > 0
        ? match.pages.join('; ')
        : '—';
    }
    if (match.sourceType === 'weblink') {
      return match.entityDefinitionId && match.entityDefinitionId !== 'Global'
        ? match.entityDefinitionId : 'Global';
    }
    return '—';
  }

  function _isoDate() {
    return new Date().toISOString().slice(0, 10);
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  function isEnabled() { return _enabled; }

  function onActivate() {}

  function refresh() {
    STATE.buttonInjected = false;
    _waitForButtonBar();
  }

  return {
    init,
    isEnabled,
    onActivate,
    refresh
  };

})();

SFFlowUtilityToolkit.registerFeature('where-is-this-used', WhereIsThisUsed);