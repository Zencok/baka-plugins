const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const pluginPath = fs.existsSync(path.join(__dirname, 'kg.js')) ? path.join(__dirname, 'kg.js') : path.join(__dirname, '../plugins/kg.js');
function fixture({failure=false}={}) {
  const calls=[];
  const axios={
    async get(url,options) {
      calls.push({url,options});
      assert.ok(!url.includes('thirdsso.kugou.com'));
      if(url.includes('/v1/search/author'))return {data:{status:1,data:{total:53,lists:[
        {AuthorId:1,AuthorName:'<em>Artist</em>',Avatar:'http://img.example/{size}/artist.jpg',AudioCount:17,AlbumCount:7},
        {AuthorId:2,AuthorName:'Missing',Avatar:'',AudioCount:0,AlbumCount:0},
      ]}}};
      if(url.includes('/v1/search/album'))return {data:{status:1,data:{total:21,lists:[
        {albumid:3,albumname:'<em>Album</em>',singer:'Artist',img:'http://img.example/{size}/album.jpg',publish_time:'2026-11-09',songcount:8},
      ]}}};
      if(url.includes('/singer/info'))return {data:{status:1,data: options.params.singerid===1
        ? {singerid:1,singername:'Artist',imgurl:'http://img.example/{size}/artist.jpg',songcount:17,albumcount:7}
        : null}};
      return {data:{data:{total:1,info:[{specialid:42,specialname:'Playlist',imgurl:'http://imge.kugou.com/{size}/cover.jpg'}]}}};
    },
  };
  const context=vm.createContext({Buffer,module:{exports:{}},exports:{},UPDATE_URL:'https://example.test/kg.js',console,
    require:name=>name==='axios'?{...axios,default:axios}:name==='buffer'?{Buffer}:name==='crypto-js'?{MD5:value=>({toString:()=>crypto.createHash('md5').update(value).digest('hex')})}:name==='cheerio'?{load:value=>({text:()=>value.replace(/<[^>]*>/g,'')})}:{}});
  vm.runInContext(fs.readFileSync(pluginPath,'utf8'),context);
  return {plugin:context.module.exports,calls,context};
}
test('mobile signed artist search preserves identities, totals and real covers without SSO',async()=>{
  const {plugin,calls}=fixture();
  const result=await plugin.search('二次元',1,'artist');
  assert.equal(result.data[0].id,1);
  assert.equal(result.data[0].avatar,'https://img.example/400/artist.jpg');
  assert.equal(result.data[0].songCount,17);
  assert.equal(result.data[1].avatar,'');
  assert.equal(result.data[0].name,'Artist');
  assert.equal(result.isEnd,false);
  assert.equal(calls.length,1);
  const params=calls[0].options.params;
  const key='OIlwieks28dk2k092lksi2UIkp';
  const raw=Object.entries(params).filter(([k])=>k!=='signature').map(([k,v])=>`${k}=${v}`).sort().join('');
  assert.equal(params.signature,crypto.createHash('md5').update(key+raw+key).digest('hex'));
  const info=await plugin.getArtistInfo(result.data[0]);
  assert.equal(info.avatar,'https://img.example/400/artist.jpg');
  assert.ok(calls.every(c=>!c.url.includes('thirdsso.kugou.com')));
});
test('playlist search replaces cover size placeholders and supplies both host cover fields',async()=>{
  const {plugin}=fixture();const result=await plugin.search('二次元',1,'sheet');
  assert.equal(result.data[0].coverImg,'https://imge.kugou.com/400/cover.jpg');
  assert.equal(result.data[0].artwork,result.data[0].coverImg);
});
test('daily singer identities retain structured artists and safely split legacy SSO joined fields',()=>{
  const {context}=fixture();
  const project=item=>JSON.parse(vm.runInContext('JSON.stringify(kgSingerList('+JSON.stringify(item)+'))',context));
  assert.deepEqual(project({singer_id:'3520',singer_name:'Jay'}),[{id:'3520',name:'Jay',avatar:''}]);
  assert.deepEqual(project({singer_id:'1,2',singer_name:'A,B'}).map(s=>s.id),['1','2']);
  assert.deepEqual(project({singers:[{singer_id:1,singer_name:'A,B',singer_img:'http://img.example/{size}.jpg'}]}),[{id:'1',name:'A,B',avatar:'https://img.example/400.jpg'}]);
  assert.deepEqual(project({singer_id:'1,2',singer_name:'Ambiguous'}),[]);
});

test('mobile album search maps cover, date and pagination',async()=>{
  const {plugin}=fixture();
  const result=await plugin.search('二次元',1,'album');
  assert.equal(result.data[0].id,3);
  assert.equal(result.data[0].title,'Album');
  assert.equal(result.data[0].artwork,'https://img.example/400/album.jpg');
  assert.equal(result.data[0].date,'2026-11-09');
  assert.equal(result.isEnd,false);
});

test('song search uses captured mobile filter parameters and keeps Hash IDs',async()=>{
  const {context}=fixture();
  const calls=[];
  vm.runInContext('axios_1',context).default.get=async(url,options)=>{
    calls.push({url,options});
    return {data:{status:1,data:{total:21,lists:[{FileHash:'A'.repeat(32),Audioid:1}]}}};
  };
  vm.runInContext('getBatchMusicQualityInfo=async()=>({});formatExpandedMusicItem=item=>({id:item.FileHash})',context);
  const result=await context.searchMusic('周杰伦',1);
  assert.equal(result.data[0].id,'A'.repeat(32));
  assert.equal(result.isEnd,false);
  const params=calls[0].options.params;
  assert.equal(params.platform,'AndroidFilter');
  assert.equal(params.PrivilegeFilter,0);
  assert.equal(params.hifiquality,0);
  assert.equal(params.filter,undefined);
});


test('mobile search failures propagate instead of masquerading as empty complete results',async()=>{
  const {plugin,context}=fixture();
  vm.runInContext('axios_1',context).default.get=async()=>({data:{status:0,error_code:200001}});
  await assert.rejects(plugin.search('query',1,'artist'),/搜索失败/);
  await assert.rejects(plugin.search('query',1,'album'),/搜索失败/);
});
