/**
 * SF Flow Utility Toolkit - Flow Health Rules
 *
 * Produces raw findings. Scoring is handled later by score families.
 */

const FlowHealthRules = (() => {

  function evaluate(normalizedFlow, config = {}) {
    const findings = [];

    findings.push(..._checkFlowDescription(normalizedFlow));
    findings.push(..._checkElementDescriptions(normalizedFlow));
    findings.push(..._checkResourceDescriptions(normalizedFlow));
    findings.push(..._checkGenericElementNaming(normalizedFlow));
    findings.push(..._checkNamingConventions(normalizedFlow, config));
    findings.push(..._checkFaultPaths(normalizedFlow));
    findings.push(..._checkDmlInsideLoops(normalizedFlow));
    findings.push(..._checkQueriesInsideLoops(normalizedFlow));
    findings.push(..._checkNestedLoops(normalizedFlow));
    findings.push(..._checkHighDataOperationCount(normalizedFlow, config));
    findings.push(..._checkBroadEntryCriteria(normalizedFlow));
    findings.push(..._checkTriggerTiming(normalizedFlow));
    findings.push(..._checkOutdatedApiVersion(normalizedFlow, config));
    findings.push(..._checkHardCodedIds(normalizedFlow));
    findings.push(..._checkHardCodedUrls(normalizedFlow));
    findings.push(..._checkDependencyInventory(normalizedFlow));

    return findings;
  }

  function _finding({
    ruleId,
    scoreFamily,
    title,
    severity,
    category,
    confidence = 'high',
    message,
    recommendation,
    location,
    metadata
  }) {
    return {
      id: `${ruleId}-${Math.random().toString(36).slice(2, 10)}`,
      ruleId,
      scoreFamily,
      title,
      severity,
      category,
      confidence,
      message,
      recommendation,
      location,
      metadata
    };
  }

  function _checkFlowDescription(flow) {
    if (flow.metadata.description) return [];

    return [
      _finding({
        ruleId: 'FLOW_DESC_MISSING',
        scoreFamily: 'flow_description',
        title: 'Flow description missing',
        severity: 'low',
        category: 'maintainability',
        message: 'The flow itself does not have a description.',
        recommendation: 'Add a clear summary describing what triggers the flow, what it does, and the main business outcome.'
      })
    ];
  }

  function _checkElementDescriptions(flow) {
    return flow.nodes
      .filter((n) => n.type !== 'Start')
      .filter((n) => !n.description)
      .map((node) => _finding({
        ruleId: 'ELEMENT_DESC_MISSING',
        scoreFamily: 'element_descriptions',
        title: 'Elements missing descriptions',
        severity: 'low',
        category: 'maintainability',
        message: `The element "${node.label}" does not have a description.`,
        recommendation: 'Add a short element description to explain its purpose and expected outcome.',
        location: {
          elementLabel: node.label,
          elementApiName: node.apiName
        }
      }));
  }

  function _checkResourceDescriptions(flow) {
    return flow.resources
      .filter((r) => !r.description)
      .map((resource) => _finding({
        ruleId: 'RESOURCE_DESC_MISSING',
        scoreFamily: 'resource_descriptions',
        title: 'Resources missing descriptions',
        severity: 'low',
        category: 'maintainability',
        message: `The resource "${resource.name}" does not have a description.`,
        recommendation: 'Add a description so future admins can understand how the resource is used.',
        location: {
          resourceName: resource.name
        }
      }));
  }

  function _checkGenericElementNaming(flow) {
    const genericPattern = /^(Assignment|Decision|Loop|Screen|Get Records|Update Records|Create Records|Delete Records|Action|Subflow)\s+\d+$/i;

    return flow.nodes
      .filter((n) => n.type !== 'Start')
      .filter((n) => genericPattern.test(n.label || ''))
      .map((node) => _finding({
        ruleId: 'GENERIC_ELEMENT_NAMING',
        scoreFamily: 'generic_element_naming',
        title: 'Generic element naming',
        severity: 'low',
        category: 'maintainability',
        message: `The element "${node.label}" uses a generic label.`,
        recommendation: 'Rename the element so its purpose is obvious from the canvas.',
        location: {
          elementLabel: node.label,
          elementApiName: node.apiName
        }
      }));
  }

  function _checkNamingConventions(flow, config) {
    const findings = [];
    const naming = config.namingConventions || {};

    if (naming.flow && flow.meta.flowApiName && !naming.flow.test(flow.meta.flowApiName)) {
      findings.push(_finding({
        ruleId: 'NAMING_CONVENTION_MISMATCH',
        scoreFamily: 'flow_naming',
        title: 'Naming convention mismatch',
        severity: 'low',
        category: 'maintainability',
        message: `The flow API name "${flow.meta.flowApiName}" does not match the configured naming convention.`,
        recommendation: 'Align the flow API name with your team naming standard.'
      }));
    }

    flow.resources.forEach((resource) => {
      let matcher = null;
      if (resource.type === 'Variable') matcher = naming.variable;
      if (resource.type === 'Formula') matcher = naming.formula;
      if (resource.type === 'Constant') matcher = naming.constant;

      if (_isAllowedResourceName(resource)) {
        return;
      }

      if (matcher && !matcher.test(resource.name)) {
        findings.push(_finding({
          ruleId: 'NAMING_CONVENTION_MISMATCH',
          scoreFamily: 'resource_naming',
          title: 'Naming convention mismatch',
          severity: 'low',
          category: 'maintainability',
          message: `The resource name "${resource.name}" does not match the configured convention for ${resource.type}.`,
          recommendation: 'Rename the resource to align with your naming standard.',
          location: {
            resourceName: resource.name
          }
        }));
      }
    });

    return findings;
  }

  function _isAllowedResourceName(resource) {
    if (!resource || !resource.name) return false;

    const standardVariableNames = new Set([
      'recordId'
    ]);

    if (resource.type === 'Variable' && standardVariableNames.has(resource.name)) {
      return true;
    }

    return false;
  }

  function _checkFaultPaths(flow) {
    return flow.nodes
      .filter((n) => n.supportsFaultPath)
      .filter((n) => !n.hasFaultPath)
      .map((node) => {
        let scoreFamily = 'fault_paths_actions';
        let severity = 'high';

        if (node.type === 'GetRecords') {
          scoreFamily = 'fault_paths_queries';
          severity = 'medium';
        } else if (['CreateRecords', 'UpdateRecords', 'DeleteRecords'].includes(node.type)) {
          scoreFamily = 'fault_paths_dml';
          severity = 'high';
        } else if (node.type === 'Subflow') {
          scoreFamily = 'fault_paths_subflows';
          severity = 'high';
        }

        return _finding({
          ruleId: 'FAULT_PATH_MISSING',
          scoreFamily,
          title: 'Missing fault path',
          severity,
          category: 'reliability',
          message: `The element "${node.label}" does not appear to have a fault path.`,
          recommendation: 'Add a fault path that logs, surfaces, or routes errors so failures can be diagnosed and handled safely.',
          location: {
            elementLabel: node.label,
            elementApiName: node.apiName
          }
        });
      });
  }

  function _checkDmlInsideLoops(flow) {
    return flow.nodes
      .filter((n) => ['CreateRecords', 'UpdateRecords', 'DeleteRecords'].includes(n.type))
      .filter((n) => n.isInLoop)
      .map((node) => _finding({
        ruleId: 'DML_INSIDE_LOOP',
        scoreFamily: 'dml_inside_loops',
        title: 'DML inside loop',
        severity: 'high',
        category: 'performance',
        message: `The DML element "${node.label}" is inside a loop.`,
        recommendation: 'Collect changes during the loop and perform the DML operation once outside the loop.',
        location: {
          elementLabel: node.label,
          elementApiName: node.apiName
        }
      }));
  }

  function _checkQueriesInsideLoops(flow) {
    return flow.nodes
      .filter((n) => n.type === 'GetRecords')
      .filter((n) => n.isInLoop)
      .map((node) => _finding({
        ruleId: 'QUERIES_INSIDE_LOOP',
        scoreFamily: 'queries_inside_loops',
        title: 'Get Records inside loop',
        severity: 'high',
        category: 'performance',
        message: `The query element "${node.label}" is inside a loop.`,
        recommendation: 'Move the query outside the loop where possible or redesign the data retrieval pattern.',
        location: {
          elementLabel: node.label,
          elementApiName: node.apiName
        }
      }));
  }

  function _checkNestedLoops(flow) {
    return flow.nodes
      .filter((n) => n.loopDepth > 1)
      .map((node) => _finding({
        ruleId: 'NESTED_LOOPS',
        scoreFamily: 'nested_loops',
        title: 'Nested loop detected',
        severity: 'medium',
        category: 'performance',
        message: `The element "${node.label}" appears to be inside nested loops.`,
        recommendation: 'Simplify nested iteration where possible to reduce complexity and scale risk.',
        location: {
          elementLabel: node.label,
          elementApiName: node.apiName
        }
      }));
  }

  function _checkHighDataOperationCount(flow, config) {
    const threshold = Number(config.highDataOperationThreshold || 8);
    const dataOps = flow.nodes.filter((n) =>
      ['GetRecords', 'CreateRecords', 'UpdateRecords', 'DeleteRecords', 'Action', 'Subflow'].includes(n.type)
    );

    if (dataOps.length <= threshold) return [];

    return [
      _finding({
        ruleId: 'HIGH_DATA_OPERATION_COUNT',
        scoreFamily: 'excessive_data_operations',
        title: 'High data operation count',
        severity: 'medium',
        category: 'performance',
        message: `This flow contains ${dataOps.length} data/action operations, which exceeds the configured threshold of ${threshold}.`,
        recommendation: 'Review whether some operations can be consolidated or simplified.'
      })
    ];
  }

  function _checkBroadEntryCriteria(flow) {
    if (flow.meta.flowType !== 'RecordTriggered') return [];
    if (flow.trigger.entryCriteriaSummary) return [];

    return [
      _finding({
        ruleId: 'BROAD_ENTRY_CRITERIA',
        scoreFamily: 'broad_entry_criteria',
        title: 'Broad or missing entry criteria',
        severity: 'medium',
        category: 'reliability',
        message: 'This record-triggered flow does not appear to have meaningful entry criteria.',
        recommendation: 'Add entry criteria so the flow runs only when needed.'
      })
    ];
  }

  function _checkTriggerTiming(flow) {
    if (flow.meta.flowType !== 'RecordTriggered') return [];

    const timing = flow.trigger.timing;
    const hasOnlySelfMutation =
      flow.nodes.some((n) => n.type === 'UpdateRecords') &&
      !flow.nodes.some((n) => ['CreateRecords', 'DeleteRecords', 'Action', 'Subflow'].includes(n.type));

    if (timing === 'AfterSave' && hasOnlySelfMutation) {
      return [
        _finding({
          ruleId: 'TRIGGER_TIMING_MISMATCH',
          scoreFamily: 'trigger_timing_mismatch',
          title: 'After-save flow may be better as before-save',
          severity: 'medium',
          category: 'performance',
          message: 'This flow appears to be after-save but may only be updating the triggering record.',
          recommendation: 'Consider whether this flow could be converted to before-save for better efficiency.'
        })
      ];
    }

    return [];
  }

  function _checkOutdatedApiVersion(flow, config) {
    const threshold = Number(config.outdatedApiVersionThreshold || 6);
    const currentTarget = Number(config.currentApiVersion || 65);

    if (!flow.meta.apiVersion) return [];

    const gap = currentTarget - Number(flow.meta.apiVersion);
    if (gap < threshold) return [];

    return [
      _finding({
        ruleId: 'OUTDATED_API_VERSION',
        scoreFamily: 'outdated_api_version',
        title: 'Outdated API version',
        severity: 'medium',
        category: 'portability',
        message: `This flow uses API version ${flow.meta.apiVersion}, which is ${gap} versions behind the configured target of ${currentTarget}.`,
        recommendation: 'Review and upgrade the flow API version where appropriate.'
      })
    ];
  }

  function _checkHardCodedIds(flow) {
    const findings = [];
    const seen = new Set();

    const idRegex = /\b([a-zA-Z0-9]{15}|[a-zA-Z0-9]{18})\b/g;

    function inspectValue(sourceLabel, sourceApiName, value, kind) {
      if (typeof value !== 'string' || !value) return;

      const matches = value.match(idRegex);
      if (!matches) return;

      matches.forEach((match) => {
        const normalizedMatch = match.trim();
        if (!_looksLikeSalesforceId(normalizedMatch)) return;

        const key = `${kind}::${sourceApiName || sourceLabel}::${normalizedMatch}`;
        if (seen.has(key)) return;
        seen.add(key);

        findings.push(_finding({
          ruleId: 'HARD_CODED_ID',
          scoreFamily: 'hard_coded_ids',
          title: 'Possible hard-coded Salesforce ID',
          severity: 'high',
          category: 'portability',
          confidence: 'medium',
          message: `The ${kind} "${sourceLabel}" appears to contain a hard-coded Salesforce ID.`,
          recommendation: 'Replace the hard-coded ID with configuration, metadata, or a lookup pattern that will work across environments.',
          location: kind === 'resource'
            ? { resourceName: sourceLabel }
            : { elementLabel: sourceLabel, elementApiName: sourceApiName },
          metadata: { matchedValue: normalizedMatch }
        }));
      });
    }

    flow.nodes.forEach((node) => {
      _walkLiteralStrings(node.metadata, (value) => inspectValue(node.label, node.apiName, value, 'element'));
    });

    flow.resources.forEach((resource) => {
      _walkLiteralStrings(resource.metadata, (value) => inspectValue(resource.name, null, value, 'resource'));
    });

    return findings;
  }

  function _checkHardCodedUrls(flow) {
    const findings = [];
    const seen = new Set();
    const urlRegex = /(https?:\/\/[^\s"']+)/gi;

    function inspectValue(sourceLabel, sourceApiName, value, kind) {
      if (typeof value !== 'string' || !value) return;
      const matches = value.match(urlRegex);
      if (!matches) return;

      matches.forEach((match) => {
        const key = `${kind}::${sourceApiName || sourceLabel}::${match}`;
        if (seen.has(key)) return;
        seen.add(key);

        findings.push(_finding({
          ruleId: 'HARD_CODED_URL',
          scoreFamily: 'hard_coded_urls',
          title: 'Possible hard-coded URL',
          severity: 'medium',
          category: 'portability',
          confidence: 'medium',
          message: `The ${kind} "${sourceLabel}" appears to contain a hard-coded URL.`,
          recommendation: 'Replace hard-coded URLs with environment-aware configuration where possible.',
          location: kind === 'resource'
            ? { resourceName: sourceLabel }
            : { elementLabel: sourceLabel, elementApiName: sourceApiName },
          metadata: { matchedValue: match }
        }));
      });
    }

    flow.nodes.forEach((node) => {
      _walkLiteralStrings(node.metadata, (value) => inspectValue(node.label, node.apiName, value, 'element'));
    });

    flow.resources.forEach((resource) => {
      _walkLiteralStrings(resource.metadata, (value) => inspectValue(resource.name, null, value, 'resource'));
    });

    return findings;
  }

  function _checkDependencyInventory(flow) {
    return flow.dependencies.map((dependency) => {
      let family = 'custom_apex_dependencies';
      if (dependency.type === 'LwcComponent') family = 'custom_lwc_dependencies';
      if (dependency.type === 'Subflow') family = 'subflow_dependencies';
      if (dependency.type === 'ApexDefinedType') family = 'apex_defined_dependencies';

      return _finding({
        ruleId: 'DEPENDENCY_INVENTORY',
        scoreFamily: family,
        title: 'Custom dependency inventory',
        severity: 'info',
        category: 'portability',
        message: `This flow depends on ${dependency.type} "${dependency.name}".`,
        recommendation: 'Confirm this dependency exists and is compatible in the target org before deployment.',
        metadata: {
          dependencyType: dependency.type,
          dependencyName: dependency.name,
          count: dependency.count
        }
      });
    });
  }

  function _looksLikeSalesforceId(value) {
    if (typeof value !== 'string') return false;

    const trimmed = value.trim();

    // Must be exactly 15 or 18 alphanumeric characters
    if (!/^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(trimmed)) {
      return false;
    }

    // Must contain at least one digit
    if (!/\d/.test(trimmed)) {
      return false;
    }

    // Must contain at least one uppercase letter
    if (!/[A-Z]/.test(trimmed)) {
      return false;
    }

    // Exclude obvious readable metadata/API tokens made only of letters
    if (/^[A-Za-z]+$/.test(trimmed)) {
      return false;
    }

    // Exclude common non-ID Flow/runtime literals
    const blockedLiterals = new Set([
      '$User.Id',
      'UseStoredValues',
      'ContentDocument',
      'ContentDocumentLink',
      'CustomNotificationType',
      'DisplayText',
      'InputField',
      'ComponentInstance',
      'MULTI_SELECT'
    ]);

    if (blockedLiterals.has(trimmed)) {
      return false;
    }

    return true;
  }

  function _walkLiteralStrings(obj, callback) {
    if (!obj) return;

    if (typeof obj === 'string') {
      callback(obj);
      return;
    }

    if (Array.isArray(obj)) {
      obj.forEach((item) => _walkLiteralStrings(item, callback));
      return;
    }

    if (typeof obj === 'object') {
      Object.entries(obj).forEach(([key, value]) => {
        const inspectableKeys = new Set([
          'stringValue',
          'formulaExpression',
          'expression',
          'text',
          'fieldText'
        ]);

        if (inspectableKeys.has(key) && typeof value === 'string') {
          callback(value);
          return;
        }

        _walkLiteralStrings(value, callback);
      });
    }
  }

  return {
    evaluate
  };

})();