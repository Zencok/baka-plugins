const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const musicRoot = path.resolve(__dirname, '../..');
const distributed = name => path.join(__dirname, '../plugins', name);
const external = name => path.join(musicRoot, 'QQ音乐/Vkey', name);
const qishuiFiles = [distributed('qishui.js'), external('汽水音乐[K].js'),
  ...['汽水3.3.0.js', '汽水直连.js'].map(name => path.join(musicRoot, '汽水音乐', name))];
const jooxFiles = ['joox.js', 'joox[T].js'].map(external);
const qqFiles = ['qq - l1.js', 'qq - l2.js'].map(external);
const kwFiles = [distributed('kw.js'), external('kw.js')];
const files = [...['wy.js', 'qq.js', 'kg.js', 'mg.js', 'bilibili.js'].map(distributed),
  ...kwFiles, ...qishuiFiles, ...jooxFiles, ...qqFiles];

// Evaluate the actual exported-method implementation with network/formatting
// collaborators replaced. No credentials, provider uptime or installed host needed.
function load(file, names, mocks = {}) {
  const source = fs.readFileSync(file, 'utf8');
  new vm.Script(source, { filename: file });
  const context = vm.createContext({ console: { log() {}, error() {} }, ...mocks });
  for (const name of ['playlistSheetItem', ...names]) {
    const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
    assert.ok(start >= 0, `${file}: missing ${name}`);
    const end = source.indexOf('\n}', start) + 2;
    vm.runInContext(source.slice(start, end), context);
  }
  return context;
}

function optional(file, label, body) {
  test(`${path.relative(musicRoot, file)}: ${label}`, { skip: !fs.existsSync(file) }, body);
}

for (const file of files) optional(file, 'valid totals, zero, unknown and standalone syntax', () => {
  const { playlistSheetItem: metadata } = load(file, []);
  assert.equal(metadata({ id: 'x' }, '603').worksNum, 603);
  assert.equal(metadata({ worksNum: 603 }, 0).worksNum, 0);
  assert.equal(metadata({ trackCount: 603 }, undefined).worksNum, 603);
  for (const invalid of [undefined, null, '', ' ', false, [], {}, -1, 1.5, Infinity, 'bad']) {
    assert.equal(metadata({ id: 'x' }, invalid).worksNum, undefined);
    assert.equal(metadata({ worksNum: 'bad' }, invalid).worksNum, undefined);
    assert.equal(metadata({ worksNum: 603 }, invalid).worksNum, 603);
  }
});

for (const file of kwFiles) optional(file, 'first and later pages retain source total', async () => {
  for (const total of [603, 0, undefined]) {
    const song = { id: 1, name: 'song', artist: 'artist', albumpic: 'cover' };
    const f = load(file, ['getMusicSheetInfo'], {
      pageSize: 20,
      getMusicSheetResponseById: async () => ({ total, musiclist: total === 0 ? [] : [song] }),
      getPicByRid: async () => 'cover', getQualityByMusicId: async () => ({}),
      ensureQualities: x => x, parseKuWoQualityInfo: () => ({}),
      withKuwoArtists: x => x, getDurationSeconds: () => 123,
      artworkShort2Long: x => x, he: { decode: x => x },
    });
    for (const page of [1, 2]) {
      const result = await f.getMusicSheetInfo({ id: 'x' }, page);
      assert.equal(result.sheetItem.worksNum, total);
      assert.equal(result.isEnd, total === 0);
    }
  }
});

test('Kugou numeric playlist forwards API total rather than page length', async () => {
  for (const total of [603, 0, undefined]) {
    const f = load(distributed('kg.js'), ['getSpecialMusicList', 'getMusicSheetInfo'], {
      headers: {}, axios_1: { default: { get: async () => ({
        data: { status: 1, data: { total, info: total === 0 ? [] : [{ hash: 'x' }] } },
      }) } },
      getBatchMusicQualityInfo: async () => ({}), normalizeDurationSeconds: () => 123,
    });
    for (const page of [1, 2]) {
      const result = await f.getMusicSheetInfo({ id: '123' }, page);
      assert.equal(result.sheetItem.worksNum, total);
      assert.equal(result.isEnd, total === 0);
    }
  }
});

test('Kugou full-import branch reports full collection count before slicing', async () => {
  const f = load(distributed('kg.js'), ['getMusicSheetInfo'], {
    importMusicSheet: async () => Array.from({ length: 235 }, (_, id) => ({ id })),
  });
  for (const page of [1, 2, 3]) {
    const result = await f.getMusicSheetInfo({ id: 'not-numeric' }, page);
    assert.equal(result.sheetItem.worksNum, 235);
    assert.equal(result.musicList.length, page === 3 ? 35 : 100);
    assert.equal(result.isEnd, page === 3);
  }
});

