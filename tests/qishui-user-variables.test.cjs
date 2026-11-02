const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  let variables = {};
  const requests = [];
  const axios = {
    getUri: require('axios').getUri,
    async post(url, body, options) {
      requests.push({ url, body, options });
      return url.includes('sign-pc.php')
        ? { data: { headers: { 'x-ss-stub': 'stub', 'x-helios': 'helios', 'x-medusa': 'medusa' } } }
        : { data: { search_chart_block: { charts: [] } } };
    },
  };
  const module = { exports: {} };
  const context = { module, exports: module.exports, Buffer,
    require(name) { if (name === 'axios') return { default: axios }; throw new Error('Unexpected dependency'); },
    env: { getUserVariables: () => variables },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../plugins/qishui.js'), 'utf8'), context);
  const api = vm.runInContext('({getQishuiSessionId, getQishuiXHeadersKey, prepareSignedQishuiPcRequest})', context);
  return { plugin: module.exports, api, requests, variables(value) { variables = value; } };
}

test('qishui exposes the signature key first, followed by the existing sessionid', () => {
  const f = fixture();
  assert.deepEqual(Array.from(f.plugin.userVariables, v => v.key), ['X-Hearder Key', 'sessionid']);
});

test('qishui sends the configured signing key only to the signer and sessionid only to the API', async () => {
  const f = fixture();
  f.variables({ 'X-Hearder Key': '  Bearer test-signing-key  ', sessionid: 'other=value; sessionid=test-session; more=value' });
  const signed = await f.api.prepareSignedQishuiPcRequest('track_v2', Buffer.from('{}'));
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].url, 'https://api.vsaa.cn/api/music/soda/sign-pc.php');
  assert.equal(f.requests[0].options.headers.Authorization, 'Bearer test-signing-key');
  assert.equal(JSON.stringify(f.requests).includes('test-session'), false);
  assert.equal(signed.headers.Cookie, 'sessionid=test-session');
  assert.equal(JSON.stringify(signed).includes('test-signing-key'), false);
  assert.equal(signed.headers['X-Helios'], 'helios');
});

test('qishui reads edits immediately and keeps defaults for missing or blank variables', () => {
  const f = fixture();
  const defaultKey = f.api.getQishuiXHeadersKey();
  const defaultSession = f.api.getQishuiSessionId();
  f.variables({ 'X-Hearder Key': 'test-key', sessionid: 'test-session' });
  assert.equal(f.api.getQishuiXHeadersKey(), 'test-key');
  assert.equal(f.api.getQishuiSessionId(), 'test-session');
  for (const variables of [{}, { 'X-Hearder Key': '  ', sessionid: '  ' },
    { 'X-Hearder Key': 42, sessionid: false }]) {
    f.variables(variables);
    assert.equal(f.api.getQishuiXHeadersKey(), defaultKey);
    assert.equal(f.api.getQishuiSessionId(), defaultSession);
  }
});

test('qishui hot search remains independent of both user credentials', async () => {
  const f = fixture();
  f.variables({ 'X-Hearder Key': 'test-signing-key', sessionid: 'test-session' });
  await f.plugin.getHotSearch();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].url, 'https://api5-lq.qishui.com/luna/search-block');
  const request = JSON.stringify(f.requests[0]);
  assert.equal(request.includes('test-signing-key'), false);
  assert.equal(request.includes('test-session'), false);
  assert.equal(f.requests[0].options.headers.Authorization, undefined);
  assert.equal(f.requests[0].options.headers.Cookie, undefined);
});
