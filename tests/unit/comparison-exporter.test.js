'use strict';
// Fix 3 is partial: the Winter '27 side-panel selectors wait for Phase 3 DOM evidence.
// This covers the part that doesn't depend on the DOM: never export an empty
// Details column silently.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModules } = require('../helpers/load-modules');

const { get } = loadModules(['features/comparison-exporter.js'], { dom: true, globals: { chrome: {} } });
const warn = get('ComparisonExporter')._detailsWarning;

test('details requested but none read: warning', () => {
  assert.match(warn([{ details: '' }, {}], true), /no change details could be read/);
});

test('some details read: no warning', () => {
  assert.equal(warn([{ details: '' }, { details: 'Changed: label' }], true), null);
});

test('details not requested, or nothing to export: no warning', () => {
  assert.equal(warn([{ details: '' }], false), null);
  assert.equal(warn([], true), null);
});
