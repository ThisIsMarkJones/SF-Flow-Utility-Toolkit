'use strict';
// Fix 4 is partial: these cards are hand-built. The Winter '27 card markup (which
// element carries icon-name) is confirmed in Phase 3.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModules } = require('../helpers/load-modules');

const chrome = { runtime: { sendMessage: (_m, cb) => cb({ ok: false }) }, storage: { local: { get: (_k, cb) => cb({}) } } };
const env = loadModules(['config/api-name-prefixes.js', 'features/canvas-search.js'], { dom: true, globals: { chrome } });
const cardType = env.get('CanvasSearch')._getCardType;
const card = (html) => {
  const div = env.window.document.createElement('div');
  div.className = 'element-card';
  div.innerHTML = html;
  return div;
};

test('pre-Winter \'27 card: type from span.element-type-label[title]', () => {
  assert.equal(cardType(card('<span class="element-type-label" title="Decision">Decision</span>')), 'Decision');
});

test('Winter \'27 card without a type label: type from the icon via ICON_TO_TYPE', () => {
  assert.equal(cardType(card('<lightning-icon icon-name="standard:decision"></lightning-icon>')), 'Decision');
  assert.equal(cardType(card('<lightning-icon icon-name="standard:record_lookup"></lightning-icon>')), 'Get Records');
});

test('unknown icon or no icon: empty type (label search still works)', () => {
  assert.equal(cardType(card('<lightning-icon icon-name="standard:unknown_thing"></lightning-icon>')), '');
  assert.equal(cardType(card('<span class="text-element-label" title="X">X</span>')), '');
});
