const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { handler } = require('../functions/plugin');
const subscription = require('../functions/subscription');
const { SOURCE_CONFIG } = require('../functions/source-config');

const endpoint = 'https://yy.zddyr.top/lx/api/';
const tokenEndpoint = endpoint + 'token.php';
const signedToken = 'xh3.server-payload.server-signature';
async function generated(file, get, DateImpl = Date, source = 'xinghai') {
  const response = await handler({ httpMethod: 'GET', path: '/plugins/' + file,
    queryStringParameters: { source } }, {});
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
      if (url === tokenEndpoint) return { data: { code: 0, data: { token: signedToken } } };
      return url === endpoint
        ? { data: { code: 200, url: audioUrl, quality: 'flac' } }
        : { data: Buffer.from('fLaC\0\0\0\0') };
    });
    const source = file === 'qq.js' ? 'tx' : file.slice(0, -3);
    const result = await context.requestMusicUrl(source, 'sample-id', qualityList[0]);
    assert.equal(result.url, audioUrl);
    assert.equal(calls.length, 3);
    assert.equal(calls[0].url, tokenEndpoint);
    assert.match(calls[0].options.params.device_id, /^lx-online-/);
    assert.equal(calls[0].options.headers['X-Token'], undefined);
    assert.equal(calls[1].url, endpoint);
    assert.equal(calls[1].options.params.source, source === 'tx' ? 'qq' : source);
    assert.equal(calls[1].options.params.songmid, 'sample-id');
    assert.equal(calls[1].options.params.quality, qualityList[0]);
    assert.equal(calls[1].options.headers['X-Token'], signedToken);
    assert.equal(calls[1].options.headers['X-Client'], 'XingHaiMusicSource/v3.2.17 (unknown)');
    assert.equal(calls[2].options.headers['X-Token'], undefined);
    assert.equal(calls[2].options.headers.Range, 'bytes=0-1023');
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
      if (url === tokenEndpoint) return { data: { data: { token: signedToken } } };
      calls++;
      return { data: url === endpoint ? body : Buffer.from('<html>error</html>') };
    });
    await assert.rejects(context.requestMusicUrl('kw', '94239', 'flac'));
    assert.equal(calls, body.url === endpoint + 'error.php' ? 2 : 1);
  }
});

test('xinghai caches server tokens for four minutes and keeps the device ID on refresh', async () => {
  let now = Date.now();
  class Clock extends Date { static now() { return now; } }
  const tokens = [];
  const devices = [];
  const context = await generated('wy.js', async (url, options) => {
    if (url === tokenEndpoint) {
      devices.push(options.params.device_id);
      return { data: { data: { token: signedToken + devices.length } } };
    }
    if (url === endpoint) { tokens.push(options.headers['X-Token']); return { data: { code: 200, url: 'https://audio.example/track.flac' } }; }
    return { data: Buffer.from('fLaC\0\0\0\0') };
  }, Clock);
  await context.requestMusicUrl('wy', '123', 'flac');
  await context.requestMusicUrl('wy', '123', 'flac');
  now += 240001;
  await context.requestMusicUrl('wy', '123', 'flac');
  assert.equal(tokens[0], tokens[1]);
  assert.notEqual(tokens[1], tokens[2]);
  assert.equal(devices.length, 2);
  assert.equal(devices[0], devices[1]);
});

test('xinghai shares concurrent token requests and recovers after token acquisition fails', async () => {
  let tokenCalls = 0;
  let parserCalls = 0;
  const context = await generated('wy.js', async url => {
    if (url === tokenEndpoint) {
      tokenCalls++;
      await new Promise(resolve => setImmediate(resolve));
      return { data: tokenCalls === 1 ? { code: 500 } : { data: { token: signedToken } } };
    }
    if (url === endpoint) {
      parserCalls++;
      return { data: { code: 200, url: 'https://audio.example/track.flac' } };
    }
    return { data: Buffer.from('fLaC\0\0\0\0') };
  });
  const failed = await Promise.allSettled([context.requestMusicUrl('wy', '123', 'flac'), context.requestMusicUrl('wy', '456', 'flac')]);
  assert.ok(failed.every(result => result.status === 'rejected'));
  assert.equal(tokenCalls, 1);
  assert.equal(parserCalls, 0);
  await Promise.all([context.requestMusicUrl('wy', '123', 'flac'), context.requestMusicUrl('wy', '456', 'flac')]);
  assert.equal(tokenCalls, 2);
  assert.equal(parserCalls, 2);
});

test('xinghai refreshes on each upstream auth error, retries once, and bounds repeated rejection', async () => {
  for (const auth of [{ tk_mismatch: true }, { device_id: 'untrusted-token' }, { tk_error: 'expired' }]) {
    for (const alwaysReject of [false, true]) {
      let tokenCalls = 0;
      const tokens = [];
      const context = await generated('wy.js', async (url, options) => {
        if (url === tokenEndpoint) return { data: { data: { token: signedToken + ++tokenCalls } } };
        if (url === endpoint) {
          tokens.push(options.headers['X-Token']);
          assert.equal(options.validateStatus(403), true);
          assert.equal(options.validateStatus(500), false);
          return alwaysReject || tokens.length === 1
            ? { status: 403, data: { code: 403, auth } }
            : { data: { code: 200, url: 'https://audio.example/track.flac' } };
        }
        return { data: Buffer.from('fLaC\0\0\0\0') };
      });
      if (alwaysReject) await assert.rejects(context.requestMusicUrl('wy', '123', 'flac'), /鉴权失败/);
      else assert.equal((await context.requestMusicUrl('wy', '123', 'flac')).code, 200);
      assert.equal(tokenCalls, 2);
      assert.deepEqual(tokens, [signedToken + '1', signedToken + '2']);
    }
  }
});

test('xinghai refuses expired cached tokens if renewal fails', async () => {
  let now = Date.now();
  class Clock extends Date { static now() { return now; } }
  let tokenCalls = 0;
  let parserCalls = 0;
  const context = await generated('wy.js', async url => {
    if (url === tokenEndpoint) {
      if (++tokenCalls > 1) throw new Error('token service unavailable');
      return { data: { data: { token: signedToken } } };
    }
    if (url === endpoint) {
      parserCalls++;
      return { data: { code: 200, url: 'https://audio.example/track.flac' } };
    }
    return { data: Buffer.from('fLaC\0\0\0\0') };
  }, Clock);
  await context.requestMusicUrl('wy', '123', 'flac');
  now += 240001;
  await assert.rejects(context.requestMusicUrl('wy', '123', 'flac'), /token service unavailable/);
  assert.equal(parserCalls, 1);
});

test('aggregate xinghai routes use server tokens without sending them to nianxin or audio hosts', async () => {
  for (const source of ['cihedai', 'quandouyao']) {
    for (const file of ['wy.js', 'kg.js', 'kw.js']) {
      let parserCalls = 0;
      const context = await generated(file, async (url, options) => {
        if (url === tokenEndpoint) return { data: { data: { token: signedToken } } };
        if (url === endpoint) {
          parserCalls++;
          assert.equal(options.headers['X-Token'], signedToken);
          return { data: { code: 200, url: 'https://audio.example/track.flac' } };
        }
        assert.equal(options.headers && options.headers['X-Token'], undefined);
        if (url.includes('nianxinxz.com')) throw new Error('nianxin unavailable');
        return { data: Buffer.from('fLaC\0\0\0\0') };
      }, Date, source);
      assert.equal((await context.requestMusicUrl(file.slice(0, -3), '123', 'flac')).code, 200);
      assert.equal(parserCalls, 1);
    }
  }
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
