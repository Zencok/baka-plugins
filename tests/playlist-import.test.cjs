const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the actual plugin functions with deterministic provider responses.
// No account, playback source, credentials, or network is involved.
function load(file, names, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../plugins', file + '.js'), 'utf8');
  const functions = names.map(name => {
    const re = new RegExp('^(?:async )?function ' + name + '\\(', 'm');
    const start = source.search(re);
    assert.notEqual(start, -1, name);
    const rest = source.slice(start);
    const next = rest.slice(1).search(/\n(?:async )?function [\w$]+\(/);
    return next < 0 ? rest : rest.slice(0, next + 1);
  }).join('\n');
  const context = vm.createContext({ console: { log() {}, error() {}, warn() {} },
    URL, setTimeout: fn => fn(), ...globals });
  vm.runInContext(functions, context);
  return context;
}
const rows = (count, begin = 0) => Array.from({ length: count }, (_, i) => ({ id: begin + i }));
function qq(request) {
  return load('qq', ['importMusicSheet', 'getQQPlaylistPage', 'buildQQImportedSheet', 'getMusicSheetInfo'], {
    axios_1: { default: request }, headers: { 'user-agent': 'fixture' },
    he: { decode: x => x }, getBatchQualities: async () => ({}), formatMusicItem: song => song,
  });
}
const qqResponse = (songs, total = 1928) => ({ data: { code: 0, req: { code: 0, data: {
  code: 0, dirinfo: { disstid: 2784566436, title: '我喜欢', songnum: total }, songlist: songs,
} } } });

test('QQ imports beyond 999; short/duplicate slots do not truncate; source total is retained', async () => {
  const offsets = [];
  const plugin = qq(async config => {
    const { song_begin: begin, song_num: size } = config.data.req.param;
    offsets.push(begin);
    let songs = rows(Math.min(size, 1928 - begin), begin);
    if (begin === 0) songs = songs.filter(song => song.id !== 100);
    if (begin === 500) songs[0] = { id: 499 };
    return qqResponse(songs, begin ? 1927 : 1928);
  });
  const result = await plugin.importMusicSheet('2784566436');
  assert.deepEqual(offsets, [0, 500, 1000, 1500]);
  assert.equal(result.musicList.length, 1926);
  assert.equal(result.musicList.at(-1).id, 1927);
  assert.equal(result.worksNum, 1928);
  assert.equal(result.title, '我喜欢');
});

test('QQ later-page failures and repeated pages reject rather than return a partial playlist', async () => {
  for (const failure of ['network', 'repeat', 'empty', 'business']) {
    const plugin = qq(async config => {
      if (!config.data.req.param.song_begin) return qqResponse(rows(500));
      if (failure === 'network') throw Error('offline');
      if (failure === 'repeat') return qqResponse(rows(500));
      if (failure === 'empty') return qqResponse([]);
      return { data: { code: 1 } };
    });
    await assert.rejects(() => plugin.importMusicSheet('2784566436'));
  }
});

test('QQ remote playlist calls real pages instead of re-importing the entire list', async () => {
  let offset;
  const plugin = qq(async config => {
    offset = config.data.req.param.song_begin;
    return qqResponse(rows(28, offset), 1928);
  });
  const result = await plugin.getMusicSheetInfo({ id: '2784566436' }, 20);
  assert.equal(offset, 1900);
  assert.equal(result.isEnd, true);
  assert.equal(result.musicList[0].id, 1900);
  assert.equal(result.sheetItem.worksNum, 1928);
});

function kuwo(response) {
  return load('kw', ['importMusicSheet'], {
    getMusicSheetResponseById: response, he: { decode: x => x },
    parseKuWoQualityInfo: () => ({}), ensureQualities: x => x, artworkShort2Long: () => '',
    getDurationSeconds: () => 0, withKuwoArtists: x => x,
  });
}
test('Kuwo includes the final page and single-page lists', async () => {
  for (const total of [1, 80, 81, 163, 2401]) {
    const pages = [];
    const result = await kuwo(async (id, page, size) => {
      pages.push(page);
      return { total, musiclist: rows(Math.min(size, total - (page - 1) * size), (page - 1) * size) };
    }).importMusicSheet('123');
    assert.equal(result.musicList.length, total);
    assert.equal(pages.length, Math.ceil(total / 80));
  }
});
test('Kuwo propagates final-page failure and detects repeated pages', async () => {
  await assert.rejects(() => kuwo(async (id, page) => {
    if (page > 1) throw Error('offline');
    return { total: 81, musiclist: rows(80) };
  }).importMusicSheet('123'), /offline/);
  await assert.rejects(() => kuwo(async () => ({ total: 160, musiclist: rows(80) })).importMusicSheet('123'), /重复/);
});
test('Kuwo without a total continues until the first short page', async () => {
  const result = await kuwo(async (id, page) => ({ musiclist: rows(page === 1 ? 80 : 1, (page - 1) * 80) })).importMusicSheet('123');
  assert.equal(result.musicList.length, 81);
});

test('Bilibili imports more than 100 favorite pages and preserves has_more for normal paging', async () => {
  let calls = 0;
  const plugin = load('bilibili', ['getFavoriteList'], { rawApiGet: async (url, { pn }) => {
    calls++;
    return { code: 0, data: { info: { title: 'Favorite' }, medias: rows(36, (pn - 1) * 36), has_more: pn < 101 } };
  } });
  const result = await plugin.getFavoriteList('123', 1, true);
  assert.equal(calls, 101);
  assert.equal(result.medias.length, 3636);
  const page = await plugin.getFavoriteList('123', 2, false);
  assert.equal(page.hasMore, true);
  assert.equal(calls, 102);
});
test('Bilibili repeated or empty continuation is an error', async () => {
  for (const medias of [[], rows(36)]) {
    const plugin = load('bilibili', ['getFavoriteList'], { rawApiGet: async () => ({ code: 0, data: { medias, has_more: true } }) });
    await assert.rejects(() => plugin.getFavoriteList('123', 1, true));
  }
});

test('Qishui follows every next_cursor, including string has_more flags', async () => {
  const cursors = [];
  const plugin = load('qishui', ['fetchPlaylistDetailFromApi'], { qishuiPcGet: async (url, { cursor }) => {
    cursors.push(cursor);
    const offset = Number(cursor) || 0;
    return { playlist: { id: '123' }, media_resources: rows(100, offset), has_more: offset < 1100 ? '1' : '0', next_cursor: String(offset + 100) };
  } });
  const result = await plugin.fetchPlaylistDetailFromApi('123');
  assert.equal(result.media_resources.length, 1200);
  assert.equal(cursors.length, 12);
  assert.equal(result.has_more, false);
});
test('Qishui distinguishes initial API unavailability from incomplete pagination', async () => {
  const initial = load('qishui', ['fetchPlaylistDetailFromApi'], { qishuiPcGet: async () => { throw Error('offline'); } });
  assert.equal(await initial.fetchPlaylistDetailFromApi('123'), null);
  for (const mode of ['repeat', 'failure']) {
    const plugin = load('qishui', ['fetchPlaylistDetailFromApi'], { qishuiPcGet: async (url, { cursor }) => {
      if (cursor && mode === 'failure') throw Error('offline');
      return { media_resources: rows(100), has_more: true, next_cursor: 'next' };
    } });
    await assert.rejects(() => plugin.fetchPlaylistDetailFromApi('123'));
  }
});

test('Migu paginates CID discovery and batches details, retaining VIP metadata', async () => {
  const total = 1025;
  const batches = [];
  const axios = async ({ url }) => {
    const ids = new URL(url).searchParams.get('copyrightId').split(',');
    batches.push(ids.length);
    return { data: { items: ids.map(id => ({ songId: Number(id), copyrightId: id, songName: id, vipFlag: 1 })) } };
  };
  axios.get = async url => {
    if (url.includes('query_playlist')) return { data: { rsp: { playList: [{ contentCount: total, playListName: 'Migu' }] } } };
    const page = Number(new URL(url).searchParams.get('page'));
    return { data: rows(Math.min(20, total - (page - 1) * 20), (page - 1) * 20) };
  };
  const plugin = load('mg', ['importMusicSheet'], {
    axios_1: { default: axios }, cheerio_1: { load: items => arg => typeof arg === 'string'
      ? { each: cb => items.forEach((item, index) => cb(index, item)) } : { attr: () => String(arg.id) } },
    extractLyricInfo: () => ({}), formatImgUrl: x => x, getMiGuQualitiesFromSong: () => ({}),
  });
  const result = await plugin.importMusicSheet('123');
  assert.equal(result.musicList.length, total);
  assert.deepEqual(batches, [...Array(10).fill(100), 25]);
});

test('Kugou shared lists page beyond the command preview and batch privileges', async () => {
  const pages = [], batches = [];
  const plugin = load('kg', ['getKugouSharedSongs', 'getKugouImportDetails'], {
    axios_1: { default: { post: async (url, body) => {
      if (url.includes('kucodeAndShare')) {
        const { page, pagesize } = body.data;
        pages.push(page);
        return { status: 200, data: { status: 1, data: rows(Math.min(pagesize, 1201 - (page - 1) * pagesize), (page - 1) * pagesize).map(item => ({ hash: String(item.id) })) } };
      }
      batches.push(body.resource.length);
      return { status: 200, data: { status: 1, data: body.resource } };
    } } },
  });
  const songs = await plugin.getKugouSharedSongs({ id: '123', userid: 1, count: 1201 });
  const details = await plugin.getKugouImportDetails({ resource: songs });
  assert.equal(songs.length, 1201);
  assert.equal(pages.length, 13);
  assert.deepEqual(batches, [200, 200, 200, 200, 200, 200, 1]);
  assert.equal(details.data.data.length, 1201);
});
test('Kugou global collections continue after short server pages with a known total', async () => {
  const offsets = [];
  const plugin = load('kg', ['getUserListDetail2'], {
    signatureParams: () => '', getBatchMusicQualityInfo: async () => ({}), formatGatewayImportMusicItem: song => ({ id: song.hash }),
    axios_1: { default: {
      get: async url => {
        const begin = Number(new URL(url).searchParams.get('begin_idx')); offsets.push(begin);
        return { data: { data: { count: 1201, songs: rows(Math.min(100, 1201 - begin), begin).map(item => ({ hash: String(item.id) })) } } };
      },
      post: async (url, body) => ({ status: 200, data: { status: 1, data: body.resource } }),
    } },
  });
  const result = await plugin.getUserListDetail2('123');
  assert.equal(result.length, 1201);
  assert.equal(offsets.length, 13);
});

test('Netease already consumes the complete trackIds array in 200-ID batches (over 5000)', async () => {
  const batches = [];
  const plugin = load('wy', ['getSheetMusicById'], {
    axios_1: { default: { get: async () => ({ data: { playlist: { id: 123, name: 'Netease', trackCount: 5201, trackIds: rows(5201) } } }) } },
    getValidMusicItems: async ids => { batches.push(ids.length); return ids.map(id => ({ id })); },
  });
  const result = await plugin.getSheetMusicById('123', true);
  assert.equal(result.musicList.length, 5201);
  assert.equal(result.musicList.at(-1).id, 5200);
  assert.equal(batches.length, 27);
});
