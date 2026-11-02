const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  let variables = {}, body, failure;
  let playlist = { code: 0, req: { code: 0, data: { code: 0,
    dirinfo: { disstid: 900, dissname: 'Personal daily mix', desc: 'Selected for you today',
      logo: 'https://fixture.example/daily.jpg', songnum: 30 }, songlist: [] } } };
  const requests = [];
  const axios = async config => {
    requests.push({ config });
    return { data: playlist };
  };
  axios.get = async (url, config) => {
    requests.push({ url, config });
    if (failure) throw failure;
    return { data: body };
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../plugins/qq.js'), 'utf8'), {
    module, exports: module.exports, UPDATE_URL: 'https://plugins.test/qq.js',
    env: { getUserVariables: () => variables }, Date, Buffer,
    require(name) {
      return name === 'axios' ? { default: axios } : name === 'he' ? { decode: value => value }
        : name === 'buffer' ? { Buffer } : {};
    },
  });
  return { plugin: module.exports, requests,
    playlist: value => { playlist = value; },
    variables: value => { variables = value; }, body: value => { body = value; }, failure: value => { failure = value; } };
}

const validBody = () => ({ code: 0, data: {
  date: new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10),
  refresh_at: Date.now() + 60000, tid: '900',
} });

test('connection configuration is plugin-owned and missing/invalid keys never make requests', async () => {
  const f = fixture();
  assert.equal(f.plugin.userVariables[0].key, 'qq_user_id');
  const result = await f.plugin.getDailyRecommendations();
  assert.equal(result.state, 'unconfigured');
  assert.equal(result.title, '每日三十首');
  assert.equal(result.connectUrl, 'https://mc.vsaa.cn/connect');
  f.variables({ qq_user_id: 'bad\r\nkey' });
  assert.equal((await f.plugin.getDailyRecommendations()).state, 'login_required');
  assert.equal(f.requests.length, 0);
});

test('user ID stays in headers; tid opens through the normal paginated playlist API', async () => {
  const f = fixture(); f.variables({ qq_user_id: 'synthetic-connection-key' }); f.body(validBody());
  const result = await f.plugin.getDailyRecommendations();
  assert.equal(result.state, 'ready');
  assert.equal(result.sheetItem.id, '900');
  assert.equal(result.sheetItem.worksNum, 30);
  assert.equal(result.sheetItem.title, 'Personal daily mix');
  assert.equal(result.sheetItem.description, 'Selected for you today');
  assert.equal(result.sheetItem.artwork, 'https://fixture.example/daily.jpg');
  assert.equal(result.musicList, undefined);
  assert.equal(result.sheetItem._dailyRecommendation, undefined);
  assert.equal(JSON.stringify(result).includes('synthetic-connection-key'), false);
  const req = f.requests[0];
  assert.equal(req.url, 'https://mc.vsaa.cn/api/qq/recommendations/daily');
  assert.equal(req.config.headers['X-User-Id'], 'synthetic-connection-key');
  const song = { id: 123, mid: 'fixtureMid', title: 'Song', singer: [{ name: 'Artist' }],
    album: { title: 'Album', mid: 'fixtureAlbum' }, interval: 180, file: { size_128mp3: 100 } };
  f.playlist({ code: 0, req: { code: 0, data: { code: 0,
    dirinfo: { disstid: 900, dissname: 'Daily playlist', desc: 'Full description', songnum: 130 },
    songlist: [song] } } });
  const detail = await f.plugin.getMusicSheetInfo(result.sheetItem, 1);
  assert.equal(detail.isEnd, false);
  assert.equal(detail.musicList[0].title, 'Song');
  assert.equal(detail.sheetItem.description, 'Full description');
  assert.equal(detail.sheetItem.worksNum, 130);
  const next = await f.plugin.getMusicSheetInfo(result.sheetItem, 2);
  assert.equal(next.isEnd, true);
  assert.equal(f.requests.length, 4);
  for (const [index, begin] of [[1, 0], [2, 0], [3, 100]]) {
    const config = f.requests[index].config;
    assert.equal(config.url, 'https://u.y.qq.com/cgi-bin/musicu.fcg');
    assert.equal(config.data.req.param.disstid, 900);
    assert.equal(config.data.req.param.song_begin, begin);
    assert.equal(config.headers['X-User-Id'], undefined);
  }
});

test('cross-day or expired content is never returned as ready', async () => {
  const f = fixture(); f.variables({ qq_user_id: 'synthetic-connection-key' });
  const yesterday = validBody(); yesterday.data.date = '2000-01-01'; f.body(yesterday);
  assert.equal((await f.plugin.getDailyRecommendations()).state, 'updating');
  const expired = validBody(); expired.data.refresh_at = Date.now() - 1; f.body(expired);
  assert.notEqual((await f.plugin.getDailyRecommendations()).state, 'ready');
});

test('existing short collection user IDs remain usable', async () => {
  const f = fixture(); f.variables({ qq_user_id: 'abc123' }); f.body(validBody());
  assert.equal((await f.plugin.getDailyRecommendations()).state, 'ready');
  assert.equal(f.requests[0].config.headers['X-User-Id'], 'abc123');
});

test('HTTP business errors remain useful states without forwarding server diagnostics', async () => {
  const f = fixture(); f.variables({ qq_user_id: 'synthetic-connection-key' });
  for (const [code, state] of [[1001, 'login_required'], [1005, 'login_required'], [1003, 'blocked'], [2002, 'updating'], [2003, 'error']]) {
    f.failure({ response: { data: { code, message: 'private diagnostic' } } });
    const result = await f.plugin.getDailyRecommendations();
    assert.equal(result.state, state); assert.equal(JSON.stringify(result).includes('private diagnostic'), false);
  }
  f.failure(new Error('network unavailable'));
  assert.equal((await f.plugin.getDailyRecommendations()).state, 'error');
  f.failure(null); f.body(validBody());
  assert.equal((await f.plugin.getDailyRecommendations()).state, 'ready');
  // No cached response from the prior user survives a variable change.
  f.variables({}); assert.equal((await f.plugin.getDailyRecommendations()).state, 'unconfigured');
});
