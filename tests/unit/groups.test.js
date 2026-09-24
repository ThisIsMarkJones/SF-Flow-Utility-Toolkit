'use strict';
// Groups are not yet enabled in the capture org: these tests run against the
// hand-written tests/synthetic/SFUT_W27_GroupsSynthetic.tooling.json (built from
// the API 68.0 WSDL) and against real fixtures where groups/group are empty.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModules, readJson, clone } = require('../helpers/load-modules');

const grouped = () => clone(readJson('synthetic/SFUT_W27_GroupsSynthetic.tooling.json').Metadata);
const ungrouped = () => clone(readJson('fixtures/winter27/SFUT_W27_EndElements.saved.tooling.json').Metadata);

test('synthetic fixture: two elements in the group, one outside', () => {
  const md = grouped();
  assert.deepEqual(md.assignments.map((a) => [a.name, a.group]).sort(),
    [['Step_One', 'Setup_Steps'], ['Step_Three', null], ['Step_Two', 'Setup_Steps']]);
  assert.equal(md.groups[0].description, 'SFUT group description probe');
});

test('Health Check normaliser sees grouped elements; the group is not a node', () => {
  const { get } = loadModules(['utils/flow-health-normalizer.js', 'utils/flow-health-rules.js']);
  const flow = get('FlowHealthNormalizer').normalize(grouped());
  const names = clone(flow.nodes.map((n) => n.apiName)).sort();
  assert.deepEqual(names, ['Step_One', 'Step_Three', 'Step_Two', '__start__']);
  assert.doesNotThrow(() => get('FlowHealthRules').evaluate(flow, {}));
});

test('Missing Description Flags: grouped elements are still checked', () => {
  const { get } = loadModules(['features/missing-description-flags.js'], { dom: true });
  const missing = clone(get('MissingDescriptionFlags')._findElementsWithoutDescriptions(grouped()));
  const assignments = missing.filter((m) => m.type === 'Assignment').map((m) => m.name).sort();
  assert.deepEqual(assignments, ['Step_One', 'Step_Three', 'Step_Two']);
});

test('Missing Description Flags: a group with a description is not flagged; without one it is', () => {
  const { get } = loadModules(['features/missing-description-flags.js'], { dom: true });
  const find = get('MissingDescriptionFlags')._findElementsWithoutDescriptions;
  assert.equal(clone(find(grouped())).filter((m) => m.type === 'Group').length, 0);
  const md = grouped();
  md.groups[0].description = null;
  assert.deepEqual(clone(find(md)).filter((m) => m.type === 'Group'),
    [{ name: 'Setup_Steps', label: 'Setup Steps', type: 'Group', isResource: false }]);
});

test('Missing Description Flags: groups null (as captured), [] or absent is safe', () => {
  const { get } = loadModules(['features/missing-description-flags.js'], { dom: true });
  const find = get('MissingDescriptionFlags')._findElementsWithoutDescriptions;
  const md = ungrouped();
  assert.equal(md.groups, null, 'the Tooling API returns null when a flow has no groups');
  for (const value of [null, [], undefined]) {
    md.groups = value;
    assert.equal(clone(find(md)).filter((m) => m.type === 'Group').length, 0);
  }
});

test('Unused Resources: references from grouped elements still count', () => {
  const { get } = loadModules(['utils/unused-resources-analyser.js']);
  const r = get('UnusedResourcesAnalyser').analyse(grouped());
  assert.equal(r.totalUnused, 0, 'message is assigned inside the group');
});

test('Metadata cleaner keeps groups and the per-element group name', () => {
  const { get } = loadModules(['utils/flow-metadata-cleaner.js']);
  const Cleaner = get('FlowMetadataCleaner');
  const cleaned = clone(Cleaner.clean(grouped()));
  assert.equal(cleaned.groups[0].name, 'Setup_Steps');
  assert.equal(cleaned.assignments.find((a) => a.name === 'Step_One').group, 'Setup_Steps');
  assert.equal(clone(Cleaner.summarise(grouped())).elements.Assignments, 3);
});

test('FlowXmlConverter export keeps groups and element group names', () => {
  const { get } = loadModules(['utils/salesforce-api.js', 'utils/flow-xml-converter.js'], { dom: true });
  const xml = get('FlowXmlConverter').flowMetadataToXml(grouped());
  assert.match(xml, /<groups>[\s\S]*<name>Setup_Steps<\/name>[\s\S]*<\/groups>/);
  assert.match(xml, /<groupType>generic<\/groupType>/);
  assert.equal((xml.match(/<group>Setup_Steps<\/group>/g) || []).length, 2);
});
