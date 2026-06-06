/**
 * SF Flow Utility Toolkit - Flow Error Dictionary
 *
 * Pure data layer. Contains the full reference catalogue of known Salesforce
 * flow exception codes, their plain-English explanations, causes, and
 * recommended remediations.
 *
 * Consumed by:
 *   - flow-error-translator.js  (parsing + translation at runtime)
 *   - ui/flow-error-modal.js    (Error Dictionary tab rendering)
 *   - features/flow-error-dictionary.js (standalone Setup page tool)
 *
 * Adding a new entry: push a new object into DICTIONARY following the
 * shape below. The translator will automatically pick it up via the
 * `code` or `matchPattern` fields.
 *
 * Entry shape:
 *   code           {string}   Exact Salesforce ExceptionCode string.
 *                             Use '*GENERIC*' for the catch-all fallback.
 *   matchPattern   {RegExp}   Optional. If present, matched against the
 *                             raw fault string when `code` is not found.
 *                             Useful for codes that appear mid-string
 *                             (e.g. cascade errors).
 *   category       {string}   Display category for grouping in the dictionary.
 *   severity       {string}   'high' | 'medium' | 'low'
 *   title          {string}   Short human-readable name for this error type.
 *   description    {string}   Plain-English explanation of what this error is.
 *   causes         {string[]} Common reasons this error occurs in a flow context.
 *   recommendations {string[]} Actionable steps to resolve or prevent the error.
 *   example        {string}   Example of the raw Salesforce fault string.
 *   relatedCodes   {string[]} Other error codes the developer should be aware of.
 */

