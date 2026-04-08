/**
 * BakaMusic 插件下载接口
 * 功能: 下载插件文件并动态生成请求处理器，按音源配置注入请求逻辑和音质
 */

const fs = require('fs');
const path = require('path');
const {
  SOURCE_CONFIG,
  FREE_PLUGINS,
  DEFAULT_SOURCE,
  isSourcePlugin,
  sourceSupportsPlugin,
  getQualityOverride,
} = require('./source-config');

/**
 * 验证插件文件名（防止路径遍历攻击）
 */
function isValidPluginName(pluginName) {
  return pluginName &&
    pluginName.endsWith('.js') &&
    !pluginName.includes('..') &&
    !pluginName.includes('/') &&
    !pluginName.includes('\\');
}

/**
 * 读取插件文件
 */
function readPluginFile(pluginName) {
  const pluginPath = path.join(__dirname, '..', 'plugins', pluginName);
  console.log(`Attempting to read plugin from: ${pluginPath}`);
  if (!fs.existsSync(pluginPath)) {
    throw new Error(`Plugin file not found: ${pluginName}`);
  }
  return fs.readFileSync(pluginPath, 'utf-8');
}

/**
 * 替换插件中 module.exports 的 supportedQualities 数组
 * 仅匹配属性赋值形式 (key: [...])，不影响局部变量 (const x = [...])
 */
function replaceQualities(content, qualities) {
  if (!qualities) return content;
  const json = JSON.stringify(qualities);
  return content.replace(
    /("?supportedQualities"?\s*:\s*)\[[^\]]*\]/,
    `$1${json}`
  );
}

/**
 * 根据音源类型生成请求处理器代码 (constants + requestMusicUrl 函数)
 * 所有类型统一返回 {code: 200, url: "..."} 格式，确保插件 getMediaSource 的
 * `res.code === 200 && res.url` 检查在所有音源下都能正常工作
 *
 * @param {object} sourceConfig - 音源配置对象
 * @param {string} pluginName  - 插件文件名 (如 'wy.js')
 * @param {string} apiUrl      - API 基础地址
 * @param {string} effectiveKey - 有效 API Key
 * @param {string} updateUrl   - 插件更新地址
 */
