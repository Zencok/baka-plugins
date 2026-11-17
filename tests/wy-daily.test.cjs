const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../plugins/wy.js'), 'utf8');

test('WY daily configuration, detail and import use personal connection over HTTP without changing source routing', async t => {
  const token = 'wy_' + 'a'.repeat(48), calls = [];
  let variables = {}, invalidDate = false, expired = false, failedQuality = false, loginCode = false;
  const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const target = new URL(req.headers['x-fixture-target']);
    calls.push({ target, headers: req.headers });
    assert.equal(req.headers['x-api-key'], undefined);
    let body;
    if (target.pathname === '/api/wy/recommendations/daily') {
      assert.equal(target.origin, 'https://mc.vsaa.cn');
      assert.equal(req.headers['x-user-id'], token);
      if (expired) { res.writeHead(401); res.end('{}'); return; }
      body = loginCode ? {code:1005} : { code: 0, data: {
        date: invalidDate ? '2000-01-01' : today(), refresh_at: Date.now() + 60000,
        title: '每日推荐', cover: 'http://p1.music.126.net/daily.jpg', description: '推荐简介',
        tracks: [{ id:'347230', title:'测试歌曲', artists:[{id:7,name:'歌手'}],
          album:{id:8,name:'专辑',picUrl:'http://p1.music.126.net/album.jpg'}, duration_ms:201999,
          sq:{size:1234,br:800000} }],
      } };
    } else {
      assert.equal(target.href, 'https://interface3.music.163.com/eapi/batch');
      assert.equal(req.headers['x-user-id'], undefined);
      if (failedQuality) {res.writeHead(503);res.end('{}');return;}
      const payload = JSON.parse(new URLSearchParams(raw).get('params'));
      body = {code:200,...Object.fromEntries(Object.keys(payload).map(key=>[key,{code:200,data:{songId:347230,jm:{size:5678,br:4608000}}}]))};
    }
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const axios = async config => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}`, {
      method:config.method||'GET',headers:{...config.headers,'x-fixture-target':config.url},body:config.data,
    });
    const data=await response.json();
    if (!response.ok) {const error=new Error('fixture unavailable');error.response={status:response.status,data};throw error;}
    return {data,status:response.status};
  };
  axios.default=axios;axios.get=(url,config)=>axios({...config,url});
  const module={exports:{}};
  const context=vm.createContext({module,exports:module.exports,UPDATE_URL:'https://plugins.example.test/plugins/wy.js?source=ikun&key=source-key',
    env:{getUserVariables:()=>variables},console:{log(){},error(){},warn(){}},
    require:name=>name==='axios'?axios:name==='qs'?{stringify:data=>new URLSearchParams(data).toString()}: {},
  });
  vm.runInContext(source,context);
  vm.runInContext('eapiEncrypt = (path, body) => ({params:JSON.stringify(body)})',context);
  const plugin=module.exports;
  assert.equal(plugin.version,'1.1.8');
  assert.equal(plugin.userVariables[0].key,'wy_user_id');
  assert.equal(Array.from(plugin.supportedQualities).join(','),'128k,320k,flac,hires,atmos,master');
  assert.equal((await plugin.getDailyRecommendations()).state,'unconfigured');
  variables={wy_user_id:'123456'};
  assert.equal((await plugin.getDailyRecommendations()).state,'login_required');
  assert.equal(calls.length,0);
  variables={wy_user_id:token};
  const daily=await plugin.getDailyRecommendations();
  assert.equal(daily.state,'ready');assert.equal(daily.sheetItem.description,'推荐简介');
  assert.equal(daily.sheetItem.artwork,'https://p1.music.126.net/daily.jpg');
  assert.equal(daily.sheetItem.worksNum,1);assert.equal(daily.musicList[0].duration,201);
  assert.equal(daily.musicList[0].singerList[0].name,'歌手');
  assert.ok(daily.musicList[0].qualities.flac);assert.ok(daily.musicList[0].qualities.master);
  const detail=await plugin.getMusicSheetInfo(daily.sheetItem,1);assert.equal(detail.musicList[0].id,'347230');
  const before=calls.length;
  assert.equal((await plugin.getMusicSheetInfo(daily.sheetItem,2)).musicList.length,0);assert.equal(calls.length,before);
  assert.equal((await plugin.importMusicSheet('wy-daily')).musicList.length,1);
  assert.equal((await plugin.importMusicSheet(daily.sheetItem.id)).worksNum,1);
  failedQuality=true;assert.equal((await plugin.getDailyRecommendations()).musicList.length,1);failedQuality=false;
  invalidDate=true;assert.equal((await plugin.getDailyRecommendations()).state,'updating');invalidDate=false;
  loginCode=true;assert.equal((await plugin.getDailyRecommendations()).state,'login_required');loginCode=false;
  expired=true;assert.equal((await plugin.getDailyRecommendations()).state,'login_required');
  assert.ok(calls.every(call=>!call.target.pathname.includes('/playlist/detail')));
});
