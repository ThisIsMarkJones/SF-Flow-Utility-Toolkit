'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModules, readJson, readText, clone } = require('../helpers/load-modules');

const { get } = loadModules(
  ['utils/salesforce-api.js', 'utils/flow-xml-converter.js', 'utils/flow-deploy-diff.js'],
  { dom: true }
);
const Diff = get('FlowDeployDiff');
const toXml = (metadata) => get('FlowXmlConverter').flowMetadataToXml(metadata);
const fixtureXml = (name) => toXml(readJson(`fixtures/winter27/${name}.tooling.json`).Metadata);

test('fixtures really differ by End elements (sanity check)', () => {
  assert.doesNotMatch(fixtureXml('ImportTest.before'), /<ends>/);
  assert.match(fixtureXml('ImportTest.after'), /<ends>/);
  assert.match(fixtureXml('ImportTest.after'), /<targetReference>END_ELEMENT_2</);
});

test('older export vs re-saved org version: identical (Tooling JSON via FlowXmlConverter, as Import uses)', () => {
  const r = Diff.diffFlows(fixtureXml('ImportTest.before'), fixtureXml('ImportTest.after'));
  assert.equal(r.identical, true, JSON.stringify(r.summary));
});

test('older export vs re-saved org version: identical (Metadata API XML)', () => {
  const r = Diff.diffFlows(
    readText('fixtures/winter27/ImportTest.before.flow-meta.xml'),
    readText('fixtures/winter27/ImportTest.after.flow-meta.xml')
  );
  assert.equal(r.identical, true, JSON.stringify(r.summary));
});

test('branching flow: two outcomes ending separately compare as identical', () => {
  const r = Diff.diffFlows(
    fixtureXml('SFUT_W27_EndElements.deployed-no-end'),
    fixtureXml('SFUT_W27_EndElements.saved')
  );
  assert.equal(r.identical, true, JSON.stringify(r.summary));
});

test('Decision outcome pointing straight at an End (hand-edited fixture)', () => {
  const edited = readJson('synthetic/SFUT_W27_EndElements.outcome-to-end.tooling.json').Metadata;
  const legacy = clone(edited);
  legacy.ends = [];
  legacy.decisions[0].rules[0].connector = null; // an outcome with no connector just ends
  legacy.assignments.find((a) => a.name === 'Path_B').connector = null;
  const r = Diff.diffFlows(toXml(legacy), toXml(edited));
  assert.equal(r.identical, true, JSON.stringify(r.summary));
});

test('every ordinary connector kind that targets an End is removed', () => {
  const base = readJson('fixtures/winter27/SFUT_W27_EndElements.saved.tooling.json').Metadata;
  const withEnd = clone(base);
  const without = clone(base);
  const toEnd = { targetReference: 'END_ELEMENT_3' };
  // Point the Decision's default outcome at an End, and add a loop and a lookup whose
  // noMoreValues, nextValue, fault and timeout connectors also target Ends.
  withEnd.decisions[0].defaultConnector = toEnd;
  without.decisions[0].defaultConnector = null;
  const loop = { name: 'Loop_X', label: 'Loop X', locationX: 0, locationY: 0, collectionReference: 'c', iterationOrder: 'Asc' };
  withEnd.loops = [{ ...loop, nextValueConnector: { targetReference: 'END_ELEMENT_4' }, noMoreValuesConnector: toEnd }];
  without.loops = [{ ...loop }];
  const lookup = { name: 'Get_X', label: 'Get X', locationX: 0, locationY: 0, object: 'Account', getFirstRecordOnly: true, storeOutputAutomatically: true };
  withEnd.recordLookups = [{ ...lookup }];
  without.recordLookups = [{ ...lookup }];
  const wait = { name: 'Wait_X', label: 'Wait X', locationX: 0, locationY: 0 };
  withEnd.waits = [{ ...wait, defaultConnector: toEnd, timeoutConnector: toEnd }];
  without.waits = [{ ...wait }];
  withEnd.start = { ...withEnd.start, connector: { targetReference: 'END_ELEMENT_4' } };
  without.start = { ...without.start, connector: null };
  // Remove the ordinary end-of-path connectors from "without" too.
  for (const a of without.assignments) a.connector = null;
  without.ends = [];

  const r = Diff.diffFlows(toXml(without), toXml(withEnd));
  assert.equal(r.identical, true, JSON.stringify(r.summary));
});

