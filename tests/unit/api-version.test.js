'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadModules, readJson, REPO_ROOT } = require('../helpers/load-modules');

test('SalesforceAPI exports API_VERSION v68.0', () => {
  const { get } = loadModules(['utils/salesforce-api.js'], { dom: true });
  assert.equal(get('SalesforceAPI').API_VERSION, 'v68.0');
});

test('no other shipped file hardcodes a REST API version', () => {
  // salesforce-api.js owns the version; background.js keeps its v60.0 fallback list on purpose.
  const allowed = new Set(['utils/salesforce-api.js', 'background.js']);
  const offenders = [];
  for (const dir of ['utils', 'features', 'ui', 'config', '.']) {
    for (const name of fs.readdirSync(path.join(REPO_ROOT, dir))) {
      if (!name.endsWith('.js')) continue;
      const rel = dir === '.' ? name : `${dir}/${name}`;
      if (allowed.has(rel)) continue;
      const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
      const hit = src.match(/\/services\/data\/v\d+\.\d|['"]v?6\d\.0['"]/);
      if (hit) offenders.push(`${rel}: ${hit[0]}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('Import/Export deploys with package version 68.0 (required for <ends>)', () => {
  const { get } = loadModules(['utils/salesforce-api.js', 'utils/flow-xml-converter.js'], { dom: true });
  assert.match(get('FlowXmlConverter').buildFlowPackageXml('X'), /<version>68\.0<\/version>/);
  const prepare = loadModules(
    ['utils/salesforce-api.js', 'utils/flow-xml-converter.js', 'utils/flow-deploy-diff.js', 'features/flow-import-export.js'],
    { dom: true }
  ).get('FlowImportExport')._prepareDeployPayload;
  const xml = '<?xml version="1.0" encoding="UTF-8"?><Flow xmlns="http://soap.sforce.com/2006/04/metadata"><label>X</label></Flow>';
  assert.equal(prepare(xml, 'Draft', 68).packageVersion, '68.0');
  assert.equal(prepare(xml, 'Draft', 69).packageVersion, '68.0', 'never above the toolkit\'s own version');
  assert.equal(prepare(xml, 'Draft', 67).packageVersion, '67.0', 'capped at the org\'s version');
});

test('Outdated API version rule falls back to a target of 68', () => {
  const { get } = loadModules(['utils/flow-health-normalizer.js', 'utils/flow-health-rules.js']);
  const md = readJson('fixtures/winter27/SFUT_W27_UserMode.tooling.json').Metadata;
  const findings = (apiVersion) => {
    const flow = get('FlowHealthNormalizer').normalize({ ...md, apiVersion });
    return get('FlowHealthRules').evaluate(flow, {}).map((f) => f.ruleId);
  };
  assert.ok(findings(65).includes('OUTDATED_API_VERSION'), '68 - 65 = 3 versions behind');
  assert.ok(!findings(66).includes('OUTDATED_API_VERSION'), '68 - 66 = 2 versions behind');
});