const FlowErrorDictionary = (() => {

  const CATEGORIES = {
    VALIDATION:    'Validation',
    GOVERNOR:      'Governor Limits',
    DML:           'Data Operations',
    ACCESS:        'Access & Permissions',
    APEX:          'Apex & Actions',
    CASCADE:       'Cascade Failures',
    DUPLICATE:     'Duplicate Rules',
    UNKNOWN:       'Unknown'
  };

  const DICTIONARY = [

    // -------------------------------------------------------------------------
    // VALIDATION ERRORS
    // -------------------------------------------------------------------------

    {
      code: 'FIELD_CUSTOM_VALIDATION_EXCEPTION',
      category: CATEGORIES.VALIDATION,
      severity: 'high',
      title: 'Validation Rule Blocked the Operation',
      description:
        'A validation rule on the object prevented the record from being saved. ' +
        'The flow attempted to create or update a record, but one or more field ' +
        'values did not meet the conditions defined in a validation rule.',
      causes: [
        'A validation rule on the target object evaluated to true, blocking the save.',
        'The flow is not populating a field that the validation rule requires.',
        'The flow is setting a field value that violates a conditional rule (e.g. a ' +
        'picklist value only allowed in certain circumstances).',
        'A validation rule was added or changed after the flow was built, creating ' +
        'a new incompatibility.'
      ],
      recommendations: [
        'Read the error message carefully — the human-readable part after the ' +
        'exception code is the exact message from the validation rule, and tells ' +
        'you which condition failed.',
        'Open the object\'s validation rules in Setup and find the rule whose error ' +
        'message matches. Review the formula to understand what conditions must be met.',
        'Add a fault path to this element. On the fault path, use a Screen element ' +
        'to surface the {!$Flow.FaultMessage} to the user so they understand what ' +
        'went wrong.',
        'Consider whether the flow should pre-validate the data before attempting ' +
        'the DML operation — a Decision element checking the same condition as the ' +
        'validation rule can route users to a corrective screen before the error occurs.',
        'If the flow is a record-triggered flow, ensure it only runs when relevant ' +
        'conditions are met using entry criteria, so it does not attempt to update ' +
        'records that will always fail the validation.'
      ],
      example:
        'The flow tried to update these records: 001XX000003GYkZ. This error occurred: ' +
        'FIELD_CUSTOM_VALIDATION_EXCEPTION: Phone is required for Customer - Direct accounts.. ' +
        'You can look up ExceptionCode values in the SOAP API Developer Guide.',
      relatedCodes: ['REQUIRED_FIELD_MISSING', 'FIELD_INTEGRITY_EXCEPTION']
    },

    {
      code: 'REQUIRED_FIELD_MISSING',
      category: CATEGORIES.VALIDATION,
      severity: 'high',
      title: 'Required Field Not Populated',
      description:
        'The flow attempted to create or update a record without providing a value ' +
        'for a field that is marked as required on the object or page layout. ' +
        'Salesforce rejected the operation because a mandatory field was null or empty.',
      causes: [
        'The flow\'s Create Records or Update Records element does not map a value ' +
        'to a field that is required at the database level.',
        'A field was made required after the flow was built, creating a gap.',
        'The flow uses a variable to populate the field, but the variable was never ' +
        'assigned a value and remained null.',
        'The required field is only relevant in certain scenarios, and the flow ' +
        'does not have conditional logic to handle both cases.'
      ],
      recommendations: [
        'Check the error message — the field name listed after the exception code ' +
        'is the field that was missing.',
        'Open the Create Records or Update Records element and confirm that all ' +
        'required fields for the object are mapped.',
        'Add a null-check Decision element before the DML operation to confirm ' +
        'required variables have values before proceeding.',
        'If the field is conditionally required, add a fault path that routes ' +
        'the user back to a screen where they can provide the missing value.',
        'Review all required fields on the object in Setup → Object Manager to ' +
        'ensure your flow accounts for all of them.'
      ],
      example:
        'The flow tried to create a record. This error occurred: ' +
        'REQUIRED_FIELD_MISSING: Required fields are missing: [Name]. ' +
        'You can look up ExceptionCode values in the SOAP API Developer Guide.',
      relatedCodes: ['FIELD_CUSTOM_VALIDATION_EXCEPTION', 'FIELD_INTEGRITY_EXCEPTION']
    },

    {
      code: 'FIELD_INTEGRITY_EXCEPTION',
      category: CATEGORIES.VALIDATION,
      severity: 'high',
      title: 'Field Integrity Violation',
      description:
        'The value provided for a field violates a data integrity constraint. ' +
        'This is different from a validation rule — it is a structural constraint ' +
        'enforced by Salesforce itself, such as an invalid picklist value, a ' +
        'lookup to a record that does not exist, or a value that conflicts with ' +
        'the field\'s type or relationship rules.',
      causes: [
        'A picklist field is being set to a value that is not in the picklist\'s ' +
        'active value set.',
        'A lookup field is being set to a record ID that no longer exists or ' +
        'belongs to the wrong object.',
        'A currency or number field is receiving a value in the wrong format.',
        'A relationship field is being set in a way that violates the relationship ' +
        'type (e.g. a Master-Detail parent being changed after record creation).'
      ],
      recommendations: [
        'Check the field name in the error message and verify the value the flow ' +
        'is attempting to assign.',
        'For picklist fields, ensure the value being assigned is an active, valid ' +
        'option. Inactive picklist values will cause this error.',
        'For lookup fields, add a Get Records element before the DML to confirm ' +
        'the target record exists before referencing its ID.',
        'Add a fault path to handle this gracefully and surface a meaningful ' +
        'message to the user or administrator.'
      ],
      example:
        'This error occurred: FIELD_INTEGRITY_EXCEPTION: value of type \'Picklist\' ' +
        'is not valid for field Rating. You can look up ExceptionCode values in the ' +
        'SOAP API Developer Guide.',
      relatedCodes: ['FIELD_CUSTOM_VALIDATION_EXCEPTION', 'INVALID_FIELD']
    },

    // -------------------------------------------------------------------------
    // DUPLICATE RULES
    // -------------------------------------------------------------------------

    {
      code: 'DUPLICATES_DETECTED',
      category: CATEGORIES.DUPLICATE,
      severity: 'high',
      title: 'Duplicate Rule Blocked the Operation',
      description:
        'A duplicate rule configured on the object detected that the record being ' +
        'created or updated is a duplicate of an existing record. The rule is set ' +
        'to block — rather than warn — so Salesforce rejected the operation entirely.',
      causes: [
        'The org has a duplicate rule on the target object set to "Block" when ' +
        'duplicates are detected.',
        'The flow is creating records that match existing records by the matching ' +
        'criteria defined in the duplicate rule (e.g. same email address, same name).',
        'The flow does not perform an upsert or pre-check before inserting, so it ' +
        'does not know the record already exists.'
      ],
      recommendations: [
        'Consider using an Upsert operation instead of Create Records, if the ' +
        'record may legitimately already exist.',
        'Add a Get Records element before the Create Records element to check ' +
        'whether a matching record exists, then use a Decision to route accordingly.',
        'Review the duplicate rule in Setup to understand the matching criteria. ' +
        'Ensure the flow\'s data will not inadvertently match existing records.',
        'Add a fault path that catches DUPLICATES_DETECTED and routes the user ' +
        'to a screen explaining that a duplicate was found, with options to view ' +
        'the existing record or proceed anyway if the rule allows it.',
        'If the duplicate rule should not apply in this automated context, consider ' +
        'whether a Duplicate Rule bypass (available in some API contexts) is appropriate.'
      ],
      example:
        'This error occurred: DUPLICATES_DETECTED: Use one of these records?. ' +
        'You can look up ExceptionCode values in the SOAP API Developer Guide.',
      relatedCodes: ['FIELD_CUSTOM_VALIDATION_EXCEPTION']
    },

    // -------------------------------------------------------------------------
    // DML / DATA OPERATION ERRORS
    // -------------------------------------------------------------------------

    {
      code: 'CANNOT_INSERT_UPDATE_ACTIVATE_ENTITY',
      category: CATEGORIES.DML,
      severity: 'high',
      title: 'Trigger or Process on Target Object Failed',
      description:
        'The flow successfully attempted a DML operation, but an Apex trigger, ' +
        'Process Builder process, or another flow on the target object threw an ' +
        'error during execution. The original flow\'s operation was rolled back ' +
        'as a result. This is a cascade failure — the error did not originate in ' +
        'this flow element, but in something triggered by it.',
      causes: [
        'An Apex trigger on the target object contains logic that threw an ' +
        'unhandled exception.',
        'Another flow (record-triggered) on the same object faulted without a ' +
        'fault path, causing the entire transaction to roll back.',
        'A Process Builder process on the target object encountered an error.',
        'An Apex CPU time limit or other governor limit was exceeded by the ' +
        'combined execution of this flow and the triggered code.'
      ],
      recommendations: [
        'Read the full error message carefully — it usually names the trigger, ' +
        'process, or flow that caused the secondary failure.',
        'Investigate the named trigger or flow separately. The fix may be in that ' +
        'component, not in this flow.',
        'Add a fault path to this element so the transaction failure is caught ' +
        'gracefully. The {!$Flow.FaultMessage} will contain the cascade error detail.',
        'If the error originates in an Apex trigger, work with a developer to add ' +
        'proper error handling or conditional logic to the trigger.',
        'Check the Salesforce debug logs for the full execution context to see ' +
        'the complete call stack of what was triggered.'
      ],
      example:
        'The flow tried to update these records: 001XX000003GYkZ. This error occurred: ' +
        'CANNOT_INSERT_UPDATE_ACTIVATE_ENTITY: AccountTrigger: execution of AfterUpdate ' +
        'caused by: System.LimitException: Apex CPU time limit exceeded. ' +
        'You can look up ExceptionCode values in the SOAP API Developer Guide.',
      relatedCodes: ['APEX_CPU_TIME_LIMIT_EXCEEDED', 'TOO_MANY_SOQL_QUERIES']
    },

    {
      code: 'ENTITY_IS_DELETED',
      category: CATEGORIES.DML,
      severity: 'high',
      title: 'Target Record Has Been Deleted',
      description:
        'The flow attempted to update or reference a record that has already been ' +
        'deleted. This typically happens in async or scheduled flows where time ' +
        'passes between when the record ID was captured and when the flow runs.',
      causes: [
        'A scheduled flow or scheduled path ran against a record that was deleted ' +
        'before the flow executed.',
        'The flow stores a record ID in a variable, but the record is deleted ' +
        'between flow interviews.',
        'A Get Records element retrieved an ID that was valid at query time but ' +
        'the record was deleted before the subsequent DML element ran.'
      ],
      recommendations: [
        'Add a fault path to this element to handle the case where the target ' +
        'record no longer exists.',
        'For scheduled flows, add a Get Records element immediately before the ' +
        'DML operation and a Decision to check the record was found before proceeding.',
        'Consider whether the flow\'s entry criteria should exclude records that ' +
        'are likely to be deleted before the scheduled path runs.'
      ],
      example:
        'The flow tried to update these records: 001XX000003GYkZ. This error occurred: ' +
        'ENTITY_IS_DELETED: entity is deleted. ' +
        'You can look up ExceptionCode values in the SOAP API Developer Guide.',
      relatedCodes: ['CANNOT_INSERT_UPDATE_ACTIVATE_ENTITY']
    },

    // -------------------------------------------------------------------------
    // GOVERNOR LIMITS
    // -------------------------------------------------------------------------

    {
      code: 'APEX_CPU_TIME_LIMIT_EXCEEDED',
      category: CATEGORIES.GOVERNOR,
      severity: 'high',
      title: 'Apex CPU Time Limit Exceeded',
      description:
        'The total CPU time consumed by the current transaction — including the ' +
        'flow itself and any Apex code it called or that was triggered by it — ' +
        'exceeded Salesforce\'s limit of 10,000ms (synchronous) or 60,000ms ' +
        '(asynchronous). The entire transaction was rolled back.',
      causes: [
        'The flow calls an Apex action that performs expensive computation.',
        'An Apex trigger on a target object is consuming significant CPU time ' +
        'when the flow\'s DML executes.',
        'The flow has complex formula fields or large collections being processed.',
        'The flow is running inside a transaction that already has significant ' +
        'CPU usage from other processes.'
      ],
      recommendations: [
        'Review any Apex actions called by this flow for performance issues — ' +
        'inefficient SOQL queries, large loops, or string manipulation are common causes.',
        'If the issue is in a trigger on the target object, work with a developer ' +
        'to optimise the trigger\'s logic.',
        'Consider whether the flow can be split into multiple transactions using ' +
        'a Scheduled Path or a Platform Event to break the execution chain.',
        'Reduce the number of elements in any loops within the flow.',
        'Check whether bulk operations are contributing — if many records are ' +
        'processed at once, each adds to the CPU total.'
      ],
      example:
        'The flow tried to update these records. This error occurred: ' +
        'APEX_CPU_TIME_LIMIT_EXCEEDED: ' +
        'You can look up ExceptionCode values in the SOAP API Developer Guide.',
      relatedCodes: ['TOO_MANY_SOQL_QUERIES', 'CANNOT_INSERT_UPDATE_ACTIVATE_ENTITY']
    },

    {
      code: 'TOO_MANY_SOQL_QUERIES',
      category: CATEGORIES.GOVERNOR,
      severity: 'high',
      title: 'Too Many SOQL Queries (Governor Limit)',
      description:
        'The flow (and anything it triggered) issued more than 100 SOQL queries ' +
        'within a single transaction. Salesforce enforces this limit to ensure ' +
        'fair use of shared database resources. The entire transaction was rolled back.',
      causes: [
        'A Get Records element is inside a loop, issuing one query per iteration.',
        'Subflows called from this flow are each issuing their own queries, and ' +
        'the total across all of them exceeded the limit.',
        'Apex triggers on target objects are issuing additional queries inside ' +
        'the same transaction.',
        'The flow queries the same data multiple times when it could query once ' +
        'and store the result in a collection variable.'
      ],
      recommendations: [
        'Move all Get Records elements outside of loops. Query all needed records ' +
        'before the loop starts and filter within a collection variable inside the loop.',
        'Review subflows — each subflow\'s queries count toward the same transaction limit.',
        'Consolidate duplicate queries. If the same object is queried multiple ' +
        'times with similar criteria, combine them into one query returning more fields.',
        'Consider whether some data lookups can be replaced with formula fields ' +
        'or cross-object references rather than explicit Get Records elements.',
        'The Health Check can identify Get Records elements inside loops — run it ' +
        'on this flow to see a full list.'
      ],
      example:
        'Too many SOQL queries: 101. ' +
        'You can look up ExceptionCode values in the SOAP API Developer Guide.',
      relatedCodes: ['TOO_MANY_DML_ROWS', 'APEX_CPU_TIME_LIMIT_EXCEEDED']
    },

    {
      code: 'TOO_MANY_DML_ROWS',
      category: CATEGORIES.GOVERNOR,
      severity: 'high',
      title: 'Too Many DML Rows (Governor Limit)',
      description:
        'The flow attempted to create, update, or delete more than 10,000 records ' +
        'in a single transaction. Salesforce limits the total number of records ' +
        'affected by DML operations across an entire transaction.',
      causes: [
        'A Create Records, Update Records, or Delete Records element is operating ' +
        'on a collection variable containing more than 10,000 records.',
        'Multiple DML elements in the flow are each affecting thousands of records, ' +
        'and their combined total exceeded the limit.',
        'A bulk operation triggered this flow for a large data load, and the flow\'s ' +
        'DML compounds the total row count.'
      ],
      recommendations: [
        'Add entry criteria or filters to reduce the number of records the flow ' +
        'processes in a single run.',
        'Consider batching the operation — a scheduled flow or Apex batch job may ' +
        'be more appropriate for bulk data operations.',
        'Review whether all records in the collection genuinely need to be updated, ' +
        'or whether a more selective filter can reduce the set.',
        'If this flow is record-triggered and fires for bulk imports, consider ' +
        'whether it should be converted to an Apex batch process for large volumes.'
      ],
      example:
        'Too many DML rows: 10001. ' +
        'You can look up ExceptionCode values in the SOAP API Developer Guide.',
      relatedCodes: ['TOO_MANY_DML_STATEMENTS', 'TOO_MANY_SOQL_QUERIES']
    },

    {
      code: 'TOO_MANY_DML_STATEMENTS',
      category: CATEGORIES.GOVERNOR,
      severity: 'high',
      title: 'Too Many DML Statements (Governor Limit)',
      description:
        'The flow (and any code it triggered) issued more than 150 DML statements ' +
        'in a single transaction. Each Create Records, Update Records, or Delete ' +
        'Records element counts as at least one DML statement.',
      causes: [
        'A DML element (Create, Update, or Delete Records) is inside a loop, ' +
        'issuing one DML statement per iteration.',
        'The flow calls multiple subflows each performing their own DML operations.',
        'Apex triggers on target objects are issuing additional DML statements ' +
        'within the same transaction.'
      ],
      recommendations: [
        'Move DML elements outside of loops. Accumulate changes in a collection ' +
        'variable inside the loop, then perform one bulk DML operation after the loop.',
        'The Health Check will flag DML inside loops — this is almost always the ' +
        'root cause when this limit is hit.',
        'Review the total number of DML operations across all elements, subflows, ' +
        'and triggered code in this transaction.'
      ],
      example:
        'Too many DML statements: 151. ' +
        'You can look up ExceptionCode values in the SOAP API Developer Guide.',
      relatedCodes: ['TOO_MANY_DML_ROWS', 'TOO_MANY_SOQL_QUERIES']
    },

    // -------------------------------------------------------------------------
    // ACCESS & PERMISSIONS
    // -------------------------------------------------------------------------

    {
      code: 'INSUFFICIENT_ACCESS_OR_READONLY',
      category: CATEGORIES.ACCESS,
      severity: 'high',
      title: 'Insufficient Access to Perform Operation',
      description:
        'The running user (or the system context in which the flow is executing) ' +
        'does not have the necessary permissions to create, update, or delete the ' +
        'record. This could be an object-level, field-level, or record-level ' +
        'permission issue.',
      causes: [
        'The flow runs in user context and the running user\'s profile or permission ' +
        'set does not grant the required CRUD permission on the object.',
        'Field-Level Security is preventing the flow from writing to a specific field.',
        'The target record is owned by another user and sharing rules do not grant ' +
        'edit access to the running user.',
        'The flow is trying to update a record in a Master-Detail relationship ' +
        'that the running user does not have access to reparent.',
        'A System Administrator has not enabled "Run Flows" permission for the ' +
        'running user\'s profile.'
      ],
      recommendations: [
        'Check the running user\'s profile permissions for the target object — ' +
        'ensure Create, Read, Edit, or Delete is enabled as appropriate.',
        'Review Field-Level Security for any fields the flow writes to.',
        'If the flow should run with elevated permissions regardless of the user, ' +
        'check the flow\'s "Run As" settings — "System Context Without Sharing" may ' +
        'be appropriate for administrative automation flows.',
        'For record-triggered flows, confirm the user whose action triggers the ' +
        'flow has the necessary permissions.',
        'Add a fault path to surface a meaningful error message rather than a ' +
        'generic failure.'
      ],
      example:
        'The flow tried to update these records: 001XX000003GYkZ. This error occurred: ' +
        'INSUFFICIENT_ACCESS_OR_READONLY: ' +
        'You can look up ExceptionCode values in the SOAP API Developer Guide.',
      relatedCodes: ['FIELD_INTEGRITY_EXCEPTION']
    },

    // -------------------------------------------------------------------------
    // APEX & ACTIONS
    // -------------------------------------------------------------------------

    {
      code: 'GENERIC_APEX_EXCEPTION',
      matchPattern: /invocable action|apex class|unhandled exception|system\..*exception/i,
      category: CATEGORIES.APEX,
      severity: 'high',
      title: 'Apex Action Threw an Unhandled Exception',
      description:
        'An Apex class called by the flow as an invocable action threw an exception ' +
        'that was not caught within the Apex code itself. The exception propagated ' +
        'back to the flow and caused the interview to fault.',
      causes: [
        'The Apex invocable method does not have try/catch error handling.',
        'The Apex class encountered an unexpected data condition (null pointer, ' +
        'invalid cast, query returning no results where one was expected).',
        'A governor limit was hit inside the Apex class.',
        'The Apex class depends on external data or a third-party service that ' +
        'was unavailable or returned an unexpected response.'
      ],
      recommendations: [
        'Work with the Apex developer to add proper try/catch handling inside the ' +
        'invocable method, and have it return an error message rather than throw.',
        'Add a fault path to this Action element in the flow so failures are caught ' +
        'and handled gracefully even if the Apex is not updated.',
        'Check the Salesforce debug logs for the full Apex stack trace to identify ' +
        'the exact line and exception type.',
        'Consider whether the Apex action should be made more defensive — validating ' +
        'inputs before processing and handling null/empty cases explicitly.'
      ],
      example:
        'The flow tried to invoke an action. This error occurred: ' +
        'An Apex error occurred: System.NullPointerException: Attempt to de-reference a null object.',
      relatedCodes: ['CANNOT_INSERT_UPDATE_ACTIVATE_ENTITY', 'APEX_CPU_TIME_LIMIT_EXCEEDED']
    },

    // -------------------------------------------------------------------------
    // CASCADE / SUBFLOW FAILURES
    // -------------------------------------------------------------------------

    {
      code: '*CASCADE*',
      matchPattern: /caused by|inner flow|subflow|child flow|another flow/i,
      category: CATEGORIES.CASCADE,
      severity: 'high',
      title: 'Cascade Failure from Another Flow or Process',
      description:
        'This flow failed because another flow, process, or trigger that it ' +
        'called (or that was triggered by its DML operation) encountered an error. ' +
        'The transaction was rolled back as a whole. The root cause is in the ' +
        'called component, not necessarily in this flow\'s own logic.',
      causes: [
        'A Subflow element called a child flow that faulted without a fault path, ' +
        'causing the error to propagate upward.',
        'A DML operation in this flow triggered a record-triggered flow on the ' +
        'target object, and that flow faulted.',
        'An Apex trigger fired by this flow\'s DML threw an unhandled exception.',
        'A Process Builder process on the target object encountered an error.'
      ],
      recommendations: [
        'Read the full error message — it typically names the child flow, trigger, ' +
        'or process that originally failed.',
        'Investigate the named component separately. Open it in Flow Builder or ' +
        'the developer console and look for missing fault paths or logic errors.',
        'Ensure any Subflow elements in this flow have fault paths that catch errors ' +
        'propagated from the child flow.',
        'Add fault paths to all DML elements in this flow so that cascade failures ' +
        'are caught and logged rather than terminating the interview silently.',
        'Consider the chain of automation on the target object — multiple flows, ' +
        'triggers, and processes firing in sequence can be difficult to debug. A ' +
        'Salesforce debug log will show the complete execution chain.'
      ],
      example:
        'The flow tried to update these records. This error occurred: ' +
        'CANNOT_INSERT_UPDATE_ACTIVATE_ENTITY: AnotherFlow: execution of AfterUpdate ' +
        'caused by: The record couldn\'t be saved because it failed to trigger a flow.',
      relatedCodes: ['CANNOT_INSERT_UPDATE_ACTIVATE_ENTITY', 'GENERIC_APEX_EXCEPTION']
    },

    // -------------------------------------------------------------------------
    // CATCH-ALL / UNKNOWN
    // -------------------------------------------------------------------------

    {
      code: '*GENERIC*',
      category: CATEGORIES.UNKNOWN,
      severity: 'medium',
      title: 'Unrecognised Flow Error',
      description:
        'This flow error does not match a known exception code pattern. The raw ' +
        'fault message is shown below. This may be a less common Salesforce ' +
        'exception, an error from an external service, or a new error type not ' +
        'yet in this dictionary.',
      causes: [
        'A less common Salesforce governor limit or platform exception was encountered.',
        'An external service or connected app returned an error that propagated ' +
        'into the flow.',
        'A new Salesforce API version introduced a new exception type.',
        'The error originates in a component (trigger, process, external action) ' +
        'whose error message format is not yet recognised.'
      ],
      recommendations: [
        'Copy the full raw fault message and search the Salesforce Developer ' +
        'documentation or Trailblazer Community for the exact exception code.',
        'Check the SOAP API Developer Guide ExceptionCode reference linked in the ' +
        'error message for the full list of codes.',
        'Add a fault path to this element so future occurrences are caught and ' +
        'logged rather than terminating the interview unexpectedly.',
        'Use the Salesforce debug log to get the full execution context and stack ' +
        'trace for this error.'
      ],
      example: 'This error occurred: [ExceptionCode]: [message].',
      relatedCodes: []
    }

  ];

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Returns the full dictionary as an array.
   * @returns {Object[]}
   */
  function getAll() {
    return DICTIONARY;
  }

  /**
   * Returns all available category strings.
   * @returns {string[]}
   */
  function getCategories() {
    return Object.values(CATEGORIES);
  }

  /**
   * Finds a dictionary entry by exact exception code.
   * Falls back to pattern matching via `matchPattern`, then the catch-all.
   *
   * @param {string} code  - The Salesforce ExceptionCode string.
   * @param {string} [raw] - The raw fault string (used for pattern matching).
   * @returns {Object}     - The matching dictionary entry (never null).
   */
  function findByCode(code, raw = '') {
    // 1. Exact code match (skip special sentinel codes)
    if (code) {
      const exact = DICTIONARY.find(
        (e) => e.code === code && !e.code.startsWith('*')
      );
      if (exact) return exact;
    }

    // 2. Pattern match against raw fault string
    if (raw) {
      const pattern = DICTIONARY.find(
        (e) => e.matchPattern && e.matchPattern.test(raw)
      );
      if (pattern) return pattern;
    }

    // 3. Catch-all
    return DICTIONARY.find((e) => e.code === '*GENERIC*');
  }

  /**
   * Returns entries filtered to a specific category.
   * @param {string} category
   * @returns {Object[]}
   */
  function getByCategory(category) {
    return DICTIONARY.filter(
      (e) => e.category === category && !e.code.startsWith('*')
    );
  }

  /**
   * Simple text search across code, title, description, and causes.
   * @param {string} term
   * @returns {Object[]}
   */
  function search(term) {
    if (!term || !term.trim()) return getAll().filter((e) => !e.code.startsWith('*'));

    const q = term.trim().toLowerCase();

    return DICTIONARY.filter((entry) => {
      if (entry.code.startsWith('*')) return false;
      return (
        entry.code.toLowerCase().includes(q) ||
        entry.title.toLowerCase().includes(q) ||
        entry.description.toLowerCase().includes(q) ||
        (entry.causes || []).some((c) => c.toLowerCase().includes(q))
      );
    });
  }

  return {
    getAll,
    getCategories,
    getByCategory,
    findByCode,
    search,
    CATEGORIES
  };

})();