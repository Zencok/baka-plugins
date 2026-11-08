const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../plugins/kg.js'), 'utf8');
const first = 'A'.repeat(32), second = 'B'.repeat(32), flac = 'C'.repeat(32);
const date = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
function fixture({metadata = true, failure = false, songs} = {}) {
  const calls = [];
  const daily = {code:0, data:{date, refresh_at:Date.now()+60000,
    ...(metadata ? {cover_img_url:'https://imge.kugou.com/official/{size}.jpg', sub_title:'Official daily introduction'} : {}),
    songs:songs ?? [{hash:first,songname:'First',sizable_cover:'https://imge.kugou.com/song/{size}.jpg',
      hash_flac:flac,filesize_flac:12345678,time_length:180000}, {hash:second,songname:'Second'}]}};
  const axios = async options => {
    calls.push(options);
    if (options.url.includes('get_res_privilege')) {
      if (failure) throw new Error('optional details offline');
      return {data:{error_code:0,data:[
        {hash:second.toLowerCase(),relate_goods:[{quality:'320',hash:second,info:{filesize:4567890}}]},
        {hash:first,album_audio_id:123,relate_goods:[
          {quality:'high',hash:first,info:{filesize:23456789}},
          {quality:'flac',hash:flac,info:{filesize:12345678}},
          {quality:'320',info:{filesize:true}}, {quality:'dolby'},
        ]},
      ]}};
    }
    return {data:daily};
  };
  axios.get = (url, options={}) => axios({...options,url});
  const context = vm.createContext({Buffer,console:{log(){},error(){}},module:{exports:{}},exports:{},
    UPDATE_URL:'https://music.example.test/api/plugins/source/kg.js',
    env:{getUserVariables:()=>({kg_user_id:'kg_'+'a'.repeat(48)})},
    require:name=>name==='axios'?{default:axios}:name==='buffer'?{Buffer}:{}});
  vm.runInContext(source,context);
  context.module.exports.srcUrl='https://music.example.test/api/plugins/source/kg.js';
  return {plugin:context.module.exports,calls};
}

test('daily playlist supplies official cover and introduction plus per-track badge qualities', async()=>{
  const {plugin,calls} = fixture();
  const result = await plugin.getDailyRecommendations();
  assert.equal(result.state,'ready');
  assert.equal(result.sheetItem.artwork,'https://imge.kugou.com/official/400.jpg');
  assert.equal(result.sheetItem.coverImg,result.sheetItem.artwork);
  assert.equal(result.sheetItem.description,'Official daily introduction');
  assert.equal(result.sheetItem.worksNum,2);
  assert.equal(result.musicList[0].duration,180);
  assert.equal(result.musicList[0].artwork,'https://imge.kugou.com/song/400.jpg');
  assert.ok(result.musicList[0].qualities.hires);
  assert.ok(result.musicList[0].qualities.flac);
  assert.ok(!result.musicList[0].qualities['320k']);
  assert.ok(result.musicList[1].qualities['320k']);
  assert.ok(!result.musicList[1].qualities.hires);
  assert.equal(calls.length,2);
  assert.equal(calls[1].data.resource.length,2);
  assert.ok(!calls[1].headers['X-User-Id']);
  assert.ok(!calls[1].headers['X-API-KEY']);
  const detail = await plugin.getMusicSheetInfo(result.sheetItem,1);
  assert.equal(detail.sheetItem.description,result.sheetItem.description);
  assert.ok(detail.musicList[0].qualities.hires);
  const before=calls.length;
  assert.equal((await plugin.getMusicSheetInfo(result.sheetItem,2)).musicList.length,0);
  assert.equal(calls.length,before);
});

test('optional quality errors retain official metadata, songs and proven native sizes',async()=>{
  const {plugin} = fixture({failure:true});
  const result=await plugin.getDailyRecommendations();
  assert.equal(result.state,'ready');
  assert.equal(result.sheetItem.description,'Official daily introduction');
  assert.equal(result.musicList.length,2);
  assert.ok(result.musicList[0].qualities.flac);
  assert.ok(!result.musicList[0].qualities.hires);
  assert.deepEqual(Object.keys(result.musicList[1].qualities),[]);
});

test('legacy daily responses use a song cover without inventing an official introduction',async()=>{
  const result=await fixture({metadata:false}).plugin.getDailyRecommendations();
  assert.equal(result.state,'ready');
  assert.equal(result.sheetItem.artwork,'https://imge.kugou.com/song/400.jpg');
  assert.equal(result.sheetItem.description,'');
});

test('empty daily playlists stay usable without any quality request or made-up cover',async()=>{
  const {plugin,calls}=fixture({songs:[],metadata:false});
  const result=await plugin.getDailyRecommendations();
  assert.equal(result.state,'ready');
  assert.equal(result.sheetItem.worksNum,0);
  assert.equal(result.sheetItem.artwork,'');
  assert.equal(calls.length,1);
});
