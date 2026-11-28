const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');

function load(id, overrides) {
  let source = fs.readFileSync(path.join(__dirname, '../plugins/v2', id + '.js'), 'utf8');
  const assignments = Object.keys(overrides).map(name => `${name} = overrides.${name};`).join('\n');
  source = source.replace(/return \{\s*search,/, `${assignments}\nreturn { search,`);
  const context = { module: { exports: {} }, overrides };
  vm.runInNewContext(source, context);
  return context.module.exports;
}
const sdk = {
  settings: {},
  log: { debug() {}, info() {}, warn() {}, error() {} },
  bytes: { encode: value => Buffer.from(value).toString('hex') },
  crypto: { hash: (algorithm, value) => crypto.createHash(algorithm).update(Buffer.from(value, 'hex')).digest('hex') },
};
const plain = value => JSON.parse(JSON.stringify(value));
for (const [id, nativeId] of [['wy', 123], ['kg', 'ABCDEF0123456789'], ['kw', '123']]) {
  test(`${id}: lyric search keeps typed track identity and provider metadata without display platform aliases`, async () => {
    const tracks = [nativeId, typeof nativeId === 'number' ? nativeId + 1 : nativeId + '2'].map(id => ({
      id, title: 'Song', artist: 'Artist', artwork: 'https://fixture/art.jpg', album: 'Album',
      albumId: 45, duration: 123, singerList: [{ id: 'singer', name: 'Artist' }],
      qualities: { '320k': { bitrate: 320000 } }, hash: 'business-hash', copyrightId: 'copyright',
    }));
    const overrides = id === 'wy' ? {
      searchBase: async (_query, page, type) => {
        assert.equal(page, 1);
        assert.equal(type, 1);
        return { result: { songs: tracks, songCount: 2 } };
      },
      getValidMusicItems: async ids => {
        assert.deepEqual(plain(ids), tracks.map(track => track.id));
        return tracks;
      },
    } : { searchMusic: async (_query, page) => {
      assert.equal(page, 1);
      return { data: tracks, isEnd: true };
    } };
    const plugin = load(id, overrides);
    const request = { kind: 'lyric', query: 'Song Artist', limit: 1 };
    const first = await plugin.handlers.search(request, sdk);
    assert.equal(Object.hasOwn(first.items[0], 'platform'), false);
    assert.deepEqual(plain(first.items), [tracks[0]]);
    assert.equal(typeof first.items[0].id, typeof nativeId);
    assert.ok(first.nextCursor);
    const last = await plugin.handlers.search({ ...request, cursor: first.nextCursor }, sdk);
    assert.deepEqual(plain(last.items), [tracks[1]]);
    assert.equal(last.nextCursor, null);
  });
}
