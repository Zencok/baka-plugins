const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../plugins/kw.js'), 'utf8');
const key = 'kw_' + 'a'.repeat(48);
const site = 'https://music.example.test';
const date = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const direct = 'https://wapi.kuwo.cn/openapi/v1/recommend/daily/main?num=50&loginUid=123456&loginSid=987654&appuid=1234';
const native = () => ({ child: [{ type: 'music_list', title: 'Daily', baseImg: 'http://img4.kuwo.cn/daily.jpg?trace=private-tracking', child: [
  { duration: '180', img: 'http://img4.kuwo.cn/one.jpg?trace=private-tracking', data: {
    rid: 101, name: 'One &amp; Two', artist: 'Singer A&Singer B', artistid: '10&11',
    album: 'Album &amp; More', albumid: 12, duration: 123, vid: 'MV_789',
    n_minfo: 'level:p,bitrate:320,format:mp3,size:3.1Mb;level:s,bitrate:2000,format:flac,size:21.3Mb',
    format: 'mp3|flac', sid: 'private-credential', traceid: 'private-tracking',
  } },
  { musicdata: { rid: '102', name: 'Fallback', artist: 'Singer C', artistid: '13', duration: 201,
    img: 'https://evil.example.test/cover.jpg', vid: '0' } },
  { data: { rid: '101', name: 'Duplicate' } },
  { data: { rid: '0', name: 'Invalid' } },
] }] });

function load(options = {}) {
  const calls = [], playback = [];
  const metadata = options.metadata || { code: 0, data: { date, refresh_at: Date.now() + 60000, updated_at: Date.now(), url: direct } };
  const axios = async request => {
    calls.push(request);
    if (request.url.includes('/api/kw/recommendations/daily')) {
      if (options.serviceError) throw { response: { data: { code: options.serviceError } }, message: direct };
      return { data: metadata };
    }
    assert.match(request.url, /^https:\/\/wapi\.kuwo\.cn\/openapi\/v1\/recommend\/daily\/main\?/);
    if (options.upstreamError) throw new Error(direct);
    return { data: options.payload ?? native() };
  };
  axios.get = (url, config = {}) => axios({ ...config, url });
  axios.default = axios;
  const context = vm.createContext({ Buffer, URL, console: { log() {}, error() {} },
    module: { exports: {} }, exports: {}, UPDATE_URL: site + '/api/plugins/source/kw.js',
    env: { getUserVariables: () => options.variables ?? { kw_user_id: key } },
    requestMusicUrl: async (...args) => { playback.push(args); return { code: 200, url: 'https://media.example.test/song.flac' }; },
    require: name => name === 'axios' ? axios : name === 'he' ? { decode: value => value.replace(/&amp;/g, '&') } : name === 'buffer' ? { Buffer } : {},
  });
  vm.runInContext(source, context, { filename: 'kw.js' });
  context.module.exports.srcUrl = site + '/api/plugins/source/kw.js';
  return { plugin: context.module.exports, calls, playback };
}

test('daily recommendation resolves the direct URL and maps native fields without retaining credentials', async () => {
  const { plugin, calls } = load();
  const result = await plugin.getDailyRecommendations();
  assert.equal(result.state, 'ready');
  assert.equal(result.date, date);
  assert.equal(result.connectUrl, site + '/connect?platform=kw');
  assert.equal(result.sheetItem.id, 'kw-daily-' + date);
  assert.equal(result.sheetItem.worksNum, 2);
  assert.equal(result.sheetItem.artwork, 'https://img4.kuwo.cn/daily.jpg');
  assert.equal(result.musicList[0].title, 'One & Two');
  assert.equal(result.musicList[0].album, 'Album & More');
  assert.equal(result.musicList[0].albumId, 12);
  assert.equal(result.musicList[0].duration, 180);
  assert.equal(result.musicList[0].mvId, '789');
  assert.equal(result.musicList[0].singerList[0].id, '10');
  assert.equal(result.musicList[0].singerList[1].id, '11');
  assert.ok(result.musicList[0].qualities['320k']);
  assert.ok(result.musicList[0].qualities.flac);
  assert.equal(result.musicList[1].id, '102');
  assert.equal(result.musicList[1].duration, 201);
  assert.equal(result.musicList[1].artwork, '');
  assert.equal(result.musicList[1].mvId, undefined);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers['X-User-Id'], key);
  assert.equal(calls[1].url, direct);
  assert.equal(calls[1].maxRedirects, 0);
  assert.deepEqual(Object.keys(calls[1].headers), ['User-Agent']);
  for (const secret of [key, direct, '987654', 'private-']) assert.ok(!JSON.stringify(result).includes(secret));
});

