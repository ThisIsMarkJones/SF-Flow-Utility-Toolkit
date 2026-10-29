'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModules, readJson, readText } = require('../helpers/load-modules');

test('IIFE modules load unchanged into a vm context', () => {
  const { get } = loadModules(['utils/flow-xml-converter.js']);
  assert.equal(typeof get('FlowXmlConverter').flowMetadataToXml, 'function');
});

test('Winter \'27 fixtures are present and self-consistent', () => {
  const after = readJson('fixtures/winter27/ImportTest.after.tooling.json');
  assert.equal(after.Metadata.ends.length, 1);
  assert.match(readText('fixtures/winter27/ImportTest.after.flow-meta.xml'), /<ends>/);
  assert.equal(readJson('fixtures/winter27/SFUT_W27_UserMode.tooling.json').RunInMode, 'UserMode');
});

test('jsdom provides DOMParser for modules that need it', () => {
  const { get } = loadModules(['utils/flow-deploy-diff.js'], { dom: true });
  const r = get('FlowDeployDiff').diffFlows('<Flow><label>A</label></Flow>', '<Flow><label>A</label></Flow>');
  assert.equal(r.identical, true);
});