test('QQ source total handles numeric strings, empty playlists and missing counts', async () => {
  for (const total of ['603', 0, undefined, null]) {
    const f = load(distributed('qq.js'), ['getMusicSheetInfo', 'buildQQImportedSheet'], {
      getQQPlaylistPage: async () => ({ dirinfo: { songnum: total }, songlist: [] }),
      formatMusicItem: x => x, he: { decode: x => x },
    });
    for (const page of [1, 2]) {
      const result = await f.getMusicSheetInfo({ id: 'x' }, page);
      assert.equal(result.sheetItem.worksNum, total == null ? undefined : Number(total));
    }
    const result = await f.getMusicSheetInfo({ id: 'x', worksNum: 900 }, 1);
    assert.equal(result.sheetItem.worksNum, total == null ? 900 : Number(total));
  }
});

for (const file of qqFiles) optional(file, 'complete import metadata and array fallback', async () => {
  for (const count of [0, 235]) {
    for (const object of [false, true]) {
      const musicList = Array.from({ length: count }, (_, id) => ({ id }));
      const f = load(file, ['getMusicSheetInfo'], {
        importMusicSheet: async () => object ? { id: 'x', worksNum: count, musicList } : musicList,
      });
      const result = await f.getMusicSheetInfo({ id: 'x' }, 1);
      assert.equal(result.sheetItem.worksNum, count);
      assert.equal(result.musicList.length, count);
    }
  }
});

for (const file of jooxFiles) optional(file, 'nested host metadata uses total, never partial page length', async () => {
  for (const total of [603, 0, undefined]) {
    const f = load(file, ['getMusicSheetInfo'], {
      DETAIL_PAGE_SIZE: 50,
      requestPage: async () => ({ playlists: { tracks: { total_count: total, items: total === 0 ? [] : Array(50).fill({}) } } }),
      extractTrackList: tracks => tracks.items,
      formatMusicItem: x => x, formatSheetItem: x => ({ id: x.id }),
    });
    for (const page of [1, 2]) {
      const result = await f.getMusicSheetInfo({ id: 'x' }, page);
      assert.equal(result.sheetItem.worksNum, total);
      assert.equal(result.isEnd, total === 0);
      assert.equal(result.worksNum, total); // Preserve legacy top-level metadata too.
    }
  }
});

for (const file of qishuiFiles) optional(file, 'playlist metadata and toplist fallback carry totals', async () => {
  for (const total of [603, 0, undefined]) {
    const f = load(file, ['getMusicPlaylistInfo', 'normalizePlaylist'], {
      QISHUI_TOP_LIST_IDS: new Set(['top']), QISHUI_TOP_LIST_ITEMS: [],
      getTopListDetail: async () => ({ musicList: [{ id: 'a' }, { id: 'b' }] }),
      fetchPlaylistDetail: async () => ({ playlistInfo: { count_tracks: total }, media_resources: total === 0 ? [] : [{ id: 'a' }] }),
      parsePlaylistItem: () => ({ id: 'x', worksNum: 0 }),
      parsePlaylistMediaResource: x => x, prepareMusicList: x => x,
    });
    const result = await f.getMusicPlaylistInfo({ id: 'x' });
    assert.equal(result.sheetItem.worksNum, total == null ? 1 : total);
    assert.equal((await f.getMusicPlaylistInfo({ id: 'top' })).sheetItem.worksNum, 2);
  }
});

test('Migu primary and signed fallback forward totalCount', async () => {
  for (const branch of ['primary', 'signed']) {
    for (const total of [603, 0, undefined]) {
      const f = load(distributed('mg.js'), ['getMusicSheetInfo', 'miguPlaylistSheetItem'], {
        axios_1: { default: { get: async url => {
          if (url.includes('queryMusicListSongs')) {
            if (branch === 'signed') throw Error('use fallback');
            return { data: { code: '000000', list: [], totalCount: total } };
          }
          return { data: { resource: [{}], totalCount: total } };
        } } },
        createSignature: () => ({}), extractLyricInfo: () => ({}),
        formatImgUrl: x => x, formatSingerName: () => '', pickDurationSeconds: () => 123,
      });
      for (const page of [1, 2]) {
        const result = await f.getMusicSheetInfo({ id: 'x' }, page);
        assert.equal(result.sheetItem?.worksNum, total);
        assert.ok(result.sheetItem, 'must reach the expected successful branch');
      }
    }
  }
});

