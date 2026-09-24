'use strict';
// SFUT_W27_CFCSynthetic was deployed via metadata (not built in Flow Builder) to a
// Winter '27 org where the feature isn't enabled yet; the org stored it as InvalidDraft.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModules, readJson, clone } = require('../helpers/load-modules');

const cfcFlow = () => clone(readJson('fixtures/winter27/SFUT_W27_CFCSynthetic.tooling.json').Metadata);
const analyse = (md) => {
  const { get } = loadModules(['utils/unused-resources-analyser.js']);
  return clone(get('UnusedResourcesAnalyser').analyse(md));
};
const unusedNames = (r) => r.groups.flatMap((g) => g.items.map((i) => `${g.type}:${i.name}`)).sort();

test('fixture shape: criteria reference a variable, the resource is used in an Assignment', () => {
  const md = cfcFlow();
  const cfc = md.collectionFilterCriteria[0];
  assert.equal(cfc.name, 'Big_Accounts');
  assert.equal(cfc.objectReferencePath, 'Get_Accounts');
  assert.equal(cfc.filterOptions[0].rightValue.elementReference, 'minEmployees');
  assert.equal(md.assignments[0].assignmentItems[0].value.elementReference, 'Big_Accounts');
});

test('Unused Resources: a variable used only inside the criteria is not reported', () => {
  const r = analyse(cfcFlow());
  assert.deepEqual(unusedNames(r), []);
});

test('Unused Resources: a collection variable used only as the criteria source is not reported', () => {
  const md = cfcFlow();
  md.collectionFilterCriteria[0].objectReferencePath = 'sourceAccounts';
  md.variables.push({ name: 'sourceAccounts', dataType: 'SObject', isCollection: true, objectType: 'Account' });
  assert.deepEqual(unusedNames(analyse(md)), []);
});

test('Unused Resources: the Collection Filter Criteria resource is itself checked', () => {
  const md = cfcFlow();
  md.assignments[0].assignmentItems[0].value.elementReference = 'Get_Accounts';
  const r = analyse(md);
  assert.deepEqual(unusedNames(r), ['Collection Filter Criteria:Big_Accounts']);
  assert.equal(r.totalResources, 3);
});

test('Missing Description Flags checks Collection Filter Criteria resources', () => {
  const { get } = loadModules(['features/missing-description-flags.js'], { dom: true });
  const find = get('MissingDescriptionFlags')._findElementsWithoutDescriptions;
  const pick = (md) => clone(find(md)).filter((m) => m.type === 'Collection Filter Criteria');
  assert.deepEqual(pick(cfcFlow()), [], 'the fixture has a description');
  const md = cfcFlow();
  md.collectionFilterCriteria[0].description = null;
  assert.deepEqual(pick(md), [{ name: 'Big_Accounts', label: 'Big_Accounts', type: 'Collection Filter Criteria', isResource: true }]);
});

test('Metadata cleaner summary counts Collection Filter Criteria', () => {
  const { get } = loadModules(['utils/flow-metadata-cleaner.js']);
  const s = clone(get('FlowMetadataCleaner').summarise(cfcFlow()));
  assert.equal(s.resources['Collection Filter Criteria'], 1);
});

test('empty collectionFilterCriteria (as captured) is safe everywhere', () => {
  const md = clone(readJson('fixtures/winter27/SFUT_W27_LoopFilter.tooling.json').Metadata);
  assert.deepEqual(md.collectionFilterCriteria, []);
  for (const value of [[], null, undefined]) {
    md.collectionFilterCriteria = value;
    assert.doesNotThrow(() => analyse(md));
  }
});

test('FlowXmlConverter export keeps collectionFilterCriteria', () => {
  const { get } = loadModules(['utils/salesforce-api.js', 'utils/flow-xml-converter.js'], { dom: true });
  const xml = get('FlowXmlConverter').flowMetadataToXml(cfcFlow());
  assert.match(xml, /<collectionFilterCriteria>[\s\S]*<name>Big_Accounts<\/name>[\s\S]*<\/collectionFilterCriteria>/);
  assert.match(xml, /<objectReferencePath>Get_Accounts<\/objectReferencePath>/);
  assert.match(xml, /<elementReference>minEmployees<\/elementReference>/);
});

test('prefix: a Collection Filter Criteria resource row, distinct from the Collection Filter element', async () => {
  const chrome = {
    runtime: { lastError: undefined, sendMessage: (_msg, cb) => cb({ ok: false, error: 'offline' }) },
    storage: { local: { get: (_k, cb) => cb({}), set: (_v, cb) => cb && cb(), remove: (_k, cb) => cb && cb() } }
  };
  const { get } = loadModules(['config/api-name-prefixes.js'], { globals: { chrome } });
  const Prefixes = get('APINamePrefixes');
  await Prefixes.load();
  const fallback = clone(Prefixes.getDefaults());
  const shipped = readJson('../config/default-prefixes.json').prefixes;
  const key = (r) => `${r.table}|${r.type}|${r.Snake_Case}|${r.PascalCase}|${r.camelCase}`;
  // Compare only the Collection Filter rows: the fallback already lacks two
  // unrelated rows (Datatable, Radio Button Group), reported separately.
  const filterRows = (rows) => rows.filter((r) => r.type.startsWith('Collection Filter')).map(key).sort();
  assert.deepEqual(filterRows(fallback), filterRows(shipped), 'fallback matches default-prefixes.json');
  const row = shipped.find((r) => r.type === 'Collection Filter Criteria');
  assert.equal(row.table, 'resource');
  assert.notEqual(row.Snake_Case, shipped.find((r) => r.type === 'Collection Filter').Snake_Case);
});
