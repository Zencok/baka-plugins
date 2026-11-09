const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const root = fs.existsSync(path.join(__dirname,'kg.js')) ? __dirname : path.join(__dirname,'../plugins');
const source = fs.readFileSync(path.join(root,'kg.js'),'utf8');
function fixture(reply) {
  const calls=[];
  const axios={get:async(url,options)=>{calls.push({url,options});return {data:await reply(options.params)};}};
  const CryptoJs={MD5:value=>({toString:()=>crypto.createHash('md5').update(value).digest('hex')})};
  const context=vm.createContext({axios,axios_1:{default:axios},CryptoJs,require:()=>CryptoJs});
  for(const name of ['kgImage','signatureParams','kgFillMissingImages','kgFillArtistImage']) {
    const start=source.search(new RegExp(`(?:async )?function ${name}\\(`));
    vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),context);
  }
  return {fill:context.kgFillMissingImages,artist:context.kgFillArtistImage,calls};
}
const hash='a'.repeat(32);
test('image fallback batches only missing images, preserves IDs and existing artwork, matches artist IDs',async()=>{
  const {fill,calls}=fixture(params=>{
    assert.equal(JSON.parse(params.data).length,1);
    const key='OIlwieks28dk2k092lksi2UIkp';
    const raw=Object.entries(params).filter(([k])=>k!=='signature').map(([k,v])=>`${k}=${v}`).sort().join('');
    assert.equal(params.signature,crypto.createHash('md5').update(key+raw+key).digest('hex'));
    return {status:1,data:[{album:[{album_id:7,sizable_cover:'http://img.test/{size}/album.jpg'}],author:[
      {author_id:2,sizable_avatar:'http://img.test/{size}/two.jpg'},
      {author_id:1,sizable_avatar:'http://img.test/{size}/one.jpg'},
    ]}]};
  });
  const items=[{id:'123',hash,album_id:7,artwork:'',singerList:[{id:'1',name:'One',avatar:''},{id:'2',avatar:'https://keep.test/two.jpg'}]},
    {id:hash.toUpperCase(),artwork:'https://keep.test/album.jpg',singerList:[{id:'1',avatar:''}]},
    {id:'b'.repeat(32),artwork:'https://keep.test/complete.jpg'}];
  await fill(items);
  assert.equal(calls.length,1);
  assert.equal(items[0].id,'123');
  assert.equal(items[0].artwork,'https://img.test/400/album.jpg');
  assert.equal(items[0].singerList[0].avatar,'https://img.test/400/one.jpg');
  assert.equal(items[0].singerList[1].avatar,'https://keep.test/two.jpg');
  assert.equal(items[1].artwork,'https://keep.test/album.jpg');
});
test('complete lists and numeric IDs without Hash do not request images',async()=>{
  const {fill,calls}=fixture(()=>{throw Error('should not request');});
  await fill([{id:hash,artwork:'https://keep.test/cover.jpg',singerList:[{id:'1',avatar:''}]},{id:'123',artwork:''}]);
  assert.equal(calls.length,0);
});
test('failure, incomplete positional rows and wrong albums never break lists or attach unrelated covers',async()=>{
  for(const reply of [()=>{throw Error('offline');},()=>({status:1,data:[]}),()=>({status:0,data:[{}]}),()=>({status:1,data:[{album:[{album_id:8,sizable_cover:'https://wrong.test/cover.jpg'}]}]})]) {
    const items=[{id:hash,album_id:7,artwork:''}];
    const {fill}=fixture(reply);assert.equal(await fill(items),items);assert.equal(items[0].artwork,'');
  }
});
test('image requests are bounded to twenty unique Hashes per batch',async()=>{
  const {fill,calls}=fixture(p=>({status:1,data:JSON.parse(p.data).map(()=>({}))}));
  await fill(Array.from({length:41},(_,i)=>({id:i.toString(16).padStart(32,'0'),artwork:''})));
  assert.deepEqual(calls.map(c=>JSON.parse(c.options.params.data).length),[20,20,1]);
});

test('artist page requests by author ID only for absent avatars and rejects mismatched identities',async()=>{
  const {artist,calls}=fixture(params=>{
    assert.deepEqual(JSON.parse(params.data),[{author_id:3047}]);
    return {status:1,data:[{author:[{author_id:3047,sizable_avatar:'http://img.test/{size}/artist.jpg'}]}]};
  });
  const item={id:'3047',avatar:''};await artist(item);
  assert.equal(item.avatar,'https://img.test/400/artist.jpg');
  await artist(item);assert.equal(calls.length,1);
  const wrong=fixture(()=>({status:1,data:[{author:[{author_id:999,sizable_avatar:'https://wrong.test/a.jpg'}]}]}));
  const missing={id:3047,avatar:''};await wrong.artist(missing);assert.equal(missing.avatar,'');
  const offline=fixture(()=>{throw Error('offline');});assert.equal(await offline.artist(missing),missing);
});
