const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { handler } = require('../functions/plugin');
const subscription = require('../functions/subscription');

async function load(post, key = 'fixture-key') {
    const response = await handler({ httpMethod: 'GET', path: '/plugins/am.js',
        queryStringParameters: { source: 'ikun', key } }, {});
    assert.equal(response.statusCode, 200);
    const sandbox = { module: { exports: {} }, require(name) {
        assert.equal(name, 'axios'); return { post };
    }, Date };
    vm.runInNewContext(response.body, sandbox);
    return sandbox.module.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('template stays provider neutral and accepts a different injected adapter', async () => {
    const template = fs.readFileSync(path.join(__dirname, '../plugins/am.js'), 'utf8');
    assert.doesNotMatch(template, /ikun|wwwweb|authst/i);
    const sandbox = { module: { exports: {} }, require: () => ({}), Date,
        API_URL: 'https://other-provider.example', UPDATE_URL: 'https://plugins.example/am.js',
        requestAppleMusicApi: async () => ({ code: 200, hasNext: false, data: [{ id: 42, name: 'Other source' }] }) };
    vm.runInNewContext(template, sandbox);
    assert.equal(sandbox.module.exports.description, 'Apple Music 音源');
    assert.equal((await sandbox.module.exports.search('x')).data[0].title, 'Other source');
});

test('am is available only in ikun subscriptions and generates valid code', async () => {
    for (const source of ['ikun', 'linglan', 'xinghai', 'oi']) {
        const response = await subscription.handler({ httpMethod: 'GET', headers: {},
            queryStringParameters: { source, key: source === 'oi' ? 'a'.repeat(32) : 'fixture-key.json' } }, {});
        assert.equal(response.statusCode, 200);
        const plugin = JSON.parse(response.body).plugins.find(p => p.name === 'Apple Music');
        assert.equal(Boolean(plugin), source === 'ikun');
        if (plugin) {
            const url = new URL(plugin.url);
            assert.equal(url.pathname, '/plugins/am.js');
            assert.equal(url.searchParams.get('source'), 'ikun');
            assert.equal(url.searchParams.get('key'), 'fixture-key');
            assert.equal(plugin.version, '0.1.0');
        }
    }
    const response = await handler({ httpMethod: 'GET', path: '/plugins/am.js',
        queryStringParameters: { source: 'linglan' } }, {});
    assert.equal(response.statusCode, 404);
});

test('search maps song fields, seconds, pagination and quality metadata', async () => {
    const calls = [];
    const plugin = await load(async (url, body, config) => {
        calls.push({ url, body: plain(body), config });
        return { data: { code: 200, hasNext: true, total: 44, data: [
            { songId: 42, songName: 'Song', artists: [{ id: 7, name: 'Singer' }],
                albumId: 9, coverUrl: 'https://img.example/{w}x{h}.{f}', durationInMillis: 900,
                quality: { flac: { filesize: 1234 }, hires: 2000, atmos: {} } },
            { id: 43, name: 'Long', duration: 180000 }, { id: 44, name: 'Timed', duration: '3:01' }, null,
        ] } };
    });
    const result = plain(await plugin.search('hello', 2, 'lyric'));
    assert.equal(result.isEnd, false);
    assert.equal(result.total, 44);
    assert.equal(result.data[0].duration, 0.9);
    assert.equal(result.data[1].duration, 180);
    assert.equal(result.data[2].duration, 181);
    assert.equal(result.data[0].artwork, 'https://img.example/600x600.jpg');
    assert.equal(result.data[0].artist, 'Singer');
    assert.deepEqual(Object.keys(result.data[0].qualities), ['flac', 'hires']);
    assert.deepEqual(calls[0].body, { source: 'am', keyword: 'hello', type: 'song', page: 2, limit: 20 });
    assert.equal(calls[0].url, 'https://c.wwwweb.top/music/search');
    assert.equal(calls[0].config.headers['X-API-Key'], 'fixture-key');
    await assert.rejects(plugin.search('x', 0), /页码/);
    assert.deepEqual(plain(await plugin.search('x', 1, 'sheet')), { isEnd: true, data: [] });
});

test('albums collect all pages; artist albums and songs preserve page boundaries', async () => {
    const calls = [];
    const plugin = await load(async (url, body) => {
        calls.push(plain(body));
        if (url.endsWith('/music/album')) return { data: { code: 200, hasNext: body.page === 1,
            info: { id: 9, name: 'Album' }, data: [{ id: body.page, name: 'Track' }] } };
        return { data: { code: 200, hasNext: false, data: [{ id: 10, name: 'Work' }] } };
    });
    const album = await plugin.getAlbumInfo({ id: '9' });
    assert.equal(album.musicList.length, 2);
    assert.equal(album.albumItem.title, 'Album');
    const works = await plugin.getArtistWorks({ id: 7 }, 3, 'album');
    assert.equal(works.data[0].title, 'Work');
    assert.equal(calls[2].view, 'albums');
    assert.equal(calls[2].page, 3);
    await plugin.getArtistWorks({ id: 7 }, 1, 'music');
    assert.equal(calls[3].view, 'songs');
});

test('lyrics preserve original TTML and supplementary tracks without JS parsing', async () => {
    const ttml = '<tt xmlns="http://www.w3.org/ns/ttml"><body>untouched</body></tt>';
    const plugin = await load(async () => ({ data: { code: 200,
        data: { ttml, lyric: '[00:01]base', trans: '[00:01]译', roma: '[00:01]roma', chase: 'word', chroma: 'rich' } } }));
    const lyrics = await plugin.getLyric({ id: 42 });
    assert.equal(lyrics.rawLrc, ttml);
    assert.equal(lyrics.format, 'ttml');
    assert.equal(lyrics.translation, '[00:01]译');
    assert.equal(lyrics.romanization, '[00:01]roma');
    assert.equal(lyrics.chroma, 'rich');
});

test('media returns a versioned encrypted descriptor with no plaintext URL or credentials', async () => {
    const calls = [];
    const plugin = await load(async (url, body) => {
        calls.push({ url, body: plain(body) });
        return { data: { code: 200, url: 'https://audio.example/track.m3u8', adamId: '42',
            keyEndpoint: 'https://c.wwwweb.top/music/key', codec: 'alac', _cacheTTL: 60 } };
    });
    const source = plain(await plugin.getMediaSource({ id: '42' }, 'hires'));
    assert.deepEqual(calls[0], { url: 'https://c.wwwweb.top/music/url', body: { source: 'am', musicId: '42', quality: 'hires' } });
    assert.equal(source.type, 'apple-hls');
    assert.equal(source.appleMusic.version, 1);
    assert.equal(source.appleMusic.keyEndpoint, '/music/key');
    assert.equal(source.appleMusic.codec, 'alac');
    assert.equal('url' in source, false);
    assert.equal(JSON.stringify(source).includes('fixture-key'), false);
    assert.ok(source.expiresAt > Date.now() / 1000);
    await assert.rejects(plugin.getMediaSource({ id: 42 }, 'atmos'), /音质/);
});

test('key callback handles public samples and validates endpoint before sending credentials', async () => {
    const calls = [];
    const plugin = await load(async (url, body) => {
        calls.push({ url, body: plain(body) });
        return { data: { code: 200, data: { ctx: 'context', state: 'state', rdx: '12' } } };
    });
    const publicUri = 'skd://itunes.apple.com/P000000000/s1/e1';
    await plugin.getAppleMusicKey({ adamId: 42, uri: publicUri });
    assert.equal(calls[0].body.musicId, '0');
    const uri = 'skd://itunes.apple.com/P123/s1/e1';
    const key = await plugin.getAppleMusicKey({ adamId: 42, uri });
    assert.equal(key.ctx, 'context');
    assert.equal(calls[1].body.musicId, '42');
    for (const keyEndpoint of ['https://evil.example/music/key', '//evil.example/key', '/music/../key', '/music/key?token=x']) {
        await assert.rejects(plugin.getAppleMusicKey({ adamId: 42, uri, keyEndpoint }), /地址/);
    }
    await assert.rejects(plugin.getAppleMusicKey({ adamId: 42, uri: 'https://evil.example/key' }), /标识/);
    assert.equal(calls.length, 2);
});

test('authentication errors never return upstream secrets and missing keys make no request', async () => {
    let calls = 0;
    const post = async () => { calls++; throw new Error('fixture-key PRIVATE upstream error'); };
    const empty = await load(post, '');
    await assert.rejects(empty.search('x'), /Key/);
    assert.equal(calls, 0);
    const plugin = await load(post);
    await assert.rejects(plugin.search('x'), error => !/fixture-key|PRIVATE/.test(error.message));
    const malicious = await load(async () => ({ data: { code: 200, url: 'https://audio.example/a', keyEndpoint: 'https://evil.example/key' } }));
    await assert.rejects(malicious.getMediaSource({ id: 42 }), /地址/);
});

test('malformed replies fail clearly and albums never silently truncate', async () => {
    const invalid = await load(async () => ({ data: 'not json' }));
    await assert.rejects(invalid.search('x'), /请求失败/);
    const noKey = await load(async () => ({ data: { code: 200, data: {} } }));
    await assert.rejects(noKey.getAppleMusicKey({ adamId: 42, uri: 'skd://itunes.apple.com/P123/s1/e1' }), /模板无效/);
    const endless = await load(async () => ({ data: { code: 200, hasNext: true, data: [] } }));
    await assert.rejects(endless.getAlbumInfo({ id: 42 }), /完整读取/);
});
