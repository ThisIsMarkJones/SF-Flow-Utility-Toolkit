'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModules, readJson } = require('../helpers/load-modules');

const { get } = loadModules(['utils/flow-health-normalizer.js']);
const md = readJson('fixtures/winter27/SFUT_W27_UserMode.tooling.json').Metadata;
const trigger = (runInMode) => get('FlowHealthNormalizer').normalize({ ...md, runInMode }).trigger;

test('UserMode (captured fixture) shows Flow Builder\'s label', () => {
  const t = get('FlowHealthNormalizer').normalize(md).trigger;
  assert.equal(t.runContext, 'User Context—Enforces User Permissions');
  assert.equal(t.runInMode, 'UserMode');
});

test('the other run modes map to readable labels', () => {
  assert.equal(trigger('DefaultMode').runContext, 'User or System Context—Depends on How Flow is Launched');
  assert.equal(trigger('SystemModeWithSharing').runContext, 'System Context with Sharing—Enforces Record-Level Access');
  assert.equal(trigger('SystemModeWithoutSharing').runContext, 'System Context Without Sharing—Access All Data');
});

test('unknown values pass through; missing is Unknown', () => {
  assert.equal(trigger('SomeFutureMode').runContext, 'SomeFutureMode');
  assert.equal(trigger(null).runContext, 'Unknown');
  assert.equal(trigger(null).runInMode, null);
});
