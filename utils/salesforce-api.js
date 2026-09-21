/**
 * SF Flow Utility Toolkit - Salesforce API Utility
 *
 * Robust Salesforce auth strategy for Flow Builder:
 * - Read HttpOnly "sid" via chrome.cookies (background service worker)
 * - Try Tooling API calls on BOTH:
 *    1) current origin (lightning.force.com / salesforce-setup.com)
 *    2) mapped my.salesforce.com host
 * - Use whichever host+sid combination Salesforce accepts.
 *
 * Updated:
 * - Hardened runtime messaging with timeout + safe resolution to prevent:
 *   "A listener indicated an asynchronous response by returning true, but the message channel closed..."
 * - Retains generic request helpers for non-GET API calls
 * - Removes updateFlowMetadata() because Missing Description Manager should not persist Flow metadata directly
 * - Improves error reporting so non-401 API failures are surfaced clearly
 */

const SalesforceAPI = (() => {
  const API_VERSION = 'v67.0';
  let _sessionCache = null; // { candidates: Array<{baseUrl, sid}> }

  // ---------
  // Messaging
  // ---------

  /**
   * Sends a message to the extension service worker safely:
   * - Never throws
   * - Resolves even if the channel closes or background doesn't respond
   * - Applies a timeout so callers never hang forever
   *
   * @param {any} payload
   * @param {number} timeoutMs
   * @returns {Promise<any>} response-like object
   */
  function _sendMessageSafe(payload, timeoutMs = 4000) {
    return new Promise((resolve) => {
      let done = false;

      const finish = (resp) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(resp);
      };

      const timer = setTimeout(() => {
        finish({ ok: false, error: 'Timeout waiting for background response' });
      }, timeoutMs);

      try {
        chrome.runtime.sendMessage(payload, (resp) => {
          if (chrome.runtime.lastError) {
            finish({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          finish(resp ?? { ok: false, error: 'No response' });
        });
      } catch (e) {
        finish({ ok: false, error: String(e?.message || e) });
      }
    });
  }

  // ------------
  // URL handling
  // ------------

  function _mapToMySalesforceBaseUrl() {
    const hostname = window.location.hostname;

    if (hostname.includes('.lightning.force.com')) {
      const orgPart = hostname.replace('.lightning.force.com', '');
      return `https://${orgPart}.my.salesforce.com`;
    }

    if (hostname.includes('.salesforce-setup.com')) {
      // Setup domains are already "<myDomain>.my.salesforce-setup.com", so the
      // core API host is the same host with ".salesforce-setup.com" swapped for
      // ".salesforce.com" — NOT strip-and-append ".my.salesforce.com", which
      // would double the ".my." (e.g. ...develop.my.my.salesforce.com) and
      // yield a dead host with no sid cookie. This matters for the multipart
      // metadata deploy, which the Setup proxy host rejects.
      return `https://${hostname.replace('.salesforce-setup.com', '.salesforce.com')}`;
    }

    if (hostname.includes('.my.salesforce.com')) {
      return `https://${hostname}`;
    }

    return null;
  }

  async function _getSidMapForUrls(urls) {
    const resp = await _sendMessageSafe({ action: 'getSidForUrls', urls }, 5000);

    if (!resp?.ok) {
      console.warn('[SFUT API] getSidForUrls failed:', resp?.error);
      return {};
    }

    return resp?.sids || {};
  }

  function _maybeDecodeSid(sid) {
    try {
      return sid.includes('%') ? decodeURIComponent(sid) : sid;
    } catch {
      return sid;
    }
  }

  // ----------------
  // Session + Fetch
  // ----------------

  async function getSession() {
    if (_sessionCache?.candidates?.length) return _sessionCache;

    const currentBase = window.location.origin;
    const mysfBase = _mapToMySalesforceBaseUrl();

    // Prefer .my.salesforce.com first — it reliably accepts REST API calls.
    // The lightning.force.com domain often returns 401 for API requests.
    const baseUrls = [mysfBase, currentBase].filter((v, i, a) => v && a.indexOf(v) === i);

    const sidMap = await _getSidMapForUrls(baseUrls);

    const candidates = baseUrls
      .map((baseUrl) => {
        const sid = sidMap[baseUrl];
        return sid ? { baseUrl, sid: _maybeDecodeSid(sid) } : null;
      })
      .filter(Boolean);

    if (candidates.length === 0) {
      console.error('[SFUT API] No sid cookie found for any candidate hosts:', baseUrls);
      return null;
    }

    _sessionCache = { candidates };
    console.log(
      '[SFUT API] Session candidates:',
      candidates.map(c => ({ baseUrl: c.baseUrl, sidLen: c.sid.length }))
    );

    return _sessionCache;
  }

  function clearSessionCache() {
    _sessionCache = null;
  }

  async function apiGet(endpoint, params = {}, retryOn401 = true) {
    if (!endpoint || typeof endpoint !== 'string' || !endpoint.startsWith('/')) {
      throw new Error(`apiGet: endpoint must start with "/". Got: ${endpoint}`);
    }

    const session = await getSession();
    if (!session) throw new Error('No Salesforce session available');

    const queryString = Object.keys(params).length > 0
      ? '?' + new URLSearchParams(params).toString()
      : '';

    const lastErrors = [];

    for (const { baseUrl, sid } of session.candidates) {
      const url = `${baseUrl}${endpoint}${queryString}`;
      console.log('[SFUT API] GET (candidate):', url);

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${sid}`,
            'Accept': 'application/json'
          }
        });

        if (response.ok) {
          return response.json();
        }

        const errorText = await response.text();
        if (response.status === 401) {
          console.debug(`[SFUT API] HTTP 401 (${baseUrl}) — trying next candidate.`);
        } else {
          console.error(`[SFUT API] HTTP ${response.status} (${baseUrl}):`, errorText);
        }
        lastErrors.push({ baseUrl, status: response.status, errorText });
      } catch (e) {
        console.error(`[SFUT API] Network error (${baseUrl}):`, e);
        lastErrors.push({ baseUrl, status: 0, errorText: String(e?.message || e) });
      }
    }

    const hasNon401Failure = lastErrors.some(e => e.status >= 400 && e.status !== 401);

    if (retryOn401 && lastErrors.some(e => e.status === 401) && !hasNon401Failure) {
      console.warn('[SFUT API] All candidates returned 401. Clearing cache and retrying once...');
      clearSessionCache();
      return apiGet(endpoint, params, false);
    }

    const primaryError =
      lastErrors.find(e => e.status >= 400 && e.status !== 401) ||
      lastErrors[0];

    const summary = lastErrors.map(e => `${e.baseUrl} -> ${e.status}`).join(', ');
    throw new Error(
      `Salesforce API error: ${primaryError.baseUrl} -> ${primaryError.status}. ` +
      `Details: ${primaryError.errorText}. All results: ${summary}`
    );
  }

  async function apiRequest(method, endpoint, body = null, retryOn401 = true) {
    if (!endpoint || typeof endpoint !== 'string' || !endpoint.startsWith('/')) {
      throw new Error(`apiRequest: endpoint must start with "/". Got: ${endpoint}`);
    }

    const session = await getSession();
    if (!session) throw new Error('No Salesforce session available');

    const lastErrors = [];

    for (const { baseUrl, sid } of session.candidates) {
      const url = `${baseUrl}${endpoint}`;
      console.log(`[SFUT API] ${method} (candidate):`, url);

      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Authorization': `Bearer ${sid}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: body ? JSON.stringify(body) : undefined
        });

        if (response.ok) {
          if (response.status === 204) {
            return null;
          }

          const text = await response.text();
          return text ? JSON.parse(text) : null;
        }

        const errorText = await response.text();
        if (response.status === 401) {
          console.debug(`[SFUT API] HTTP 401 (${baseUrl}) — trying next candidate.`);
        } else {
          console.error(`[SFUT API] HTTP ${response.status} (${baseUrl}):`, errorText);
        }
        lastErrors.push({ baseUrl, status: response.status, errorText });
      } catch (e) {
        console.error(`[SFUT API] Network error (${baseUrl}):`, e);
        lastErrors.push({ baseUrl, status: 0, errorText: String(e?.message || e) });
      }
    }

    const hasNon401Failure = lastErrors.some(e => e.status >= 400 && e.status !== 401);

    if (retryOn401 && lastErrors.some(e => e.status === 401) && !hasNon401Failure) {
      console.warn('[SFUT API] All candidates returned 401. Clearing cache and retrying once...');
      clearSessionCache();
      return apiRequest(method, endpoint, body, false);
    }

    const primaryError =
      lastErrors.find(e => e.status >= 400 && e.status !== 401) ||
      lastErrors[0];

    const summary = lastErrors.map(e => `${e.baseUrl} -> ${e.status}`).join(', ');
    throw new Error(
      `Salesforce API error: ${primaryError.baseUrl} -> ${primaryError.status}. ` +
      `Details: ${primaryError.errorText}. All results: ${summary}`
    );
  }

  async function apiPatch(endpoint, body) {
    return apiRequest('PATCH', endpoint, body);
  }

  /**
   * Sends a multipart POST, retaining the candidate-host + Bearer sid pattern.
   *
   * Two body modes:
   *  - Hand-built body (a Blob/ArrayBuffer/string) WITH an explicit `contentType`
   *    ("multipart/form-data; boundary=..."): the header is set exactly so the
   *    declared boundary matches the body bytes. This is what the Metadata REST
   *    deployRequest endpoint needs — the browser's own FormData serialization
   *    is rejected by Salesforce with INVALID_MULTIPART_REQUEST.
   *  - A FormData body with `contentType` omitted: the browser sets
   *    `multipart/form-data` and the boundary itself.
   *
   * @param {string} endpoint - Must start with "/".
   * @param {Blob|FormData|ArrayBuffer|string} body - The request body.
   * @param {string|null} contentType - Explicit Content-Type, or null to let the browser set it.
   * @param {boolean} retryOn401
   * @returns {Promise<any>} Parsed JSON response (or null for empty bodies).
   */
  async function apiPostMultipart(endpoint, body, contentType = null, retryOn401 = true) {
    if (!endpoint || typeof endpoint !== 'string' || !endpoint.startsWith('/')) {
      throw new Error(`apiPostMultipart: endpoint must start with "/". Got: ${endpoint}`);
    }

    const session = await getSession();
    if (!session) throw new Error('No Salesforce session available');

    const lastErrors = [];

    for (const { baseUrl, sid } of session.candidates) {
      const url = `${baseUrl}${endpoint}`;
      console.log('[SFUT API] POST multipart (candidate):', url);

      try {
        const headers = {
          'Authorization': `Bearer ${sid}`,
          'Accept': 'application/json'
        };
        // Set Content-Type only for a hand-built body, so the boundary matches
        // exactly. For a FormData body, the browser must set it (with boundary).
        if (contentType) headers['Content-Type'] = contentType;

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body
        });

        if (response.ok) {
          const text = await response.text();
          return text ? JSON.parse(text) : null;
        }

        const errorText = await response.text();
        if (response.status === 401) {
          console.debug(`[SFUT API] HTTP 401 (${baseUrl}) — trying next candidate.`);
        } else {
          console.error(`[SFUT API] HTTP ${response.status} (${baseUrl}):`, errorText);
        }
        lastErrors.push({ baseUrl, status: response.status, errorText });
      } catch (e) {
        console.error(`[SFUT API] Network error (${baseUrl}):`, e);
        lastErrors.push({ baseUrl, status: 0, errorText: String(e?.message || e) });
      }
    }

    const hasNon401Failure = lastErrors.some(e => e.status >= 400 && e.status !== 401);

    if (retryOn401 && lastErrors.some(e => e.status === 401) && !hasNon401Failure) {
      console.warn('[SFUT API] All candidates returned 401. Clearing cache and retrying once...');
      clearSessionCache();
      return apiPostMultipart(endpoint, body, contentType, false);
    }

    const primaryError =
      lastErrors.find(e => e.status >= 400 && e.status !== 401) ||
      lastErrors[0];

    const summary = lastErrors.map(e => `${e.baseUrl} -> ${e.status}`).join(', ');
    throw new Error(
      `Salesforce API error: ${primaryError.baseUrl} -> ${primaryError.status}. ` +
      `Details: ${primaryError.errorText}. All results: ${summary}`
    );
  }

  async function toolingQuery(soql) {
    return apiGet(`/services/data/${API_VERSION}/tooling/query`, { q: soql });
  }

  /**
   * Runs a standard SOQL query via the REST API (not Tooling).
   * Use this for sObjects like FlowDefinitionView that are not available
   * in the Tooling API.
   * @param {string} soql
   */
  async function restQuery(soql) {
    return apiGet(`/services/data/${API_VERSION}/query`, { q: soql });
  }

  async function getFlowMetadata(flowId) {
    console.log('[SFUT API] Fetching flow metadata for:', flowId);

    // The URL "flowId" parameter is not always a Salesforce record ID.
    // For some flows (notably Service Cloud templates such as
    // "SvcCopilotTmpl__ResetPassword-1") the URL carries the Flow FullName
    // ({Namespace__}{DeveloperName}-{VersionNumber}) instead. Putting a
    // FullName into `WHERE DefinitionId = '...'` produces a Salesforce 400
    // INVALID_QUERY_FILTER_OPERATOR ("invalid ID field"). Detect the shape
    // of the identifier and route to the right query.
    // A Salesforce record ID is exactly 15 or 18 alphanumeric characters.
    const escaped = String(flowId).replace(/'/g, "\\'");
    const looksLikeSalesforceId = /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(flowId);

    if (!looksLikeSalesforceId) {
      const fullNameResult = await toolingQuery(
        `SELECT Id, Definition.DeveloperName, FullName, Metadata, ` +
        `MasterLabel, Description, ProcessType, Status ` +
        `FROM Flow WHERE FullName = '${escaped}' LIMIT 1`
      );

      if (!fullNameResult.records || fullNameResult.records.length === 0) {
        throw new Error(`No flow found for FullName: ${flowId}`);
      }

      return fullNameResult.records[0];
    }

    const result = await toolingQuery(
      `SELECT Id, Definition.DeveloperName, FullName, Metadata, ` +
      `MasterLabel, Description, ProcessType, Status ` +
      `FROM Flow WHERE DefinitionId = '${escaped}' ` +
      `ORDER BY VersionNumber DESC LIMIT 1`
    );

    if (!result.records || result.records.length === 0) {
      const directResult = await toolingQuery(
        `SELECT Id, Definition.DeveloperName, FullName, Metadata, ` +
        `MasterLabel, Description, ProcessType, Status ` +
        `FROM Flow WHERE Id = '${escaped}' LIMIT 1`
      );

      if (!directResult.records || directResult.records.length === 0) {
        throw new Error(`No flow found for ID: ${flowId}`);
      }

      return directResult.records[0];
    }

    return result.records[0];
  }

  /**
   * Lists all versions of a Flow by its Definition DeveloperName, newest first.
   * Used by the import flow to locate an existing Flow and resolve which version
   * to compare an imported file against.
   *
   * @param {string} developerName - The Flow's Definition.DeveloperName (no namespace, no version).
   * @returns {Promise<Array<{Id,VersionNumber,Status,MasterLabel,ProcessType}>>}
   */
  async function getFlowVersions(developerName) {
    const escaped = String(developerName).replace(/'/g, "\\'");
    const result = await toolingQuery(
      `SELECT Id, VersionNumber, Status, MasterLabel, ProcessType ` +
      `FROM Flow WHERE Definition.DeveloperName = '${escaped}' ` +
      `ORDER BY VersionNumber DESC`
    );
    return result.records || [];
  }

  /**
   * Fetches a single Flow version's full metadata by its version record Id
   * (queries by Id directly, avoiding the DefinitionId-first path of
   * getFlowMetadata). Used to retrieve the compare-target for the import diff.
   *
   * @param {string} versionId - A Flow version record Id.
   * @returns {Promise<Object>} The Tooling API Flow record (incl. Metadata).
   */
  async function getFlowMetadataByVersionId(versionId) {
    const escaped = String(versionId).replace(/'/g, "\\'");
    const result = await toolingQuery(
      `SELECT Id, Definition.DeveloperName, FullName, Metadata, ` +
      `MasterLabel, Description, ProcessType, Status, VersionNumber ` +
      `FROM Flow WHERE Id = '${escaped}' LIMIT 1`
    );

    if (!result.records || result.records.length === 0) {
      throw new Error(`No flow version found for Id: ${versionId}`);
    }

    return result.records[0];
  }

  /**
   * Deploys a metadata ZIP via the Metadata REST deployRequest endpoint.
   *
   * @param {Blob} zipBlob - The deploy package ZIP (package.xml + flows/*.flow).
   * @param {Object} [deployOptions] - Overrides merged over sensible defaults.
   * @returns {Promise<Object>} The deployRequest representation (includes `id`).
   */
  async function deployMetadata(zipBlob, deployOptions = {}) {
    const options = {
      singlePackage: true,
      rollbackOnError: true,
      checkOnly: false,
      ...deployOptions
    };

    // The deployRequest endpoint needs two multipart parts (per the Metadata
    // REST docs / jsforce convention): a "json" part with the deployOptions
    // descriptor (application/json) and a "file" part with the package ZIP
    // (application/zip, filename deploy.zip).
    //
    // We build the multipart body by hand with our own boundary rather than
    // using FormData: Salesforce rejects the browser's FormData serialization
    // with INVALID_MULTIPART_REQUEST. A hand-built body lets us emit byte-exact,
    // RFC-2046 multipart with a boundary that matches the Content-Type header.
    const boundary = '----SFUTFormBoundary' + Date.now().toString(16) +
      Math.random().toString(16).slice(2, 10);
    const CRLF = '\r\n';

    const preamble =
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="json"${CRLF}` +
      `Content-Type: application/json${CRLF}${CRLF}` +
      JSON.stringify({ deployOptions: options }) + CRLF +
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="file"; filename="deploy.zip"${CRLF}` +
      `Content-Type: application/zip${CRLF}${CRLF}`;

    const epilogue = `${CRLF}--${boundary}--${CRLF}`;

    // Assemble: text preamble + raw zip bytes + text epilogue. The Blob
    // constructor UTF-8-encodes the string parts and preserves the zip bytes.
    const zipBuffer = await zipBlob.arrayBuffer();
    const contentType = `multipart/form-data; boundary=${boundary}`;
    const body = new Blob([preamble, zipBuffer, epilogue], { type: contentType });

    return apiPostMultipart(
      `/services/data/${API_VERSION}/metadata/deployRequest`,
      body,
      contentType
    );
  }

  /**
   * Polls the status of an async metadata deploy.
   *
   * @param {string} deployRequestId - The `id` returned by deployMetadata().
   * @returns {Promise<Object>} The deployRequest representation (incl. deployResult).
   */
  async function getDeployStatus(deployRequestId) {
    const id = encodeURIComponent(String(deployRequestId));
    return apiGet(
      `/services/data/${API_VERSION}/metadata/deployRequest/${id}`,
      { includeDetails: 'true' }
    );
  }

  function getFlowIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('flowId') || null;
  }

  return {
    getSession,
    apiGet,
    apiRequest,
    apiPatch,
    apiPostMultipart,
    toolingQuery,
    restQuery,
    getFlowMetadata,
    getFlowVersions,
    getFlowMetadataByVersionId,
    deployMetadata,
    getDeployStatus,
    getFlowIdFromUrl,
    clearSessionCache
  };
})();