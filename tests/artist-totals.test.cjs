const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const distributed = name => path.join(__dirname, '../plugins', name);
const external = name => path.join(root, 'QQ音乐/Vkey', name);
const qqFiles = [distributed('qq.js'), ...['qq - l1.js', 'qq - l2.js'].map(external)];
const kwFiles = [distributed('kw.js'), external('kw.js')];
const jooxFiles = ['joox.js', 'joox[T].js'].map(external);
const qishuiFiles = [distributed('qishui.js'), external('汽水音乐[K].js'),
  ...['汽水3.3.0.js', '汽水直连.js'].map(name => path.join(root, '汽水音乐', name))];
const all = [...qqFiles, ...kwFiles, ...jooxFiles, ...qishuiFiles,
  ...['wy.js', 'kg.js', 'mg.js', 'bilibili.js'].map(distributed)];

function load(file, names, mocks = {}) {
  const source = fs.readFileSync(file, 'utf8');
  new vm.Script(source, { filename: file });
  const context = vm.createContext({ console: { log() {}, error() {} }, ...mocks });
  for (const name of ['playlistSheetItem', 'artistWorksItem', ...names]) {
    const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
    assert.ok(start >= 0, `${file}: missing ${name}`);
    vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), context);
  }
  return context;
}
function optional(file, label, fn) {
  test(`${path.relative(root, file)}: ${label}`, { skip: !fs.existsSync(file) }, fn);
}

for (const file of all) optional(file, 'song and album metadata never borrow generic works counts', () => {
  const f = load(file, []);
  const artist = { id: 'a', songCount: 603, albumCount: 125, worksNum: 999 };
  assert.equal(f.artistWorksItem(artist, 'album', 0).songCount, 603);
  assert.equal(f.artistWorksItem(artist, 'album', 0).albumCount, 0);
  assert.equal(f.artistWorksItem(artist, 'music', '604').songCount, 604);
  assert.equal(f.artistWorksItem(artist, 'music', '604').albumCount, 125);
  assert.equal(f.artistWorksItem({ worksNum: 999 }, 'music').songCount, undefined);
  assert.equal(f.artistWorksItem({ worksNum: 999 }, 'album').albumCount, undefined);
  for (const bad of [undefined, null, '', false, -1, 1.5, Infinity, 'bad']) {
    assert.equal(f.artistWorksItem({}, 'music', bad).songCount, undefined);
    assert.equal(f.artistWorksItem(artist, 'album', bad).albumCount, 125);
  }
});

for (const file of qqFiles) optional(file, 'song and album pages return independent source totals', async () => {
  for (const count of [603, 0, undefined]) {
    const axios = async () => ({ data: {
      singerSongList: { data: { totalNum: count, songList: [{ songInfo: { id: 's' } }] } },
      singerAlbum: { data: { total: count, list: [{ id: 'a' }] } },
    } });
    const f = load(file, ['getArtistSongs', 'getArtistAlbums'], {
      pageSize: 20, TRACK_QUALITY_COMM: {}, headers: {}, changeUrlQuery: () => 'fixture',
      axios_1: { default: axios }, formatMusicItem: x => x,
      formatMusicItemList: async x => x, formatAlbumItem: x => x,
    });
    for (const page of [1, 2]) {
      const songs = await f.getArtistSongs({ id: 'x', albumCount: 125 }, page);
      const albums = await f.getArtistAlbums({ id: 'x', songCount: 603 }, page);
      assert.equal(songs.artistItem.songCount, count);
      assert.equal(songs.artistItem.albumCount, 125);
      assert.equal(albums.artistItem.albumCount, count);
      assert.equal(albums.artistItem.songCount, 603);
    }
  }
});

for (const file of kwFiles) optional(file, 'Kuwo totals survive both kinds of pagination', async () => {
  const f = load(file, ['getArtistMusicWorks', 'getArtistAlbumWorks'], {
    pageSize: 20, axios_1: { default: async ({ params }) => ({ data: {
      pn: params.pn, total: params.stype === 'albumlist' ? '125' : '603',
      musiclist: [], albumlist: [],
    } }) }, formatAlbumItem: x => x,
  });
  for (const page of [1, 2]) {
    assert.equal((await f.getArtistMusicWorks({ id: 'x' }, page)).artistItem.songCount, 603);
    assert.equal((await f.getArtistAlbumWorks({ id: 'x' }, page)).artistItem.albumCount, 125);
  }
});

for (const file of [...qqFiles, ...kwFiles]) optional(file, 'search artist count has an explicit song meaning', () => {
  const f = load(file, ['formatArtistItem'], { he: { decode: x => x } });
  assert.equal(f.formatArtistItem({ songNum: 603, SONGNUM: 603 }).songCount, 603);
  assert.equal(f.formatArtistItem({ songNum: 0, SONGNUM: 0 }).songCount, 0);
});

test('Migu artist search retains exact counts without substituting its search-result total', async () => {
  const f = load(distributed('mg.js'), ['searchArtist'], {
    searchRows: 20, formatImgUrl: x => x,
    searchArtistV3: async () => ({ code: '000000', singerResultData: {
      totalCount: 999, result: [{ id: 'x', name: 'Singer', songCount: 0, albumCount: 125 }],
    } }),
  });
  const result = await f.searchArtist('Singer', 1);
  assert.equal(result.data[0].songCount, 0);
  assert.equal(result.data[0].albumCount, 125);
});

