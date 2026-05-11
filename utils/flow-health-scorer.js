/**
 * SF Flow Utility Toolkit - Flow Health Scorer
 *
 * Scores once per family using the worst severity in that family.
 *
 * High = -5
 * Medium = -3
 * Low = -1
 * Info = 0
 */

const FlowHealthScorer = (() => {

  const SCORE_WEIGHTS = {
    high: 5,
    medium: 3,
    low: 1,
    info: 0
  };

  const SEVERITY_ORDER = {
    high: 4,
    medium: 3,
    low: 2,
    info: 1
  };

  function buildIssueFamilies(findings) {
    const families = new Map();

    findings.forEach((finding) => {
      const key = finding.scoreFamily || finding.ruleId;
      const affected = _extractAffectedItem(finding);

      if (!families.has(key)) {
        families.set(key, {
          scoreFamily: key,
          title: _titleFromFamily(key),
          severity: finding.severity,
          category: finding.category,
          scoreImpact: SCORE_WEIGHTS[finding.severity] || 0,
          instanceCount: 1,
          findings: [finding],
          affectedItems: affected ? [affected] : []
        });
        return;
      }

      const family = families.get(key);
      family.instanceCount += 1;
      family.findings.push(finding);

      if (affected) {
        family.affectedItems.push(affected);
      }

      if ((SEVERITY_ORDER[finding.severity] || 0) > (SEVERITY_ORDER[family.severity] || 0)) {
        family.severity = finding.severity;
        family.scoreImpact = SCORE_WEIGHTS[finding.severity] || 0;
        family.category = finding.category;
      }
    });

    return Array.from(families.values())
      .map((family) => ({
        ...family,
        affectedItems: _uniqueAffectedItems(family.affectedItems || [])
      }))
      .sort((a, b) => {
        const severityCompare = (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0);
        if (severityCompare !== 0) return severityCompare;
        return a.title.localeCompare(b.title);
      });
  }

  function calculateScore(issueFamilies) {
    let score = 100;

    issueFamilies.forEach((family) => {
      score -= family.scoreImpact || 0;
    });

    const finalScore = Math.max(0, Math.min(100, score));

    return {
      overallScore: finalScore,
      rating: getScoreRating(finalScore),
      severityCounts: _countBySeverity(issueFamilies),
      categoryCounts: _countByCategory(issueFamilies)
    };
  }

  function getScoreRating(score) {
    if (score >= 90) return 'Excellent';
    if (score >= 80) return 'Very Good';
    if (score >= 70) return 'Good';
    if (score >= 55) return 'Poor';
    return 'Very Poor';
  }

  function _countBySeverity(issueFamilies) {
    const counts = { high: 0, medium: 0, low: 0, info: 0 };
    issueFamilies.forEach((family) => {
      counts[family.severity] = (counts[family.severity] || 0) + 1;
    });
    return counts;
  }

  function _countByCategory(issueFamilies) {
    const counts = {
      performance: 0,
      reliability: 0,
      maintainability: 0,
      portability: 0
    };

    issueFamilies.forEach((family) => {
      counts[family.category] = (counts[family.category] || 0) + 1;
    });

    return counts;
  }

  function _titleFromFamily(scoreFamily) {
    const titles = {
      flow_description: 'Flow description missing',
      element_descriptions: 'Elements missing descriptions',
      resource_descriptions: 'Resources missing descriptions',
      flow_naming: 'Flow naming convention mismatches',
      resource_naming: 'Resource naming convention mismatches',
      generic_element_naming: 'Generic element naming',
      fault_paths_actions: 'Action elements missing fault paths',
      fault_paths_queries: 'Query elements missing fault paths',
      fault_paths_dml: 'DML elements missing fault paths',
      fault_paths_subflows: 'Subflow elements missing fault paths',
      dml_inside_loops: 'DML inside loops',
      queries_inside_loops: 'Queries inside loops',
      nested_loops: 'Nested loops',
      excessive_data_operations: 'High data operation count',
      broad_entry_criteria: 'Broad or missing entry criteria',
      trigger_timing_mismatch: 'Trigger timing mismatch',
      outdated_api_version: 'Outdated API version',
      hard_coded_ids: 'Possible hard-coded Salesforce IDs found',
      hard_coded_urls: 'Possible hard-coded URLs found',
      custom_apex_dependencies: 'Custom Apex dependencies detected',
      custom_lwc_dependencies: 'Custom LWC dependencies detected',
      subflow_dependencies: 'Subflow dependencies detected',
      apex_defined_dependencies: 'Apex-defined dependencies detected',
      elevated_run_context: 'Elevated run context detected'
    };

    return titles[scoreFamily] || scoreFamily;
  }

  function _extractAffectedItem(finding) {
    if (finding.location?.elementLabel) {
      return {
        type: 'element',
        label: finding.location.elementLabel,
        apiName: finding.location.elementApiName || null
      };
    }

    if (finding.location?.resourceName) {
      return {
        type: 'resource',
        label: finding.location.resourceName,
        apiName: null
      };
    }

    if (finding.metadata?.dependencyName) {
      return {
        type: 'dependency',
        label: finding.metadata.dependencyName,
        apiName: null
      };
    }

    return null;
  }

  function _uniqueAffectedItems(items) {
    const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
    const seen = new Set();

    return safeItems.filter((item) => {
      const key = `${item.type}::${item.label}::${item.apiName || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  return {
    buildIssueFamilies,
    calculateScore,
    getScoreRating
  };

})();