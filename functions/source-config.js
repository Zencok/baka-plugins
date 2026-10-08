/**
 * Source Configuration - 音源配置中心
 * 在 subscription.js 和 plugin.js 之间共享
 *
 * 每个音源定义:
 * - name:         显示名称
 * - url:          API 基础地址
 * - requiresKey:  用户是否需要提供 API Key
 * - builtinKey:   内置 Key (仅 requiresKey=false 时使用)
 * - apiType:      请求类型 (ikun|oi|query|cihedai|quandouyao)
 * - authHeader:   自定义认证头名称 (默认 X-API-Key)
 * - platformProviders: 按插件文件排序的聚合端点 (cihedai/quandouyao)
 * - plugins:      支持的插件映射 { 文件名 → 音质数组 | null }
 *                 null = 使用插件文件内置的默认音质
 *                 数组 = 覆盖插件的 supportedQualities
 *
 * apiType 说明:
 *   ikun       - POST ${url}/music/url  body: {source, musicId, quality}  header: X-API-Key
 *   query      - GET  ${url}/url?source=&songId=&quality=                 header: X-API-Key
 *   oi         - GET  ${url}?Oimc=                                     用户 Key 作为 OIMC 签名盐
 *   lxmusic    - GET  ${url}/url/${source}/${songId}/${quality}           header: authHeader (或无)
 *   cihedai    - 次合代: 星海优先、念心备用；QQ=s01s
 *   quandouyao - 全豆要: 念心优先、星海备用；酷狗星海优先；QQ=s01s
 */

const KH_LEVELS = { '128k': 'standard', '320k': 'exhigh', flac: 'lossless', hires: 'hires', master: 'jymaster' };
const KH_PROVIDERS = {
  nianxinWy: { type: 'nianxin', url: 'https://mcp.nianxinxz.com/share/ceshi/wy.php', qualityMap: KH_LEVELS },
  nianxinKw: { type: 'nianxin', url: 'https://mcp.nianxinxz.com/share/ceshi/kw.php', qualityMap: KH_LEVELS },
  nianxinKg: {
    type: 'nianxin', url: 'https://mcp.nianxinxz.com/share/ceshi/kg.php',
    qualityMap: { '128k': '128kmp3', '320k': '320kmp3', flac: '2000kflac', hires: 'hires' },
  },
  xinghaiWy: { type: 'xinghai', url: 'https://yy.zddyr.top/lx/api/', source: 'netease', qualityMap: KH_LEVELS },
  xinghaiKw: {
    type: 'xinghai', url: 'https://yy.zddyr.top/lx/api/', source: 'kw',
    qualityMap: { '128k': '128kmp3', '320k': '320kmp3', flac: 'flac' },
  },
  xinghaiKg: {
    type: 'xinghai', url: 'https://yy.zddyr.top/lx/api/', source: 'kg',
    qualityMap: { '128k': '128kmp3', '320k': '320kmp3', flac: 'flac', hires: 'hires' },
  },
};

const SOURCE_CONFIG = {
  'ikun': {
    name: 'ikun 音源',
    url: 'https://c.wwwweb.top',
    requiresKey: true,
    apiType: 'ikun',
    // 平台顺序 wy→qq→kg→kw；null = 使用插件默认 supportedQualities
    plugins: {
      'wy.js':  null,
      'qq.js':  null,
      'kg.js':  null,
      // ikun 酷我额外开放环绕/母带（插件默认仅到 flac）
      'kw.js':  ['128k', '320k', 'flac', 'atmos', 'atmos_plus', 'master'],
    }
  },
  'oi': {
    name: 'OI 音源',
    url: 'http://music-api.cenguigui.cn',
    requiresKey: true,
    apiType: 'oi',
    plugins: {
      'wy.js': ['128k', '320k', 'flac', 'hires', 'atmos', 'atmos_plus', 'master'],
      'qq.js': ['128k', '320k', 'flac', 'hires', 'atmos', 'atmos_plus', 'master'],
      'kg.js': ['128k', '320k', 'flac', 'hires', 'atmos', 'master'],
      'kw.js': ['128k', '320k', 'flac', 'hires', 'atmos', 'atmos_plus', 'master'],
    }
  },
  'linglan': {
    name: '聆澜音源',
    url: 'https://source.shiqianjiang.cn/api/music',
    requiresKey: true,
    apiType: 'query',
    plugins: {
      'wy.js':  null,
      // tx 已不支持 master（API 返回 400）
      'qq.js':  ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus'],
      'kg.js':  null,
      'kw.js':  null,
    }
  },
  'cihedai': {
    name: '次合代',
    url: 'https://yy.zddyr.top/lx/api/',
    requiresKey: false,
    builtinKey: '',
    apiType: 'cihedai',
    platformProviders: {
      'wy.js': [KH_PROVIDERS.xinghaiWy, KH_PROVIDERS.nianxinWy],
      'kg.js': [KH_PROVIDERS.xinghaiKg, KH_PROVIDERS.nianxinKg],
      'kw.js': [KH_PROVIDERS.xinghaiKw, KH_PROVIDERS.nianxinKw],
    },
    plugins: {
      'wy.js': ['128k', '320k', 'flac', 'hires', 'master'],
      'qq.js': ['128k', '320k', 'flac'],
      'kg.js': ['128k', '320k', 'flac', 'hires'],
      'kw.js': ['128k', '320k', 'flac'],
    }
  },
  'quandouyao': {
    name: '全豆要',
    url: 'https://mcp.nianxinxz.com/share/ceshi/',
    requiresKey: false,
    apiType: 'quandouyao',
    platformProviders: {
      'wy.js': [KH_PROVIDERS.nianxinWy, KH_PROVIDERS.xinghaiWy],
      'kg.js': [KH_PROVIDERS.xinghaiKg, KH_PROVIDERS.nianxinKg],
      'kw.js': [KH_PROVIDERS.nianxinKw, KH_PROVIDERS.xinghaiKw],
    },
    plugins: {
      'wy.js':  ['128k', '320k', 'flac', 'hires', 'master'],
      'qq.js':  ['128k', '320k', 'flac'],
      'kg.js':  ['128k', '320k', 'flac', 'hires'],
      'kw.js':  ['128k', '320k', 'flac'],
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
