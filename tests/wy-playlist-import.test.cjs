const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../plugins/wy.js'), 'utf8');
const share = '分享歌单: 交坠喜欢的音乐 交坠 https://music.163.com/m/playlist?id=5021087445&creatorId=3334311918';

function fixture(count, failBatch = 0) {
  const ids = Array.from({ length: count }, (_, index) => index + 1);
  const batches = [];
  let qualityRequests = 0;
  const axios = async config => {
    assert.equal(config.url, 'https://music.163.com/weapi/v3/song/detail');
    const data = JSON.parse(new URLSearchParams(config.data).get('params'));
    const batch = JSON.parse(data.ids);
    batches.push(batch);
    if (batches.length === failBatch) throw Error('fixture batch unavailable');
    return { data: { code: 200,
      songs: batch.map(id => ({ id, name: `Song ${id}`, dt: 123000,
        ar: [{ id: 9, name: 'Artist' }], al: { id: 10, name: 'Album', picUrl: 'cover' },
        h: { size: 4560000, br: 320000 }, mv: id + 10000 })),
      privileges: batch.map(id => ({ id, maxbr: 999000, maxBrLevel: 'jymaster' })),
    } };
  };
  axios.default = axios;
  axios.get = async url => {
    if (url.includes('/api/song/music/detail/get')) {
      qualityRequests++;
      return { status: 200, data: { code: 200, data: {} } };
    }
    assert.equal(new URL(url).searchParams.get('id'), '5021087445');
    return { data: { playlist: { id: 5021087445, name: '交坠喜欢的音乐',
      creator: { nickname: '交坠' }, coverImgUrl: 'playlist-cover', description: 'description',
      trackCount: count, trackIds: ids.map(id => ({ id })),
    } } };
  };
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports,
    UPDATE_URL: 'https://plugin.test/wy.js', console: { log() {}, error() {} },
    require(name) {
      if (name === 'axios') return axios;
      if (name === 'qs') return { stringify: data => new URLSearchParams(data).toString() };
      if (['crypto-js', 'big-integer', 'dayjs', 'cheerio'].includes(name)) return {};
      throw Error(`Unexpected dependency: ${name}`);
    },
  });
  vm.runInContext(source, context, { timeout: 5000 });
  // Observe real batching/formatting; encryption is exercised by the live Rust host probe.
  vm.runInContext('getParamsAndEnc = text => ({ params: text })', context);
  return { plugin: module.exports, ids, batches, qualityRequests: () => qualityRequests };
}

test('large shared playlist imports every batch without per-song quality requests', async () => {
  const f = fixture(10001);
  const sheet = await f.plugin.importMusicSheet(share);
  assert.equal(f.qualityRequests(), 0);
  assert.equal(f.batches.length, 51);
  assert.ok(f.batches.every(batch => batch.length <= 200));
  assert.deepEqual(Array.from(sheet.musicList, track => track.id), f.ids);
  assert.equal(sheet.worksNum, 10001);
  assert.equal(sheet.id, '5021087445');
  assert.equal(sheet.title, '交坠喜欢的音乐');
  assert.equal(sheet.artist, '交坠');
  assert.equal(sheet.artwork, 'playlist-cover');
  assert.equal(sheet.description, 'description');
  assert.equal(sheet.musicList[0].artist, 'Artist');
  assert.equal(sheet.musicList[0].duration, 123);
  assert.equal(sheet.musicList[0].mv, 10001);
  assert.equal(sheet.musicList[0].qualities['320k'].size, 4560000);
  assert.ok(sheet.musicList[0].qualities.flac);
  assert.ok(sheet.musicList[0].qualities.master);
});

test('failed detail batch rejects the import instead of saving an incomplete playlist', async () => {
  const f = fixture(401, 2);
  await assert.rejects(f.plugin.importMusicSheet('5021087445'), /fixture batch unavailable/);
  assert.equal(f.batches.length, 2);
});

test('small and empty playlists preserve the existing import contract', async () => {
  for (const count of [0, 1, 200, 201]) {
    const f = fixture(count);
    const sheet = await f.plugin.importMusicSheet('5021087445');
    assert.deepEqual(Array.from(sheet.musicList, track => track.id), f.ids);
    assert.equal(f.batches.length, Math.ceil(count / 200));
    assert.equal(f.qualityRequests(), 0);
  }
});
