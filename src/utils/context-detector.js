/**
 * SF Flow Utility Toolkit - Context Detector
 * 
 * Detects which Salesforce page context the user is currently on
 * and determines which features should be active.
 * 
 * Supported contexts:
 * - SETUP_FLOWS: The Flow list/home page in Setup
 * - FLOW_DETAILS: The Flow details / versions page in Setup
 * - FLOW_BUILDER: The Flow Builder canvas
 * - COMPARE_FLOWS: The Compare Flows page
 * - FLOW_TRIGGER_EXPLORER: The Flow Trigger Explorer page
 * - SETUP_OTHER: Any other Setup page
 * - NONE: Not a relevant page
 */

const ContextDetector = (() => {

  const CONTEXTS = {
    SETUP_FLOWS: 'setup_flows',
    FLOW_DETAILS: 'flow_details',
    FLOW_BUILDER: 'flow_builder',
    COMPARE_FLOWS: 'compare_flows',
    FLOW_TRIGGER_EXPLORER: 'flow_trigger_explorer',
    SETUP_OTHER: 'setup_other',
    NONE: 'none'
  };

  /**
   * Analyses the current URL to determine the page context.
   * @returns {string} One of the CONTEXTS values
   */
  function detectContext() {
    const url = window.location.href;

    // Compare Flows page (must check BEFORE Flow Builder — same base URL with extra param)
    if (_isCompareFlows(url)) {
      return CONTEXTS.COMPARE_FLOWS;
    }

    // Flow Builder canvas
    if (_isFlowBuilder(url)) {
      return CONTEXTS.FLOW_BUILDER;
    }

    // Flow Trigger Explorer
    if (_isFlowTriggerExplorer(url)) {
      return CONTEXTS.FLOW_TRIGGER_EXPLORER;
    }

    // Setup - Flow details / versions page
    if (_isFlowDetails(url)) {
      return CONTEXTS.FLOW_DETAILS;
    }

    // Setup - Flow list/home page
    if (_isSetupFlows(url)) {
      return CONTEXTS.SETUP_FLOWS;
    }

    // Setup - Any other page
    if (_isSetup(url)) {
      return CONTEXTS.SETUP_OTHER;
    }

    return CONTEXTS.NONE;
  }

  /**
   * Checks if the current context is one where the side button should appear.
   * @returns {boolean}
   */
  function shouldShowSideButton() {
    const context = detectContext();
    return context !== CONTEXTS.NONE;
  }

  /**
   * Returns the list of features available for the current context.
   * @returns {string[]} Array of feature identifiers
   */
  function getAvailableFeatures() {
    const context = detectContext();

    switch (context) {
      case CONTEXTS.SETUP_FLOWS:
        return ['setup-tabs', 'flow-list-search'];

      case CONTEXTS.FLOW_DETAILS:
        return ['flow-version-manager'];

      case CONTEXTS.FLOW_BUILDER:
        return [
          'canvas-search',
          'missing-descriptions',
          'ai-assistant',
          'api-name-generator',
          'flow-health-check'
        ];

      case CONTEXTS.COMPARE_FLOWS:
        return ['comparison-exporter'];

      case CONTEXTS.FLOW_TRIGGER_EXPLORER:
        return ['setup-tabs', 'flow-trigger-explorer-enhancer'];

      case CONTEXTS.SETUP_OTHER:
        return ['setup-tabs'];

      default:
        return [];
    }
  }

  // --- Private URL detection methods ---

  function _isFlowBuilder(url) {
    // Flow Builder URL pattern:
    // https://{org}.lightning.force.com/builder_platform_interaction/flowBuilder.app?flowId=...
    return url.includes('/builder_platform_interaction/flowBuilder.app');
  }

  function _isCompareFlows(url) {
    if (!url.includes('/builder_platform_interaction/flowBuilder.app')) return false;

    // Primary: URL contains compareTargetFlowId parameter
    if (url.includes('compareTargetFlowId')) return true;

    // Fallback: the Compare Versions view can load inside Flow Builder without
    // the URL updating. Detect by unique DOM elements present only on that page.
    return !!(
      document.querySelector('[data-testid="baseFlowCompareVersionSelect"]') ||
      document.querySelector('[data-testid="secondaryFlowCompareVersionSelect"]') ||
      document.querySelector('.test-flow-compare-panel') ||
      Array.from(document.querySelectorAll('button')).some(
        b => b.textContent.trim() === 'Compare Versions' && b.closest('[class*="compare"]')
      )
    );
  }

  function _isFlowTriggerExplorer(url) {
    return url.includes('/interaction_explorer/flowExplorer') ||
           url.includes('FlowTriggerExplorer');
  }

  function _isFlowDetails(url) {
    // Outer Lightning wrapper:
    // /lightning/setup/Flows/page?address=%2F300...
    const isLightningFlowDetails = url.includes('lightning/setup/Flows/page');

    // Inner VF page rendered inside the Setup iframe:
    // /udd/FlowDefinition/viewFlowDefinition.apexp?id=...
    const isVisualforceFlowDetails = url.includes('/udd/FlowDefinition/viewFlowDefinition.apexp');

    // Direct DOM detection for the versions table in the VF frame
    const hasVersionsTable = !!document.querySelector('table.list[id="view:lists:versions"]');

    return isLightningFlowDetails || isVisualforceFlowDetails || hasVersionsTable;
  }

  function _isSetupFlows(url) {
    // Setup Flow list/home page only
    return url.includes('lightning/setup/Flows/home');
  }

  function _isSetup(url) {
    return url.includes('lightning/setup/');
  }

  // --- Public API ---
  return {
    CONTEXTS,
    detectContext,
    shouldShowSideButton,
    getAvailableFeatures
  };

})();