// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Mark Jones. SF Flow Utility Toolkit.
/**
 * SF Flow Utility Toolkit - Flow Deploy Diff
 *
 * Determines whether an imported flow is functionally identical to a target
 * version already in the org, so the import flow can hard-block a no-op deploy.
 *
 * Both inputs are `.flow-meta.xml` strings (the imported file, and the target
 * version's Metadata run back through FlowXmlConverter.flowMetadataToXml). They
 * pass through an identical canonicalization pipeline, so the comparison is
 * apples-to-apples and free of XML-vs-JSON type ambiguity — everything is text.
 *
 * Canonicalization (agreed ignore list — everything else is a real difference):
 *   - locationX / locationY   — canvas position, cosmetic
 *   - top-level <status>       — deliberately overridden on import
 *   - processMetadataValues    — builder-internal (BuilderType, CanvasMode, …),
 *                                no flow logic; differs across builder versions
 *   - Array ordering           — sibling elements are compared as an unordered
 *                                multiset (sorted by canonical value)
 *   - Explicit End elements    — Winter '27 (API 68.0) Flow Builder saves an
 *                                <ends> entry for every path end, and a connector
 *                                (of any kind) from the last element to it. An
 *                                older export has neither. Both are removed, so
 *                                the same logic compares as identical. A connector
 *                                is removed only when its target is an entry in
 *                                <ends>, never by matching the END_ELEMENT_n name.
 *
 * apiVersion is NOT ignored: it changes run-time behaviour.
 *
 * Dependency-free (uses DOMParser, available in content scripts) and side-effect
 * free, so it can be reasoned about and unit-tested in isolation.
 */

