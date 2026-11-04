const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../plugins/kg.js'), 'utf8');
const gcid = 'gcid_3z1706y71zez0ba';
const globalId = 'collection_3_2206217896_14_0';
const share = `https://m.kugou.com/songlist/${gcid}/?src_cid=3z1706y71zez0ba`;

function fixture({ count = 888, decodeFailure = false, pageFailure = false } = {}) {
  const requests = [];
  const axios = async () => ({ data: {} });
  axios.default = axios;
  axios.post = async (url, body) => {
    requests.push({ url, body });
    if (url.includes('/batch_decode')) {
      assert.deepEqual(JSON.parse(JSON.stringify(body)), {
        ret_info: 1, data: [{ id: gcid, id_type: 2 }],
      });
      const parsed = new URL(url);
      const signature = parsed.searchParams.get('signature');
      parsed.searchParams.delete('signature');
      const secret = 'OIlwieks28dk2k092lksi2UIkp';
      const expected = crypto.createHash('md5').update(secret +
        parsed.search.slice(1).split('&').sort().join('') + JSON.stringify(body) + secret).digest('hex');
      assert.equal(signature, expected, 'signature must include the exact JSON body');
      return { status: 200, data: decodeFailure ? { status: 0 } : {
        status: 1, data: { list: [{ id: gcid, global_collection_id: globalId }] },
      } };
    }
    if (url.includes('/command/')) {
      assert.equal(body.data, '123456');
      return { status: 200, data: { status: 1,
        data: { info: { global_collection_id: globalId, name: 'numeric' } } } };
    }
    assert.ok(url.includes('/get_res_privilege/lite'));
    assert.ok(body.resource.length <= 200);
    return { status: 200, data: { status: 1, data: body.resource } };
  };
  axios.get = async url => {
    requests.push({ url });
    const params = new URL(url).searchParams;
    assert.equal(params.get('global_collection_id'), globalId);
    const begin = Number(params.get('begin_idx'));
    if (pageFailure && begin > 0) throw Error('page unavailable');
    const length = Math.min(300, count - begin);
    return { status: 200, data: { status: 1, data: {
      count, list_info: { listid: 14, name: '1104', count,
        pic: 'https://cover.test/{size}.jpg', list_create_username: 'creator' },
      songs: Array.from({ length }, (_, i) => ({ hash: `hash${begin + i}`,
        name: `Artist - Song ${begin + i}`, audio_id: begin + i + 1 })),
    } } };
  };
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports,
    UPDATE_URL: 'https://plugin.test/kg.js', console: { log() {}, error() {}, warn() {} },
    require(name) {
      if (name === 'axios') return axios;
      if (name === 'buffer') return { Buffer };
      if (name === 'crypto-js') return {
        MD5: value => crypto.createHash('md5').update(value).digest('hex'),
      };
      if (['cheerio', 'he', 'pako'].includes(name)) return {};
      throw Error(`Unexpected dependency: ${name}`);
    },
  });
  vm.runInContext(source, context);
  vm.runInContext('getBatchMusicQualityInfo = async () => ({})', context);
  return { plugin: module.exports, requests };
}

test('new gcid share link imports all 888 tracks and preserves playlist metadata', async () => {
  const { plugin, requests } = fixture();
  const sheet = await plugin.importMusicSheet(`分享歌单「1104」 ${share}`);
  assert.equal(sheet.id, gcid);
  assert.equal(sheet.title, '1104');
  assert.equal(sheet.artist, 'creator');
  assert.equal(sheet.artwork, 'https://cover.test/400.jpg');
  assert.equal(sheet.worksNum, 888);
  assert.equal(sheet.musicList.length, 888);
  assert.equal(new Set(sheet.musicList.map(song => song.id)).size, 888);
  assert.equal(sheet.musicList[887].title, 'Song 887');
  assert.deepEqual(requests.filter(r => r.url.includes('get_other_list')).map(r =>
    Number(new URL(r.url).searchParams.get('begin_idx'))), [0, 300, 600]);
  assert.ok(!requests.some(r => r.url.includes('/command/')));
  const page = await plugin.getMusicSheetInfo({ id: sheet.id }, 2);
  assert.equal(page.musicList.length, 100);
  assert.equal(page.sheetItem.worksNum, 888);
});

test('bare gcid and empty playlists are supported', async () => {
  const { plugin } = fixture({ count: 0 });
  const sheet = await plugin.importMusicSheet(gcid);
  assert.equal(sheet.title, '1104');
  assert.equal(sheet.worksNum, 0);
  assert.equal(sheet.musicList.length, 0);
});

test('decode and pagination errors reject rather than report a partial import', async () => {
  await assert.rejects(fixture({ decodeFailure: true }).plugin.importMusicSheet(share), /解析失败/);
  await assert.rejects(fixture({ pageFailure: true }).plugin.importMusicSheet(share), /page unavailable/);
});

test('numeric command codes keep the legacy import path', async () => {
  const { plugin, requests } = fixture({ count: 1 });
  const sheet = await plugin.importMusicSheet('123456');
  assert.equal(sheet.title, 'numeric');
  assert.equal(sheet.musicList.length, 1);
  assert.ok(requests[0].url.includes('/command/'));
});

test('unsupported URLs cannot become accidental numeric command codes', async () => {
  const { plugin, requests } = fixture();
  await assert.rejects(plugin.importMusicSheet('https://m.kugou.com/unknown/123'), /不支持/);
  assert.equal(requests.length, 0);
});
