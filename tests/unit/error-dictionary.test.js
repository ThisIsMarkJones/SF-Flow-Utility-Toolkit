'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModules } = require('../helpers/load-modules');

const { get } = loadModules(['utils/flow-error-dictionary.js', 'utils/flow-error-translator.js']);
const Dict = get('FlowErrorDictionary');
const byCode = (code) => Dict.findByCode(code, '');

test('new entries have the same shape as existing ones', () => {
  const ref = Object.keys(byCode('FIELD_CUSTOM_VALIDATION_EXCEPTION')).sort();
  for (const code of ['UNABLE_TO_LOCK_ROW', 'STRING_TOO_LONG']) {
    const e = byCode(code);
    assert.equal(e.code, code);
    assert.deepEqual(Object.keys(e).sort(), ref, code);
    assert.ok(e.causes.length > 0 && e.recommendations.length > 0);
    assert.ok(['high', 'medium', 'low'].includes(e.severity));
  }
});

test('the translator recognises each new entry from its own example', () => {
  for (const code of ['UNABLE_TO_LOCK_ROW', 'STRING_TOO_LONG']) {
    const r = get('FlowErrorTranslator').translate(byCode(code).example);
    assert.equal(r.exceptionCode, code);
    assert.equal(r.entry.code, code);
  }
});

test('UNABLE_TO_LOCK_ROW explains the 10-second retry', () => {
  assert.match(byCode('UNABLE_TO_LOCK_ROW').description, /retries once after 10 seconds/);
  assert.match(byCode('UNABLE_TO_LOCK_ROW').description, /longer than that retry/);
});

test('STRING_TOO_LONG says the save-time check does not cover variables', () => {
  const text = JSON.stringify(byCode('STRING_TOO_LONG'));
  assert.match(text, /save time/);
  assert.match(text, /not values that come from variables/);
});

test('REQUIRED_FIELD_MISSING mentions the Create Records save-time warning', () => {
  assert.match(byCode('REQUIRED_FIELD_MISSING').recommendations.join(' '), /save time when a Create Records/);
});

test('APEX_CPU_TIME_LIMIT_EXCEEDED recommends Collection Filter Criteria', () => {
  assert.match(byCode('APEX_CPU_TIME_LIMIT_EXCEEDED').recommendations.join(' '), /Collection Filter Criteria/);
});
