const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { generateSourceHandler } = require('../functions/v2-source-handler');
const { SOURCE_CONFIG } = require('../functions/source-config');
const plugin = require('../functions/v2-plugin');
const subscription = require('../functions/v2-subscription');

test('Netlify routes force dynamic V2 responses and package runtime-read dependencies', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const config = fs.readFileSync(path.join(__dirname, '../netlify.toml'), 'utf8');
  const redirects = [...config.matchAll(/\[\[redirects\]\]([\s\S]*?)(?=\[\[redirects\]\]|$)/g)].map(match => match[1]);
  for (const [from, to] of [
    ['/api/v2/subscription', '/.netlify/functions/v2-subscription'],
    ['/api/v2/subscription.json', '/.netlify/functions/v2-subscription'],
    ['/v2/plugins/:plugin', '/.netlify/functions/v2-plugin?plugin=:plugin'],
  ]) {
    const rule = redirects.find(value => value.includes('from = "' + from + '"'));
    assert.ok(rule, from);
    assert.ok(rule.includes('to = "' + to + '"'));
    assert.match(rule, /status\s*=\s*200/);
    assert.match(rule, /force\s*=\s*true/);
  }
  assert.match(config, /node_bundler\s*=\s*"zisi"/);
  assert.match(config, /included_files\s*=\s*\["plugins\/\*\*",\s*"functions\/\*\*"\]/);
});

