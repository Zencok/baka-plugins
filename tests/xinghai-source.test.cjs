const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { handler } = require('../functions/plugin');
const subscription = require('../functions/subscription');
const { SOURCE_CONFIG } = require('../functions/source-config');

const endpoint = 'https://yy.zddyr.top/lx/api/';
async function generated(file, get, DateImpl = Date) {
  const response = await handler({ httpMethod: 'GET', path: '/plugins/' + file,
    queryStringParameters: { source: 'xinghai' } }, {});
  assert.equal(response.statusCode, 200);
  new vm.Script(response.body);
  const template = fs.readFileSync(path.join(__dirname, '../plugins', file), 'utf8').split('// {{REQUEST_HANDLER}}');
  const code = response.body.slice(template[0].length, response.body.indexOf(template[1].slice(0, 80), template[0].length));
  const context = { axios_1: { default: { get } }, require, Date: DateImpl };
  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

test('xinghai subscriptions need no key and preserve bare free-plugin URLs', async () => {
  const response = await subscription.handler({ httpMethod: 'GET', headers: {},
    queryStringParameters: { source: 'xinghai.json', key: 'must-not-be-used' } }, {});
  assert.equal(response.statusCode, 200);
  const { plugins } = JSON.parse(response.body);
  for (const file of Object.keys(SOURCE_CONFIG.xinghai.plugins)) {
    const url = new URL(plugins.find(p => new URL(p.url).pathname.endsWith('/' + file)).url);
    assert.equal(url.searchParams.get('source'), 'xinghai');
    assert.equal(url.searchParams.has('key'), false);
  }
  for (const file of ['bilibili.js', 'qishui.js', 'mg.js']) {
    const url = new URL(plugins.find(p => new URL(p.url).pathname.endsWith('/' + file)).url);
    assert.equal(url.search, '');
  }
});

test('all four generated handlers use only the xinghai parser and validate playable PHP URLs', async () => {
  for (const [file, qualityList] of Object.entries(SOURCE_CONFIG.xinghai.plugins)) {
    const calls = [];
    const audioUrl = endpoint + 'kwplay.php?token=audio-only';
    const context = await generated(file, async (url, options) => {
      calls.push({ url, options });
      return url === endpoint
        ? { data: { code: 200, url: audioUrl, quality: 'flac' } }
        : { data: Buffer.from('fLaC\0\0\0\0') };
    });
    const source = file === 'qq.js' ? 'tx' : file.slice(0, -3);
    const result = await context.requestMusicUrl(source, 'sample-id', qualityList[0]);
    assert.equal(result.url, audioUrl);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, endpoint);
    assert.equal(calls[0].options.params.source, source === 'tx' ? 'qq' : source);
    assert.equal(calls[0].options.params.songmid, 'sample-id');
    assert.equal(calls[0].options.params.quality, qualityList[0]);
    const token = JSON.parse(Buffer.from(calls[0].options.headers['X-Token'], 'base64').toString());
    assert.match(token.device_id, /^lx-online-/);
    assert.equal(typeof token.timestamp, 'number');
    assert.equal(calls[1].options.headers['X-Token'], undefined);
    assert.equal(calls[1].options.headers.Range, 'bytes=0-1023');
  }
});

test('xinghai rejects unsupported input before network access and never falls back', async () => {
  let calls = 0;
  const context = await generated('qq.js', async () => { calls++; throw new Error('upstream unavailable'); });
  await assert.rejects(context.requestMusicUrl('tx', 'mid', 'hires'), /不支持的音质/);
  await assert.rejects(context.requestMusicUrl('kw', 'mid', 'flac'), /不支持的平台/);
  await assert.rejects(context.requestMusicUrl('tx', '', 'flac'), /缺少歌曲 ID/);
  assert.equal(calls, 0);
  await assert.rejects(context.requestMusicUrl('tx', 'mid', 'flac'), /upstream unavailable/);
  assert.equal(calls, 1);
});

test('xinghai rejects API business failures, missing links, and fake audio', async () => {
  for (const body of [{ code: 500, msg: 'resource unavailable' }, { code: 200 },
    { code: 200, url: 'javascript:alert(1)' }, { code: 200, url: endpoint + 'error.php' }]) {
    let calls = 0;
    const context = await generated('kw.js', async url => {
      calls++;
      return { data: url === endpoint ? body : Buffer.from('<html>error</html>') };
    });
    await assert.rejects(context.requestMusicUrl('kw', '94239', 'flac'));
    assert.equal(calls, body.url === endpoint + 'error.php' ? 2 : 1);
  }
});

test('xinghai refreshes its temporary token after five minutes', async () => {
  let now = Date.now();
  class Clock extends Date { static now() { return now; } }
  const tokens = [];
  const context = await generated('wy.js', async (url, options) => {
    if (url === endpoint) { tokens.push(options.headers['X-Token']); return { data: { code: 200, url: 'https://audio.example/track.flac' } }; }
    return { data: Buffer.from('fLaC\0\0\0\0') };
  }, Clock);
  await context.requestMusicUrl('wy', '123', 'flac');
  await context.requestMusicUrl('wy', '123', 'flac');
  now += 300001;
  await context.requestMusicUrl('wy', '123', 'flac');
  assert.equal(tokens[0], tokens[1]);
  assert.notEqual(tokens[1], tokens[2]);
});

test('xinghai frontend quality labels match generated plugin declarations', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const qualities = vm.runInNewContext('(' + html.match(/const SOURCE_QUALITIES = (\{[\s\S]*?\n        \});/)[1] + ')');
  assert.deepEqual(JSON.parse(JSON.stringify(qualities.xinghai)), SOURCE_CONFIG.xinghai.plugins);
  for (const file of Object.keys(SOURCE_CONFIG.xinghai.plugins)) {
    const response = await handler({ httpMethod: 'GET', path: '/plugins/' + file,
      queryStringParameters: { source: 'xinghai' } }, {});
    const declaration = response.body.match(/"?supportedQualities"?\s*:\s*(\[[^\]]*\])/)[1];
    assert.deepEqual(JSON.parse(declaration), SOURCE_CONFIG.xinghai.plugins[file]);
  }
});
