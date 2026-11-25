const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const pluginPath = fs.existsSync(path.join(__dirname, 'kg.js')) ? path.join(__dirname, 'kg.js') : path.join(__dirname, '../plugins/kg.js');
const source = fs.readFileSync(pluginPath, 'utf8');
const sso = source.includes('async function kgSsoCall(');
const size = sso ? 20 : 100;
function fixture(reply) {
  const calls = [];
  const rows = (page, count) => Array.from({length:count}, (_, i) => {
    const id = (page - 1) * size + i + 1;
    return sso ? {song_id:String(id)} : {hash:id.toString(16).padStart(32, '0')};
  });
  const request = async page => {
    calls.push(page);
    return reply ? reply(page, rows) : {total:500, items:rows(page, Math.max(0, Math.min(size, 500 - (page - 1) * size)))};
  };
  const axios = {get:async url => {
    const data = await request(Number(new URL(url).searchParams.get('page')));
    return {data:{status:data.status ?? 1, data:{total:data.total, info:data.items}}};
  }};
  const context = vm.createContext({Buffer, console, module:{exports:{}}, exports:{}, UPDATE_URL:'https://example.test/kg.js',
    require:name => name === 'axios' ? {...axios, default:axios} : name === 'buffer' ? {Buffer} : {},
    fetchPage:async params => {
      assert.equal(params.size, 20);
      assert.equal(params.top_id, '8888');
      const data = await request(params.page);
      return {total:data.total, songs:data.items};
    }});
  vm.runInContext(source, context);
  if (sso) vm.runInContext('kgSsoCall = async (endpoint, params) => { if(endpoint !== "top/song") throw Error(endpoint); return fetchPage(params); }; kgSsoSongs = async songs => songs.map(item => ({id:item.song_id}));', context);
  else vm.runInContext('getBatchMusicQualityInfo = async () => ({}); formatMusicItem2 = item => ({id:item.hash});', context);
  return {plugin:context.module.exports, calls};
}

test('TOP500 without a page fetches every upstream page in order for single-call hosts', async () => {
  const {plugin,calls} = fixture();
  const result = await plugin.getTopListDetail({id:'8888', title:'TOP500'});
  assert.equal(result.musicList.length, 500);
  assert.equal(new Set(result.musicList.map(item => item.id)).size, 500);
  assert.equal(result.isEnd, true);
  assert.equal(result.title, 'TOP500');
  assert.deepEqual(calls, Array.from({length:500/size}, (_,i) => i + 1));
  assert.equal(result.musicList[499].id, sso ? '500' : (500).toString(16).padStart(32,'0'));
});

test('explicit pages return 100 songs each, ending at page five without skipping songs', async () => {
  const {plugin,calls} = fixture();
  const ids = [];
  for (let page=1; page<=5; page++) {
    const result = await plugin.getTopListDetail({id:'8888'}, page);
    assert.equal(result.musicList.length, 100);
    assert.equal(result.isEnd, page === 5);
    ids.push(...result.musicList.map(item => item.id));
  }
  assert.equal(new Set(ids).size, 500);
  assert.deepEqual(calls, Array.from({length:500/size}, (_,i) => i + 1));
  const beyond = await plugin.getTopListDetail({id:'8888'}, 6);
  assert.equal(beyond.isEnd, true);
  assert.equal(beyond.musicList.length, 0);
});

test('unknown totals, string totals, empty charts and short final pages terminate correctly', async () => {
  for (const total of [undefined, null, '', '125']) {
    const {plugin,calls} = fixture((page, rows) => ({total, items:rows(page, Math.max(0,Math.min(size,125-(page-1)*size)))}));
    const result = await plugin.getTopListDetail({id:'8888'});
    assert.equal(result.musicList.length, 125);
    assert.equal(result.isEnd, true);
    assert.equal(calls.length, Math.ceil(125/size));
  }
  const empty = fixture(() => ({total:0, items:[]}));
  assert.equal((await empty.plugin.getTopListDetail({id:'8888'})).musicList.length, 0);
  assert.deepEqual(empty.calls, [1]);
});

test('unknown totals at exact page boundaries request an empty final page', async () => {
  const {plugin,calls} = fixture((page,rows) => ({items:page<=2 ? rows(page,size) : []}));
  const result = await plugin.getTopListDetail({id:'8888'});
  assert.equal(result.musicList.length, 2*size);
  assert.equal(result.isEnd, true);
  assert.deepEqual(calls, [1,2,3]);
});

test('malformed responses, failed later pages and repeated pages cannot masquerade as complete charts', async () => {
  for (const reply of [
    () => ({total:500}),
    (page,rows) => ({total:page===1?500:undefined,items:rows(page,page===2?0:size)}),
    (page,rows) => ({total:page===1?500:undefined,items:rows(page,page===2?size-1:size)}),
    (page,rows) => ({total:500,items:rows(page,page===2?0:size)}),
    (page,rows) => ({total:500,items:rows(page,page===2?size-1:size)}),
    (page,rows) => {if(page===2) throw Error('offline'); return {total:500,items:rows(page,size)};},
    (page,rows) => ({items:rows(1,size)}),
    ...(!sso ? [() => ({status:0,items:[]})] : []),
  ]) {
    const {plugin} = fixture(reply);
    await assert.rejects(plugin.getTopListDetail({id:'8888'}));
  }
});

test('invalid page numbers are rejected before any HTTP requests', async () => {
  const {plugin,calls} = fixture();
  for (const page of [0,-1,1.5,NaN,'2']) await assert.rejects(plugin.getTopListDetail({id:'8888'},page));
  assert.deepEqual(calls, []);
});
