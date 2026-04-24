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
  const API_VERSION = 'v62.0';
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
      const orgPart = hostname.replace('.salesforce-setup.com', '');
      return `https://${orgPart}.my.salesforce.com`;
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

  async function toolingQuery(soql) {
    return apiGet(`/services/data/${API_VERSION}/tooling/query`, { q: soql });
  }

  async function getFlowMetadata(flowId) {
    console.log('[SFUT API] Fetching flow metadata for:', flowId);

    const result = await toolingQuery(
      `SELECT Id, Definition.DeveloperName, FullName, Metadata, ` +
      `MasterLabel, Description, ProcessType, Status ` +
      `FROM Flow WHERE DefinitionId = '${flowId}' ` +
      `ORDER BY VersionNumber DESC LIMIT 1`
    );

    if (!result.records || result.records.length === 0) {
      const directResult = await toolingQuery(
        `SELECT Id, Definition.DeveloperName, FullName, Metadata, ` +
        `MasterLabel, Description, ProcessType, Status ` +
        `FROM Flow WHERE Id = '${flowId}' LIMIT 1`
      );

      if (!directResult.records || directResult.records.length === 0) {
        throw new Error(`No flow found for ID: ${flowId}`);
      }

      return directResult.records[0];
    }

    return result.records[0];
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
    toolingQuery,
    getFlowMetadata,
    getFlowIdFromUrl,
    clearSessionCache
  };
})();