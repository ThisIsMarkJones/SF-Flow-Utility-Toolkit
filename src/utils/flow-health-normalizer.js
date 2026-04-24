/**
 * SF Flow Utility Toolkit - Flow Health Normalizer
 *
 * Normalises raw Salesforce Flow metadata into a stable internal structure
 * for the health check rules and scorer.
 */

const FlowHealthNormalizer = (() => {

  function normalize(metadata, options = {}) {
    const flowType = _detectFlowType(metadata);

    const nodes = [];
    const resources = [];
    const dependencies = [];

    nodes.push({
      id: '__start__',
      type: 'Start',
      label: metadata.label || 'Start',
      apiName: '__start__',
      description: metadata.start?.description || metadata.description || null,
      supportsFaultPath: false,
      hasFaultPath: false,
      metadata: {
        connectorTarget: metadata.start?.connector?.targetReference || null
      }
    });

    (metadata.actionCalls || []).forEach((item) => {
      const isApex = item.actionType === 'apex';

      nodes.push({
        id: item.name,
        type: 'Action',
        label: item.label || item.name,
        apiName: item.name,
        description: item.description,
        supportsFaultPath: true,
        hasFaultPath: !!item.faultConnector?.targetReference,
        metadata: {
          actionType: item.actionType || null,
          actionName: item.actionName || null,
          connectorTarget: item.connector?.targetReference || null,
          inputParameters: item.inputParameters || [],
          outputParameters: item.outputParameters || []
        }
      });

      if (isApex && item.actionName) {
        dependencies.push({
          type: 'ApexAction',
          name: item.actionName,
          count: 1
        });
      }
    });

    (metadata.assignments || []).forEach((item) => {
      nodes.push({
        id: item.name,
        type: 'Assignment',
        label: item.label || item.name,
        apiName: item.name,
        description: item.description,
        supportsFaultPath: false,
        hasFaultPath: false,
        metadata: {
          connectorTarget: item.connector?.targetReference || null,
          assignmentItems: item.assignmentItems || []
        }
      });
    });

    (metadata.decisions || []).forEach((item) => {
      nodes.push({
        id: item.name,
        type: 'Decision',
        label: item.label || item.name,
        apiName: item.name,
        description: item.description,
        supportsFaultPath: false,
        hasFaultPath: false,
        metadata: {
          rules: item.rules || [],
          defaultConnector: item.defaultConnector?.targetReference || null
        }
      });
    });

    (metadata.recordLookups || []).forEach((item) => {
      nodes.push({
        id: item.name,
        type: 'GetRecords',
        label: item.label || item.name,
        apiName: item.name,
        description: item.description,
        supportsFaultPath: true,
        hasFaultPath: !!item.faultConnector?.targetReference,
        metadata: {
          object: item.object || null,
          connectorTarget: item.connector?.targetReference || null,
          filters: item.filters || []
        }
      });
    });

    (metadata.recordCreates || []).forEach((item) => {
      nodes.push({
        id: item.name,
        type: 'CreateRecords',
        label: item.label || item.name,
        apiName: item.name,
        description: item.description,
        supportsFaultPath: true,
        hasFaultPath: !!item.faultConnector?.targetReference,
        metadata: {
          object: item.object || null,
          connectorTarget: item.connector?.targetReference || null
        }
      });
    });

    (metadata.recordUpdates || []).forEach((item) => {
      nodes.push({
        id: item.name,
        type: 'UpdateRecords',
        label: item.label || item.name,
        apiName: item.name,
        description: item.description,
        supportsFaultPath: true,
        hasFaultPath: !!item.faultConnector?.targetReference,
        metadata: {
          object: item.object || null,
          connectorTarget: item.connector?.targetReference || null
        }
      });
    });

    (metadata.recordDeletes || []).forEach((item) => {
      nodes.push({
        id: item.name,
        type: 'DeleteRecords',
        label: item.label || item.name,
        apiName: item.name,
        description: item.description,
        supportsFaultPath: true,
        hasFaultPath: !!item.faultConnector?.targetReference,
        metadata: {
          object: item.object || null,
          connectorTarget: item.connector?.targetReference || null
        }
      });
    });

    (metadata.screens || []).forEach((item) => {
      nodes.push({
        id: item.name,
        type: 'Screen',
        label: item.label || item.name,
        apiName: item.name,
        description: item.description,
        supportsFaultPath: false,
        hasFaultPath: false,
        metadata: {
          connectorTarget: item.connector?.targetReference || null,
          fields: item.fields || []
        }
      });

      (item.fields || []).forEach((field) => {
        if (field.fieldType === 'ComponentInstance' && field.extensionName) {
          const ext = field.extensionName;
          const isStandard = ext.startsWith('flowruntime:');
          if (!isStandard) {
            dependencies.push({
              type: 'LwcComponent',
              name: ext,
              count: 1
            });
          }
        }
      });
    });

    (metadata.loops || []).forEach((item) => {
      nodes.push({
        id: item.name,
        type: 'Loop',
        label: item.label || item.name,
        apiName: item.name,
        description: item.description,
        supportsFaultPath: false,
        hasFaultPath: false,
        metadata: {
          nextValueConnector: item.nextValueConnector?.targetReference || null,
          noMoreValuesConnector: item.noMoreValuesConnector?.targetReference || null,
          collectionReference: item.collectionReference || null
        }
      });
    });

    (metadata.transforms || []).forEach((item) => {
      nodes.push({
        id: item.name,
        type: 'Transform',
        label: item.label || item.name,
        apiName: item.name,
        description: item.description,
        supportsFaultPath: false,
        hasFaultPath: false,
        metadata: {
          connectorTarget: item.connector?.targetReference || null
        }
      });
    });

    (metadata.subflows || []).forEach((item) => {
      nodes.push({
        id: item.name,
        type: 'Subflow',
        label: item.label || item.name,
        apiName: item.name,
        description: item.description,
        supportsFaultPath: true,
        hasFaultPath: !!item.faultConnector?.targetReference,
        metadata: {
          flowName: item.flowName || null,
          connectorTarget: item.connector?.targetReference || null
        }
      });

      if (item.flowName) {
        dependencies.push({
          type: 'Subflow',
          name: item.flowName,
          count: 1
        });
      }
    });

    (metadata.collectionProcessors || []).forEach((item) => {
      nodes.push({
        id: item.name,
        type: 'CollectionProcessor',
        label: item.label || item.name,
        apiName: item.name,
        description: item.description,
        supportsFaultPath: false,
        hasFaultPath: false,
        metadata: {
          connectorTarget: item.connector?.targetReference || null
        }
      });
    });

    (metadata.variables || []).forEach((item) => {
      resources.push({
        name: item.name,
        type: 'Variable',
        dataType: item.dataType,
        description: item.description,
        metadata: {
          isCollection: !!item.isCollection,
          isInput: !!item.isInput,
          isOutput: !!item.isOutput,
          value: item.value || null
        }
      });

      if (item.apexClass) {
        dependencies.push({
          type: 'ApexDefinedType',
          name: item.apexClass,
          count: 1
        });
      }
    });

    (metadata.formulas || []).forEach((item) => {
      resources.push({
        name: item.name,
        type: 'Formula',
        dataType: item.dataType,
        description: item.description,
        metadata: {
          expression: item.expression || null
        }
      });
    });

    (metadata.constants || []).forEach((item) => {
      resources.push({
        name: item.name,
        type: 'Constant',
        dataType: item.dataType,
        description: item.description,
        metadata: {
          value: item.value || null
        }
      });
    });

    (metadata.textTemplates || []).forEach((item) => {
      resources.push({
        name: item.name,
        type: 'TextTemplate',
        dataType: 'Text',
        description: item.description,
        metadata: {
          text: item.text || null
        }
      });
    });

    const edges = _buildEdges(metadata);
    const loopInfo = _computeLoopMembership(nodes, edges);

    const normalizedNodes = nodes.map((node) => ({
      ...node,
      isInLoop: !!loopInfo.byNode[node.id],
      loopDepth: loopInfo.byNode[node.id] || 0
    }));

    return {
      meta: {
        flowVersionId: options.flowVersionId || null,
        flowLabel: metadata.label || 'Unknown Flow',
        flowApiName: options.flowApiName || metadata.fullName || metadata.label || 'unknown_flow',
        flowType,
        apiVersion: metadata.apiVersion || null,
        status: metadata.status || 'Unknown'
      },
      trigger: {
        objectApiName: metadata.start?.object || null,
        timing: _detectTriggerTiming(metadata),
        event: _detectTriggerEvent(metadata),
        entryCriteriaSummary: _buildEntryCriteriaSummary(metadata),
        runContext: _detectRunContext(metadata)
      },
      nodes: normalizedNodes,
      edges,
      resources,
      dependencies: _mergeDependencies(dependencies),
      metadata
    };
  }

  function _detectFlowType(metadata) {
    if ((metadata.screens || []).length > 0) return 'ScreenFlow';

    const processType = metadata.processType || '';

    if (processType === 'Flow') return 'Autolaunched';
    if (processType === 'AutoLaunchedFlow') return 'Autolaunched';
    if (processType === 'Workflow') return 'Autolaunched';
    if (metadata.start?.schedule) return 'Scheduled';

    return 'Unknown';
  }

  function _detectTriggerTiming(metadata) {
    const start = metadata.start || {};
    const type = start.recordTriggerType || start.triggerType || '';
    if (!type) return 'Unknown';

    const normal = String(type).toLowerCase();
    if (normal.includes('before')) return 'BeforeSave';
    if (normal.includes('after')) return 'AfterSave';
    if (normal.includes('async')) return 'Async';
    return 'Unknown';
  }

  function _detectTriggerEvent(metadata) {
    const start = metadata.start || {};
    const event = start.triggerType || start.eventType || '';
    const normal = String(event).toLowerCase();

    if (normal.includes('create') && normal.includes('update')) return 'CreateOrUpdate';
    if (normal.includes('create')) return 'Create';
    if (normal.includes('update')) return 'Update';
    if (normal.includes('delete')) return 'Delete';

    return 'Unknown';
  }

  function _detectRunContext(metadata) {
    const mode = metadata.runInMode || metadata.start?.flowRunAsUser || null;
    return mode || 'Unknown';
  }

  function _buildEntryCriteriaSummary(metadata) {
    const start = metadata.start || {};
    const filterCount = (start.filters || []).length;
    const hasFormula = !!start.filterFormula;

    if (filterCount === 0 && !hasFormula) return null;
    if (hasFormula) return `Formula criteria defined`;
    return `${filterCount} start filter${filterCount === 1 ? '' : 's'} configured`;
  }

  function _buildEdges(metadata) {
    const edges = [];

    function pushEdge(from, to, kind = 'default', label = null) {
      if (!from || !to) return;
      edges.push({ from, to, kind, label });
    }

    if (metadata.start?.connector?.targetReference) {
      pushEdge('__start__', metadata.start.connector.targetReference, 'default');
    }

    const addConnectorEdges = (items, extractor) => {
      (items || []).forEach((item) => extractor(item));
    };

    addConnectorEdges(metadata.actionCalls, (item) => {
      pushEdge(item.name, item.connector?.targetReference, 'default');
      pushEdge(item.name, item.faultConnector?.targetReference, 'fault');
      pushEdge(item.name, item.timeoutConnector?.targetReference, 'fault');
    });

    addConnectorEdges(metadata.assignments, (item) => {
      pushEdge(item.name, item.connector?.targetReference, 'default');
    });

    addConnectorEdges(metadata.recordLookups, (item) => {
      pushEdge(item.name, item.connector?.targetReference, 'default');
      pushEdge(item.name, item.faultConnector?.targetReference, 'fault');
    });

    addConnectorEdges(metadata.recordCreates, (item) => {
      pushEdge(item.name, item.connector?.targetReference, 'default');
      pushEdge(item.name, item.faultConnector?.targetReference, 'fault');
    });

    addConnectorEdges(metadata.recordUpdates, (item) => {
      pushEdge(item.name, item.connector?.targetReference, 'default');
      pushEdge(item.name, item.faultConnector?.targetReference, 'fault');
    });

    addConnectorEdges(metadata.recordDeletes, (item) => {
      pushEdge(item.name, item.connector?.targetReference, 'default');
      pushEdge(item.name, item.faultConnector?.targetReference, 'fault');
    });

    addConnectorEdges(metadata.screens, (item) => {
      pushEdge(item.name, item.connector?.targetReference, 'default');
    });

    addConnectorEdges(metadata.loops, (item) => {
      pushEdge(item.name, item.nextValueConnector?.targetReference, 'loop', 'nextValue');
      pushEdge(item.name, item.noMoreValuesConnector?.targetReference, 'default', 'noMoreValues');
    });

    addConnectorEdges(metadata.decisions, (item) => {
      (item.rules || []).forEach((rule) => {
        pushEdge(item.name, rule.connector?.targetReference, 'decision', rule.label || rule.name || null);
      });
      pushEdge(item.name, item.defaultConnector?.targetReference, 'decision', item.defaultConnectorLabel || 'Default');
    });

    addConnectorEdges(metadata.transforms, (item) => {
      pushEdge(item.name, item.connector?.targetReference, 'default');
    });

    addConnectorEdges(metadata.subflows, (item) => {
      pushEdge(item.name, item.connector?.targetReference, 'default');
      pushEdge(item.name, item.faultConnector?.targetReference, 'fault');
    });

    addConnectorEdges(metadata.collectionProcessors, (item) => {
      pushEdge(item.name, item.connector?.targetReference, 'default');
    });

    return edges;
  }

  function _computeLoopMembership(nodes, edges) {
    const byNode = {};
    const loopTargets = new Set(
      edges.filter((e) => e.kind === 'loop' && e.to).map((e) => e.to)
    );

    if (!loopTargets.size) {
      return { byNode };
    }

    const outgoing = {};
    edges.forEach((edge) => {
      if (!outgoing[edge.from]) outgoing[edge.from] = [];
      outgoing[edge.from].push(edge);
    });

    const visited = new Set();
    const queue = Array.from(loopTargets).map((id) => ({ id, depth: 1 }));

    while (queue.length) {
      const current = queue.shift();
      if (!current || visited.has(current.id)) continue;

      visited.add(current.id);
      byNode[current.id] = Math.max(byNode[current.id] || 0, current.depth);

      const nextEdges = outgoing[current.id] || [];
      nextEdges.forEach((edge) => {
        if (edge.kind === 'fault') return;
        if (!visited.has(edge.to)) {
          queue.push({ id: edge.to, depth: current.depth });
        }
      });
    }

    return { byNode };
  }

  function _mergeDependencies(items) {
    const map = new Map();

    items.forEach((item) => {
      const key = `${item.type}::${item.name}`;
      if (!map.has(key)) {
        map.set(key, { ...item });
      } else {
        const existing = map.get(key);
        existing.count += item.count || 1;
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type.localeCompare(b.type);
    });
  }

  return {
    normalize
  };

})();