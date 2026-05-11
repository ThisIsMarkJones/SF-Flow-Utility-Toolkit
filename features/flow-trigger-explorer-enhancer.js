/**
 * SF Flow Utility Toolkit - Flow Trigger Explorer Enhancer
 *
 * Beta feature for Salesforce Flow Trigger Explorer.
 *
 * Adds lightweight row enrichments:
 * - inline info icon tooltip trigger next to the Flow Label
 * - inline version/API metadata when not already visible in the row
 * - coloured trigger-context tags for the current explorer context only
 *
 * Tooltip content is intentionally compact:
 * - Last Modified By
 * - Trigger Order
 * - Process Type
 * - Trigger
 *
 * Notes for beta:
 * - DOM-first implementation, no API calls
 * - Learns richer metadata from the right-hand Flow Details panel when available
 * - Does NOT persist Created / Updated / Deleted across views, to avoid false tagging
 * - Safe to run repeatedly; rows are marked after enhancement
 */

const FlowTriggerExplorerEnhancer = (() => {
  const STORAGE_KEY = 'sfut.flowTriggerExplorerEnhancer.cache.v8';
  const ROW_MARKER = 'data-sfut-fte-enhanced';
  const TOOLTIP_ID = 'sfut-fte-tooltip';

  let _observer = null;
  let _refreshTimer = null;
  let _tooltipEl = null;
  let _hideTooltipTimer = null;
  let _cache = _loadCache();

  const SELECTORS = {
    root: 'interaction_explorer-explorer',
    row: 'interaction_explorer-flow-explorer-card-row',
    rowLink: 'lightning-formatted-url a[href*="flowBuilder.app?flowId="]',
    detailPanel: 'interaction_explorer-flow-details-panel, [class*="flow-details-panel"], [data-id*="details"]',
    detailOpenLink: '.test-open-flow[href*="flowBuilder.app?flowId="], .test-open-flow-version[href*="flowBuilder.app?flowId="], a[href*="flowBuilder.app?flowId="]',
    versionRows: 'interaction_explorer-details-panel-version-row, .version-row, [class*="version-row"]',
    versionApi: '.version-api, [class*="version-api"]'
  };

  const CONTEXT_LABELS = {
    created: 'Created',
    updated: 'Updated',
    deleted: 'Deleted'
  };

  async function init() {
    const context = ContextDetector.detectContext();
    if (context !== ContextDetector.CONTEXTS.FLOW_TRIGGER_EXPLORER) {
      return;
    }

    console.log('[SFUT FTE] Initialising...');
    await _waitForExplorer();
    _ensureTooltip();
    _learnFromDetailsPanel();
    _enhanceRows(true);
    _startObserving();
    console.log('[SFUT FTE] Active.');
  }

  function onActivate() {
    _learnFromDetailsPanel();
    _enhanceRows(true);
    _showToast('Flow Trigger Explorer enhancer refreshed.');
  }

  function refresh() {
    _learnFromDetailsPanel();
    _enhanceRows(true);
  }

  function _waitForExplorer() {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 40;

      const timer = setInterval(() => {
        attempts += 1;
        if (document.querySelector(SELECTORS.root) || attempts >= maxAttempts) {
          clearInterval(timer);
          resolve();
        }
      }, 500);
    });
  }

  function _startObserving() {
    if (_observer) {
      _observer.disconnect();
    }

    _observer = new MutationObserver((mutations) => {
      const hasRelevantMutation = mutations.some((mutation) => {
        if (mutation.type !== 'childList') return false;

        const nodes = [
          ...Array.from(mutation.addedNodes || []),
          ...Array.from(mutation.removedNodes || [])
        ];

        return nodes.some((node) => {
          if (!node || node.nodeType !== 1) return false;
          return (
            node.matches?.(SELECTORS.row) ||
            node.matches?.('interaction_explorer-flow-details-panel') ||
            node.querySelector?.(SELECTORS.row) ||
            node.querySelector?.('interaction_explorer-flow-details-panel') ||
            node.querySelector?.('.version-row')
          );
        });
      });

      if (!hasRelevantMutation) return;

      clearTimeout(_refreshTimer);
      _refreshTimer = setTimeout(() => {
        _learnFromDetailsPanel();
        _enhanceRows();
      }, 250);
    });

    _observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function _enhanceRows(force = false) {
    const rows = document.querySelectorAll(SELECTORS.row);
    if (!rows.length) return;

    const currentContext = _detectCurrentTriggerContext();

    rows.forEach((row) => {
      const link = row.querySelector(SELECTORS.rowLink);
      if (!link) return;

      const rowData = _extractRowData(row, currentContext);
      if (!rowData || !rowData.flowId || !rowData.label) return;

      _mergeIntoCache(rowData.flowId, rowData);

      if (force) {
        row.removeAttribute(ROW_MARKER);
      }

      _renderRowEnhancement(row, _cache[rowData.flowId] || rowData);
      row.setAttribute(ROW_MARKER, 'true');
    });

    _saveCache();
  }

  function _extractRowData(row, currentContext) {
    const link = row.querySelector(SELECTORS.rowLink);
    if (!link) return null;

    const href = link.getAttribute('href') || '';
    const flowId = _getQueryParam(href, 'flowId');
    const label = (link.textContent || '').trim();
    if (!flowId || !label) return null;

    const visibleVersion = _extractVisibleVersionFromRow(row);

    return {
      flowId,
      label,
      versionNumber: visibleVersion || _cache[flowId]?.versionNumber || null,
      rowAlreadyShowsVersion: !!visibleVersion,
      apiVersion: _cache[flowId]?.apiVersion || null,
      contexts: currentContext ? [currentContext] : [],
      tooltip: { ...(_cache[flowId]?.tooltip || {}) }
    };
  }

  function _renderRowEnhancement(row, flowData) {
    const link = row.querySelector(SELECTORS.rowLink);
    if (!link) return;

    const labelContainer = _ensureLabelContainer(link);
    if (!labelContainer) return;

    // If we have learned API/version data, suppress Salesforce's visible native version token
    // so we can render a clean ordered inline block ourselves.
    _suppressNativeVersionDisplay(row, flowData);

    _upsertInfoTrigger(labelContainer, flowData);
    _upsertInlineMeta(labelContainer, flowData);
    _upsertContextTags(labelContainer, flowData);
  }

  function _ensureLabelContainer(link) {
    const existing = link.closest('.sfut-fte-label-container');
    if (existing) return existing;

    const parent = link.parentElement;
    if (!parent) return null;

    const container = document.createElement('span');
    container.className = 'sfut-fte-label-container';

    link.insertAdjacentElement('beforebegin', container);
    container.appendChild(link);

    return container;
  }

  function _upsertInfoTrigger(labelContainer, flowData) {
    let trigger = labelContainer.querySelector('.sfut-fte-info-trigger');

    if (!trigger) {
      trigger = _buildInfoTrigger(flowData);
      labelContainer.appendChild(trigger);
      return;
    }

    trigger._sfutFlowData = flowData;
    trigger.setAttribute('aria-label', `Show flow summary for ${flowData.label}`);
  }

  function _upsertInlineMeta(labelContainer, flowData) {
    const fragments = [];

    // Always render our own ordered version/API block if we know either value.
    if (flowData.versionNumber) {
      fragments.push(`V${flowData.versionNumber}`);
    }

    if (flowData.apiVersion) {
      fragments.push(`API ${flowData.apiVersion}`);
    }

    let inlineMeta = labelContainer.querySelector('.sfut-fte-inline-meta');

    if (!fragments.length) {
      if (inlineMeta) inlineMeta.remove();
      return;
    }

    const text = ` • ${fragments.join(' • ')}`;

    if (!inlineMeta) {
      inlineMeta = document.createElement('span');
      inlineMeta.className = 'sfut-fte-inline-meta';
      inlineMeta.textContent = text;
      labelContainer.appendChild(inlineMeta);
      return;
    }

    if (inlineMeta.textContent !== text) {
      inlineMeta.textContent = text;
    }
  }

  function _upsertContextTags(labelContainer, flowData) {
    const orderedContexts = ['created', 'updated', 'deleted'].filter((ctx) =>
      Array.isArray(flowData.contexts) && flowData.contexts.includes(ctx)
    );

    let tagContainer = labelContainer.querySelector('.sfut-fte-context-tags');

    if (!orderedContexts.length) {
      if (tagContainer) tagContainer.remove();
      return;
    }

    if (!tagContainer) {
      tagContainer = document.createElement('span');
      tagContainer.className = 'sfut-fte-context-tags';
      labelContainer.appendChild(tagContainer);
    }

    const requiredSignature = orderedContexts.join('|');
    if (tagContainer.getAttribute('data-sfut-context-signature') === requiredSignature) {
      return;
    }

    tagContainer.setAttribute('data-sfut-context-signature', requiredSignature);
    tagContainer.innerHTML = '';

    const sep = document.createElement('span');
    sep.className = 'sfut-fte-inline-meta';
    sep.textContent = ' • ';
    tagContainer.appendChild(sep);

    orderedContexts.forEach((ctx) => {
      const tag = document.createElement('span');
      tag.className = `sfut-fte-tag sfut-fte-tag-${ctx}`;
      tag.textContent = CONTEXT_LABELS[ctx];
      tagContainer.appendChild(tag);
    });
  }

  function _buildInfoTrigger(flowData) {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'sfut-fte-info-trigger';
    trigger.setAttribute('aria-label', `Show flow summary for ${flowData.label}`);
    trigger.setAttribute('title', 'Flow information');
    trigger._sfutFlowData = flowData;

    trigger.innerHTML = `
      <span class="sfut-fte-info-icon" aria-hidden="true">
        <svg focusable="false" aria-hidden="true" viewBox="0 0 520 520" class="sfut-fte-info-icon-svg">
          <g>
            <path d="M260 20a240 240 0 100 480 240 240 0 100-480m0 121c17 0 30 13 30 30s-13 30-30 30-30-13-30-30 13-30 30-30m50 210c0 5-4 9-10 9h-80c-5 0-10-3-10-9v-20c0-5 4-11 10-11 5 0 10-3 10-9v-40c0-5-4-11-10-11-5 0-10-3-10-9v-20c0-5 4-11 10-11h60c5 0 10 5 10 11v80c0 5 4 9 10 9 5 0 10 5 10 11z"></path>
          </g>
        </svg>
      </span>
    `;

    const show = () => _showTooltip(trigger, trigger._sfutFlowData || flowData);
    const hide = () => _scheduleHideTooltip();

    trigger.addEventListener('mouseenter', show);
    trigger.addEventListener('focus', show);
    trigger.addEventListener('mouseleave', hide);
    trigger.addEventListener('blur', hide);

    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      show();
    });

    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        _hideTooltip();
      }
    });

    return trigger;
  }

  function _showTooltip(anchor, flowData) {
    _ensureTooltip();
    _cancelHideTooltip();

    const tooltip = _tooltipEl;
    tooltip.innerHTML = '';

    const items = [
      ['Last Modified By', flowData.tooltip?.lastModifiedBy],
      ['Trigger Order', flowData.tooltip?.triggerOrder],
      ['Process Type', flowData.tooltip?.processType],
      ['Trigger', flowData.tooltip?.trigger]
    ].filter(([, value]) => !!value);

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'sfut-fte-tooltip-empty';
      empty.textContent = 'Metadata not available in the current explorer DOM.';
      tooltip.appendChild(empty);
    } else {
      items.forEach(([label, value]) => {
        const row = document.createElement('div');
        row.className = 'sfut-fte-tooltip-row';

        const labelEl = document.createElement('div');
        labelEl.className = 'sfut-fte-tooltip-label';
        labelEl.textContent = label;

        const valueEl = document.createElement('div');
        valueEl.className = 'sfut-fte-tooltip-value';
        valueEl.textContent = value;

        row.appendChild(labelEl);
        row.appendChild(valueEl);
        tooltip.appendChild(row);
      });
    }

    tooltip.classList.add('sfut-fte-tooltip-visible');

    const rect = anchor.getBoundingClientRect();

    tooltip.style.top = '0px';
    tooltip.style.left = '0px';

    const tooltipRect = tooltip.getBoundingClientRect();

    let top = window.scrollY + rect.bottom + 8;
    let left = window.scrollX + rect.left - 4;

    const maxLeft = window.scrollX + window.innerWidth - tooltipRect.width - 12;
    const minLeft = window.scrollX + 12;
    left = Math.max(minLeft, Math.min(left, maxLeft));

    const maxTop = window.scrollY + window.innerHeight - tooltipRect.height - 12;
    if (top > maxTop) {
      top = window.scrollY + rect.top - tooltipRect.height - 8;
    }

    tooltip.style.top = `${Math.max(window.scrollY + 12, top)}px`;
    tooltip.style.left = `${left}px`;
  }

  function _ensureTooltip() {
    if (_tooltipEl) return;

    const tooltip = document.createElement('div');
    tooltip.id = TOOLTIP_ID;
    tooltip.className = 'sfut-fte-tooltip';

    tooltip.addEventListener('mouseenter', _cancelHideTooltip);
    tooltip.addEventListener('mouseleave', _scheduleHideTooltip);

    document.body.appendChild(tooltip);
    _tooltipEl = tooltip;
  }

  function _scheduleHideTooltip() {
    _cancelHideTooltip();
    _hideTooltipTimer = setTimeout(() => _hideTooltip(), 140);
  }

  function _cancelHideTooltip() {
    if (_hideTooltipTimer) {
      clearTimeout(_hideTooltipTimer);
      _hideTooltipTimer = null;
    }
  }

  function _hideTooltip() {
    if (_tooltipEl) {
      _tooltipEl.classList.remove('sfut-fte-tooltip-visible');
    }
  }

  function _learnFromDetailsPanel() {
    const panel = _findBestDetailsPanel();
    if (!panel) return;

    const flowId = _extractFlowIdFromPanel(panel);
    if (!flowId) return;

    const versionNumber =
      _extractVersionNumber(_readFieldByLabel(panel, 'Version Number')) ||
      _extractActiveVersionNumber(panel) ||
      _cache[flowId]?.versionNumber ||
      null;

    const lastModifiedBy =
      _readFieldByLabel(panel, 'Last Modified By') ||
      _cache[flowId]?.tooltip?.lastModifiedBy ||
      null;

    const triggerOrder =
      _readFieldByLabel(panel, 'Trigger Order') ||
      _cache[flowId]?.tooltip?.triggerOrder ||
      null;

    const processType =
      _readFieldByLabel(panel, 'Process Type') ||
      _cache[flowId]?.tooltip?.processType ||
      null;

    const trigger =
      _readFieldByLabel(panel, 'Trigger') ||
      _cache[flowId]?.tooltip?.trigger ||
      null;

    const apiVersion =
      _extractActiveApiVersion(panel) ||
      _cache[flowId]?.apiVersion ||
      null;

    const existing = _cache[flowId] || { tooltip: {} };

    _cache[flowId] = {
      ...existing,
      flowId,
      label: existing.label || _findRowLabelByFlowId(flowId) || null,
      versionNumber,
      apiVersion,
      tooltip: {
        lastModifiedBy,
        triggerOrder,
        processType,
        trigger
      }
    };

    _saveCache();
    _rerenderRowByFlowId(flowId);
  }

  function _findBestDetailsPanel() {
    const panels = Array.from(document.querySelectorAll(SELECTORS.detailPanel));
    if (!panels.length) return null;

    const scored = panels
      .map((panel) => {
        const text = _normaliseText(panel.textContent || '');
        let score = 0;
        if (/Flow Details/i.test(text)) score += 3;
        if (/Version Number/i.test(text)) score += 2;
        if (/Last Modified By/i.test(text)) score += 2;
        if (/Process Type/i.test(text)) score += 2;
        if (/Trigger/i.test(text)) score += 1;
        if (/API\s+\d+(?:\.\d+)?/i.test(text)) score += 3;
        if (panel.querySelector('.version-row')) score += 3;
        if (panel.querySelector('.version-api')) score += 3;
        return { panel, score };
      })
      .sort((a, b) => b.score - a.score);

    return scored[0]?.score > 0 ? scored[0].panel : null;
  }

  function _extractFlowIdFromPanel(panel) {
    const links = panel.querySelectorAll(SELECTORS.detailOpenLink);
    for (const link of links) {
      const flowId = _getQueryParam(link.getAttribute('href') || '', 'flowId');
      if (flowId) return flowId;
    }
    return null;
  }

  function _readFieldByLabel(root, labelText) {
    const all = Array.from(root.querySelectorAll('*'));

    for (const el of all) {
      const text = _normaliseText(el.textContent || '');
      if (!text || text !== labelText) continue;

      const sibling = _firstMeaningfulSiblingText(el);
      if (sibling) return sibling;

      const parentValue = _valueFromParentAfterLabel(el, labelText);
      if (parentValue) return parentValue;

      const nextBlockValue = _valueFromNearbyBlocks(el, labelText);
      if (nextBlockValue) return nextBlockValue;
    }

    const wholeText = _normaliseText(root.textContent || '');
    const escaped = labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`${escaped}\\s+(.*?)\\s+(?:Version Number|Status|Last Modified By|Trigger Order|Process Type|Trigger|Versions|$)`, 'i');
    const match = wholeText.match(regex);
    return match ? _normaliseText(match[1]) : null;
  }

  function _firstMeaningfulSiblingText(el) {
    let sibling = el.nextElementSibling;
    while (sibling) {
      const text = _normaliseText(sibling.textContent || '');
      if (text) return text;
      sibling = sibling.nextElementSibling;
    }
    return null;
  }

  function _valueFromParentAfterLabel(el, labelText) {
    const parent = el.parentElement;
    if (!parent) return null;

    const children = Array.from(parent.children);
    const index = children.indexOf(el);
    if (index === -1) return null;

    const laterText = children
      .slice(index + 1)
      .map((child) => _normaliseText(child.textContent || ''))
      .filter(Boolean)
      .join(' ');

    if (laterText) return laterText;

    const parentText = _normaliseText(parent.textContent || '');
    if (parentText && parentText !== labelText && parentText.startsWith(labelText)) {
      return _normaliseText(parentText.slice(labelText.length));
    }

    return null;
  }

  function _valueFromNearbyBlocks(el, labelText) {
    const blocks = Array.from(el.parentElement?.children || []);
    const index = blocks.indexOf(el);
    if (index === -1) return null;

    for (let i = index + 1; i < Math.min(blocks.length, index + 4); i += 1) {
      const text = _normaliseText(blocks[i].textContent || '');
      if (text && text !== labelText) return text;
    }

    return null;
  }

  function _extractVersionNumber(value) {
    if (!value) return null;
    const match = String(value).match(/(\d+)/);
    return match ? match[1] : null;
  }

  function _extractVisibleVersionFromRow(row) {
    if (!row) return null;

    const rowText = _normaliseText(row.textContent || '');
    const match = rowText.match(/\bV(\d+)\b/i);
    return match ? match[1] : null;
  }

  function _extractActiveVersionNumber(panel) {
    if (!panel) return null;

    const versionRows = Array.from(panel.querySelectorAll(SELECTORS.versionRows));

    for (const row of versionRows) {
      const statusBadge = row.querySelector('.status .slds-badge, .slds-badge');
      const statusText = _normaliseText(statusBadge?.textContent || '');
      if (!/^active$/i.test(statusText)) continue;

      const apiContainer = row.querySelector(SELECTORS.versionApi);
      const apiText = _normaliseText(apiContainer?.textContent || '');
      const versionMatch = apiText.match(/\bV(\d+)\b/i);
      if (versionMatch) return versionMatch[1];

      const rowText = _normaliseText(row.textContent || '');
      const fallbackMatch = rowText.match(/\bV(\d+)\b/i);
      if (fallbackMatch) return fallbackMatch[1];
    }

    return null;
  }

  function _extractActiveApiVersion(panel) {
    if (!panel) return null;

    const versionRows = Array.from(panel.querySelectorAll(SELECTORS.versionRows));

    for (const row of versionRows) {
      const statusBadge = row.querySelector('.status .slds-badge, .slds-badge');
      const statusText = _normaliseText(statusBadge?.textContent || '');
      if (!/^active$/i.test(statusText)) continue;

      const apiContainer = row.querySelector(SELECTORS.versionApi);
      const apiText = _normaliseText(apiContainer?.textContent || '');
      const apiMatch = apiText.match(/API\s+(\d+(?:\.\d+)?)/i);
      if (apiMatch) return apiMatch[1];

      const rowText = _normaliseText(row.textContent || '');
      const fallbackMatch = rowText.match(/API\s+(\d+(?:\.\d+)?)/i);
      if (fallbackMatch) return fallbackMatch[1];
    }

    const panelText = _normaliseText(panel.textContent || '');
    const panelFallback = panelText.match(/V\d+\s*•\s*API\s+(\d+(?:\.\d+)?)\s+Active/i);
    if (panelFallback) return panelFallback[1];

    return null;
  }

  function _suppressNativeVersionDisplay(row, flowData) {
    if (!row || !flowData || !flowData.versionNumber) return;

    const link = row.querySelector(SELECTORS.rowLink);
    if (!link) return;

    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    const textNodes = [];

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = _normaliseText(node.nodeValue || '');
      if (!text) continue;
      if (text === `V${flowData.versionNumber}` || text === `·V${flowData.versionNumber}` || text === `•V${flowData.versionNumber}`) {
        textNodes.push(node);
      }
    }

    textNodes.forEach((node) => {
      const parentEl = node.parentElement;
      if (!parentEl) return;
      if (link.contains(parentEl)) return;
      if (parentEl.closest('.sfut-fte-label-container')) return;

      const existingMarker = parentEl.querySelector('.sfut-fte-native-version-hidden');
      if (existingMarker) return;

      const marker = document.createElement('span');
      marker.className = 'sfut-fte-native-version-hidden';
      marker.style.display = 'none';

      try {
        parentEl.style.display = 'none';
      } catch (_) {
        node.nodeValue = '';
      }

      parentEl.appendChild(marker);
    });
  }

  function _rerenderRowByFlowId(flowId) {
    if (!flowId) return;

    const rows = document.querySelectorAll(SELECTORS.row);
    rows.forEach((row) => {
      const link = row.querySelector(SELECTORS.rowLink);
      if (!link) return;

      const candidateId = _getQueryParam(link.getAttribute('href') || '', 'flowId');
      if (candidateId === flowId) {
        _renderRowEnhancement(row, _cache[flowId]);
      }
    });
  }

  function _findRowLabelByFlowId(flowId) {
    const links = document.querySelectorAll(SELECTORS.rowLink);
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      const candidate = _getQueryParam(href, 'flowId');
      if (candidate === flowId) {
        return (link.textContent || '').trim() || null;
      }
    }
    return null;
  }

  function _mergeIntoCache(flowId, incoming) {
    const existing = _cache[flowId] || { tooltip: {} };

    _cache[flowId] = {
      ...existing,
      flowId,
      label: incoming.label || existing.label || null,
      versionNumber: incoming.versionNumber || existing.versionNumber || null,
      apiVersion: incoming.apiVersion || existing.apiVersion || null,
      contexts: Array.isArray(incoming.contexts) ? incoming.contexts : [],
      rowAlreadyShowsVersion: !!incoming.rowAlreadyShowsVersion,
      tooltip: {
        ...existing.tooltip,
        ...(incoming.tooltip || {})
      }
    };
  }

  function _detectCurrentTriggerContext() {
    const titleEl = document.querySelector('[data-id="title"]');
    const titleText = (titleEl?.textContent || '').toLowerCase();

    if (titleText.includes('record is') && titleText.includes('created')) return 'created';
    if (titleText.includes('record is') && titleText.includes('updated')) return 'updated';
    if (titleText.includes('record is') && titleText.includes('deleted')) return 'deleted';

    return null;
  }

  function _loadCache() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed ? parsed : {};
    } catch (e) {
      console.warn('[SFUT FTE] Failed to load cache:', e);
      return {};
    }
  }

  function _saveCache() {
    try {
      const safeCache = {};
      Object.entries(_cache).forEach(([key, value]) => {
        safeCache[key] = {
          flowId: value.flowId || null,
          label: value.label || null,
          versionNumber: value.versionNumber || null,
          apiVersion: value.apiVersion || null,
          tooltip: value.tooltip || {}
        };
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safeCache));
    } catch (e) {
      console.warn('[SFUT FTE] Failed to save cache:', e);
    }
  }

  function _normaliseText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function _getQueryParam(url, key) {
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.searchParams.get(key);
    } catch (_) {
      return null;
    }
  }

  function _showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `sfut-toast ${type === 'error' ? 'sfut-toast-error' : ''} ${type === 'warning' ? 'sfut-toast-warning' : ''}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('sfut-toast-visible');
    });

    setTimeout(() => {
      toast.classList.remove('sfut-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 2200);
  }

  return {
    init,
    onActivate,
    refresh
  };
})();

SFFlowUtilityToolkit.registerFeature('flow-trigger-explorer-enhancer', FlowTriggerExplorerEnhancer);