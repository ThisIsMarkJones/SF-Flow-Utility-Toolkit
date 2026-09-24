'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModules, readJson, readText } = require('../helpers/load-modules');

const { get } = loadModules(
  ['utils/salesforce-api.js', 'utils/flow-xml-converter.js', 'utils/flow-deploy-diff.js', 'features/flow-import-export.js'],
  { dom: true }
);
const Diff = get('FlowDeployDiff');
const prepare = get('FlowImportExport')._prepareDeployPayload;
const afterXml = readText('fixtures/winter27/ImportTest.after.flow-meta.xml');
const beforeXml = readText('fixtures/winter27/ImportTest.before.flow-meta.xml');

test('stripEndElements removes <ends> and the connectors that target them', () => {
  const r = Diff.stripEndElements(afterXml);
  assert.equal(r.ends, 1);
  assert.equal(r.connectors, 1);
  assert.doesNotMatch(r.xml, /<ends>|END_ELEMENT_/);
  assert.match(r.xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.equal(Diff.diffFlows(r.xml, beforeXml).identical, true);
});

test('stripEndElements handles a Decision outcome pointing straight at an End', () => {
  const md = readJson('synthetic/SFUT_W27_EndElements.outcome-to-end.tooling.json').Metadata;
  const r = Diff.stripEndElements(get('FlowXmlConverter').flowMetadataToXml(md));
  assert.equal(r.ends, 2);
  assert.equal(r.connectors, 2); // Path_A_Outcome rule, Path_B assignment
  assert.doesNotMatch(r.xml, /<ends>|<targetReference>END_ELEMENT_/);
  assert.match(r.xml, /<rules>/, 'the outcome itself is kept');
});

test('stripEndElements leaves a flow without End elements untouched', () => {
  const r = Diff.stripEndElements(beforeXml);
  assert.equal(r.xml, beforeXml);
  assert.equal(r.ends + r.connectors, 0);
});

test('Import into an org on Summer \'26 (API 67): End elements stripped, package 67.0', () => {
  const r = prepare(afterXml, 'Draft', 67);
  assert.equal(r.packageVersion, '67.0');
  assert.equal(r.removedEnds, 1);
  assert.equal(r.removedConnectors, 1);
  assert.doesNotMatch(r.deployXml, /<ends>/);
  assert.match(r.deployXml, /<status>Draft<\/status>/);
});

test('Import into an org on Winter \'27 (API 68): End elements kept, package 68.0', () => {
  const r = prepare(afterXml, 'Active', 68);
  assert.equal(r.packageVersion, '68.0');
  assert.equal(r.removedEnds, 0);
  assert.match(r.deployXml, /<ends>/);
  assert.match(r.deployXml, /<status>Active<\/status>/);
});

test('Import when the org version is unknown: nothing stripped, package 68.0', () => {
  const r = prepare(afterXml, 'Draft', null);
  assert.equal(r.packageVersion, '68.0');
  assert.match(r.deployXml, /<ends>/);
});
