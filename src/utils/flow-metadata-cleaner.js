/**
 * SF Flow Utility Toolkit - Flow Metadata Cleaner
 * 
 * Transforms raw Salesforce Tooling API flow metadata JSON into
 * a cleaner, more readable format by stripping null values,
 * empty arrays, builder internals, and canvas coordinates.
 * 
 * Used by the AI Assistant to reduce token consumption and improve
 * LLM comprehension. Also available as a user option when copying
 * or downloading metadata.
 * 
 * Cleaning rules:
 *   - Remove all keys with null values
 *   - Remove all empty arrays ([])
 *   - Remove all empty objects ({})
 *   - Remove processMetadataValues when empty array
 *   - Remove top-level processMetadataValues (builder internals)
 *   - Remove locationX and locationY (canvas coordinates)
 *   - Collapse value objects to only populated fields
 *   - Remove empty top-level element arrays (e.g. "loops": [])
 */

const FlowMetadataCleaner = (() => {

  /**
   * Cleans the raw flow metadata JSON.
   * @param {Object} raw - The raw Metadata object from the Tooling API
   * @returns {Object} A cleaned copy (original is not mutated)
   */
  function clean(raw) {
    if (!raw || typeof raw !== 'object') return raw;

    // Deep clone to avoid mutating the original
    let cleaned = JSON.parse(JSON.stringify(raw));

    // Remove top-level processMetadataValues (BuilderType, CanvasMode, etc.)
    delete cleaned.processMetadataValues;

    // Recursively clean the entire tree
    cleaned = _cleanNode(cleaned);

    return cleaned;
  }

  /**
   * Recursively cleans a node and all its children.
   * @param {any} node - The current node to clean
   * @returns {any} The cleaned node
   */
  function _cleanNode(node) {
    if (node === null || node === undefined) return undefined;

    // Primitives pass through
    if (typeof node !== 'object') return node;

    // Arrays: clean each item, remove empty results
    if (Array.isArray(node)) {
      const cleaned = node
        .map(item => _cleanNode(item))
        .filter(item => item !== undefined && item !== null);

      return cleaned.length > 0 ? cleaned : undefined;
    }

    // Objects: clean each key
    const cleaned = {};
    for (const [key, value] of Object.entries(node)) {
      // Skip canvas coordinates
      if (key === 'locationX' || key === 'locationY') continue;

      // Skip processMetadataValues when empty
      if (key === 'processMetadataValues') {
        if (Array.isArray(value) && value.length === 0) continue;
        // Non-empty processMetadataValues: still clean but keep
      }

      // Recurse
      const cleanedValue = _cleanNode(value);

      // Skip nulls, undefined, empty arrays, and empty objects
      if (cleanedValue === null || cleanedValue === undefined) continue;
      if (Array.isArray(cleanedValue) && cleanedValue.length === 0) continue;
      if (typeof cleanedValue === 'object' && !Array.isArray(cleanedValue) && Object.keys(cleanedValue).length === 0) continue;

      cleaned[key] = cleanedValue;
    }

    return Object.keys(cleaned).length > 0 ? cleaned : undefined;
  }

  /**
   * Returns a summary of the flow metadata for display purposes.
   * Useful for showing the user what they're about to copy/download.
   * @param {Object} metadata - The raw or cleaned metadata
   * @returns {Object} A summary object with counts and key info
   */
  function summarise(metadata) {
    if (!metadata) return null;

    const elementTypes = [
      { key: 'actionCalls', label: 'Actions' },
      { key: 'assignments', label: 'Assignments' },
      { key: 'decisions', label: 'Decisions' },
      { key: 'loops', label: 'Loops' },
      { key: 'recordCreates', label: 'Create Records' },
      { key: 'recordDeletes', label: 'Delete Records' },
      { key: 'recordLookups', label: 'Get Records' },
      { key: 'recordUpdates', label: 'Update Records' },
      { key: 'screens', label: 'Screens' },
      { key: 'subflows', label: 'Subflows' },
      { key: 'transforms', label: 'Transforms' },
      { key: 'collectionProcessors', label: 'Collection Processors' },
      { key: 'waits', label: 'Waits' },
      { key: 'recordRollbacks', label: 'Rollbacks' }
    ];

    const resourceTypes = [
      { key: 'variables', label: 'Variables' },
      { key: 'formulas', label: 'Formulas' },
      { key: 'constants', label: 'Constants' },
      { key: 'textTemplates', label: 'Text Templates' },
      { key: 'choices', label: 'Choices' },
      { key: 'dynamicChoiceSets', label: 'Dynamic Choice Sets' },
      { key: 'stages', label: 'Stages' }
    ];

    const elements = {};
    let totalElements = 0;
    for (const { key, label } of elementTypes) {
      const count = Array.isArray(metadata[key]) ? metadata[key].length : 0;
      if (count > 0) {
        elements[label] = count;
        totalElements += count;
      }
    }

    const resources = {};
    let totalResources = 0;
    for (const { key, label } of resourceTypes) {
      const count = Array.isArray(metadata[key]) ? metadata[key].length : 0;
      if (count > 0) {
        resources[label] = count;
        totalResources += count;
      }
    }

    return {
      label: metadata.label || 'Unknown',
      processType: metadata.processType || 'Unknown',
      status: metadata.status || 'Unknown',
      apiVersion: metadata.apiVersion || 'Unknown',
      description: metadata.description || '(No description)',
      totalElements,
      totalResources,
      elements,
      resources
    };
  }

  /**
   * Estimates the token count of a JSON string.
   * Rough heuristic: ~4 characters per token for structured JSON.
   * @param {string} jsonString - The JSON string
   * @returns {number} Estimated token count
   */
  function estimateTokens(jsonString) {
    if (!jsonString) return 0;
    return Math.ceil(jsonString.length / 4);
  }

  // --- Public API ---
  return {
    clean,
    summarise,
    estimateTokens
  };

})();