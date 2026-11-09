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
      if(url.includes('/search/singer'))return {data:{status:1,data:[
        {singerid:1,singername:'Artist'},
        {singerid:2,singername:'Fallback',imgurl:'http://img.example/{size}/fallback.jpg'},
      ]}};
      if(url.includes('/singer/info'))return {data:{status:1,data: options.params.singerid===1
        ? {singerid:1,singername:'Artist',imgurl:'http://img.example/{size}/artist.jpg',songcount:17,albumcount:7}
        : null}};
      return {data:{data:{total:1,info:[{specialid:42,specialname:'Playlist',imgurl:'http://imge.kugou.com/{size}/cover.jpg'}]}}};
    },
  };
  const context=vm.createContext({Buffer,module:{exports:{}},exports:{},UPDATE_URL:'https://example.test/kg.js',console,
    require:name=>name==='axios'?{...axios,default:axios}:name==='buffer'?{Buffer}:{}});
  vm.runInContext(fs.readFileSync(pluginPath,'utf8'),context);
  return {plugin:context.module.exports,calls,context};
}
test('artist search and details stay on original non-SSO endpoints and preserve fallback covers',async()=>{
  const {plugin,calls}=fixture();
  const result=await plugin.search('二次元',1,'artist');
  assert.equal(result.data[0].id,1);
  assert.equal(result.data[0].avatar,'https://img.example/400/artist.jpg');
  assert.equal(result.data[0].songCount,17);
  assert.equal(result.data[1].avatar,'https://img.example/400/fallback.jpg');
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
