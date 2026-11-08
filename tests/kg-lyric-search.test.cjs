const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../plugins/kg.js'), 'utf8');

function fixture(searchMusic) {
  const context = vm.createContext({ searchMusic });
  const start = source.indexOf('async function searchLyric(');
  vm.runInContext(source.slice(start, source.indexOf('\nasync function searchArtist', start)), context);
  return context;
}

test('lyric search reuses song search and retains hash, cover, album and pagination', async () => {
  const hash = 'A'.repeat(32);
  const context = fixture(async (query, page) => {
    assert.equal(query, 'song artist');
    assert.equal(page, 3);
    return {isEnd: false, data: [{id: hash, title: 'song', artist: 'artist',
      artwork: 'https://example.test/cover.jpg', album: 'album'}]};
  });
  const result = await context.searchLyric('song artist', 3);
  assert.equal(result.isEnd, false);
  assert.equal(result.data.length, 1);
  const item = result.data[0];
  assert.equal(item.id, hash);
  assert.equal(item.title, 'song');
  assert.equal(item.artist, 'artist');
  assert.equal(item.album, 'album');
  assert.equal(item.artwork, 'https://example.test/cover.jpg');
  assert.equal(typeof item.platform, 'string');
});

test('lyric search preserves empty results and propagates song search failures', async () => {
  const empty = fixture(async () => ({isEnd: true, data: []}));
  const result = await empty.searchLyric('song', 1);
  assert.equal(result.isEnd, true);
  assert.equal(result.data.length, 0);
  const failed = fixture(async () => {throw new Error('offline');});
  await assert.rejects(failed.searchLyric('song', 1), /offline/);
});

test('actual KRC parser extracts timed romanization and translation from language metadata', () => {
  const context = vm.createContext({ Buffer, console });
  const start = source.indexOf('function parseKrc(');
  const end = source.indexOf('\n}', start) + 2;
  vm.runInContext(source.slice(start, end), context);
  const language = Buffer.from(JSON.stringify({ content: [
    { type: 0, lyricContent: [['ki', 'mi'], ['so', 'ra']] },
    { type: 1, lyricContent: [['you'], ['sky']] },
  ] })).toString('base64');
  const result = context.parseKrc(`[language:${language}]\n[1000,2000]<0,1000,0>A\n[4000,2000]<0,1000,0>B`);
  assert.equal(result.romaji, '[00:01.0]kimi\n[00:04.0]sora');
  assert.equal(result.translation, '[00:01.0]you\n[00:04.0]sky');
  assert.match(result.lyric, /A\(1000,1000\)/);
});
