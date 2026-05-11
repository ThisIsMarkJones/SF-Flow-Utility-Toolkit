/**
 * SF Flow Utility Toolkit - Background Service Worker
 * Robust messaging: always responds, always returns true.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message?.action) {
        case 'openSettings': {
          chrome.runtime.openOptionsPage();
          return { ok: true };
        }

        case 'getSidForUrls': {
          const urls = Array.isArray(message.urls) ? message.urls : [];
          if (!urls.length) return { ok: false, sids: {}, error: 'No urls provided' };

          const getSid = (url) =>
            new Promise((resolve) => {
              chrome.cookies.get({ url, name: 'sid' }, (cookie) => resolve(cookie?.value || null));
            });

          const entries = await Promise.all(urls.map(async (url) => [url, await getSid(url)]));
          return { ok: true, sids: Object.fromEntries(entries) };
        }

        /**
         * Preferred resolver:
         * Open a temporary inactive tab on the exact API host, wait for it to load,
         * execute the SOQL query inside that tab's page context, then close it.
         *
         * message: {
         *   action: 'resolveAppDurableIdViaTemporaryOrgTab',
         *   apiHostname: '<org>.my.salesforce.com',
         *   developerName: 'FlowsApp'
         * }
         */
        case 'resolveAppDurableIdViaTemporaryOrgTab': {
          const apiHostname = message?.apiHostname;
          const developerName = message?.developerName;

          if (!apiHostname || !developerName) {
            return { ok: false, error: 'Missing apiHostname or developerName' };
          }

          return await _resolveAppDurableIdViaTemporaryOrgTab(apiHostname, developerName);
        }

        /**
         * Background-worker resolver retained as fallback.
         *
         * message: {
         *   action: 'resolveAppDurableId',
         *   apiHostname: '<org>.my.salesforce.com',
         *   developerName: 'FlowsApp'
         * }
         */
        case 'resolveAppDurableId': {
          const apiHostname = message?.apiHostname;
          const developerName = message?.developerName;

          if (!apiHostname || !developerName) {
            return { ok: false, error: 'Missing apiHostname or developerName' };
          }

          const baseUrl = `https://${apiHostname}`;

          const sid = await new Promise((resolve) => {
            chrome.cookies.get({ url: baseUrl, name: 'sid' }, (cookie) => resolve(cookie?.value || null));
          });

          if (!sid) {
            return {
              ok: false,
              error: `No sid cookie found for ${baseUrl}.`
            };
          }

          const versions = ['v60.0', 'v59.0', 'v58.0', 'v57.0', 'v56.0'];

          const devNameEscaped = String(developerName)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'");

          const soql = `SELECT DurableId FROM AppDefinition WHERE DeveloperName='${devNameEscaped}' LIMIT 1`;

          for (const v of versions) {
            const url = `${baseUrl}/services/data/${v}/query?q=${encodeURIComponent(soql)}`;

            const res = await fetch(url, {
              method: 'GET',
              credentials: 'include',
              headers: {
                Accept: 'application/json'
              }
            });

            if (res.status === 404) continue;

            if (!res.ok) {
              const body = await res.text().catch(() => '');

              if (res.status === 401) {
                return {
                  ok: false,
                  error:
                    `Query failed (401). Salesforce did not accept the current browser session for ${baseUrl}. ` +
                    `Response: ${body.slice(0, 200)}`
                };
              }

              return { ok: false, error: `Query failed (${res.status}): ${body.slice(0, 200)}` };
            }

            const json = await res.json();
            const durableId = json.records?.[0]?.DurableId;

            if (!durableId) {
              return { ok: false, error: `No AppDefinition found for DeveloperName=${developerName}` };
            }

            return { ok: true, durableId };
          }

          return { ok: false, error: 'No supported API version endpoint found on this org' };
        }

        case 'fetchExtensionFile': {
          const filePath = message?.path;
          if (!filePath) return { ok: false, error: 'No file path provided' };

          const url = chrome.runtime.getURL(filePath);
          const res = await fetch(url);
          if (!res.ok) return { ok: false, error: `Failed to fetch ${filePath}: ${res.status}` };

          const ab = await res.arrayBuffer();
          const bytes = new Uint8Array(ab);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);

          return { ok: true, base64 };
        }

        case 'injectXlsxLib': {
          const tabId = sender?.tab?.id;
          if (!tabId) {
            return { ok: false, error: 'No sender tab ID available' };
          }

          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['lib/xlsx.bundle.js'],
            world: 'ISOLATED'
          });

          return { ok: true };
        }

        default:
          return { ok: false, error: 'Unknown action' };
      }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  })()
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));

  return true; // ALWAYS async
});

