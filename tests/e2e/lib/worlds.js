'use strict';
/**
 * Evaluates code in the toolkit's content-script world (the extension's
 * isolated world) through the Chrome DevTools Protocol.
 *
 * Why: Lightning patches DOM methods in the page's main world (synthetic
 * shadow), but the toolkit's querySelector calls run in its isolated world,
 * where they aren't patched. Checking selectors in the isolated world gives
 * exactly the result the toolkit gets. The same world also exposes the
 * toolkit's globals (SalesforceAPI, APINamePrefixes, ...).
 */
const EXTENSION_WORLD_NAME = 'SF Flow Utility Toolkit';

async function attach(page) {
  const cdp = await page.context().newCDPSession(page);
  const contexts = new Map(); // id -> { name, frameId, isDefault }
  cdp.on('Runtime.executionContextCreated', ({ context }) => {
    contexts.set(context.id, { name: context.name, frameId: context.auxData?.frameId, isDefault: !!context.auxData?.isDefault });
  });
  cdp.on('Runtime.executionContextDestroyed', ({ executionContextId }) => contexts.delete(executionContextId));
  cdp.on('Runtime.executionContextsCleared', () => contexts.clear());
  await cdp.send('Runtime.enable');
  const { frameTree } = await cdp.send('Page.getFrameTree');
  const topFrameId = frameTree.frame.id;

  function contextIds({ world, allFrames }) {
    return [...contexts.entries()]
      .filter(([, c]) => (world === 'extension' ? c.name === EXTENSION_WORLD_NAME : c.isDefault))
      .filter(([, c]) => allFrames || c.frameId === topFrameId)
      .map(([id]) => id);
  }

  /**
   * Evaluates an expression and returns its JSON value.
   * @param {string} expression - Must evaluate to something JSON-serialisable (awaited if a promise).
   * @param {{world?: 'extension'|'main', allFrames?: boolean}} [opts]
   * @returns {Promise<any[]>} One result per matching frame context.
   */
  async function evaluate(expression, { world = 'extension', allFrames = false } = {}) {
    const ids = contextIds({ world, allFrames });
    const results = [];
    for (const id of ids) {
      const r = await cdp.send('Runtime.evaluate', { expression, contextId: id, returnByValue: true, awaitPromise: true })
        .catch((e) => ({ exceptionDetails: { text: e.message } }));
      results.push(r.exceptionDetails ? { error: r.exceptionDetails.exception?.description || r.exceptionDetails.text } : r.result.value);
    }
    return results;
  }

  const hasExtensionWorld = () => contextIds({ world: 'extension', allFrames: true }).length > 0;
  return { evaluate, hasExtensionWorld, detach: () => cdp.detach().catch(() => {}) };
}

module.exports = { attach, EXTENSION_WORLD_NAME };
