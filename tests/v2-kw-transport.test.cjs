const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

function load() {
  const scope = { module: { exports: {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../plugins/v2/kw.js'), 'utf8'), scope);
  return scope.module.exports;
}
function fixture() {
  const requests = [];
  const sdk = {
    settings: {},
    bytes: { encode: (value, encoding = "utf8") => Buffer.from(value, encoding).toString("hex") },
    text: { decodeHtml: value => String(value) },
    crypto: { hash: (algorithm, value) => crypto.createHash(algorithm).update(Buffer.from(value, 'hex')).digest('hex') },
    log: { error() {}, warn() {}, info() {}, debug() {} },
    http: { request: async request => {
      const url = new URL(request.url);
      assert.equal(url.origin, 'https://search.kuwo.cn');
      assert.equal(url.pathname, '/r.s');
      requests.push(url);
      const music = { MUSICRID: 'MUSIC_7', NAME: 'Song', ARTIST: 'Artist', ARTISTID: '8',
        id: '7', musicrid: '7', name: 'Song', artist: 'Artist', artistid: '8', albumid: '9', album: 'Album' };
      const album = { albumid: '9', name: 'Album', artist: 'Artist' };
      const result = { PN: 0, RN: 30, TOTAL: 1, pn: 0, total: 1,
        abslist: [{ ...music, playlistid: '10', name: 'Sheet', nickname: 'Owner' }],
        albumlist: [album], musiclist: [music] };
      return { status: 200, headers: {}, body: JSON.stringify(result) };
    } },
  };
  return { sdk, requests };
}
for (const kind of ['music', 'album', 'artist', 'sheet', 'lyric']) {
  test(`Kuwo V2 ${kind} search uses HTTPS and preserves search paging`, async () => {
    const { sdk, requests } = fixture();
    const result = await load().handlers.search({ query: 'Fixture', kind, limit: 5, cursor: null }, sdk);
    assert.equal(result.items.length, 1);
    assert.equal(result.nextCursor, null);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].searchParams.get('all'), 'Fixture');
    assert.equal(requests[0].searchParams.get('pn'), '0');
    assert.equal(requests[0].searchParams.get('ft'), kind === 'sheet' ? 'playlist' : kind === 'lyric' ? 'music' : kind);
  });
}
test('Kuwo V2 album and artist detail requests use the same HTTPS catalog', async () => {
  const { sdk, requests } = fixture();
  const { handlers } = load();
  await handlers.collections.get({ entity: { id: '9', type: 'album' } }, sdk);
  for (const kind of ['music', 'album']) {
    const result = await handlers.collections.members({ entity: { id: '8', type: 'artist' }, kind, limit: 5, cursor: null }, sdk);
    assert.equal(result.items.length, 1);
    assert.equal(result.nextCursor, null);
  }
  assert.deepEqual(requests.map(url => url.searchParams.get('stype')), ['albuminfo', 'artist2music', 'albumlist']);
});
