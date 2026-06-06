/**
 * SF Flow Utility Toolkit - Flow Error Translator
 *
 * Parses a raw Salesforce flow fault string and returns a structured
 * translation object enriched with data from FlowErrorDictionary.
 *
 * Depends on: flow-error-dictionary.js (must be loaded first)
 *
 * Usage:
 *   const result = FlowErrorTranslator.translate(rawFaultString);
 *
 * Returns a TranslationResult:
 *   {
 *     exceptionCode   {string}   The extracted Salesforce ExceptionCode, or 'UNKNOWN'
 *     humanMessage    {string}   The clean human-readable error text, stripped of boilerplate
 *     recordIds       {string[]} Any Salesforce record IDs mentioned in the fault string
 *     isCascade       {boolean}  True if this appears to be a cascade/secondary failure
 *     entry           {Object}   The matching FlowErrorDictionary entry
 *     raw             {string}   The original unmodified fault string
 *   }
 */

const FlowErrorTranslator = (() => {

  // The standard Salesforce boilerplate trailer appended to most fault messages.
  // Used as an anchor to trim the human message.
  const BOILERPLATE_TRAILER = '. You can look up ExceptionCode values in the';

  // Prefix patterns Salesforce uses to introduce the exception code in the fault string.
  const ERROR_OCCURRED_PREFIX = 'This error occurred: ';

  // Pattern to detect the "flow tried to <verb> records" preamble and capture record IDs.
  const RECORD_IDS_PATTERN = /\b([A-Za-z0-9]{15}|[A-Za-z0-9]{18})\b/g;

  // Pattern to detect cascade failure language anywhere in the raw string.
  const CASCADE_PATTERN = /caused by|inner flow|subflow|child flow|another flow|execution of/i;

  // Known exception codes that appear directly in the fault string.
  // Ordered from most specific to least specific so matching is unambiguous.
  const KNOWN_CODES = [
    'FIELD_CUSTOM_VALIDATION_EXCEPTION',
    'REQUIRED_FIELD_MISSING',
    'FIELD_INTEGRITY_EXCEPTION',
    'DUPLICATES_DETECTED',
    'CANNOT_INSERT_UPDATE_ACTIVATE_ENTITY',
    'ENTITY_IS_DELETED',
    'APEX_CPU_TIME_LIMIT_EXCEEDED',
    'TOO_MANY_SOQL_QUERIES',
    'TOO_MANY_DML_ROWS',
    'TOO_MANY_DML_STATEMENTS',
    'INSUFFICIENT_ACCESS_OR_READONLY',
    'INSUFFICIENT_ACCESS',
    'INVALID_FIELD',
    'INVALID_TYPE',
    'INVALID_SESSION_ID'
  ];

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Translates a raw Salesforce flow fault string into a structured result.
   *
   * @param {string} rawFaultString  The text content of the Salesforce debug
   *                                 error container, exactly as rendered.
   * @returns {TranslationResult}
   */
  function translate(rawFaultString) {
    const raw = (rawFaultString || '').trim();

    const exceptionCode = _extractExceptionCode(raw);
    const humanMessage  = _extractHumanMessage(raw, exceptionCode);
    const recordIds     = _extractRecordIds(raw);
    const isCascade     = _detectCascade(raw);

    const entry = FlowErrorDictionary.findByCode(exceptionCode, raw);

    return {
      exceptionCode,
      humanMessage,
      recordIds,
      isCascade,
      entry,
      raw
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Attempts to extract the Salesforce ExceptionCode from the raw fault string.
   *
   * Strategy:
   *   1. Look for the "This error occurred: " prefix, then extract the token
   *      before the first ': ' following it.
   *   2. Scan the string for any known exception code token.
   *   3. Return 'UNKNOWN' if neither matches.
   *
   * @param {string} raw
   * @returns {string}
   */
  function _extractExceptionCode(raw) {
    // Strategy 1: Standard "This error occurred: EXCEPTION_CODE: message" structure.
    const prefixIdx = raw.indexOf(ERROR_OCCURRED_PREFIX);
    if (prefixIdx !== -1) {
      const afterPrefix = raw.slice(prefixIdx + ERROR_OCCURRED_PREFIX.length);
      const colonIdx = afterPrefix.indexOf(': ');
      if (colonIdx !== -1) {
        const candidate = afterPrefix.slice(0, colonIdx).trim();
        // Validate it looks like a Salesforce exception code:
        // all-caps, underscores allowed, no spaces.
        if (/^[A-Z_]{3,}$/.test(candidate)) {
          return candidate;
        }
      }
    }

    // Strategy 2: Scan for any known code anywhere in the string.
    for (const code of KNOWN_CODES) {
      if (raw.includes(code)) return code;
    }

    // Strategy 3: Generic _EXCEPTION pattern (catches less common codes).
    const exceptionMatch = raw.match(/([A-Z_]+_EXCEPTION)/);
    if (exceptionMatch) return exceptionMatch[1];

    return 'UNKNOWN';
  }

  /**
   * Extracts the human-readable error message from the raw fault string,
   * stripping the Salesforce boilerplate prefix and trailer.
   *
   * For known exception codes, extracts the text between "EXCEPTION_CODE: "
   * and the boilerplate trailer.
   *
   * For unknown codes, extracts everything after "This error occurred: "
   * up to the trailer (or end of string).
   *
   * @param {string} raw
   * @param {string} exceptionCode
   * @returns {string}
   */
  function _extractHumanMessage(raw, exceptionCode) {
    // If we have a code, look for "EXCEPTION_CODE: <message>" pattern.
    if (exceptionCode && exceptionCode !== 'UNKNOWN') {
      const codeMarker = exceptionCode + ': ';
      const codeIdx = raw.indexOf(codeMarker);

      if (codeIdx !== -1) {
        const afterCode = raw.slice(codeIdx + codeMarker.length);
        return _trimTrailer(afterCode);
      }
    }

    // Fallback: extract everything after "This error occurred: ".
    const prefixIdx = raw.indexOf(ERROR_OCCURRED_PREFIX);
    if (prefixIdx !== -1) {
      const afterPrefix = raw.slice(prefixIdx + ERROR_OCCURRED_PREFIX.length);
      return _trimTrailer(afterPrefix);
    }

    // Last resort: return the raw string with only the trailer stripped.
    return _trimTrailer(raw);
  }

  /**
   * Strips the Salesforce boilerplate trailer and any trailing punctuation.
   * Handles the double-period quirk (validation rule message ends with '.'
   * and Salesforce appends its own '.').
   *
   * @param {string} text
   * @returns {string}
   */
  function _trimTrailer(text) {
    const trailerIdx = text.indexOf(BOILERPLATE_TRAILER);
    const trimmed = trailerIdx !== -1 ? text.slice(0, trailerIdx) : text;

    // Strip any trailing double-period artefact and trim whitespace.
    return trimmed.replace(/\.{2,}$/, '.').trim();
  }

  /**
   * Extracts any Salesforce record IDs mentioned in the fault string.
   * Returns a deduplicated array.
   *
   * @param {string} raw
   * @returns {string[]}
   */
  function _extractRecordIds(raw) {
    const matches = raw.match(RECORD_IDS_PATTERN) || [];
    const ids = matches.filter(_looksLikeSalesforceId);
    return [...new Set(ids)];
  }

  /**
   * Detects whether the fault appears to be a cascade failure from a called
   * component rather than an error originating in this flow element.
   *
   * @param {string} raw
   * @returns {boolean}
   */
  function _detectCascade(raw) {
    return CASCADE_PATTERN.test(raw);
  }

  /**
   * Lightweight Salesforce ID validity check — mirrors the logic in
   * flow-health-rules.js to stay consistent.
   *
   * @param {string} value
   * @returns {boolean}
   */
  function _looksLikeSalesforceId(value) {
    if (typeof value !== 'string') return false;
    const t = value.trim();
    if (!/^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(t)) return false;
    if (!/\d/.test(t)) return false;
    if (!/[A-Z]/.test(t)) return false;
    return true;
  }

  return {
    translate
  };

})();