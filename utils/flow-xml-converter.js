/**
 * SF Flow Utility Toolkit - Flow XML Converter
 *
 * Converts a Salesforce Flow's Tooling-API `Metadata` JSON object into a
 * Metadata-API `.flow-meta.xml` document (and back, in later phases).
 *
 * The Tooling API returns `Flow.Metadata` as a nested JSON object whose shape
 * mirrors the Metadata API `Flow` type. Converting it faithfully means:
 *   - Each object key becomes an XML element.
 *   - Arrays become repeated sibling elements sharing the key name.
 *   - Booleans render as `true` / `false`; numbers render verbatim.
 *   - `null` / `undefined` values are skipped entirely (Salesforce omits them).
 *   - Text content is XML-escaped.
 *
 * Element ordering is preserved from the source JSON, which Salesforce returns
 * in a stable, schema-consistent order. The document is wrapped in the standard
 * `<Flow xmlns="http://soap.sforce.com/2006/04/metadata">` root, matching what
 * `sfdx force:source:retrieve` / the Metadata API produce.
 *
 * This module is dependency-free and side-effect free so it can be unit-reasoned
 * about in isolation and reused by both the export and (later) import paths.
 */

const FlowXmlConverter = (() => {

  const FLOW_NAMESPACE = 'http://soap.sforce.com/2006/04/metadata';
  const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';
  const INDENT_UNIT = '    '; // 4 spaces, matching Salesforce source-format output

  /**
   * Escapes a string for safe inclusion as XML text content or attribute value.
   * @param {string} value
   * @returns {string}
   */
  function _escapeXml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Renders a primitive JSON value as its XML text representation.
   * @param {*} value
   * @returns {string}
   */
  function _primitiveToText(value) {
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(value);
    return _escapeXml(value);
  }

  /**
   * Returns true for values Salesforce omits from serialised metadata.
   * @param {*} value
   * @returns {boolean}
   */
  function _isOmitted(value) {
    return value === null || value === undefined;
  }

  /**
   * Converts a single key/value pair into one or more XML element strings.
   * Arrays expand into repeated sibling elements; objects recurse.
   *
   * @param {string} key   - Element tag name.
   * @param {*} value       - JSON value.
   * @param {number} depth  - Current indentation depth.
   * @returns {string[]} Array of rendered line-blocks (already newline-joined).
   */
  function _renderElement(key, value, depth) {
    if (_isOmitted(value)) return [];

    // Arrays: one element per item, sharing the key name.
    if (Array.isArray(value)) {
      const blocks = [];
      for (const item of value) {
        blocks.push(..._renderElement(key, item, depth));
      }
      return blocks;
    }

    const pad = INDENT_UNIT.repeat(depth);

    // Objects: nested block. An empty object renders as a self-closing element.
    if (typeof value === 'object') {
      const childKeys = Object.keys(value);
      const childLines = [];
      for (const childKey of childKeys) {
        childLines.push(..._renderElement(childKey, value[childKey], depth + 1));
      }

      if (childLines.length === 0) {
        return [`${pad}<${key}/>`];
      }

      return [`${pad}<${key}>\n${childLines.join('\n')}\n${pad}</${key}>`];
    }

    // Primitives: single inline element. Empty strings render as <key></key>.
    return [`${pad}<${key}>${_primitiveToText(value)}</${key}>`];
  }

  /**
   * Converts a Flow `Metadata` JSON object into a full `.flow-meta.xml` document.
   *
   * @param {Object} metadata - The `Metadata` object from a Tooling API Flow record.
   * @returns {string} A well-formed `.flow-meta.xml` document string.
   */
  function flowMetadataToXml(metadata) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      throw new Error('flowMetadataToXml: expected a Flow Metadata object.');
    }

    const bodyLines = [];
    for (const key of Object.keys(metadata)) {
      bodyLines.push(..._renderElement(key, metadata[key], 1));
    }

    const body = bodyLines.length > 0 ? `\n${bodyLines.join('\n')}\n` : '\n';

    return `${XML_DECLARATION}\n<Flow xmlns="${FLOW_NAMESPACE}">${body}</Flow>\n`;
  }

  /**
   * Builds a Metadata API `package.xml` manifest for deploying a single Flow.
   *
   * @param {string} developerName - The Flow's API name (a single Flow member).
   * @param {string} [apiVersion='67.0'] - Numeric API version, no leading "v".
   * @returns {string} A well-formed package.xml document string.
   */
  function buildFlowPackageXml(developerName, apiVersion = '67.0') {
    const member = _escapeXml(developerName);
    const version = _escapeXml(apiVersion);
    return (
      `${XML_DECLARATION}\n` +
      `<Package xmlns="${FLOW_NAMESPACE}">\n` +
      `${INDENT_UNIT}<types>\n` +
      `${INDENT_UNIT}${INDENT_UNIT}<members>${member}</members>\n` +
      `${INDENT_UNIT}${INDENT_UNIT}<name>Flow</name>\n` +
      `${INDENT_UNIT}</types>\n` +
      `${INDENT_UNIT}<version>${version}</version>\n` +
      `</Package>\n`
    );
  }

  // --- Public API ---
  return {
    flowMetadataToXml,
    buildFlowPackageXml,
    _escapeXml // exposed for reuse by later phases
  };

})();
