/**
 * SF Flow Utility Toolkit - Flow Health Scorer
 *
 * Follows the same deduct-from-100 model as the standard Salesforce Health Check.
 * A perfect flow scores 100. Violations reduce the score based on severity and
 * instance count. The score is floored at 0 and can never go negative.
 *
 * --- Scoring model ---
 *
 * Deductions are calculated per issue family, not per individual finding.
 * Each family pays a base cost for its worst severity, plus a per-instance
 * scaling charge for every violation beyond the first. A per-family cap
 * prevents any single family from dominating the score unfairly while still
 * ensuring that many violations in one family hurt more than one.
 *
 *   deduction = min( baseWeight + instanceScale × (instanceCount − 1), familyCap )
 *
 * Severity weights and scaling:
 *
 *   Severity  Base  Per-extra-instance  Family cap
 *   --------  ----  ------------------  ----------
 *   High        10                   4          30
 *   Medium       5                   1          12
 *   Low          1                   0           5   (flat — volume doesn't compound)
 *   Info         0                   0           0
 *
 * Rationale:
 *   - High-severity families (DML in loops, missing fault paths on DML) compound
 *     aggressively because each additional instance represents a real production risk.
 *   - Medium families compound gently — 4 queries missing fault paths is worse than
 *     1, but not catastrophically so.
 *   - Low families are flat — 10 missing descriptions is not 10× worse than 1;
 *     it reflects the same underlying habit, not 10 independent failures.
 *   - Family caps ensure no single category can push the score below 0 on its own.
 *
 * Example — Bad Practice Screen Flow (designed to demonstrate violations):
 *   3× DML missing fault paths   (high,   3 instances) → min(10 + 4×2, 30) = 18
 *   2× DML inside loops          (high,   2 instances) → min(10 + 4×1, 30) = 14
 *   2× Queries inside loops      (high,   2 instances) → min(10 + 4×1, 30) = 14
 *   4× Query missing fault paths (medium, 4 instances) → min( 5 + 1×3, 12) =  8
 *   1× Outdated API version      (medium, 1 instance)  → min( 5 + 0×0, 12) =  5
 *   10× Missing descriptions     (low,   10 instances) → min( 1 + 0×9,  5) =  1
 *   1× Missing flow description  (low,    1 instance)  → min( 1 + 0×0,  5) =  1
 *                                                         Total deducted     = 61
 *   Final score: 100 − 61 = 39 ("Very Poor") ✓
 *
 * A flow with a single high-severity finding scores 90 ("Excellent" boundary).
 */

const FlowHealthScorer = (() => {

  /**
   * Base deduction per issue family at each severity level.
   */
  const SCORE_WEIGHTS = {
    high:   10,
    medium:  5,
    low:     1,
    info:    0
  };

  /**
   * Additional deduction per instance beyond the first, per severity level.
   * Low and Info are 0 — volume does not compound for cosmetic issues.
   */
  const INSTANCE_SCALE = {
    high:   4,
    medium: 1,
    low:    0,
    info:   0
  };

  /**
   * Maximum deduction any single issue family can contribute, per severity.
   * Prevents a single family from dominating the score.
   */
  const FAMILY_CAPS = {
    high:   30,
    medium: 12,
    low:     5,
    info:    0
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
      const base      = SCORE_WEIGHTS[family.severity]  || 0;
      const scale     = INSTANCE_SCALE[family.severity] || 0;
      const cap       = FAMILY_CAPS[family.severity]    ?? Infinity;
      const raw       = base + scale * (family.instanceCount - 1);
      const deduction = Math.min(raw, cap);
      family.scoreDeduction = deduction;
      score -= deduction;
    });

    const finalScore = Math.max(0, Math.min(100, score));

    return {
      overallScore: finalScore,
      rating: getScoreRating(finalScore),
      severityCounts: _countBySeverity(issueFamilies),
      categoryCounts: _countByCategory(issueFamilies)
    };
  }

  /**
   * Maps a numeric score to a human-readable rating.
   *
   * Thresholds are calibrated against the new scoring model:
   *   100        — perfect, no violations found
   *   90–99      — Excellent: at most one minor issue
   *   80–89      — Very Good: a few low/medium issues, no high-severity
   *   65–79      — Good: some issues present but no critical patterns
   *   45–64      — Poor: notable high-severity violations
   *   0–44       — Very Poor: multiple high-severity violations or systemic problems
   */
  function getScoreRating(score) {
    if (score >= 90) return 'Excellent';
    if (score >= 80) return 'Very Good';
    if (score >= 65) return 'Good';
    if (score >= 45) return 'Poor';
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