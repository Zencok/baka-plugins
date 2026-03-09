/**
 * Source Configuration - 音源配置中心
 * 在 subscription.js 和 plugin.js 之间共享
 *
 * 每个音源定义:
 * - name:         显示名称
 * - url:          API 基础地址
 * - requiresKey:  用户是否需要提供 API Key
 * - builtinKey:   内置 Key (仅 requiresKey=false 时使用)
 * - apiType:      请求类型 (ikun|query|lxmusic|changqing)
 * - authHeader:   自定义认证头名称 (默认 X-API-Key)
 * - qualityMap:   音质键映射 (仅 changqing 类型)
 * - platformUrls: 按插件文件的平台 URL (仅 changqing 类型)
 * - plugins:      支持的插件映射 { 文件名 → 音质数组 | null }
 *                 null = 使用插件文件内置的默认音质
 *                 数组 = 覆盖插件的 supportedQualities
 *
 * apiType 说明:
 *   ikun     - POST ${url}/music/url  body: {source, musicId, quality}  header: X-API-Key
 *   query    - GET  ${url}/url?source=&songId=&quality=                 header: X-API-Key
 *   lxmusic  - GET  ${url}/url/${source}/${songId}/${quality}           header: authHeader (或无)
 *   changqing- 按平台独立 URL, 音质键映射 (standard/exhigh/lossless)
 *   fengyu   - 多端点聚合免费音源, 按平台独立处理 (littleyouzi/bugpk/oiapi/migu/kuwo)
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
    // 不支持: mg.js (咪咕)
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
      'mg.js':  null,
    }
  },
  'suyin': {
    name: '溯音音源',
    // wy: GET https://oiapi.net/api/Music_163?id={id} → {code:0, data:[{url}]}
    // qq: -403 维护中; kw/mg: 按关键词搜索，不适合 ID 直查
    url: 'https://oiapi.net/api/Music_163',
    requiresKey: false,
    builtinKey: '',
    apiType: 'suyin',
    plugins: {
      'wy.js': ['128k', '320k', 'flac'],
      // qq/kw/mg: 暂不可用 (qq维护中, kw/mg仅支持关键词搜索)
    }
  },
  'xinghai': {
    name: 'GD音乐台',
    // API 格式: /api.php?types=url&source=netease&id=...&br=128|320|740|999
    url: 'https://music-api.gdstudio.xyz/api.php?use_xbridge3=true&loader_name=forest',
    requiresKey: false,
    apiType: 'gdstudio',
    plugins: {
      'wy.js': ['128k', '192k', '320k', 'flac', 'flac24bit'],
      // kw.js: kuwo 暂时返回空 URL，保留以备 API 恢复
      'kw.js': ['128k', '192k', '320k', 'flac'],
      // qq/kg/mg: GD API 不支持 tencent/kugou/migu
    }
  },
  'huibq': {
    name: 'Huibq 音源',
    url: 'https://lxmusicapi.onrender.com',
    requiresKey: false,
    builtinKey: 'share-v3',
    apiType: 'lxmusic',
    authHeader: 'X-Request-Key',
    // API 只支持 kw 和 tx，qq 插件需映射为 tx
    sourceMap: { 'qq': 'tx' },
    plugins: {
      'kw.js': ['128k', '320k'],
      'qq.js': ['128k', '320k'],
      // wy/kg/mg: API 明确不支持
    }
  },
  'nianxin': {
    name: '念心音源',
    // 实际端点为 /wy.php?id=...&level=lossless&type=mp3 等 PHP 路径
    // 当前全部无响应 (2026-02-20 测试)，暂时禁用所有插件
    url: 'https://music.nxinxz.com',
    requiresKey: false,
    apiType: 'lxmusic',
    plugins: {
      // 所有平台端点当前无响应，待恢复后重新开放
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
      'mg.js': 'https://music.haitangw.cc/musicapi/mg.php',
    },
    plugins: {
      'wy.js':  ['128k', '320k', 'flac'],
      'qq.js':  ['128k', '320k', 'flac'],
      'kg.js':  ['128k', '320k', 'flac'],
      'kw.js':  ['128k', '320k', 'flac'],
      'mg.js':  ['128k', '320k', 'flac'],
    }
  },
  'fengyu': {
    name: '枫雨音源',
    url: '',
    requiresKey: false,
    apiType: 'fengyu',
    plugins: {
      'wy.js':  ['128k', '320k', 'flac', 'flac24bit', 'hires', 'master'],
      'qq.js':  ['128k', '320k', 'flac', 'flac24bit', 'atmos', 'atmos_plus', 'master'],
      'kw.js':  ['128k', '320k', 'flac', 'flac24bit'],
      'mg.js':  ['128k', '320k', 'flac', 'flac24bit'],
    }
    // 不支持: kg.js (酷狗)
  }
};

// 免密插件: 始终包含，不需要 source/key 参数
const FREE_PLUGINS = ['bilibili.js', 'qishui.js', 'git.js'];

const DEFAULT_SOURCE = 'ikun';

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
  const config = SOURCE_CONFIG[source];
  if (!config) return false;
  return pluginName in config.plugins;
}

/**
 * 获取音源对插件的音质覆盖
 * 返回 null 表示使用插件默认音质
 */
function getQualityOverride(source, pluginName) {
  const config = SOURCE_CONFIG[source];
  if (!config || !(pluginName in config.plugins)) return null;
  return config.plugins[pluginName];
}

module.exports = {
  SOURCE_CONFIG,
  FREE_PLUGINS,
  DEFAULT_SOURCE,
  isSourcePlugin,
  sourceSupportsPlugin,
  getQualityOverride,
};
