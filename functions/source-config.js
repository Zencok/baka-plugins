/**
 * Source Configuration - 音源配置中心
 * 在 subscription.js 和 plugin.js 之间共享
 *
 * 每个音源定义:
 * - name:         显示名称
 * - url:          API 基础地址
 * - requiresKey:  用户是否需要提供 API Key
 * - builtinKey:   内置 Key (仅 requiresKey=false 时使用)
 * - apiType:      请求类型 (ikun|query|changqing|cihedai|quandouyao|hyw)
 * - authHeader:   自定义认证头名称 (默认 X-API-Key)
 * - qualityMap:   音质键映射 (仅 changqing 类型)
 * - platformUrls: 按插件文件的平台 URL (仅 changqing 类型)
 * - plugins:      支持的插件映射 { 文件名 → 音质数组 | null }
 *                 null = 使用插件文件内置的默认音质
 *                 数组 = 覆盖插件的 supportedQualities
 *
 * apiType 说明:
 *   ikun       - POST ${url}/music/url  body: {source, musicId, quality}  header: X-API-Key
 *   query      - GET  ${url}/url?source=&songId=&quality=                 header: X-API-Key
 *   lxmusic    - GET  ${url}/url/${source}/${songId}/${quality}           header: authHeader (或无)
 *   changqing  - 按平台独立 URL, 音质键映射 (standard/exhigh/lossless)
 *   cihedai    - 次合代多端点: wy=GD音乐台, qq=s01s链, kw=念心酷我
 *   quandouyao - 全豆要聚合: wy/kw 多端点, qq=vkeys, kg=长青
 *   hyw        - GET  ${url}/api/music/url?source=&songId=&quality=&key=  header: X-Script-Version + X-Card-Key
 */

const SOURCE_CONFIG = {
  'ikun': {
    name: 'ikun 音源',
    url: 'https://c.wwwweb.top',
    requiresKey: true,
    apiType: 'ikun',
    plugins: {
      'wy.js':  null,
      'qq.js':  null,
      'kg.js':  null,
      'kw.js':  ['128k', '320k', 'flac', 'atmos', 'atmos_plus', 'master'],
    }
  },
  'linglan': {
    name: '聆澜音源',
    url: 'https://source.shiqianjiang.cn/api/music',
    requiresKey: true,
    apiType: 'query',
    plugins: {
      'wy.js':  null,
      'qq.js':  null,
      'kg.js':  null,
      'kw.js':  null,
    }
  },
  'cihedai': {
    name: '次合代',
    // wy: GD音乐台
    // qq: littleyouzi + s01s
    // kw: 念心酷我模板 URL
    url: 'https://music-api.gdstudio.xyz/api.php?use_xbridge3=true&loader_name=forest',
    requiresKey: false,
    builtinKey: '',
    apiType: 'cihedai',
    plugins: {
      'wy.js': ['128k', '192k', '320k', 'flac', 'flac24bit'],
      'qq.js': ['128k', '320k', 'flac', 'flac24bit', 'atmos', 'atmos_plus', 'master'],
      'kw.js': ['128k', '320k', 'flac'],
    }
  },
  'changqing': {
    name: '长青音源',
    url: 'https://musicapi.haitangw.net',
    requiresKey: false,
    apiType: 'changqing',
    qualityMap: { '128k': 'standard', '320k': 'exhigh', 'flac': 'lossless' },
    platformUrls: {
      'wy.js': 'http://175.27.166.236/wy/wy.php',
      'qq.js': 'http://175.27.166.236/kgqq/qq.php',
      'kg.js': 'https://music.haitangw.cc/kgqq/kg.php',
      'kw.js': 'https://musicapi.haitangw.net/music/kw.php',
    },
    plugins: {
      'wy.js':  ['128k', '320k', 'flac'],
      'qq.js':  ['128k', '320k', 'flac'],
      'kg.js':  ['128k', '320k', 'flac'],
      'kw.js':  ['128k', '320k', 'flac'],
    }
  },
  'quandouyao': {
    name: '全豆要',
    // 多端点聚合；QQ=vkeys；酷狗=长青 kg 模板
    url: '',
    requiresKey: false,
    apiType: 'quandouyao',
    plugins: {
      'wy.js':  ['128k', '320k', 'flac', 'flac24bit', 'hires', 'master'],
      'qq.js':  ['128k', '320k', 'flac', 'flac24bit', 'atmos', 'atmos_plus', 'master'],
      'kg.js':  ['128k', '320k', 'flac'],
      'kw.js':  ['128k', '320k', 'flac', 'flac24bit'],
    }
  },
  'hyw': {
    name: '何意味',
    // HYW×Koneko-API-Charity 公益卡密
    url: 'http://hywmusicsource.xn--9tra.work',
    requiresKey: false,
    apiType: 'hyw',
    builtinKey: 'charity',
    scriptVersion: 'HYW\u00d7Koneko-API-Charity_v1.0.0',
    plugins: {
      'wy.js': ['128k', '320k', 'flac'],
      'qq.js': ['128k', '320k', 'flac'],
      'kg.js': ['128k', '320k', 'flac'],
      'kw.js': ['128k', '320k', 'flac'],
    }
  }
};

// 免密插件: 始终包含，不需要 source/key（mg 内置官方线路）
const FREE_PLUGINS = ['bilibili.js', 'qishui.js', 'mg.js'];

const DEFAULT_SOURCE = 'ikun';

/**
 * 解析音源标识 (剥离 .json 后缀)
 */
function resolveSourceId(source) {
  if (!source) return DEFAULT_SOURCE;
  let id = String(source);
  if (id.endsWith('.json')) id = id.slice(0, -5);
  return id;
}

/**
 * 判断插件是否为音源相关插件 (非免密)
 */
function isSourcePlugin(pluginName) {
  return !FREE_PLUGINS.includes(pluginName);
}

/**
 * 判断音源是否支持指定插件
 */
function sourceSupportsPlugin(source, pluginName) {
  if (FREE_PLUGINS.includes(pluginName)) return true;
  const config = SOURCE_CONFIG[resolveSourceId(source)];
  if (!config) return false;
  return pluginName in config.plugins;
}

/**
 * 获取音源对插件的音质覆盖
 * 返回 null 表示使用插件默认音质
 */
function getQualityOverride(source, pluginName) {
  const config = SOURCE_CONFIG[resolveSourceId(source)];
  if (!config || !(pluginName in config.plugins)) return null;
  return config.plugins[pluginName];
}

module.exports = {
  SOURCE_CONFIG,
  FREE_PLUGINS,
  DEFAULT_SOURCE,
  resolveSourceId,
  isSourcePlugin,
  sourceSupportsPlugin,
  getQualityOverride,
};