test('credential-specific V2 documents forbid shared caching and source transformation', async () => {
  const query = { source: 'ikun', key: 'key&value.json' };
  for (const response of [
    await subscription.handler({ httpMethod: 'GET', queryStringParameters: query }),
    await plugin.handler({ httpMethod: 'GET', queryStringParameters: { ...query, plugin: 'am' } }),
  ]) {
    assert.equal(response.statusCode, 200);
    for (const directive of ['private', 'no-store', 'no-transform']) assert.ok(response.headers['Cache-Control'].includes(directive));
    assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
  }
  assert.equal((await subscription.handler({ httpMethod: 'GET', queryStringParameters: null })).statusCode, 400);
});
function fixture(config, platform, responses, key = 'test-key') {
  const calls = [];
  const sdk = {
    http: { request: async options => { calls.push(options); const next = responses.shift(); if (next instanceof Error) throw next; return { status: 200, body: next }; } },
    bytes: { encode: value => Buffer.from(value).toString('hex') },
    crypto: { hash: (algorithm, hex) => crypto.createHash(algorithm).update(Buffer.from(hex, 'hex')).digest('hex'), randomBytes: n => 'ab'.repeat(n) },
  };
  const code = generateSourceHandler(config, platform, key, 'https://distribution.test/v2/plugins/' + platform);
  assert.doesNotMatch(code, /axios(?:_1)?\s*[.(]|crypto-js|require\(/);
  const scope = { module: { exports: {} } };
  vm.runInNewContext(code + '\nmodule.exports={requestMusicUrl,api:typeof requestAppleMusicApi === "function" ? requestAppleMusicApi : null};', scope);
  return { ...scope.module.exports, calls, sdk, code };
}
const audio = Buffer.from('ID3audio').toString('hex');
test('ikun and query source adapters use direct SDK calls and encode identifiers', async () => {
  const f = fixture(SOURCE_CONFIG.ikun, 'qq', [{ code: 200, url: 'https://audio.test/qq' }]);
  assert.equal((await f.requestMusicUrl({ songmid: 'abc' }, 'flac', f.sdk)).url, 'https://audio.test/qq');
  assert.deepEqual(JSON.parse(f.calls[0].body), { source: 'tx', musicId: 'abc', quality: 'flac' });
  assert.equal(f.calls[0].headers['X-API-Key'], 'test-key');
  const q = fixture(SOURCE_CONFIG.linglan, 'wy', [{ code: 200, url: 'https://audio.test/wy' }]);
  await q.requestMusicUrl({ id: 'a&b/?' }, 'flac', q.sdk);
  assert.equal(new URL(q.calls[0].url).searchParams.get('songId'), 'a&b/?');
  assert.equal(new URL(q.calls[0].url).searchParams.get('source'), 'wy');
});
test('lxmusic applies configured source mapping and auth header', async () => {
  const f = fixture({ url: 'https://api.test', apiType: 'lxmusic', authHeader: 'X-Token', sourceMap: { tx: 'qq' } }, 'qq', [{ code: 0, url: 'https://audio.test/lx' }]);
  assert.equal((await f.requestMusicUrl({ songmid: 'a/b' }, 'flac', f.sdk)).url, 'https://audio.test/lx');
  assert.equal(f.calls[0].url, 'https://api.test/url/qq/a%2Fb/flac');
  assert.equal(f.calls[0].headers['X-Token'], 'test-key');
});
test('Apple source adapter retains public authentication and endpoint envelope', async () => {
  const f = fixture(SOURCE_CONFIG.ikun, 'am', [{ code: 200, data: { items: [] } }]);
  assert.equal((await f.api('/catalog/search', { q: 'test' }, f.sdk)).code, 200);
  assert.equal(f.calls[0].url, SOURCE_CONFIG.ikun.url + '/catalog/search');
  assert.equal(f.calls[0].headers['X-API-Key'], 'test-key');
});
test('OI packet preserves SHA256 core, XOR framing and MD5 trailer using SDK primitives', async () => {
  const key = '0123456789abcdef0123456789abcdef';
  const f = fixture(SOURCE_CONFIG.oi, 'wy', [{ code: 200, data: { url: 'https://audio.test/oi', quality: 'lossless', ekey: 'encrypted' } }], key);
  const result = await f.requestMusicUrl({ id: 42 }, 'flac', f.sdk);
  assert.equal(result.ekey, 'encrypted');
  const packet = new URL(f.calls[0].url).searchParams.get('Oimc');
  assert.match(packet, /^v2[0-8][0-9a-f]+$/);
  const core = packet.slice(-48, -32), encrypted = packet.slice(16, -48), tail = packet.slice(-32);
  const digest = crypto.createHash('sha256').update('42' + key).digest('hex');
  assert.equal(core, [7,15,3,21,45,36,18,27,55,14,26,39,40,8,19,48].map(i => digest[i]).join(''));
  assert.equal(tail, crypto.createHash('md5').update(encrypted + core + key).digest('hex'));
  const bytes = Buffer.from(encrypted, 'hex');
  const plain = [...bytes.subarray(1)].map((b, i) => String.fromCharCode(b ^ core.charCodeAt(i % 16) ^ bytes[0])).join('');
  assert.equal(plain, 'server=wy&id=42&type=song&level=lossless&format=json&getEekey=1&onlyGetUrl=1&sign=' + core);
});
test('xinghai refreshes rejected token and verifies byte signatures', async () => {
  const f = fixture(SOURCE_CONFIG.xinghai, 'qq', [
    { data: { token: 'first' } }, { auth: { tk_mismatch: true } },
    { data: { token: 'second' } }, { code: 200, url: 'https://audio.test/direct' }, audio,
  ], '');
  assert.equal((await f.requestMusicUrl({ songmid: 'mid' }, 'flac', f.sdk)).url, 'https://audio.test/direct');
  assert.equal(f.calls[1].headers['X-Token'], 'first');
  assert.equal(f.calls[3].headers['X-Token'], 'second');
  assert.equal(new URL(f.calls[3].url).searchParams.get('source'), 'qq');
  assert.equal(f.calls[4].responseType, 'bytes');
});
test('aggregate sources preserve provider ordering, fallback and QQ quality fields', async () => {
  for (const source of ['cihedai', 'quandouyao']) {
    const f = fixture(SOURCE_CONFIG[source], 'qq', [{ song_play_url_sq: 'https://audio.test/sq' }, audio], '');
    assert.equal((await f.requestMusicUrl({ songmid: 'mid' }, 'flac', f.sdk)).url, 'https://audio.test/sq');
    assert.match(f.calls[0].url, /tang\.api\.s01s\.cn/);
    const providers = SOURCE_CONFIG[source].platformProviders['wy.js'];
    const responses = providers[0].type === 'xinghai'
      ? [{ data: { token: 'token' } }, { code: 500 }, { code: 200, url: 'https://audio.test/wy' }, audio]
      : [{ code: 500 }, { data: { token: 'token' } }, { code: 200, url: 'https://audio.test/wy' }, audio];
    const g = fixture(SOURCE_CONFIG[source], 'wy', responses, '');
    assert.equal((await g.requestMusicUrl({ id: 42 }, 'flac', g.sdk)).url, 'https://audio.test/wy');
    assert.ok(g.calls[0].url.startsWith(providers[0].url));
  }
});
test('V2 source/key validation never applies V1 json suffix rewriting', async () => {
  assert.throws(() => plugin.selectedSource({ source: 'ikun.json', key: 'test' }), /Invalid source/);
  assert.throws(() => plugin.selectedSource({ source: 'ikun' }), /key required/);
  assert.throws(() => plugin.selectedSource({ source: 'oi', key: 'bad' }), /OI key/);
  const selected = plugin.selectedSource({ source: 'ikun', key: 'a&b/.json' });
  const url = new URL(plugin.pluginUrl('qq', selected));
  assert.equal(url.searchParams.get('key'), 'a&b/.json');
  assert.equal(new URL(plugin.pluginUrl('bilibili', selected)).search, '');
  for (const raw of ['../qq', 'qq.js.js', 'toString', 'qq.json']) {
    assert.equal((await plugin.handler({ httpMethod: 'GET', queryStringParameters: { plugin: raw, key: 'test' } })).statusCode, 400);
  }
});
test('V2 subscription metadata is extracted without host modules or network', () => {
  const source = '// @baka-provider 2\nconst manifest={apiVersion:2,kind:"provider",id:"cc.baka.qq",sourceId:"qq.v1",name:"QQ",author:"Public",version:"1.0.0"};module.exports={manifest,handlers:{}}';
  assert.equal(subscription.manifestOf(source, 'qq').author, 'Public');
  assert.throws(() => subscription.manifestOf(source.replace('// @baka-provider 2\n', ''), 'qq'), /Exact V2 source marker/);
  assert.throws(() => subscription.manifestOf(source.replace('cc.baka.qq', 'lyra.mesh.qq'), 'qq'));
});
test('distribution serves suffixless and js routes with manifest-derived subscription metadata', async () => {
  const selected = { source: 'ikun', key: 'a&b/.json' };
  const sub = await subscription.handler({ httpMethod: 'GET', queryStringParameters: selected });
  assert.equal(sub.statusCode, 200, sub.body);
  const entries = JSON.parse(sub.body).plugins;
  assert.equal(entries.length, 7);
  for (const entry of entries) {
    const platform = entry.id.split('.').at(-1);
    for (const suffix of ['', '.js']) {
      const served = await plugin.handler({ httpMethod: 'GET', path: '/v2/plugins/' + platform + suffix, queryStringParameters: selected });
      assert.equal(served.statusCode, 200, served.body);
      assert.match(served.body, /^\/\/ @baka-provider 2/);
      assert.doesNotMatch(served.body, /axios(?:_1)?\s*[.(]|crypto-js|require\(/);
      const context = { module: { exports: {} } };
      vm.runInNewContext(served.body, context, { timeout: 1000 });
      assert.equal(context.module.exports.manifest.id, entry.id);
      assert.equal(context.module.exports.manifest.name, entry.name);
      assert.equal(context.module.exports.manifest.version, entry.version);
      assert.equal(context.module.exports.manifest.author, 'BakaMusic');
      assert.equal(entry.author, 'BakaMusic');
    }
  }
});


test('every configured V2 source emits loadable SDK-only providers and correct quality overrides', async () => {
  for (const [source, config] of Object.entries(SOURCE_CONFIG)) {
    const key = source === 'oi' ? '0123456789abcdef0123456789abcdef' : 'sample&key.json';
    const sub = await subscription.handler({ httpMethod: 'GET', queryStringParameters: { source, key } });
    assert.equal(sub.statusCode, 200, source + ': ' + sub.body);
    for (const entry of JSON.parse(sub.body).plugins) {
      const platform = entry.id.split('.').at(-1);
      const served = await plugin.handler({ httpMethod: 'GET', queryStringParameters: { plugin: platform, source, key } });
      assert.equal(served.statusCode, 200, source + '/' + platform);
      const scope = { module: { exports: {} } };
      vm.runInNewContext(served.body, scope, { timeout: 1000 });
      const manifest = scope.module.exports.manifest;
      assert.equal(manifest.sourceId, platform + '.v1');
      assert.equal(manifest.version, ['kw', 'mg'].includes(platform) ? '1.0.5' : ['wy', 'kg'].includes(platform) ? '1.0.4' : platform === 'am' ? '1.0.1' : '1.0.3');
      if (config.plugins[platform + '.js']) assert.deepEqual(Array.from(manifest.supportedQualities), config.plugins[platform + '.js']);
      assert.doesNotMatch(served.body, /axios(?:_1)?\s*[.(]|crypto-js|require\(/);
    }
  }
});
