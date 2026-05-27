/**
 * SF Flow Utility Toolkit - Unused Resources Analyser
 *
 * Analyses raw Salesforce Flow metadata to identify user-authored Manager-tab
 * resources that are not referenced anywhere else in the flow.
 *
 * The seven supported resource types are the standalone Manager-tab resources:
 *   - Variable           (metadata.variables)
 *   - Constant           (metadata.constants)
 *   - Formula            (metadata.formulas)
 *   - Text Template      (metadata.textTemplates)
 *   - Choice             (metadata.choices)
 *   - Choice Set         (metadata.dynamicChoiceSets)
 *   - Stage              (metadata.stages)
 *
 * Element-derived items (e.g. Get Records output variables, Loop iteration
 * variables, Screen component outputs) are deliberately not in scope — they
 * live on their parent elements in the metadata, not in these top-level arrays,
 * so they are excluded automatically.
 *
 * Reference detection strategy:
 *   - Any field with a key ending in 'Reference' (string) — e.g. elementReference,
 *     leftValueReference, assignToReference, collectionReference, outputReference,
 *     inputReference, recordIdReference, assignNextValueToReference.
 *   - Any field with a key ending in 'References' (array of strings) — e.g.
 *     choiceReferences.
 *   - Merge field syntax {!ResourceName} or {!ResourceName.field.path} found in
 *     any string value — covers formula expressions, text template content,
 *     stringValue input parameters, screen field defaults, etc.
 *
 * Connector references (key 'targetReference') are explicitly excluded — these
 * point to other elements, not resources. Including them would be harmless
 * (element API names cannot collide with resource API names in the same flow)
 * but explicit exclusion makes intent clear.
 *
 * Global tokens (e.g. $User, $Record, $GlobalConstant.True) end up in the
 * reference set harmlessly because they cannot match any user-authored
 * resource name.
 */

const UnusedResourcesAnalyser = (() => {

  // The seven resource types in display order.
  // metadataKey is the raw Tooling API field name on the flow Metadata object.
  const RESOURCE_TYPES = [
    { metadataKey: 'variables',         displayType: 'Variable',      displayPlural: 'Variables' },
    { metadataKey: 'constants',         displayType: 'Constant',      displayPlural: 'Constants' },
    { metadataKey: 'formulas',          displayType: 'Formula',       displayPlural: 'Formulas' },
    { metadataKey: 'textTemplates',     displayType: 'Text Template', displayPlural: 'Text Templates' },
    { metadataKey: 'choices',           displayType: 'Choice',        displayPlural: 'Choices' },
    { metadataKey: 'dynamicChoiceSets', displayType: 'Choice Set',    displayPlural: 'Choice Sets' },
    { metadataKey: 'stages',            displayType: 'Stage',         displayPlural: 'Stages' }
  ];

  // Matches {!Identifier or {!Identifier.path... — captures only the root identifier.
  // The closing } isn't required by the regex because we just need the first identifier
  // after the !, and Salesforce identifiers cannot contain whitespace, dots after the
  // root segment are fine (we strip them when recording the reference).
  const MERGE_FIELD_REGEX = /\{!([A-Za-z_$][A-Za-z0-9_$]*)/g;

  /**
   * Analyses the given raw flow metadata and returns a grouped report of
   * unused user-authored resources.
   *
   * @param {Object} metadata - Raw Salesforce Tooling API flow Metadata
   * @returns {{
   *   totalResources: number,
   *   totalUnused: number,
   *   groups: Array<{
   *     type: string,
   *     typePlural: string,
   *     metadataKey: string,
   *     count: number,
   *     items: Array<{ name: string, type: string, metadataKey: string,
   *                    dataType: string|null, description: string|null }>
   *   }>
   * }}
   */
  function analyse(metadata) {
    if (!metadata || typeof metadata !== 'object') {
      return { totalResources: 0, totalUnused: 0, groups: [] };
    }

    const resources = _collectResources(metadata);
    const referenced = _buildReferenceSet(metadata);

    const unusedResources = resources.filter((r) => !referenced.has(r.name));
    const groups = _groupByType(unusedResources);

    return {
      totalResources: resources.length,
      totalUnused: unusedResources.length,
      groups
    };
  }

  /**
   * Collects all user-authored resources from the seven supported metadata
   * arrays. Resources without a name are skipped defensively.
   */
  function _collectResources(metadata) {
    const collected = [];

    RESOURCE_TYPES.forEach(({ metadataKey, displayType, displayPlural }) => {
      const items = metadata[metadataKey];
      if (!Array.isArray(items)) return;

      items.forEach((item) => {
        if (!item || typeof item.name !== 'string' || !item.name) return;

        collected.push({
          name: item.name,
          type: displayType,
          typePlural: displayPlural,
          metadataKey,
          dataType: item.dataType || null,
          description: item.description || null
        });
      });
    });

    return collected;
  }

  /**
   * Walks the entire metadata tree and builds a Set of every resource name
   * that is referenced. The walker covers the resource definition arrays too
   * (so that, e.g., a variable referenced only inside a formula expression is
   * correctly detected as used). A resource's own 'name' field is never picked
   * up by the reference rules, so self-references are not a concern.
   */
  function _buildReferenceSet(metadata) {
    const refs = new Set();

    function recordReference(value) {
      if (typeof value !== 'string') return;
      const trimmed = value.trim();
      if (!trimmed) return;
      // Strip any dot path: 'varAccount.Name' -> 'varAccount'.
      const root = trimmed.split('.')[0];
      if (root) refs.add(root);
    }

    function walk(node) {
      if (node === null || node === undefined) return;

      if (typeof node === 'string') {
        // Scan the string for {!ResourceName...} merge fields.
        MERGE_FIELD_REGEX.lastIndex = 0;
        let match;
        while ((match = MERGE_FIELD_REGEX.exec(node)) !== null) {
          recordReference(match[1]);
        }
        return;
      }

      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }

      if (typeof node !== 'object') return;

      for (const [key, value] of Object.entries(node)) {
        // 'targetReference' is a connector pointing to another element, not a
        // resource — exclude explicitly.
        if (key === 'targetReference') {
          // Still recurse in case nested fields contain merge fields, though
          // targetReference is normally a leaf string.
          walk(value);
          continue;
        }

        // Single reference fields: keys ending in 'Reference'.
        if (typeof value === 'string' && key.endsWith('Reference')) {
          recordReference(value);
        }
        // Array reference fields: keys ending in 'References'.
        else if (Array.isArray(value) && key.endsWith('References')) {
          value.forEach((item) => {
            if (typeof item === 'string') recordReference(item);
          });
        }

        // Always recurse — strings still need merge-field scanning, and
        // reference fields can be nested within objects.
        walk(value);
      }
    }

    walk(metadata);
    return refs;
  }

  /**
   * Groups unused resources by display type, preserving the order defined in
   * RESOURCE_TYPES and sorting items alphabetically within each group.
   */
  function _groupByType(unusedResources) {
    const groups = [];

    RESOURCE_TYPES.forEach(({ displayType, displayPlural, metadataKey }) => {
      const items = unusedResources
        .filter((r) => r.metadataKey === metadataKey)
        .sort((a, b) => a.name.localeCompare(b.name));

      if (items.length > 0) {
        groups.push({
          type: displayType,
          typePlural: displayPlural,
          metadataKey,
          count: items.length,
          items
        });
      }
    });

    return groups;
  }

  // --- Public API ---
  return {
    analyse
  };

})();