function generateRequestHandler(sourceConfig, pluginName, apiUrl, effectiveKey, updateUrl) {
  const apiType = sourceConfig.apiType || 'query';

  // 始终声明三个常量 (UPDATE_URL 被 module.exports.srcUrl 引用)
  let code = `const API_URL = ${JSON.stringify(apiUrl)};\n`;
  code += `const API_KEY = ${JSON.stringify(effectiveKey)};\n`;
  code += `const UPDATE_URL = ${JSON.stringify(updateUrl)};\n`;

  switch (apiType) {
    // ── ikun: POST ${url}/music/url, X-API-Key, {code:200} ──
    case 'ikun':
      code += `
async function requestMusicUrl(source, songId, quality) {
  return (await axios_1.default.post(\`\${API_URL}/music/url\`, { source, musicId: String(songId), quality }, {
    headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" },
    timeout: 10000
  })).data;
}`;
      break;

    // ── query: GET ${url}/url?source=&songId=&quality=, X-API-Key, {code:200} ──
    case 'query':
      code += `
async function requestMusicUrl(source, songId, quality) {
  return (await axios_1.default.get(\`\${API_URL}/url?source=\${source}&songId=\${songId}&quality=\${quality}\`, {
    headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" },
    timeout: 10000
  })).data;
}`;
      break;

    // ── lxmusic: GET ${url}/url/${source}/${songId}/${quality}, {code:0} → 标准化为 {code:200} ──
    case 'lxmusic': {
      const authHeaderName = sourceConfig.authHeader || 'X-API-Key';
      // 有 Key 时发送认证头，无 Key 时不发送
      const headersCode = effectiveKey
        ? `{ ${JSON.stringify(authHeaderName)}: API_KEY, "Content-Type": "application/json" }`
        : `{ "Content-Type": "application/json" }`;
      // 可选 sourceMap: 将插件 source 名映射为 API 期望的名称 (如 qq → tx)
      const sourceMapCode = sourceConfig.sourceMap
        ? `var _LX_SRC_MAP = ${JSON.stringify(sourceConfig.sourceMap)};\n`
        : '';
      const resolveSource = sourceConfig.sourceMap
        ? '(_LX_SRC_MAP[source] || source)'
        : 'source';
      code += `
${sourceMapCode}async function requestMusicUrl(source, songId, quality) {
  var apiSource = ${resolveSource};
  var resp = await axios_1.default.get(\`\${API_URL}/url/\${apiSource}/\${songId}/\${quality}\`, {
    headers: ${headersCode},
    timeout: 10000
  });
  var body = resp.data;
  if (body && body.code === 0 && body.url) return { code: 200, url: body.url };
  if (body && body.url) return { code: 200, url: body.url };
  return body;
}`;
      break;
    }

    // ── suyin: oiapi.net 分平台端点 (wy 用 /api/Music_163?id=, 其余各异) ──
    case 'suyin': {
      code += `
async function requestMusicUrl(source, songId, quality) {
  if (source === "wy") {
    var resp = await axios_1.default.get(API_URL + "?id=" + encodeURIComponent(songId), { timeout: 10000 });
    var body = resp.data;
    if (body && body.code === 0 && Array.isArray(body.data) && body.data[0] && body.data[0].url)
      return { code: 200, url: body.data[0].url };
    return { code: 500, msg: (body && body.message) || "No URL" };
  }
  throw new Error("Suyin: platform " + source + " not supported");
}`;
      break;
    }

    // ── changqing: 按平台独立 URL, 音质映射 (standard/exhigh/lossless) ──
    case 'changqing': {
      const platformUrl = sourceConfig.platformUrls && sourceConfig.platformUrls[pluginName];
      if (!platformUrl) {
        code += `
async function requestMusicUrl(source, songId, quality) {
  throw new Error("Platform not configured for this source");
}`;
      } else {
        code += `
var _CQ_QUALITY_MAP = ${JSON.stringify(sourceConfig.qualityMap || {})};
async function requestMusicUrl(source, songId, quality) {
  var level = _CQ_QUALITY_MAP[quality] || quality;
  return { code: 200, url: \`${platformUrl}?type=mp3&id=\${songId}&level=\${level}\` };
}`;
      }
      break;
    }

    // ── gdstudio: GD音乐台 /api.php?types=url&source=netease&id=...&br=... ──
    case 'gdstudio': {
      code += `
var _GD_SRC = {"wy":"netease","kw":"kuwo","kg":"kugou","tx":"tencent","mg":"migu"};
var _GD_BR  = {"128k":"128","192k":"192","320k":"320","flac":"740","flac24bit":"999"};
async function requestMusicUrl(source, songId, quality) {
  var apiSource = _GD_SRC[source] || source;
  var br = _GD_BR[quality] || "128";
  var resp = await axios_1.default.get(API_URL + "&types=url&source=" + apiSource + "&id=" + songId + "&br=" + br, {
    timeout: 10000
  });
  var body = resp.data;
  if (body && body.url) return { code: 200, url: body.url };
  return { code: 500, msg: (body && body.detail) || "No URL returned" };
}`;
      break;
    }

    // ── fengyu: 多端点聚合免费音源, 按平台独立处理 ──
    case 'fengyu': {
      switch (pluginName) {
        case 'qq.js':
          code += `
var _FY_QQ_Q = {"128k":"10","320k":"8","flac":"5","flac24bit":"5","atmos":"1","atmos_plus":"1","master":"0"};
async function requestMusicUrl(source, songId, quality) {
  var q = _FY_QQ_Q[quality] || "10";
  try { var r = await axios_1.default.get("https://www.littleyouzi.com/api/v2/qqmusic?quality=" + q + "&mid=" + songId, {timeout:10000}); if (r.data && r.data.retcode === 0 && r.data.data && r.data.data.audio) return {code:200,url:r.data.data.audio}; } catch(e) {}
  try { var r2 = await axios_1.default.get("https://tang.api.s01s.cn/music_open_api.php?mid=" + songId, {timeout:10000}); if (r2.data && r2.data.song_play_url_sq) return {code:200,url:r2.data.song_play_url_sq}; } catch(e) {}
  throw new Error("QQ音乐接口获取失败");
}`;
          break;
        case 'wy.js':
          code += `
var _FY_WY_Q1 = {"128k":"7","320k":"6","flac":"4","flac24bit":"3","hires":"3","master":"1"};
var _FY_WY_Q2 = {"128k":"standard","320k":"exhigh","flac":"lossless","flac24bit":"hires","hires":"hires","master":"jymaster"};
async function requestMusicUrl(source, songId, quality) {
  try { var q1 = _FY_WY_Q1[quality] || "7"; var r = await axios_1.default.get("https://www.littleyouzi.com/api/v2/netmusic?mid=" + songId + "&type=json&quality=" + q1, {timeout:10000}); if (r.data && r.data.retcode === 0 && r.data.data && r.data.data.audio) { var a = r.data.data.audio.trim(); if (a) return {code:200,url:a}; } } catch(e) {}
  try { var q2 = _FY_WY_Q2[quality] || "lossless"; var r2 = await axios_1.default.get("https://api.bugpk.com/api/163_music?ids=" + songId + "&type=json&level=" + q2, {timeout:10000}); if (r2.data && r2.data.status == 200 && r2.data.url) { var u = r2.data.url.trim(); if (u) return {code:200,url:u}; } } catch(e) {}
  try { var r3 = await axios_1.default.get("https://oiapi.net/api/Music_163?id=" + songId, {timeout:10000}); if (r3.data && r3.data.code === 0 && r3.data.data && r3.data.data[0] && r3.data.data[0].url) { var v = r3.data.data[0].url.trim(); if (v) return {code:200,url:v}; } } catch(e) {}
  throw new Error("网易云接口获取失败");
}`;
          break;
        case 'mg.js':
          code += `
var _FY_MG_Q = {"128k":"PQ","320k":"HQ","flac":"SQ","flac24bit":"ZQ"};
async function requestMusicUrl(source, songId, quality) {
  var tf = _FY_MG_Q[quality] || "PQ";
  var r = await axios_1.default.get("https://app.c.nf.migu.cn/MIGUM2.0/strategy/listen-url/v2.4?netType=01&resourceType=E&songId=" + songId + "&toneFlag=" + tf, {headers:{channel:"014000D",aversionid:"DF94898993A5A28A64968A9FD0ADA0749397878BC39DD7BC68C584A1BAAFC96EC5938D8D8ED1A490949A8F9EB680997296DFD0D391D6ABBC69928AD0B57D99779CC8B88CDDECEE89628F89A1827E986F94978AD392A7A2916A928AA4878199779C","User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"},timeout:10000});
  var body = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
  if (body && body.code === "000000") { var url = (body.data && body.data.url) || body.playUrl || body.listenUrl; if (url) { if (url.startsWith("//")) url = "https:" + url; return {code:200,url:url.replace(/\\+/g,"%2B")}; } }
  throw new Error("咪咕音乐获取失败");
}`;
          break;
        case 'kw.js':
          code += `
var _FY_KW_Q = {"128k":"128kmp3","320k":"320kmp3","flac":"2000kflac","flac24bit":"2000kflac"};
async function requestMusicUrl(source, songId, quality) {
  var br = _FY_KW_Q[quality] || "2000kflac";
  var u = Math.floor(Math.random() * 4294967295);
  var uid = Math.floor(Math.random() * 4294967295);
  var r = await axios_1.default.get("https://nmobi.kuwo.cn/mobi.s?f=web&source=kwplayercar_ar_6.0.0.9_B_jiakong_vh.apk&type=convert_url_with_sign&rid=" + songId + "&br=" + br + "&user=" + u + "&loginUid=" + uid, {timeout:10000});
  if (r.data && r.data.code === 200 && r.data.data && r.data.data.url) return {code:200,url:r.data.data.url};
  throw new Error("酷我音乐获取失败");
}`;
          break;
        default:
          code += `\nasync function requestMusicUrl() { throw new Error("不支持的平台"); }`;
      }
      break;
    }

    // ── hyw: GET ${url}/api/music/url?source=&songId=&quality=, X-Script-* + X-Card-Key ──
    case 'hyw': {
      const scriptVersion = sourceConfig.scriptVersion || '';
      const scriptId = sourceConfig.scriptId || '';
      code += `
async function requestMusicUrl(source, songId, quality) {
  return (await axios_1.default.get(\`\${API_URL}/api/music/url?source=\${source}&songId=\${songId}&quality=\${quality}\`, {
    headers: {
      "X-Script-Version": ${JSON.stringify(scriptVersion)},
      "X-Script-ID": ${JSON.stringify(scriptId)},
      "X-Card-Key": API_KEY
    }
  })).data;
}`;
      break;
    }

    // ── 默认: 同 query 类型 ──
    default:
      code += `
async function requestMusicUrl(source, songId, quality) {
  return (await axios_1.default.get(\`\${API_URL}/url?source=\${source}&songId=\${songId}&quality=\${quality}\`, {
    headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" },
    timeout: 10000
  })).data;
}`;
  }

  return code;
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    // ── 提取插件名 ──
    let pluginName = event.queryStringParameters?.plugin;
    if (!pluginName) {
      const reqPath = event.path || event.rawUrl || '';
      const match = reqPath.match(/\/plugins?\/([^/?]+\.js)/);
      if (match) pluginName = match[1];
    }

    if (!pluginName) {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing plugin name' })
      };
    }

    if (!isValidPluginName(pluginName)) {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid plugin name' })
      };
    }

    // ── 免密插件: 直接返回原文件 ──
    if (!isSourcePlugin(pluginName)) {
      let content;
      try {
        content = readPluginFile(pluginName);
      } catch (error) {
        return {
          statusCode: 404,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: `Plugin '${pluginName}' not found` })
        };
      }
      console.log(`Serving free plugin: ${pluginName}`);
      return {
        statusCode: 200,
        headers: {
          ...headers,
          'Content-Type': 'application/javascript; charset=utf-8',
          'Content-Disposition': `inline; filename=${pluginName}`,
          'Cache-Control': 'no-cache'
        },
        body: content
      };
    }

    // ── 音源相关插件: 需要 source 参数 ──
    let source = event.queryStringParameters?.source || DEFAULT_SOURCE;

    // 剥离 .json 后缀 (BakaMusic 会自动追加)
    if (source.endsWith('.json')) {
      source = source.slice(0, -5);
    }

    const sourceConfig = SOURCE_CONFIG[source];
    if (!sourceConfig) {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Invalid source: ${source}` })
      };
    }

    // 检查此音源是否支持该插件
    if (!sourceSupportsPlugin(source, pluginName)) {
      return {
        statusCode: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Source '${source}' does not support plugin '${pluginName}'` })
      };
    }

    const apiUrl = sourceConfig.url;
    console.log(`Using source: ${source} -> ${apiUrl}`);

    // ── 确定有效 Key ──
    let effectiveKey;
    if (sourceConfig.requiresKey) {
      // 用户提供的 Key
      let key = event.queryStringParameters?.key;
      if (key && key.endsWith('.json')) {
        key = key.slice(0, -5);
      }
      effectiveKey = key || '';
    } else {
      // 内置 Key
      effectiveKey = sourceConfig.builtinKey || '';
    }

    // ── 读取插件文件 ──
    let pluginContent;
    try {
      pluginContent = readPluginFile(pluginName);
    } catch (error) {
      return {
        statusCode: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Plugin '${pluginName}' not found` })
      };
    }

    // ── 构建更新 URL ──
    const baseUrl = process.env.BASE_URL || process.env.URL || 'https://music.cwo.cc.cd';
    let updateUrl = `${baseUrl}/plugins/${pluginName}?source=${source}`;
    if (sourceConfig.requiresKey && effectiveKey) {
      updateUrl += `&key=${effectiveKey}`;
    }

    // ── 生成并注入请求处理器 ──
    let modifiedContent = pluginContent;

    const handlerCode = generateRequestHandler(sourceConfig, pluginName, apiUrl, effectiveKey, updateUrl);
    modifiedContent = modifiedContent.replace('// {{REQUEST_HANDLER}}', handlerCode);

    // ── 音质覆盖 (按音源配置) ──
    const qualities = getQualityOverride(source, pluginName);
    modifiedContent = replaceQualities(modifiedContent, qualities);

    console.log(`Serving plugin: ${pluginName}, source: ${source}, apiType: ${sourceConfig.apiType || 'query'}, key: ${sourceConfig.requiresKey ? (effectiveKey ? effectiveKey.substring(0, 8) + '...' : '(none)') : '(builtin)'}, qualities: ${qualities ? JSON.stringify(qualities) : 'default'}`);

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/javascript; charset=utf-8',
        'Content-Disposition': `inline; filename=${pluginName}`,
        'Cache-Control': 'no-cache'
      },
      body: modifiedContent
    };

  } catch (error) {
    console.error('Plugin download error:', error);
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
