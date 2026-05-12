/**
 * SF Flow Utility Toolkit - Flow Health Scorer
 *
 * Scores once per family using the worst severity in that family.
 * Each family contributes:
 *
 *   deduction = min( appearancePenalty + weight * log2(instanceCount + 1),  cap )
 *
 *  - The appearance penalty is a small flat cost paid by any family
 *    that appears at all. This stops "three different categories of
 *    disaster" from being cheaper than "one disaster repeated nine
 *    times": each High family pays at least 1.5 just for showing up.
 *  - The log-scaled per-instance term keeps adding pain as more
 *    instances pile up, but with rapidly diminishing returns.
 *  - 1 instance still produces the original severity weight as the
 *    log term (log2(2) = 1), so small flows with one or two findings
 *    are essentially unchanged from earlier versions.
 *  - The cap stops any single family from dominating the score and
 *    protects "big mature flow that just isn't documented" cases.
 *  - Genuinely problematic flows (many High-severity findings across
 *    multiple families) accumulate enough to land in Very Poor.
 *
 * Severity model:
 *   High    appearance 1.5  weight 5.5  cap 22
 *   Medium  appearance 0.5  weight 3.0  cap 13
 *   Low     appearance 0.0  weight 1.0  cap 6
 *   Info    appearance 0.0  weight 0.0  cap 0
 */

const FlowHealthScorer = (() => {

  const SCORE_APPEARANCE = {
    high: 1.5,
    medium: 0.5,
    low: 0,
    info: 0
  };

  const SCORE_WEIGHTS = {
    high: 5.5,
    medium: 3,
    low: 1,
    info: 0
  };

  const SCORE_CAPS = {
    high: 22,
    medium: 13,
    low: 6,
    info: 0
  };

  const SEVERITY_ORDER = {
    high: 4,
    medium: 3,
    low: 2,
    info: 1
  };

  function _computeDeduction(severity, instanceCount) {
    const appearance = SCORE_APPEARANCE[severity] || 0;
    const weight = SCORE_WEIGHTS[severity] || 0;
    const cap = SCORE_CAPS[severity] || 0;
    const safeCount = Math.max(1, Number(instanceCount) || 1);
    const raw = appearance + (weight * Math.log2(safeCount + 1));
    const capped = Math.min(raw, cap);
    // Round to 1 decimal place for display ("-12.5" reads cleaner than "-12.4998...")
    return Math.round(capped * 10) / 10;
  }

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
          // scoreImpact is recomputed once instanceCount is final (see below)
          scoreImpact: 0,
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
        family.category = finding.category;
      }
    });

    return Array.from(families.values())
      .map((family) => ({
        ...family,
        affectedItems: _uniqueAffectedItems(family.affectedItems || []),
        // Compute the deduction *after* severity and instanceCount are final
        scoreImpact: _computeDeduction(family.severity, family.instanceCount)
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

    // Round the displayed score to the nearest whole number
    const finalScore = Math.max(0, Math.min(100, Math.round(score)));

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