test('connectors are matched by the <ends> list, not by the END_ELEMENT_ name', () => {
  // A real element that happens to be called END_ELEMENT_9 is not an End element.
  const md = readJson('fixtures/winter27/ImportTest.after.tooling.json').Metadata;
  const withLookalike = clone(md);
  withLookalike.assignments.push({
    name: 'END_ELEMENT_9', label: 'Not an end', locationX: 0, locationY: 0,
    assignmentItems: [{ assignToReference: 'varTestMessage', operator: 'Assign', value: { stringValue: 'x' } }]
  });
  withLookalike.assignments[0].connector = { targetReference: 'END_ELEMENT_9' };
  const r = Diff.diffFlows(fixtureXml('ImportTest.after'), toXml(withLookalike));
  assert.equal(r.identical, false);
  assert.ok(r.summary.added.length + r.summary.removed.length + r.summary.changed.length > 0);
});

test('a real logic change is still detected', () => {
  const md = clone(readJson('fixtures/winter27/ImportTest.after.tooling.json').Metadata);
  md.assignments[0].assignmentItems[0].value.stringValue = 'Hi there';
  const r = Diff.diffFlows(fixtureXml('ImportTest.before'), toXml(md));
  assert.equal(r.identical, false);
  assert.deepEqual(clone(r.summary.changed), ['assignments:Set_Test_Message']);
});

test('an apiVersion difference is a real change', () => {
  const md = clone(readJson('fixtures/winter27/ImportTest.after.tooling.json').Metadata);
  md.apiVersion = 68;
  const r = Diff.diffFlows(fixtureXml('ImportTest.before'), toXml(md));
  assert.equal(r.identical, false);
});

test('a fault path that ends is not the same as no fault path', () => {
  const base = readJson('fixtures/winter27/SFUT_W27_EndElements.saved.tooling.json').Metadata;
  const lookup = { name: 'Get_X', label: 'Get X', locationX: 0, locationY: 0, object: 'Account', getFirstRecordOnly: true, storeOutputAutomatically: true };
  const handled = clone(base);
  handled.recordLookups = [{ ...lookup, faultConnector: { targetReference: 'END_ELEMENT_3' } }];
  const unhandled = clone(base);
  unhandled.recordLookups = [{ ...lookup }];
  assert.equal(Diff.diffFlows(toXml(unhandled), toXml(handled)).identical, false);
  assert.deepEqual(clone(Diff.diffFlows(toXml(unhandled), toXml(handled)).summary.changed), ['recordLookups:Get_X']);
});

test('fault paths that end compare equal whichever End element they target', () => {
  const base = readJson('fixtures/winter27/SFUT_W27_EndElements.saved.tooling.json').Metadata;
  const lookup = { name: 'Get_X', label: 'Get X', locationX: 0, locationY: 0, object: 'Account', getFirstRecordOnly: true, storeOutputAutomatically: true };
  const a = clone(base);
  a.recordLookups = [{ ...lookup, faultConnector: { targetReference: 'END_ELEMENT_3' } }];
  const b = clone(base);
  b.ends = b.ends.map((e) => ({ ...e, name: e.name.replace('END_ELEMENT_', 'END_ELEMENT_1') }));
  for (const a2 of b.assignments) if (a2.connector) a2.connector.targetReference = a2.connector.targetReference.replace('END_ELEMENT_', 'END_ELEMENT_1');
  b.recordLookups = [{ ...lookup, faultConnector: { targetReference: 'END_ELEMENT_14' } }];
  assert.equal(Diff.diffFlows(toXml(a), toXml(b)).identical, true);
});
