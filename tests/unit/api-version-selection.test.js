'use strict';
// Fix 12: every endpoint uses min(68, the org's highest API version), cached per
// org session. The background worker messaging and fetch are mocked here; the
// real GET /services/data call is covered by the Phase 3 smoke test.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModules } = require('../helpers/load-modules');

const BASE = 'https://example.my.salesforce.com';

function setup({ orgVersions, versionsFail = false } = {}) {
  const calls = [];
  const chrome = {
    runtime: {
      lastError: undefined,
      sendMessage: (msg, cb) => cb(msg.action === 'getSidForUrls'
        ? { ok: true, sids: { [BASE]: 'TEST_SID' } }
        : { ok: false, error: 'unexpected message' })
    }
  };
  const fetch = async (url) => {
    const path = url.replace(BASE, '').split('?')[0];
    calls.push(path);
    if (path === '/services/data') {
      if (versionsFail) return { ok: false, status: 500, text: async () => 'boom', json: async () => ({}) };
      return { ok: true, status: 200, json: async () => orgVersions.map((v) => ({ version: v })) };
    }
    return { ok: true, status: 200, json: async () => ({ records: [], done: true }) };
  };
  const { get } = loadModules(['utils/salesforce-api.js'], { dom: true, url: `${BASE}/lightning/setup`, globals: { chrome, fetch } });
  return { api: get('SalesforceAPI'), calls };
}

test('selectApiVersion: min(toolkit version, org maximum)', () => {
  const { api } = setup({ orgVersions: [] });
  assert.equal(api.selectApiVersion(67), 67);
  assert.equal(api.selectApiVersion(68), 68);
  assert.equal(api.selectApiVersion(69), 68);
  assert.equal(api.selectApiVersion(null), 68, 'unknown org version: the toolkit\'s own');
});

test('Summer \'26 org: endpoints use v67.0', async () => {
  const { api, calls } = setup({ orgVersions: ['65.0', '66.0', '67.0'] });
  await api.toolingQuery('SELECT Id FROM Flow');
  await api.restQuery('SELECT Id FROM FlowDefinitionView');
  assert.deepEqual(calls, ['/services/data', '/services/data/v67.0/tooling/query', '/services/data/v67.0/query']);
  assert.equal(await api.getApiVersionNumber(), 67);
});

test('Winter \'27 org: endpoints use v68.0', async () => {
  const { api, calls } = setup({ orgVersions: ['66.0', '67.0', '68.0'] });
  await api.toolingQuery('SELECT Id FROM Flow');
  assert.equal(calls[1], '/services/data/v68.0/tooling/query');
});

test('org already on a newer release: capped at the toolkit\'s v68.0', async () => {
  const { api } = setup({ orgVersions: ['68.0', '69.0'] });
  assert.equal(await api.getApiVersion(), 'v68.0');
});

test('the org version list is fetched once and cached; clearSessionCache resets it', async () => {
  const { api, calls } = setup({ orgVersions: ['67.0'] });
  await api.toolingQuery('q1');
  await api.toolingQuery('q2');
  await api.getApiVersion();
  assert.equal(calls.filter((c) => c === '/services/data').length, 1);
  api.clearSessionCache();
  await api.toolingQuery('q3');
  assert.equal(calls.filter((c) => c === '/services/data').length, 2);
});

test('if the version list can\'t be read, fall back to v68.0 and try again next time', async () => {
  const { api, calls } = setup({ versionsFail: true });
  assert.equal(await api.getApiVersion(), 'v68.0');
  await api.getApiVersion();
  assert.equal(calls.filter((c) => c === '/services/data').length, 2, 'a failure is not cached');
});
