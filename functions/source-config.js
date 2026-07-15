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
 *   cihedai    - 次合代多端点: wy=GD音乐台, qq=s01s链, kw=念心酷我, kg=长青
 *   quandouyao - 全豆要聚合: wy/kw 多端点, qq=vkeys, kg=长青
 *   hyw        - GET  ${url}/api/music/url?source=&songId=&quality=&key=  header: X-Script-Version + X-Card-Key
 */

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
    // wy: GD (128/192/320/flac；br=999 保留为 hires)
    // qq: s01s 分字段 (fq/C200=96k, standard/C400≈128, hq/C600, sq/flac)
    // kw: 念心酷我
    // kg: 长青酷狗
    url: 'https://music-api.gdstudio.xyz/api.php?use_xbridge3=true&loader_name=forest',
    requiresKey: false,
    builtinKey: '',
    apiType: 'cihedai',
    plugins: {
      'wy.js': ['128k', '192k', '320k', 'flac', 'hires'],
      'qq.js': ['96k', '128k', '320k', 'flac'],
      // kg=长青: standard/exhigh/lossless/hires → qu128/320/flac/high
      'kg.js': ['128k', '320k', 'flac', 'hires'],
      'kw.js': ['128k', '320k', 'flac'],
    }
  },
  'changqing': {
    name: '长青音源',
    url: 'https://musicapi.haitangw.net',
    requiresKey: false,
    apiType: 'changqing',
    // kg 实测: standard→qu128, exhigh→qu320, lossless→quflac, hires→quhigh
    qualityMap: { '128k': 'standard', '320k': 'exhigh', 'flac': 'lossless', 'hires': 'hires' },
    platformUrls: {
      'wy.js': 'http://175.27.166.236/wy/wy.php',
      'qq.js': 'http://175.27.166.236/kgqq/qq.php',
      'kg.js': 'https://music.haitangw.cc/kgqq/kg.php',
      'kw.js': 'https://musicapi.haitangw.net/music/kw.php',
    },
    plugins: {
      'wy.js':  ['128k', '320k', 'flac'],
      'qq.js':  ['128k', '320k', 'flac'],
      'kg.js':  ['128k', '320k', 'flac', 'hires'],
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
      'wy.js':  ['128k', '320k', 'flac', 'hires', 'master'],
      'qq.js':  ['128k', '320k', 'flac', 'atmos'],
      // kg=长青: 含 hires(quhigh)
      'kg.js':  ['128k', '320k', 'flac', 'hires'],
      'kw.js':  ['128k', '320k', 'flac'],
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
