/**
 * BakaMusic 插件订阅接口
 * 功能: 按音源配置过滤插件，返回订阅 JSON
 *
 * BakaMusic 要求订阅 URL 以 .json 结尾:
 *   有 Key:  ?source=ikun&key=YOUR_KEY.json   (key 尾部带 .json)
 *   无 Key:  ?source=suyin.json               (source 尾部带 .json)
 */

const fs = require('fs');
const path = require('path');
const {
  SOURCE_CONFIG,
  FREE_PLUGINS,
  DEFAULT_SOURCE,
  sourceSupportsPlugin,
} = require('./source-config');

/**
 * 从插件文件 module.exports 中提取元数据
 */
function extractPluginMetadata(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const moduleExportsIndex = content.lastIndexOf('module.exports');
    if (moduleExportsIndex === -1) {
      return { platform: 'Unknown', version: '0.0.0', author: 'Unknown' };
    }

    const exportsContent = content.substring(moduleExportsIndex);
    const platformMatch = exportsContent.match(/['"]?platform['"]?\s*:\s*['"](.*?)['"]/);
    const versionMatch = exportsContent.match(/['"]?version['"]?\s*:\s*['"](.*?)['"]/);
    const authorMatch = exportsContent.match(/['"]?author['"]?\s*:\s*['"](.*?)['"]/);

    return {
      platform: platformMatch ? platformMatch[1] : 'Unknown',
      version: versionMatch ? versionMatch[1] : '0.0.0',
      author: authorMatch ? authorMatch[1] : 'Unknown'
    };
  } catch (error) {
    console.error(`Error extracting metadata from ${filePath}:`, error);
    return { platform: 'Unknown', version: '0.0.0', author: 'Unknown' };
  }
}

/**
 * 扫描插件目录
 */
function scanPlugins() {
  const pluginsDir = path.join(__dirname, '../plugins');
  try {
    const files = fs.readdirSync(pluginsDir);
    const plugins = [];
    for (const file of files) {
      if (!file.endsWith('.js')) continue;
      const filePath = path.join(pluginsDir, file);
      const metadata = extractPluginMetadata(filePath);
      plugins.push({
        name: metadata.platform,
        file: file,
        version: metadata.version,
        author: metadata.author,
        isFree: FREE_PLUGINS.includes(file)
      });
      console.log(`Found plugin: ${file} (${metadata.platform} v${metadata.version})`);
    }
    console.log(`Scanned ${plugins.length} plugins`);
    return plugins;
  } catch (error) {
    console.error('Error scanning plugins directory:', error);
    return [];
  }
}

function getClientIP(headers) {
  const forwarded = headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers['client-ip'] || 'unknown';
}

function getClientUA(headers) {
  return headers['user-agent'] || 'unknown';
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
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
    // ── 解析 source ──
    let source = event.queryStringParameters?.source || DEFAULT_SOURCE;
    if (source.endsWith('.json')) {
      source = source.slice(0, -5);
    }

    const sourceConfig = SOURCE_CONFIG[source];
    if (!sourceConfig) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: `Invalid source: ${source}` })
      };
    }
    console.log(`Using source: ${source} (${sourceConfig.name})`);

    // ── 解析 key ──
    let key = event.queryStringParameters?.key;
    if (key && key.endsWith('.json')) {
      key = key.slice(0, -5);
    }

    const baseUrl = process.env.BASE_URL || 'https://music.cnmb.us.ci';

    // ── 扫描并过滤插件 ──
    const allPlugins = scanPlugins();
    const pluginsList = [];

    for (const plugin of allPlugins) {
      // 跳过此音源不支持的插件
      if (!sourceSupportsPlugin(source, plugin.file)) {
        console.log(`Skipping ${plugin.file}: not supported by source ${source}`);
        continue;
      }

      let url = `${baseUrl}/plugins/${plugin.file}`;

      if (!plugin.isFree) {
        // 音源相关插件: 始终带 source
        url += `?source=${source}`;
        // 仅 requiresKey 的音源才附加用户 key
        if (sourceConfig.requiresKey && key) {
          url += `&key=${key}`;
        }
      }

      pluginsList.push({
        name: plugin.name,
        url: url,
        version: plugin.version
      });
    }

    // ── 日志 ──
    const clientInfo = {
      ip: getClientIP(event.headers),
      ua: getClientUA(event.headers)
    };

    console.log(`Subscription: source=${source}, plugins=${pluginsList.length}, key=${key ? key.substring(0, 8) + '...' : sourceConfig.requiresKey ? '(none)' : '(builtin)'}, ip=${clientInfo.ip}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        plugins: pluginsList,
        yourinfo: clientInfo
      })
    };

  } catch (error) {
    console.error('Subscription error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