test('Kugou source totals are returned for songs and albums', async () => {
  const f = load(distributed('kg.js'), ['getArtistWorks'], {
    headers: {}, axios_1: { default: { get: async url => ({ data: { data: {
      info: [], total: url.endsWith('/album') ? 125 : 603,
    } } }) } },
  });
  for (const page of [1, 2]) {
    assert.equal((await f.getArtistWorks({ id: 'x' }, page, 'music')).artistItem.songCount, 603);
    assert.equal((await f.getArtistWorks({ id: 'x' }, page, 'album')).artistItem.albumCount, 125);
  }
});

test('NetEase album request includes offset and carries both authoritative counts', async () => {
  const offsets = [];
  const f = load(distributed('wy.js'), ['getArtistWorks'], {
    getParamsAndEnc: x => x, qs: { stringify: x => x },
    axios_1: { default: async ({ data }) => {
      offsets.push(JSON.parse(data));
      return { data: { artist: { musicSize: 581, albumSize: 125 },
        hotAlbums: Array(50).fill({}), hotSongs: [{}], more: true } };
    } }, withBatchQualities: async x => x, formatAlbumItem: x => x,
  });
  const artist = { id: 'x', worksNum: 999 };
  const songs = await f.getArtistWorks(artist, 1, 'music');
  assert.equal(songs.artistItem.songCount, 581);
  assert.equal(songs.artistItem.albumCount, 125);
  for (const page of [1, 2]) {
    const albums = await f.getArtistWorks(artist, page, 'album');
    assert.equal(albums.artistItem.albumCount, 125);
    assert.equal(albums.isEnd, false);
    assert.equal(offsets.at(-1).offset, (page - 1) * 50);
    assert.equal(offsets.at(-1).limit, 50);
  }
});

for (const file of jooxFiles) optional(file, 'JOOX totals describe the artist, not its preview lists', async () => {
  const f = load(file, ['getArtistWorks'], {
    getArtistDetail: async () => ({ artistInfo: { song_num: 269, album_num: 34 },
      artistTracks: { tracks: { total_count: 269, items: Array(10).fill({}) } },
      artistAlbums: { albums: { total_count: 34, items: Array(6).fill({}) } } }),
    extractList: data => data.artistAlbums.albums.items,
    extractTrackList: data => data.items || [],
    formatAlbumItem: x => x, formatMusicItem: x => x, firstImage: () => '',
  });
  const songs = await f.getArtistWorks({ id: 'x' }, 1, 'music');
  const albums = await f.getArtistWorks({ id: 'x' }, 1, 'album');
  assert.equal(songs.artistItem.songCount, 269);
  assert.equal(albums.artistItem.albumCount, 34);
  assert.equal(songs.data.length, 10);
  assert.equal(albums.data.length, 6);
});

for (const file of qishuiFiles) optional(file, 'Qishui reads artist_info counts and keeps them on both lists', async () => {
  const f = load(file, ['getArtistWorks', 'fetchArtistAlbumsPage', 'normalizeArtist'], {
    PAGE_SIZE: 20,
    qishuiPcGet: async (url, params) => {
      if (!url.endsWith('/albums') && !url.endsWith('/tracks')) {
        return { artist_info: { count_tracks: 65, count_albums: 9 } };
      }
      if (url.endsWith('/tracks')) return { tracks: [{}], has_more: true };
      return { albums: Array.from({ length: 9 }, (_, id) => ({ id: String(id + 1) })), has_more: false };
    }, parseTrackItem: x => x, parseAlbumItem: x => x,
  });
  const songs = await f.getArtistWorks({ id: 'x' }, 1, 'music');
  const albums = await f.getArtistWorks({ id: 'x' }, 1, 'album');
  assert.equal(songs.artistItem.songCount, 65);
  assert.equal(songs.artistItem.albumCount, 9);
  assert.equal(albums.artistItem.albumCount, 9);
  assert.equal((await f.getArtistWorks(songs.artistItem, 2, 'music')).artistItem.songCount, 65);
});

test('Migu never labels artist-filtered search totals as exact artist album counts', async () => {
  const f = load(distributed('mg.js'), ['getArtistWorks', 'getArtistAlbumWorks'], {
    axios_1: { default: { get: async () => ({ data: { code: '000000', data: {
      totalCount: 603, contentItemList: [{ itemList: [] }],
    } } }) } },
    searchAlbum: async () => ({ isEnd: false, total: 999, data: [{ artist: 'Singer' }] }),
  });
  assert.equal((await f.getArtistWorks({ id: 'x' }, 1, 'music')).artistItem.songCount, 603);
  const albums = await f.getArtistWorks({ id: 'x', name: 'Singer' }, 1, 'album');
  assert.equal(albums.artistItem.albumCount, undefined);
  assert.equal(albums.data.length, 1);
});

test('Bilibili upload total is a music-work count and is never exposed as albums', async () => {
  let requests = 0;
  const f = load(distributed('bilibili.js'), ['getArtistWorks'], {
    randomDmString: () => '', formatMedia: x => x,
    apiGet: async () => { requests++; return { data: { page: { count: 603, ps: 30, pn: 1 }, list: { vlist: [{}] } } }; },
  });
  assert.equal((await f.getArtistWorks({ id: 'x' }, 1, 'music')).artistItem.songCount, 603);
  const albums = await f.getArtistWorks({ id: 'x' }, 1, 'album');
  assert.equal(albums.artistItem.albumCount, undefined);
  assert.equal(albums.data.length, 0);
  assert.equal(requests, 1);
});
