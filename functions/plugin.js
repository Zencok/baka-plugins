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
  resolveSourceId,
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

    case 'em':
      code += `
async function requestMusicUrl(source, songId, quality) {
  var response = await axios_1.default.get(API_URL + "/url", {
    params: { source: source, songId: String(songId), quality: quality },
    headers: {
      "X-Request-Key": API_KEY,
      "User-Agent": "lx-music-desktop/2.12.1",
      "Content-Type": "application/json"
    },
    timeout: 10000
  });
  var body = response.data;
  if (!body || Number(body.code) !== 200) throw new Error(body && body.message || "EM 音源获取失败");
  if (typeof body.url !== "string" || !/^https?:\\/\\/\\S+$/i.test(body.url)) throw new Error("EM 音源未返回有效播放链接");
  return { code: 200, url: body.url };
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

    // ── cihedai/quandouyao: K×H 念心/星海聚合，QQ 保留 s01s ──
    case 'cihedai':
    case 'quandouyao': {
      code += `
async function _khCheckAudio(url) {
  var response = await axios_1.default.get(url, {
    headers: { Range: "bytes=0-1023", "User-Agent": "Mozilla/5.0" }, responseType: "arraybuffer",
    timeout: 5000, maxContentLength: 65536
  });
  var bytes = new Uint8Array(response.data);
  var signature = String.fromCharCode.apply(null, bytes.subarray(0, 4));
  var audio = signature === "fLaC" || signature.slice(0, 3) === "ID3" || signature === "OggS"
    || (bytes[0] === 255 && (bytes[1] & 224) === 224)
    || String.fromCharCode.apply(null, bytes.subarray(4, 8)) === "ftyp";
  if (!audio) throw new Error("播放链接未返回音频数据");
}`;
      if (pluginName === 'qq.js') {
        code += `
var _KH_QQ_FIELDS = {"128k":"song_play_url_standard","320k":"song_play_url_hq","flac":"song_play_url_sq"};
async function requestMusicUrl(source, songId, quality) {
  if (source !== "tx" && source !== "qq") throw new Error("QQ: 不支持的平台 " + source);
  if (songId === undefined || songId === null || String(songId).trim() === "") throw new Error("QQ: 缺少歌曲 mid");
  var field = _KH_QQ_FIELDS[quality];
  if (!field) throw new Error("QQ: 不支持的音质 " + quality);
  var response = await axios_1.default.get("https://tang.api.s01s.cn/music_open_api.php", {
    params: { mid: String(songId) }, timeout: 8000
  });
  var body = response.data;
  var url = body && body[field];
  if (typeof url === "string" && /^https?:\\/\\/\\S+$/i.test(url.trim())) {
    url = url.trim();
    await _khCheckAudio(url);
    return { code: 200, url: url };
  }
  throw new Error("QQ: s01s 未返回请求音质的播放链接");
}`;
      } else {
        const providers = sourceConfig.platformProviders && sourceConfig.platformProviders[pluginName];
        if (!providers || !providers.length) throw new Error('聚合音源未配置平台: ' + pluginName);
        code += `
var _KH_PROVIDERS = ${JSON.stringify(providers)};
var _KH_PLATFORM = ${JSON.stringify(pluginName.replace('.js', ''))};
async function requestMusicUrl(source, songId, quality) {
  if (source !== _KH_PLATFORM) throw new Error("聚合音源: 不支持的平台 " + source);
  if (songId === undefined || songId === null || String(songId).trim() === "") throw new Error("聚合音源: 缺少歌曲 ID");
  var errors = [];
  for (var index = 0; index < _KH_PROVIDERS.length; index++) {
    var provider = _KH_PROVIDERS[index];
    var level = provider.qualityMap[quality];
    if (!level) continue;
    try {
      var params = provider.type === "xinghai"
        ? { source: provider.source, name: "", songmid: String(songId), quality: level }
        : { id: String(songId), level: level };
      var response = await axios_1.default.get(provider.url, { params: params, timeout: 8000 });
      var body = response.data;
      if (!body || body.code !== 200) throw new Error("接口未成功返回");
      var url = body.url || (body.data && body.data.url);
      if (typeof url !== "string" || !/^https?:\\/\\/\\S+$/i.test(url.trim())) throw new Error("无有效播放链接");
      url = url.trim();
      if (/music\\.163\\.com\\/song\\/media\\/outer|\\.(?:html?|php)(?:[?#]|$)|\\/songDetail\\//i.test(url)) throw new Error("返回页面或伪直链");
      await _khCheckAudio(url);
      return { code: 200, url: url };
    } catch (error) {
      errors.push(provider.type + ": " + error.message);
    }
  }
  throw new Error("聚合音源获取失败 (" + source + "/" + quality + "): " + errors.join("; "));
}`;
      }
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
    let source = resolveSourceId(event.queryStringParameters?.source || DEFAULT_SOURCE);

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
