const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
function load(file, start, end, globals) {
 const source=fs.readFileSync(path.join(__dirname, '../plugins', file),'utf8');
 const context=vm.createContext({console:{error(){}},...globals});
 const a=source.indexOf(start);vm.runInContext(source.slice(a,source.indexOf(end,a)),context);return context;
}
test('KW batches 205 unique IDs, matches reordered responses by ID and preserves existing data',async()=>{
 const batches=[];
 const context=load('kw.js','async function getKuwoBatchDetails','function formatKuwoPlaylistItem',{
  axios_1:{default:{get:async(url,{params})=>{assert.match(url,/musicpay/);const ids=params.ids.split(',');batches.push(ids);return {data:{songs:ids.toReversed().map(id=>({id,N_MINFO:'flac',albumPic:'https://cover/120/a',album:'album',duration:200}))}}}}},
  parseKuWoQualityInfo:value=>value?{flac:{size:10}}:{},ensureQualities:x=>x,
 });
 const items=Array.from({length:205},(_,i)=>({id:String(i+1),title:`song${i}`,qualities:{'320k':{}},mv:'mv'}));
 items[0].artwork='original';
 const result=await context.enrichKuwoMusicItems([...items,items[0]]);
 assert.deepEqual(batches.map(b=>b.length),[100,100,5]);
 assert.equal(result.length,206);assert.equal(result[0].artwork,'original');
 assert.equal(result[204].id,'205');assert.equal(result[204].mv,'mv');
 assert.equal(result[204].artwork,'https://cover/500/a');assert.ok(result[204].qualities.flac);assert.ok(result[204].qualities['320k']);
});
test('KW optional detail failure preserves imported items and never searches by title',async()=>{
 const context=load('kw.js','async function getKuwoBatchDetails','function formatKuwoPlaylistItem',{
 axios_1:{default:{get:async url=>{assert.match(url,/musicpay/);throw Error('offline')}}},parseKuWoQualityInfo:()=>({}),ensureQualities:x=>x});
 const item={id:'123',title:'same title',qualities:{flac:{}}};
 const result=await context.enrichKuwoMusicItems([item]);assert.equal(result[0],item);
 assert.equal(Object.keys(await context.getQualityByMusicId('MUSIC_123')).length,0);
});
function wyFixture(handler) {
 const calls=[];
 const axios=async options=>{const body=JSON.parse(options.data);calls.push(body);return handler(body)};
 const context=load('wy.js','function extractWyQualityInfo','/** Attach full quality',{
 axios_1:{default:axios},qs:{stringify:x=>x},eapiEncrypt:(path,body)=>JSON.stringify(body),sizeFormate:x=>String(x),
 });return {context,calls};
}
test('WY batches advanced tiers even when ordinary file sizes are already present',async()=>{
 const {context,calls}=wyFixture(body=>({data:{code:200,...Object.fromEntries(Object.entries(body).toReversed().map(([key,value])=>[key,{code:200,data:{jm:{size:Number(JSON.parse(value).songId)},sk:{size:3000},db:{size:2000}}}]))}}));
 const ids=Array.from({length:205},(_,i)=>String(i+1));
 const result=await context.getBatchMusicQualityInfo([...ids,'1'],[{id:'1',h:{size:320}}]);
 assert.deepEqual(calls.map(x=>Object.keys(x).length),[50,50,50,50,5]);
 assert.ok(result['1']['320k']);assert.ok(result['1'].master);assert.ok(result['1'].atmos);assert.ok(result['1'].dolby);
 assert.equal(result['205'].master.size,'205');
});
test('WY retries failed batches without an unbounded single-song request fallback',async()=>{
 const {context,calls}=wyFixture(()=>{throw Error('offline')});
 const result=await context.getBatchMusicQualityInfo(['1','2'],[{id:'1',sq:{size:123}}]);
 assert.equal(calls.length,2);assert.ok(result['1'].flac);
});
