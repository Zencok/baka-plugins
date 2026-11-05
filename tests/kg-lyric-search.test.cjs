const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../plugins/kg.js'), 'utf8');
function fixture(handler) {
  const calls = [];
  const axios = { get: async (url, options) => {
    calls.push({ url, ...options });
    const { signature, ...params } = options.params;
    const secret = 'OIlwieks28dk2k092lksi2UIkp';
    const raw = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('');
    assert.equal(signature, crypto.createHash('md5').update(secret + raw + secret).digest('hex'));
    return { data: await handler(url, params, calls.length) };
  } };
  const context = vm.createContext({ axios_1: { default: axios },
    CryptoJs: { MD5: s => crypto.createHash('md5').update(s).digest('hex') } });
  const start = source.indexOf('async function requestKgLyric(');
  vm.runInContext(source.slice(start, source.indexOf('\nasync function searchArtist', start)), context);
  const get = source.indexOf('async function getLyric(musicItem)');
  vm.runInContext(source.slice(get, source.indexOf('\nasync function getAlbumInfo', get)), context);
  vm.runInContext('decryptKrc = value => value; parseKrc = value => ({lyric: value, translation: "translation", romaji: "romaji"})', context);
  return { context, calls };
}
test('lyric search uses signed candidate API and preserves download identity', async () => {
  const { context, calls } = fixture((url, params) => {
    if (url.endsWith('/v2/download')) {
      assert.equal(params.download_id, '123');
      assert.equal(params.accesskey, 'candidate-key');
      assert.equal(params.contenttype, '2');
      return { status: 1, data: { content: '[00:01]chosen lyric' } };
    }
    assert.equal(params.keyword, 'title & artist');
    assert.equal(params.duration, '0');
    assert.equal(params.hash, undefined);
    return { status: 200, candidates: [null, {id: 'bad'}, {
      download_id: 123, accesskey: 'candidate-key', contenttype: 2,
      song: 'title', singer: 'artist', duration: 210000,
    }] };
  });
  const result = await context.searchLyric('title & artist', 1);
  assert.equal(result.isEnd, true);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].duration, 210);
  const lyric = await context.getLyric(result.data[0]);
  assert.equal(lyric.rawLrc, '[00:01]chosen lyric');
  assert.equal(lyric.translation, 'translation');
  assert.equal(lyric.romanization, 'romaji');
  assert.equal(calls.length, 2);
});
test('candidate API is unpaged; empty queries and later pages make no request', async () => {
  const { context, calls } = fixture(() => ({status: 200, candidates: []}));
  assert.equal((await context.searchLyric('song', 2)).data.length, 0);
  assert.equal((await context.searchLyric('  ', 1)).data.length, 0);
  assert.equal(calls.length, 0);
  assert.equal((await context.searchLyric('song', 1)).data.length, 0);
});
test('lyric hosts fall back on transport or business failure', async () => {
  const { context, calls } = fixture((url, params, n) => {
    if (n === 1) throw Error('network');
    if (n === 2) return {status: 200, error_code: 20006};
    return {status: 200, candidates: []};
  });
  await context.searchLyric('song');
  assert.equal(calls.length, 3);
  assert.match(calls[2].url, /krcsretry/);
});
test('invalid or unavailable candidates reject instead of using song search', async () => {
  const malformed = fixture(() => ({status: 200}));
  await assert.rejects(malformed.context.searchLyric('song'), /candidates/);
  const failed = fixture(() => {throw Error('offline')});
  await assert.rejects(failed.context.searchLyric('song'), /offline/);
  assert.equal(failed.calls.length, 3);
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
