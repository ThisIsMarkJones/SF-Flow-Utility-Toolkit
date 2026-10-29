'use strict';
/**
 * Loads the extension's IIFE modules into an isolated vm context, unchanged.
 *
 * The shipped files declare globals as top-level `const X = (() => { ... })();`.
 * Scripts run in the same context share one global lexical scope, so a module
 * loaded later can see one loaded earlier — the same as content scripts listed
 * in manifest order. `get(name)` reads such a binding back out.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TESTS_ROOT = path.resolve(__dirname, '..');

const quietConsole = { log() {}, info() {}, debug() {}, warn() {}, error() {} };

/**
 * @param {string[]} files - Repo-relative paths, in manifest load order.
 * @param {Object} [options]
 * @param {boolean} [options.dom] - Provide window/document/DOMParser from jsdom.
 * @param {string} [options.url] - Page URL when `dom` is set.
 * @param {Object} [options.globals] - Extra globals (stubs such as SalesforceAPI).
 * @returns {{context: vm.Context, get: (name: string) => any, window?: any}}
 */
function loadModules(files, options = {}) {
  // Feature modules self-register with main.js; a no-op stub stands in for it.
  const registry = { registerFeature() {} };
  const sandbox = {
    console: quietConsole, setTimeout, clearTimeout, setInterval, clearInterval,
    URL, URLSearchParams, TextEncoder, TextDecoder, atob, btoa,
    SFFlowUtilityToolkit: registry,
    ...options.globals
  };
  let dom;

  if (options.dom) {
    const { JSDOM } = require('jsdom');
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: options.url || 'https://example.my.salesforce.com/'
    });
    const w = dom.window;
    Object.assign(sandbox, {
      window: w,
      document: w.document,
      DOMParser: w.DOMParser,
      XMLSerializer: w.XMLSerializer,
      Node: w.Node,
      Element: w.Element,
      HTMLElement: w.HTMLElement,
      KeyboardEvent: w.KeyboardEvent,
      MouseEvent: w.MouseEvent,
      Event: w.Event,
      MutationObserver: w.MutationObserver,
      location: w.location,
      navigator: w.navigator,
      getComputedStyle: w.getComputedStyle.bind(w),
      requestAnimationFrame: (cb) => setTimeout(cb, 0)
    });
  }

  const context = vm.createContext(sandbox);
  for (const rel of files) {
    const abs = path.join(REPO_ROOT, rel);
    vm.runInContext(fs.readFileSync(abs, 'utf8'), context, { filename: abs });
  }

  return {
    context,
    window: dom && dom.window,
    get: (name) => vm.runInContext(name, context)
  };
}

/** Reads a JSON fixture relative to tests/. */
function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(TESTS_ROOT, rel), 'utf8'));
}

/** Reads a text fixture relative to tests/. */
function readText(rel) {
  return fs.readFileSync(path.join(TESTS_ROOT, rel), 'utf8');
}

/** Deep copy, so a test can mutate a fixture without affecting others. */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { loadModules, readJson, readText, clone, REPO_ROOT };
