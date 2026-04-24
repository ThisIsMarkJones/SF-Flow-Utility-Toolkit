/**
 * SF Flow Utility Toolkit - Flow Health Check
 */

const FlowHealthCheck = (() => {

  let initialised = false;

  const DEFAULT_CONFIG = {
    outdatedApiVersionThreshold: 6,
    currentApiVersion: 65,
    highDataOperationThreshold: 8,
    namingConventions: {
      variable: /^var[A-Z].*/,
      formula: /^frm[A-Z].*/,
      constant: /^con[A-Z].*/,
      flow: null
    }
  };

  async function init() {
    if (initialised) return;
    initialised = true;
  }

  async function onActivate() {
    try {
      const flowId = SalesforceAPI.getFlowIdFromUrl();
      if (!flowId) {
        FlowHealthModal.showError('Could not determine the current Flow ID from the URL.');
        return;
      }

      FlowHealthModal.showLoading('Current Flow');

      const result = await SalesforceAPI.getFlowMetadata(flowId);
      const metadata = result?.Metadata;

      if (!metadata) {
        FlowHealthModal.showError('Could not retrieve Flow metadata.');
        return;
      }

      const resolvedApiName = _resolveFlowApiName(result, metadata);
      const runtimeConfig = await _buildRuntimeConfig();

      const normalized = FlowHealthNormalizer.normalize(metadata, {
        flowVersionId: result?.Id || flowId,
        flowApiName: resolvedApiName
      });

      const findings = FlowHealthRules.evaluate(normalized, runtimeConfig);
      const issueFamilies = FlowHealthScorer.buildIssueFamilies(findings);
      const score = FlowHealthScorer.calculateScore(issueFamilies);

      const summary = _buildSummary(normalized, issueFamilies, score);
      const dependencies = _buildDependencies(normalized.dependencies);
      const charts = _buildCharts(summary, dependencies);

      const report = {
        meta: {
          ...normalized.meta,
          flowApiName: resolvedApiName,
          generatedAt: new Date().toISOString(),
          analyzerVersion: 'v1-beta'
        },
        summary,
        charts,
        findings,
        issueFamilies,
        dependencies
      };

      const basePrompt = _getBaseImprovementPrompt();
      report.exports = {
        markdownSummary: FlowHealthExporter.buildMarkdownReport(report),
        improvementPrompt: FlowHealthExporter.buildImprovementPrompt(report, basePrompt),
        rawJson: JSON.stringify(report, null, 2)
      };

      FlowHealthModal.showReport(report, {
        onSendToImprovementPrompt: async (finalReport) => {
          await navigator.clipboard.writeText(finalReport.exports.improvementPrompt);

          if (typeof AIAssistant !== 'undefined' && typeof AIAssistant.onActivate === 'function') {
            await AIAssistant.onActivate();
          }
        }
      });

    } catch (error) {
      console.error('[SFUT] Flow Health Check failed:', error);
      FlowHealthModal.showError(error?.message || 'Unexpected error running health check.');
    }
  }

  async function _buildRuntimeConfig() {
    const config = { ...DEFAULT_CONFIG };

    try {
      const namingPattern = await _getNamingPattern();
      await _ensurePrefixesLoaded();

      config.namingConventions = await _buildNamingConventions(namingPattern);
    } catch (error) {
      console.warn('[SFUT] Failed to build naming configuration for Health Check. Falling back to defaults.', error);
    }

    return config;
  }

  async function _getNamingPattern() {
    try {
      if (typeof SettingsManager !== 'undefined' && typeof SettingsManager.get === 'function') {
        return await SettingsManager.get('apiNameGenerator.namingPattern') || 'Snake_Case';
      }
    } catch (error) {
      console.warn('[SFUT] Could not read naming pattern from settings:', error);
    }

    return 'Snake_Case';
  }

  async function _ensurePrefixesLoaded() {
    if (typeof APINamePrefixes !== 'undefined' && typeof APINamePrefixes.load === 'function') {
      await APINamePrefixes.load();
    }
  }

  async function _buildNamingConventions(namingPattern) {
    const conventions = {
      variable: null,
      formula: null,
      constant: null,
      flow: await _resolveFlowNamingConvention(namingPattern)
    };

    if (typeof APINamePrefixes === 'undefined' || typeof APINamePrefixes.getAll !== 'function') {
      return conventions;
    }

    const prefixes = APINamePrefixes.getAll() || [];
    if (!Array.isArray(prefixes) || prefixes.length === 0) {
      return conventions;
    }

    const styleKey = _resolvePrefixStyleKey(namingPattern);

    const variablePrefixes = _collectPrefixes(
      prefixes,
      (type) => type.startsWith('variable') || type.startsWith('collection'),
      styleKey
    );

    const formulaPrefixes = _collectPrefixes(
      prefixes,
      (type) => type.startsWith('formula'),
      styleKey
    );

    const constantPrefixes = _collectPrefixes(
      prefixes,
      (type) => type === 'constant',
      styleKey
    );

    conventions.variable = _buildRegexFromPrefixes(variablePrefixes, namingPattern);
    conventions.formula = _buildRegexFromPrefixes(formulaPrefixes, namingPattern);
    conventions.constant = _buildRegexFromPrefixes(constantPrefixes, namingPattern);

    return conventions;
  }

  function _resolvePrefixStyleKey(namingPattern) {
    switch (namingPattern) {
      case 'camelCase':
        return 'camelCase';
      case 'PascalCase':
        return 'PascalCase';
      case 'Snake_Case':
      default:
        return 'Snake_Case';
    }
  }

  function _collectPrefixes(prefixes, predicate, styleKey) {
    return prefixes
      .filter((entry) => predicate(String(entry.type || '').trim().toLowerCase()))
      .map((entry) => String(entry[styleKey] || '').trim())
      .filter(Boolean);
  }

  function _buildRegexFromPrefixes(prefixes, namingPattern) {
    const uniquePrefixes = [...new Set((prefixes || []).filter(Boolean))];
    if (!uniquePrefixes.length) return null;

    const escaped = uniquePrefixes
      .sort((a, b) => b.length - a.length)
      .map(_escapeRegex);

    const prefixGroup = `(?:${escaped.join('|')})`;

    switch (namingPattern) {
      case 'camelCase':
        return new RegExp(`^${prefixGroup}[A-Z][A-Za-z0-9]*$`);

      case 'PascalCase':
        return new RegExp(`^${prefixGroup}[A-Z][A-Za-z0-9]*$`);

      case 'Snake_Case':
      default:
        return new RegExp(`^${prefixGroup}[A-Z][A-Za-z0-9]*(?:_[A-Z][A-Za-z0-9]*)*$`);
    }
  }

  async function _resolveFlowNamingConvention(namingPattern) {
    try {
      if (typeof SettingsManager === 'undefined' || typeof SettingsManager.get !== 'function') {
        return null;
      }

      const explicitFlowRegex =
        await SettingsManager.get('flowHealthCheck.namingConventions.flow') ||
        await SettingsManager.get('apiNameGenerator.flowRegex');

      if (explicitFlowRegex && typeof explicitFlowRegex === 'string') {
        return new RegExp(explicitFlowRegex);
      }
    } catch (error) {
      console.warn('[SFUT] Could not resolve explicit flow naming convention:', error);
    }

    return null;
  }

  function _escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function _resolveFlowApiName(result, metadata) {
    const candidates = [
      result?.DeveloperName,
      result?.FullName,
      result?.ApiName,
      result?.Definition?.DeveloperName,
      result?.FlowDefinition?.DeveloperName,
      metadata?.fullName,
      metadata?.apiName
    ];

    const validCandidate = candidates.find((value) => (
      typeof value === 'string' &&
      value.trim() &&
      value.trim() !== metadata?.label
    ));

    return validCandidate || metadata?.label || 'unknown_flow';
  }

  function _buildSummary(normalized, issueFamilies, score) {
    const nodes = normalized.nodes;
    const getCount = (type) => nodes.filter((n) => n.type === type).length;

    const flowMissingDescriptions = issueFamilies
      .filter((f) => f.scoreFamily === 'flow_description')
      .reduce((sum, f) => sum + f.instanceCount, 0);

    const elementMissingDescriptions = issueFamilies
      .filter((f) => f.scoreFamily === 'element_descriptions')
      .reduce((sum, f) => sum + f.instanceCount, 0);

    const resourceMissingDescriptions = issueFamilies
      .filter((f) => f.scoreFamily === 'resource_descriptions')
      .reduce((sum, f) => sum + f.instanceCount, 0);

    return {
      overallScore: score.overallScore,
      rating: score.rating,
      severityCounts: score.severityCounts,
      categoryCounts: score.categoryCounts,
      metrics: {
        elementCount: nodes.filter((n) => n.type !== 'Start').length,
        decisionCount: getCount('Decision'),
        loopCount: getCount('Loop'),
        dataOperationCount: nodes.filter((n) =>
          ['GetRecords', 'CreateRecords', 'UpdateRecords', 'DeleteRecords', 'Action', 'Subflow'].includes(n.type)
        ).length,
        getRecordCount: getCount('GetRecords'),
        createRecordCount: getCount('CreateRecords'),
        updateRecordCount: getCount('UpdateRecords'),
        deleteRecordCount: getCount('DeleteRecords'),
        actionCount: getCount('Action'),
        screenCount: getCount('Screen'),
        subflowCount: getCount('Subflow'),

        missingDescriptionCount:
          flowMissingDescriptions + elementMissingDescriptions + resourceMissingDescriptions,
        flowMissingDescriptions,
        elementMissingDescriptions,
        resourceMissingDescriptions,

        missingFaultPathCount: issueFamilies
          .filter((f) => f.scoreFamily.startsWith('fault_paths_'))
          .reduce((sum, f) => sum + f.instanceCount, 0),
        dependencyCount: normalized.dependencies.length,
        maxDepth: Math.max(0, ...nodes.map((n) => n.loopDepth || 0))
      }
    };
  }

  function _buildDependencies(items) {
    const counts = {
      apexActions: 0,
      subflows: 0,
      lwcComponents: 0,
      apexDefinedTypes: 0,
      externalActions: 0
    };

    items.forEach((item) => {
      if (item.type === 'ApexAction') counts.apexActions += 1;
      if (item.type === 'Subflow') counts.subflows += 1;
      if (item.type === 'LwcComponent') counts.lwcComponents += 1;
      if (item.type === 'ApexDefinedType') counts.apexDefinedTypes += 1;
      if (item.type === 'ExternalAction') counts.externalActions += 1;
    });

    return {
      counts,
      items
    };
  }

  function _buildCharts(summary, dependencies) {
    return {
      severityBreakdown: {
        title: 'Issue Families by Severity',
        chartType: 'donut',
        items: [
          { key: 'high', label: 'High', value: summary.severityCounts.high },
          { key: 'medium', label: 'Medium', value: summary.severityCounts.medium },
          { key: 'low', label: 'Low', value: summary.severityCounts.low },
          { key: 'info', label: 'Info', value: summary.severityCounts.info }
        ]
      },
      categoryBreakdown: {
        title: 'Issue Families by Category',
        chartType: 'bar',
        items: [
          { key: 'performance', label: 'Performance', value: summary.categoryCounts.performance },
          { key: 'reliability', label: 'Reliability', value: summary.categoryCounts.reliability },
          { key: 'maintainability', label: 'Maintainability', value: summary.categoryCounts.maintainability },
          { key: 'portability', label: 'Portability', value: summary.categoryCounts.portability }
        ]
      },
      flowProfile: {
        title: 'Flow Profile',
        chartType: 'horizontalBar',
        items: [
          { key: 'elements', label: 'Elements', value: summary.metrics.elementCount },
          { key: 'decisions', label: 'Decisions', value: summary.metrics.decisionCount },
          { key: 'loops', label: 'Loops', value: summary.metrics.loopCount },
          { key: 'dataOperations', label: 'Data Operations', value: summary.metrics.dataOperationCount },
          { key: 'missingDescriptions', label: 'Missing Descriptions', value: summary.metrics.missingDescriptionCount },
          { key: 'missingFaultPaths', label: 'Missing Fault Paths', value: summary.metrics.missingFaultPathCount }
        ]
      },
      dependencyBreakdown: {
        title: 'Dependencies',
        chartType: 'bar',
        items: [
          { key: 'apexActions', label: 'Apex Actions', value: dependencies.counts.apexActions },
          { key: 'subflows', label: 'Subflows', value: dependencies.counts.subflows },
          { key: 'lwcComponents', label: 'LWCs', value: dependencies.counts.lwcComponents },
          { key: 'apexDefinedTypes', label: 'Apex Types', value: dependencies.counts.apexDefinedTypes },
          { key: 'externalActions', label: 'External Actions', value: dependencies.counts.externalActions }
        ]
      }
    };
  }

  function _getBaseImprovementPrompt() {
    try {
      if (
        typeof AIPromptTemplates !== 'undefined' &&
        typeof AIPromptTemplates.getTemplate === 'function'
      ) {
        return AIPromptTemplates.getTemplate('improvements') || '';
      }
    } catch (e) {
      console.warn('[SFUT] Could not retrieve base improvement prompt:', e);
    }

    return 'Review this Salesforce Flow and suggest improvements in priority order.';
  }

  return {
    init,
    onActivate
  };

})();

SFFlowUtilityToolkit.registerFeature('flow-health-check', FlowHealthCheck);