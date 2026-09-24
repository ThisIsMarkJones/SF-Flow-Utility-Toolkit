// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Mark Jones. SF Flow Utility Toolkit.
/**
 * SF Flow Utility Toolkit - Flow Error Detector
 *
 * Handles all detection and DOM injection logic for the Flow Error Explorer.
 *
 * Responsibilities:
 *   - Detects whether the current Flow Builder session was opened via a fault
 *     debug link (guid present in URL).
 *   - Observes the debug panel DOM for the error state to appear (async render).
 *   - Extracts the structured error context from the debug panel DOM.
 *   - Injects the "Explore Error" button into the debug panel toolbar.
 *   - Notifies the side button to show the Error Explorer menu item.
 *
 * Depends on:
 *   - flow-error-translator.js
 *   - salesforce-api.js
 *
 * Consumed by:
 *   - features/flow-error-explorer.js
 */

const FlowErrorDetector = (() => {

  // -------------------------------------------------------------------------
  // Constants — stable DOM selectors
  // All selectors target custom class names or semantic attributes that do not
  // include the LWC-generated lwc-* scoping tokens (which change per session).
  // -------------------------------------------------------------------------

  const SEL = {
    // The toolbar row containing Expand All, filter, and copy buttons.
    TOOLBAR_ROW:      '.debugPanelHeaderSpace .slds-grid.slds-border_bottom',
    // The Expand All button — used as a landmark to confirm we are in the right toolbar.
    EXPAND_ALL_BTN:   'button[title="Expand the details"]',
    // The error card wrapper — only present when the interview faulted.
    ERROR_CARD:       'div.slds-card.slds-card_boundary.card-error',
    // The dedicated error container component inside the faulted card.
    ERROR_CONTAINER:  'builder_platform_interaction-debug-error-container',
    // The rich text element that holds the raw fault string inside the error container.
    ERROR_TEXT:       'lightning-formatted-rich-text',
    // The article element inside the faulted card — aria-label holds element type + label.
    FAULTED_ARTICLE:  'div.slds-card.slds-card_boundary.card-error article[aria-label]',
    // The terminal "An Error Occurred" card — secondary confirmation of fault state.
    ERROR_OCCURRED:   'article[aria-label="An Error Occurred"]',
    // Sentinel attribute we add to our injected buttons to prevent double-injection.
    INJECTED_ATTR:    'data-sfut-error-injected'
  };

  // The ID we give the injected toolbar button for easy retrieval.
  const TOOLBAR_BTN_ID = 'sfut-explore-error-toolbar-btn';

  // -------------------------------------------------------------------------
  // Module state
  // -------------------------------------------------------------------------

  let _observer = null;
  let _isErrorContext = false;
  let _errorContext = null;      // The last extracted error context object.
  let _onErrorDetected = null;   // Callback set by the feature module.

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Returns true if the current page is an error debug session.
   * Determined purely by the presence of `guid` in the URL.
   *
   * @returns {boolean}
   */
  function isErrorContext() {
    return _isErrorContext;
  }

  /**
   * Returns the last extracted error context object, or null if not yet extracted.
   * @returns {Object|null}
   */
  function getErrorContext() {
    return _errorContext;
  }

  /**
   * Starts observing the debug panel for the error state.
   * Called by FlowErrorExplorer.init() when the page is a Flow Builder session.
   *
   * @param {Function} onErrorDetected  Callback invoked with the errorContext
   *                                    object when the error state is confirmed.
   */
  function observe(onErrorDetected) {
    _onErrorDetected = onErrorDetected || null;

    // Check for the guid parameter — the primary gate.
    const guid = _getGuidFromUrl();
    if (!guid) {
      // Not an error debug session — do nothing.
      return;
    }

    _isErrorContext = true;
    console.log('[SFUT ErrorDetector] Error debug session detected. guid:', guid);

    // The debug panel renders asynchronously after the page loads.
    // Use a MutationObserver to watch for the error container to appear.
    _startObserver();
  }

  /**
   * Stops the MutationObserver. Called on cleanup or SPA navigation.
   */
  function disconnect() {
    if (_observer) {
      _observer.disconnect();
      _observer = null;
    }
    _isErrorContext = false;
    _errorContext = null;
  }

  /**
   * Extracts the structured error context from the current DOM state.
   * Can be called directly if the caller knows the panel has already rendered.
   *
   * @returns {Object|null}  The errorContext object, or null if the error
   *                         state is not yet present in the DOM.
   */
  function extractErrorContext() {
    const errorCard = document.querySelector(SEL.ERROR_CARD);
    if (!errorCard) return null;

    const errorContainer = errorCard.querySelector(SEL.ERROR_CONTAINER);
    if (!errorContainer) return null;

    const rawFaultString = _extractRawFaultString(errorContainer);
    if (!rawFaultString) return null;

    const { elementType, elementLabel } = _extractElementInfo();
    const guid     = _getGuidFromUrl();
    const flowId   = _getFlowIdFromUrl();
    const translation = FlowErrorTranslator.translate(rawFaultString);

    const context = {
      guid,
      flowId,
      elementType,
      elementLabel,
      elementApiName: null,    // Resolved asynchronously via flow metadata.
      rawFaultString,
      translation,
      flowMetadata: null       // Populated later by the feature module.
    };

    _errorContext = context;
    return context;
  }

  // -------------------------------------------------------------------------
  // Private — observation
  // -------------------------------------------------------------------------

  /**
   * Starts a MutationObserver watching for the error container to appear.
   * Debounced to avoid thrashing on rapid DOM changes.
   */
  function _startObserver() {
    if (_observer) return;

    let debounceTimer = null;

    _observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(_checkForErrorState, 150);
    });

    _observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also run an immediate check in case the panel already rendered.
    _checkForErrorState();
  }

  /**
   * Checks whether the error state is now present in the DOM.
   * If so, extracts the context, injects the button, and fires the callback.
   */
  function _checkForErrorState() {
    // Confirm the "An Error Occurred" terminal card is present — this is the
    // most reliable confirmation that the full error panel has rendered.
    const errorOccurred = document.querySelector(SEL.ERROR_OCCURRED);
    if (!errorOccurred) return;

    // Confirm the error card is present.
    const errorCard = document.querySelector(SEL.ERROR_CARD);
    if (!errorCard) return;

    // Extract the context.
    const context = extractErrorContext();
    if (!context) return;

    console.log('[SFUT ErrorDetector] Error state confirmed. Element:', context.elementLabel);

    // Inject the toolbar button (guarded against double-injection).
    _injectToolbarButton(context);

    // Notify the feature module.
    if (typeof _onErrorDetected === 'function') {
      _onErrorDetected(context);
    }

    // Once confirmed, we don't need to keep observing — disconnect.
    // The button is injected and the context is captured.
    if (_observer) {
      _observer.disconnect();
      _observer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Private — DOM injection
  // -------------------------------------------------------------------------

  /**
   * Injects the "Explore Error" button into the debug panel toolbar row,
   * positioned after the Expand All button.
   *
   * @param {Object} context  The error context object.
   */
  function _injectToolbarButton(context) {
    // Guard: only inject once.
    if (document.getElementById(TOOLBAR_BTN_ID)) return;

    // Find the toolbar row.
    const toolbarRow = document.querySelector(SEL.TOOLBAR_ROW);
    if (!toolbarRow) {
      console.warn('[SFUT ErrorDetector] Could not find toolbar row for button injection.');
      return;
    }

    // Confirm we are in the right toolbar by checking for the Expand All button.
    const expandAllBtn = toolbarRow.querySelector(SEL.EXPAND_ALL_BTN);
    if (!expandAllBtn) {
      console.warn('[SFUT ErrorDetector] Expand All button not found — aborting injection.');
      return;
    }

    // Build the button. Use SLDS neutral button style to match Expand All.
    const wrapper = document.createElement('div');
    wrapper.className = 'slds-m-left_x-small slds-m-vertical_x-small';
    wrapper.setAttribute(SEL.INJECTED_ATTR, 'true');

    const btn = document.createElement('button');
    btn.id = TOOLBAR_BTN_ID;
    btn.className = 'slds-button slds-button_neutral sfut-explore-error-btn';
    btn.type = 'button';
    btn.title = 'Open Flow Error Explorer';
    btn.innerHTML = `
      <span class="sfut-explore-error-btn-icon">🔍</span>
      <span>Explore Error</span>
    `;

    btn.addEventListener('click', () => {
      _handleExploreErrorClick(context);
    });

    wrapper.appendChild(btn);

    // Insert immediately after the Expand All button's parent wrapper.
    const expandAllWrapper = expandAllBtn.closest('div');
    if (expandAllWrapper && expandAllWrapper.parentNode) {
      expandAllWrapper.parentNode.insertBefore(wrapper, expandAllWrapper.nextSibling);
    } else {
      // Fallback: prepend to the toolbar row.
      toolbarRow.prepend(wrapper);
    }

    console.log('[SFUT ErrorDetector] "Explore Error" button injected into toolbar.');
  }

  /**
   * Handles the toolbar "Explore Error" button click.
   * Opens the Error Explorer modal via a custom DOM event, which the
   * feature module listens for — keeping the detector decoupled from the modal.
   *
   * @param {Object} context
   */
  function _handleExploreErrorClick(context) {
    document.dispatchEvent(
      new CustomEvent('sfut-explore-error-open', { detail: { context } })
    );
  }

  // -------------------------------------------------------------------------
  // Private — DOM extraction
  // -------------------------------------------------------------------------

  /**
   * Reads the raw fault string from inside the error container component.
   *
   * @param {Element} errorContainer
   * @returns {string}
   */
  function _extractRawFaultString(errorContainer) {
    // The fault string lives in the lightning-formatted-rich-text inside the
    // error container. There may be multiple; we want the one with the error
    // content, identified by its id starting with "error-content-".
    const richText = errorContainer.querySelector(
      'lightning-formatted-rich-text[id^="error-content-"]'
    );

    if (richText) {
      return (richText.textContent || '').trim();
    }

    // Fallback: grab any lightning-formatted-rich-text inside the container.
    const fallback = errorContainer.querySelector(SEL.ERROR_TEXT);
    return fallback ? (fallback.textContent || '').trim() : '';
  }

  /**
   * Extracts the element type and label from the faulted card's article aria-label.
   *
   * The aria-label format is: "<Element Type>: <Element Label>"
   * e.g. "Update Records: Update Account"
   *
   * @returns {{ elementType: string, elementLabel: string }}
   */
  function _extractElementInfo() {
    const faultedArticle = document.querySelector(SEL.FAULTED_ARTICLE);
    if (!faultedArticle) {
      return { elementType: 'Unknown', elementLabel: 'Unknown' };
    }

    const ariaLabel = faultedArticle.getAttribute('aria-label') || '';
    const separatorIdx = ariaLabel.indexOf(': ');

    if (separatorIdx !== -1) {
      return {
        elementType:  ariaLabel.slice(0, separatorIdx).trim(),
        elementLabel: ariaLabel.slice(separatorIdx + 2).trim()
      };
    }

    return {
      elementType:  ariaLabel.trim() || 'Unknown',
      elementLabel: ariaLabel.trim() || 'Unknown'
    };
  }

  // -------------------------------------------------------------------------
  // Private — URL helpers
  // -------------------------------------------------------------------------

  /**
   * Reads the `guid` query parameter from the current URL.
   * The presence of this parameter is the canonical signal that Flow Builder
   * was opened via a fault debug link.
   *
   * @returns {string|null}
   */
  function _getGuidFromUrl() {
    return new URLSearchParams(window.location.search).get('guid') || null;
  }

  /**
   * Reads the `flowId` query parameter from the current URL.
   * Mirrors SalesforceAPI.getFlowIdFromUrl() for use within this module.
   *
   * @returns {string|null}
   */
  function _getFlowIdFromUrl() {
    return new URLSearchParams(window.location.search).get('flowId') || null;
  }

  // -------------------------------------------------------------------------

  return {
    isErrorContext,
    getErrorContext,
    observe,
    disconnect,
    extractErrorContext
  };

})();