test('playlist detail, alias import, direct URL import and pagination share the same converter', async () => {
  const { plugin, calls } = load();
  const detail = await plugin.getMusicSheetInfo({ id: 'kw-daily' }, 1);
  const alias = await plugin.importMusicSheet('kw-daily');
  const imported = await plugin.importMusicSheet(direct);
  assert.deepEqual(JSON.parse(JSON.stringify(alias.musicList)), JSON.parse(JSON.stringify(detail.musicList)));
  assert.deepEqual(JSON.parse(JSON.stringify(imported.musicList)), JSON.parse(JSON.stringify(detail.musicList)));
  assert.equal(imported.id, 'kw-daily-' + date);
  assert.equal(calls.length, 5);
  assert.equal((await plugin.getMusicSheetInfo(detail.sheetItem, 2)).musicList.length, 0);
  assert.equal(calls.length, 5);
  const withoutKey = load({ variables: {} });
  assert.equal((await withoutKey.plugin.importMusicSheet(direct)).musicList.length, 2);
  assert.equal(withoutKey.calls.length, 1);
});

test('missing connection, rejected login, stale metadata and upstream failures return usable states', async () => {
  for (const [options, expected, count] of [
    [{ variables: {} }, 'unconfigured', 0],
    [{ variables: { kw_user_id: 'kg_' + 'a'.repeat(48) } }, 'login_required', 0],
    [{ serviceError: 1004 }, 'login_required', 1],
    [{ metadata: { code: 24022 } }, 'error', 1],
    [{ metadata: { code: 0, data: { date: '2000-01-01', refresh_at: Date.now() + 60000, url: direct } } }, 'updating', 1],
    [{ metadata: { code: 0, data: { date, refresh_at: 0, url: direct } } }, 'updating', 1],
    [{ upstreamError: true }, 'error', 2],
    [{ payload: { child: [] } }, 'error', 2],
    [{ payload: { child: [{ child: [] }] } }, 'updating', 2],
  ]) {
    const { plugin, calls } = load(options);
    const result = await plugin.getDailyRecommendations();
    assert.equal(result.state, expected);
    assert.equal(calls.length, count);
    assert.ok(!JSON.stringify(result).includes(direct));
  }
  await assert.rejects(load({ upstreamError: true }).plugin.importMusicSheet(direct), error => !error.message.includes('987654'));
});

test('direct-link validation rejects other origins, credentials, duplicate identities and fragments before HTTP', async () => {
  const invalid = [direct.replace('https:', 'http:'), direct.replace('wapi.kuwo.cn', 'wapi.kuwo.cn.evil.test'),
    direct.replace('wapi.kuwo.cn', 'user:pass@wapi.kuwo.cn'), direct + '&loginSid=222',
    direct.replace('loginSid=987654', 'loginSid=0'), direct + '#secret', direct.replace('987654', '%ZZ')];
  for (const url of invalid) {
    const { plugin, calls } = load({ metadata: { code: 0, data: { date, refresh_at: Date.now() + 60000, url } } });
    assert.equal((await plugin.getDailyRecommendations()).state, 'error');
    assert.equal(calls.length, 1);
  }
});

test('native recommendation lists preserve order, remove duplicate IDs and cap at thirty', async () => {
  const tracks = Array.from({ length: 40 }, (_, i) => ({ data: { rid: i + 1, name: 'Song ' + (i + 1) } }));
  tracks.splice(2, 0, tracks[0]);
  const { plugin } = load({ payload: { child: [{ child: tracks }] } });
  const result = await plugin.getDailyRecommendations();
  assert.equal(result.musicList.length, 30);
  assert.deepEqual(Array.from(result.musicList, item => item.id), Array.from({ length: 30 }, (_, i) => String(i + 1)));
});

if (source.includes('// {{REQUEST_HANDLER}}')) test('direct URL playlist items remain playable through the injected source handler', async () => {
  const { plugin, playback } = load();
  const sheet = await plugin.importMusicSheet(direct);
  const media = await plugin.getMediaSource(sheet.musicList[0], 'flac');
  assert.equal(media.url, 'https://media.example.test/song.flac');
  assert.equal(playback[0][0], 'kw');
  assert.equal(String(playback[0][1]), '101');
  assert.equal(playback[0][2], 'flac');
});