const FlowDeployDiff = (() => {

  // Element names stripped anywhere in the tree before comparison.
  const IGNORED_ANYWHERE = new Set(['locationX', 'locationY', 'processMetadataValues']);
  // Element names stripped only as direct children of the root <Flow>.
  const IGNORED_AT_ROOT = new Set(['status']);

  /**
   * Parses an XML string into a Document, throwing on malformed input.
   * @param {string} xmlString
   * @returns {Document}
   */
  function _parseXml(xmlString) {
    const doc = new DOMParser().parseFromString(String(xmlString), 'application/xml');
    const err = doc.querySelector('parsererror');
    if (err) {
      throw new Error(`Invalid flow XML: ${err.textContent.trim().split('\n')[0]}`);
    }
    if (!doc.documentElement) {
      throw new Error('Invalid flow XML: no root element.');
    }
    return doc;
  }

  /**
   * Returns the trimmed text of a direct child element, or null.
   * @param {Element} el
   * @param {string} localName
   * @returns {string|null}
   */
  function _childText(el, localName) {
    const child = Array.from(el.children).find((c) => c.localName === localName);
    return child ? (child.textContent || '').trim() : null;
  }

  /**
   * Removes explicit End elements (top-level <ends>) and every connector that
   * targets one, in place. A connector is any element whose direct
   * <targetReference> child names an End element: connector, defaultConnector,
   * faultConnector, nextValueConnector, noMoreValuesConnector, timeoutConnector,
   * Decision rule connectors, and any connector type added later.
   *
   * @param {Document} doc
   * @returns {{ends: number, connectors: number}} How many of each were removed.
   */
  function _removeEndElements(doc) {
    const root = doc.documentElement;
    const endEls = Array.from(root.children).filter((c) => c.localName === 'ends');
    const endNames = new Set(endEls.map((el) => _childText(el, 'name')).filter(Boolean));
    endEls.forEach((el) => el.remove());

    let connectors = 0;
    if (endNames.size > 0) {
      const targetRefs = Array.from(root.getElementsByTagName('*'))
        .filter((el) => el.localName === 'targetReference');
      for (const ref of targetRefs) {
        const connector = ref.parentElement;
        if (connector && connector !== root && endNames.has((ref.textContent || '').trim())) {
          connector.remove();
          connectors += 1;
        }
      }
    }
    return { ends: endEls.length, connectors };
  }

  /**
   * Converts a DOM element into a normalized JS value, applying the ignore list.
   * Leaf elements become their trimmed text; element containers become objects
   * keyed by child tag name (repeated tags become arrays).
   *
   * @param {Element} el
   * @param {boolean} isRoot - True for the top-level <Flow> element.
   * @returns {*}
   */
  function _elementToValue(el, isRoot = false) {
    const childEls = Array.from(el.children);

    if (childEls.length === 0) {
      return (el.textContent || '').trim();
    }

    const groups = {};
    for (const child of childEls) {
      const tag = child.localName;
      if (IGNORED_ANYWHERE.has(tag)) continue;
      if (isRoot && IGNORED_AT_ROOT.has(tag)) continue;
      (groups[tag] = groups[tag] || []).push(child);
    }

    const obj = {};
    for (const tag of Object.keys(groups)) {
      const els = groups[tag];
      obj[tag] = els.length === 1
        ? _elementToValue(els[0])
        : els.map((child) => _elementToValue(child));
    }
    return obj;
  }

  /**
   * Deterministic, order-insensitive stringification. Object keys are sorted;
   * array members are sorted by their own canonical string, making arrays an
   * unordered multiset.
   * @param {*} value
   * @returns {string}
   */
  function _stableStringify(value) {
    if (Array.isArray(value)) {
      return '[' + value.map(_stableStringify).sort().join(',') + ']';
    }
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort()
        .map((k) => JSON.stringify(k) + ':' + _stableStringify(value[k]))
        .join(',') + '}';
    }
    return JSON.stringify(value);
  }

  /**
   * Produces the normalized structure for a flow XML string.
   * @param {string} xmlString
   * @returns {Object}
   */
  function _canonicalStruct(xmlString) {
    const doc = _parseXml(xmlString);
    _removeEndElements(doc);
    return _elementToValue(doc.documentElement, true);
  }

  /**
   * Builds a map of "elementType:name" -> canonical string for every named
   * element in the flow, used to summarise which elements differ.
   * @param {Object} struct
   * @returns {Map<string,string>}
   */
  function _namedElementMap(struct) {
    const map = new Map();
    for (const [type, value] of Object.entries(struct)) {
      const items = Array.isArray(value) ? value : [value];
      for (const item of items) {
        if (item && typeof item === 'object' && typeof item.name === 'string') {
          map.set(`${type}:${item.name}`, _stableStringify(item));
        }
      }
    }
    return map;
  }

  /**
   * Summarises the element-level differences between two normalized structures.
   * @param {Object} a - imported
   * @param {Object} b - target
   * @returns {{added:string[], removed:string[], changed:string[]}}
   */
  function _summarise(a, b) {
    const importedMap = _namedElementMap(a);
    const targetMap = _namedElementMap(b);

    const added = [];
    const removed = [];
    const changed = [];

    for (const [key, sig] of importedMap) {
      if (!targetMap.has(key)) added.push(key);
      else if (targetMap.get(key) !== sig) changed.push(key);
    }
    for (const key of targetMap.keys()) {
      if (!importedMap.has(key)) removed.push(key);
    }

    return { added, removed, changed };
  }

  /**
   * Returns a copy of the flow XML without explicit End elements or connectors
   * that target them. Used when deploying into an org older than Winter '27
   * (API 68.0), which rejects <ends>. Removing a connector to an End keeps the
   * same logic: a path with no connector ends there.
   *
   * @param {string} xmlString
   * @returns {{xml: string, ends: number, connectors: number}}
   */
  function stripEndElements(xmlString) {
    const doc = _parseXml(xmlString);
    const removed = _removeEndElements(doc);
    if (removed.ends === 0) return { xml: String(xmlString), ...removed };

    let xml = new XMLSerializer().serializeToString(doc);
    if (!/^\s*<\?xml/.test(xml)) {
      xml = `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
    }
    return { xml, ...removed };
  }

  /**
   * Compares an imported flow XML against a target flow XML.
   *
   * @param {string} importedXml - The imported `.flow-meta.xml` file contents.
   * @param {string} targetXml - The target version rendered as flow XML.
   * @returns {{identical:boolean, summary:{added:string[],removed:string[],changed:string[]}, totalChanges:number}}
   */
  function diffFlows(importedXml, targetXml) {
    const a = _canonicalStruct(importedXml);
    const b = _canonicalStruct(targetXml);

    const identical = _stableStringify(a) === _stableStringify(b);
    const summary = identical
      ? { added: [], removed: [], changed: [] }
      : _summarise(a, b);
    const totalChanges = summary.added.length + summary.removed.length + summary.changed.length;

    return { identical, summary, totalChanges };
  }

  // --- Public API ---
  return {
    diffFlows,
    stripEndElements,
    _canonicalStruct,   // exposed for testing
    _stableStringify    // exposed for testing
  };

})();
