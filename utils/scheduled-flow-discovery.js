/**
 * SF Flow Utility Toolkit - Scheduled Flow Discovery
 *
 * Tooling API access layer for the Scheduled Flow Explorer.
 *
 * Strategy:
 *   1. Query FlowDefinition for all definitions with an active version
 *      (no Metadata, so unbounded result count).
 *   2. For each ActiveVersionId, query Flow for the full Metadata.
 *      Tooling API restricts Metadata-bearing queries to one row at a time,
 *      so these run individually but with controlled concurrency.
 *   3. Filter for Metadata.start.triggerType === 'Scheduled' — anything else
 *      is discarded.
 *   4. Returns successfully-discovered flows alongside any per-flow errors,
 *      so partial success is presentable.
 *
 * Caching:
 *   The discovery result is cached in-memory for the session. Callers can
 *   force a refresh via { forceRefresh: true }.
 *
 * Batched loading:
 *   When the caller passes an onBatch callback, results stream in as each
 *   batch completes, so the UI can render progressively.
 */

const ScheduledFlowDiscovery = (() => {

  // Threshold above which we treat the org as "large" and stream results
  // back to the caller in batches rather than waiting for everything.
  const LARGE_ORG_THRESHOLD = 50;

  // Concurrency limit for parallel Metadata fetches. Tooling API tolerates
  // higher concurrency, but keeping this conservative avoids tripping rate
  // limits in busy orgs.
  const METADATA_FETCH_CONCURRENCY = 5;

  // In-memory session cache
  let _cache = null; // { discoveredAt: Date, flows: Array, errors: Array }

  // ---------- Public API ----------

  /**
   * Discover all active Schedule-Triggered Flows in the org.
   *
   * @param {Object} [options]
   * @param {boolean} [options.forceRefresh=false] - Bypass the cache
   * @param {Function} [options.onBatch]           - Callback invoked with
   *     ({ flows, errors, totalCandidates, processedCandidates, isComplete })
   *     after each batch completes. Useful for streaming UI updates.
   *
   * @returns {Promise<{flows: Array, errors: Array, fromCache: boolean}>}
   *
   *   flows = Array of {
   *     flowDefinitionId,
   *     activeVersionId,
   *     latestVersionId,
   *     developerName,
   *     label,
   *     parsedSchedule,        // From ScheduledFlowCalculator.parseSchedule
   *     activationDate,        // Date or null
   *     versionNumber,
   *     status,
   *     description            // String or null
   *   }
   *
   *   errors = Array of { flowDefinitionId, activeVersionId, message }
   */
  async function discoverScheduledFlows(options = {}) {
    const { forceRefresh = false, onBatch = null } = options;

    if (!forceRefresh && _cache) {
      console.log('[SFUT ScheduledFlowDiscovery] Returning cached result.');
      // For cached returns, fire onBatch once with the final state for UI consistency
      if (onBatch) {
        onBatch({
          flows: _cache.flows,
          errors: _cache.errors,
          totalCandidates: _cache.flows.length + _cache.errors.length,
          processedCandidates: _cache.flows.length + _cache.errors.length,
          isComplete: true
        });
      }
      return { flows: _cache.flows, errors: _cache.errors, fromCache: true };
    }

    console.log('[SFUT ScheduledFlowDiscovery] Starting discovery...');

    // Step 1: Get all FlowDefinitions with an active version
    const definitions = await _queryFlowDefinitions();
    console.log(`[SFUT ScheduledFlowDiscovery] Found ${definitions.length} flow definitions with active versions.`);

    if (definitions.length === 0) {
      const empty = { flows: [], errors: [] };
      _cache = { discoveredAt: new Date(), ...empty };
      if (onBatch) {
        onBatch({
          flows: [],
          errors: [],
          totalCandidates: 0,
          processedCandidates: 0,
          isComplete: true
        });
      }
      return { ...empty, fromCache: false };
    }

    // Step 2: Fetch Metadata for each ActiveVersionId, with concurrency control.
    const flows = [];
    const errors = [];

    const isLarge = definitions.length > LARGE_ORG_THRESHOLD;
    if (isLarge) {
      console.log(`[SFUT ScheduledFlowDiscovery] Large org (>${LARGE_ORG_THRESHOLD}); streaming results.`);
    }

    // Helper to push a batch update to the caller
    const pushBatchUpdate = (processedCount, isComplete) => {
      if (!onBatch) return;
      onBatch({
        flows: flows.slice(),
        errors: errors.slice(),
        totalCandidates: definitions.length,
        processedCandidates: processedCount,
        isComplete
      });
    };

    // Process the definitions through a sliding-window concurrency pool.
    let nextIndex = 0;
    let processedCount = 0;
    let lastBatchUpdateAt = 0;

    async function worker() {
      while (true) {
        const idx = nextIndex++;
        if (idx >= definitions.length) return;

        const def = definitions[idx];
        try {
          const flowEntry = await _fetchAndBuildFlowEntry(def);
          if (flowEntry) {
            flows.push(flowEntry);
          }
          // (If null, the flow wasn't a Scheduled-Triggered Flow — silently skipped.)
        } catch (err) {
          errors.push({
            flowDefinitionId: def.Id,
            activeVersionId: def.ActiveVersionId,
            developerName: def.DeveloperName || null,
            message: err?.message || String(err)
          });
          console.warn(
            `[SFUT ScheduledFlowDiscovery] Failed to load metadata for ${def.DeveloperName || def.Id}:`,
            err?.message || err
          );
        }

        processedCount++;

        // For large orgs: stream a batch update roughly every 5 processed
        // (or on completion). For small orgs: only at the end.
        if (isLarge) {
          if (processedCount - lastBatchUpdateAt >= 5 || processedCount === definitions.length) {
            lastBatchUpdateAt = processedCount;
            pushBatchUpdate(processedCount, processedCount === definitions.length);
          }
        }
      }
    }

    const workers = Array.from(
      { length: Math.min(METADATA_FETCH_CONCURRENCY, definitions.length) },
      () => worker()
    );
    await Promise.all(workers);

    // Final batch update (always — covers the small-org case where we never streamed)
    pushBatchUpdate(processedCount, true);

    _cache = { discoveredAt: new Date(), flows, errors };

    console.log(
      `[SFUT ScheduledFlowDiscovery] Discovery complete: ${flows.length} scheduled flows, ${errors.length} errors.`
    );

    return { flows, errors, fromCache: false };
  }

  /**
   * Clears the in-memory cache. The next discoverScheduledFlows() call
   * will re-fetch from Salesforce.
   */
  function clearCache() {
    _cache = null;
  }

  /**
   * Returns the cached result if available, or null.
   */
  function getCachedResult() {
    if (!_cache) return null;
    return { flows: _cache.flows, errors: _cache.errors, discoveredAt: _cache.discoveredAt };
  }

  /**
   * Fetches the org's default timezone identifier. Cached for the session.
   *
   * @returns {Promise<string|null>} e.g. "America/Los_Angeles", or null if unavailable
   */
  let _orgTimeZone = null;
  async function getOrgTimeZone() {
    if (_orgTimeZone !== null) return _orgTimeZone;

    try {
      // The Tooling API does not expose the standard Organization object,
      // so we must use the regular Data API for this query.
      // (API version is hardcoded to match the constant in salesforce-api.js;
      //  if that changes in future, this should be updated to match.)
      const result = await SalesforceAPI.apiGet(
        '/services/data/v62.0/query',
        { q: 'SELECT TimeZoneSidKey FROM Organization LIMIT 1' }
      );
      const tz = result?.records?.[0]?.TimeZoneSidKey || null;
      _orgTimeZone = tz;
      return tz;
    } catch (err) {
      console.warn('[SFUT ScheduledFlowDiscovery] Could not fetch org timezone:', err?.message || err);
      _orgTimeZone = null;
      return null;
    }
  }

  // ---------- Internal: queries ----------

  async function _queryFlowDefinitions() {
    const soql =
      'SELECT Id, DeveloperName, ActiveVersionId, LatestVersionId ' +
      'FROM FlowDefinition ' +
      'WHERE ActiveVersionId != null ' +
      'ORDER BY DeveloperName ASC';

    const result = await SalesforceAPI.toolingQuery(soql);
    return Array.isArray(result?.records) ? result.records : [];
  }

  /**
   * Fetches Metadata for a single FlowDefinition's active version, then
   * parses it. Returns a flow entry if it's a Scheduled-Triggered Flow,
   * or null if the metadata is for a non-scheduled flow type.
   *
   * Throws on API errors (caught by the caller).
   */
  async function _fetchAndBuildFlowEntry(def) {
    if (!def.ActiveVersionId) return null;

    const soql =
      'SELECT Id, MasterLabel, Description, Status, VersionNumber, ' +
      'CreatedDate, LastModifiedDate, Metadata ' +
      `FROM Flow WHERE Id = '${_escapeSoql(def.ActiveVersionId)}'`;

    const result = await SalesforceAPI.toolingQuery(soql);
    const record = result?.records?.[0];
    if (!record) return null;

    const parsedSchedule = ScheduledFlowCalculator.parseSchedule(record);
    if (!parsedSchedule) {
      // Not a Scheduled-Triggered Flow. Silently skip rather than treating
      // as an error — most flows in an org won't be scheduled.
      return null;
    }

    const activationDate = ScheduledFlowCalculator.parseActivationDate(record.LastModifiedDate);

    return {
      flowDefinitionId: def.Id,
      activeVersionId: def.ActiveVersionId,
      latestVersionId: def.LatestVersionId,
      developerName: def.DeveloperName,
      label: record.MasterLabel || def.DeveloperName,
      description: record.Description || null,
      parsedSchedule,
      activationDate,
      versionNumber: record.VersionNumber,
      status: record.Status
    };
  }

  /**
   * Escapes a value for safe inclusion in a SOQL string literal.
   * Salesforce IDs don't really need this, but it's a sensible guard.
   */
  function _escapeSoql(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  // ---------- Public API ----------

  return {
    LARGE_ORG_THRESHOLD,
    discoverScheduledFlows,
    clearCache,
    getCachedResult,
    getOrgTimeZone
  };

})();