/**
 * Open an inactive tab on the exact API host, wait for it to load,
 * query the DurableId inside that tab, and close it afterwards.
 * @param {string} apiHostname
 * @param {string} developerName
 * @returns {Promise<{ok:boolean, durableId?:string, error?:string}>}
 */
async function _resolveAppDurableIdViaTemporaryOrgTab(apiHostname, developerName) {
  const url = `https://${apiHostname}/home/home.jsp`;
  let tabId = null;

  try {
    const createdTab = await chrome.tabs.create({
      url,
      active: false
    });

    tabId = createdTab?.id;

    if (!tabId) {
      return { ok: false, error: `Failed to create temporary tab for ${url}` };
    }

    await _waitForTabComplete(tabId, 20000);

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: _queryAppDurableIdInPage,
      args: [developerName]
    });

    const firstResult = Array.isArray(results) ? results[0] : null;
    const value = firstResult?.result;

    if (!value || !value.ok || !value.durableId) {
      return {
        ok: false,
        error: value?.error || 'Failed to resolve app DurableId in temporary org tab'
      };
    }

    return { ok: true, durableId: value.durableId };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  } finally {
    if (tabId) {
      try {
        await chrome.tabs.remove(tabId);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Wait for a tab to finish loading.
 * @param {number} tabId
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
function _waitForTabComplete(tabId, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let done = false;

    const cleanup = () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
    };

    const finish = (fn, value) => {
      if (done) return;
      done = true;
      cleanup();
      fn(value);
    };

    const onUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status === 'complete') {
        finish(resolve);
      }
    };

    const timer = setTimeout(() => {
      finish(reject, new Error(`Timed out waiting for tab ${tabId} to finish loading`));
    }, timeoutMs);

    chrome.tabs.onUpdated.addListener(onUpdated);

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        finish(reject, new Error(chrome.runtime.lastError.message));
        return;
      }

      if (tab?.status === 'complete') {
        finish(resolve);
      }
    });
  });
}

/**
 * Executed inside an already-open tab on the exact API host.
 * Uses a same-origin relative URL so the request stays on that host.
 *
 * @param {string} developerName
 * @returns {Promise<{ok:boolean, durableId?:string, error?:string}>}
 */
async function _queryAppDurableIdInPage(developerName) {
  try {
    const versions = ['v60.0', 'v59.0', 'v58.0', 'v57.0', 'v56.0'];

    const devNameEscaped = String(developerName)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'");

    const soql = `SELECT DurableId FROM AppDefinition WHERE DeveloperName='${devNameEscaped}' LIMIT 1`;

    for (const v of versions) {
      const url = `/services/data/${v}/query?q=${encodeURIComponent(soql)}`;

      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json'
        }
      });

      if (res.status === 404) continue;

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { ok: false, error: `Page query failed (${res.status}): ${body.slice(0, 300)}` };
      }

      const json = await res.json();
      const durableId = json?.records?.[0]?.DurableId;

      if (!durableId) {
        return { ok: false, error: `No AppDefinition found for DeveloperName=${developerName}` };
      }

      return { ok: true, durableId };
    }

    return { ok: false, error: 'No supported API version endpoint found on this org' };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}