test('Migu H5 fallback does not assume its ambiguous total is the playlist count', async () => {
  const f = load(distributed('mg.js'), ['getMusicSheetInfo', 'miguPlaylistSheetItem'], {
    axios_1: { default: { get: async url => {
      if (!url.includes('/h5/')) throw Error('use H5 fallback');
      return { data: { data: { total: 30, items: [] } } };
    } } }, createSignature: () => ({}),
  });
  const result = await f.getMusicSheetInfo({ id: 'x', worksNum: 603 }, 1);
  assert.equal(result.sheetItem.worksNum, 603);
  assert.equal((await f.getMusicSheetInfo({ id: 'x' }, 1)).sheetItem.worksNum, undefined);
});

test('Bilibili favorite metadata keeps source zero and never invents a page total', async () => {
  for (const total of [603, 0, undefined]) {
    const f = load(distributed('bilibili.js'), ['getMusicSheetInfo'], {
      getFavoriteList: async () => ({ info: { id: 'x', media_count: total }, medias: [], hasMore: total !== 0 }),
      favoriteMediaToItem: x => x, normalizeImage: x => x,
    });
    for (const page of [1, 2]) {
      const result = await f.getMusicSheetInfo({ id: 'x' }, page);
      assert.equal(result.sheetItem.worksNum, total);
    }
  }
});

test('NetEase keeps authoritative count even when fewer track IDs are accessible, including cache reopen', async () => {
  let requests = 0;
  const f = load(distributed('wy.js'), ['getMusicSheetInfo', 'rememberSheetTrackIds'], {
    sheetTrackIdsCache: new Map(), sheetTrackTotalsCache: new Map(), SHEET_TRACK_CACHE_MAX: 40,
    axios_1: { default: { get: async () => {
      requests++;
      return { data: { playlist: { trackCount: 603, trackIds: Array.from({ length: 590 }, (_, id) => ({ id })) } } };
    } } }, getValidMusicItems: async ids => ids.map(id => ({ id })),
  });
  const first = await f.getMusicSheetInfo({ id: 'x' }, 1);
  assert.equal(first.sheetItem.worksNum, 603);
  assert.equal(first.musicList.length, 40);
  assert.equal(first.isEnd, false);
  assert.equal((await f.getMusicSheetInfo(first.sheetItem, 2)).sheetItem.worksNum, 603);
  assert.equal((await f.getMusicSheetInfo({ id: 'x' }, 1)).sheetItem.worksNum, 603);
  assert.equal(requests, 1);
  assert.equal((await f.getMusicSheetInfo(first.sheetItem, 15)).isEnd, true);
});

test('NetEase empty playlist returns an explicit zero', async () => {
  const f = load(distributed('wy.js'), ['getMusicSheetInfo'], {
    sheetTrackIdsCache: new Map(), sheetTrackTotalsCache: new Map(),
    axios_1: { default: { get: async () => ({ data: { playlist: { trackCount: 0, trackIds: [] } } }) } },
  });
  const result = await f.getMusicSheetInfo({ id: 'x' }, 1);
  assert.equal(result.sheetItem.worksNum, 0);
  assert.equal(result.musicList.length, 0);
  assert.equal(result.isEnd, true);
});


test('Migu metadata fills an absent page total and reuses it on subsequent pages', async () => {
  let requests = 0;
  const f = load(distributed('mg.js'), ['miguPlaylistSheetItem'], {
    axios_1: { default: { get: async () => {
      requests++;
      return { data: { rsp: { playList: [{ contentCount: '603' }] } } };
    } } },
  });
  const item = await f.miguPlaylistSheetItem({ id: 'x' }, 'x');
  assert.equal(item.worksNum, 603);
  assert.equal((await f.miguPlaylistSheetItem(item, 'x')).worksNum, 603);
  assert.equal(requests, 1);
});

for (const file of qishuiFiles) optional(file, 'valid empty playlist survives API/web fallback selection', () => {
  const f = load(file, ['hasValidPlaylistDetail', 'normalizePlaylist']);
  assert.equal(f.hasValidPlaylistDetail({ playlistInfo: { entity: { playlist: { count_tracks: 0 } } }, media_resources: [] }), true);
  assert.equal(f.hasValidPlaylistDetail({ playlistInfo: null, media_resources: [] }), false);
  assert.equal(f.hasValidPlaylistDetail({ playlistInfo: { count_tracks: 603 }, media_resources: [] }), false);
});
