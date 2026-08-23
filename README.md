# 🎵 BakaMusic 插件订阅服务

> 为 **BakaMusic** 提供统一的插件订阅、单插件分发、音源注入与音质覆盖。

🌐 在线地址：`https://music.cwo.cc.cd/`

---

## ✨ 特性

- 📦 统一分发 7 个平台插件
- 🔗 同时支持订阅导入与单插件导入
- 🧩 按音源动态注入请求处理器
- 🎚️ 按音源覆盖插件音质能力
- ☁️ 适配 Vercel / Netlify / 本地 Node.js

---

## 🎼 插件

| 平台 | 文件 | 版本 | 类型 |
|---|---|---:|---|
| 网易云音乐 | `plugins/wy.js` | `1.1.0` | 音源相关、MV |
| QQ音乐 | `plugins/qq.js` | `1.1.0` | 音源相关、MV |
| 酷狗音乐 | `plugins/kg.js` | `1.1.1` | 音源相关、MV |
| 酷我音乐 | `plugins/kw.js` | `1.1.1` | 音源相关、MV |
| 咪咕音乐 | `plugins/mg.js` | `1.3.1` | 免密、全 8 档音质、播放时自动降级、MV |
| Bilibili | `plugins/bilibili.js` | `2.0.7` | 免密、MV（支持 WBI、完整 Cookie/SESSDATA、收藏夹与排行榜） |
| 汽水音乐 | `plugins/qishui.js` | `3.2.3` | 下载免密、Android 取流实时签名、MV（登录态下补充视频音乐搜索结果） |

> `bilibili.js`、`qishui.js`、`mg.js` 下载时不需要 `source` 或 `key`。

咪咕播放音质完整映射：`mgg=LQ 64k`、`128k=PQ`、`320k=HQ`、`flac=SQ`、`flac24bit=ZQ24`、`hires=ZQ32`、`atmos=Z3D`、`atmos_plus=3D60`。歌曲列表会按接口元数据仅展示该歌曲实际拥有的档位。

播放时会校验转换后的咪咕 CDN 地址；目标资源明确不存在时，插件会自动选择较低的可用音质，并在返回结果中标记实际播放档位。

酷狗 MV 播放会保留接口返回的 HTTP CDN 地址（并提供备用节点）。该 CDN 的 HTTPS
证书与域名不匹配，强制升级为 HTTPS 会导致 Electron 播放器握手失败。

酷我 MV 使用 VID 分画质取源，并按接口实际返回档位识别服务端回落；播放器仅展示
真正可用且不重复的清晰度，同时保留接口返回的 HTTP CDN 地址交由应用内代理加载。

---

## 🌊 音源

音源配置见：[functions/source-config.js](./functions/source-config.js)

| 名称 | 标识 | Key | 支持插件 |
|---|---|---:|---|
| ikun 音源 | `ikun` | 需要 | wy / qq / kg / kw |
| 聆澜音源 | `linglan` | 需要 | wy / qq / kg / kw |
| 何意味 | `hyw` | 内置 charity | wy / qq / kg / kw |
| 全豆要 | `quandouyao` | 内置 | wy / qq / kg / kw |
| 次合代 | `cihedai` | 内置 | wy / qq / kg / kw |
| 长青音源 | `changqing` | 内置 | wy / qq / kg / kw |

> 免密插件始终包含在订阅结果中；音源相关插件会按配置过滤。

---

## 🚀 导入方式

### 1. 订阅导入

**需要 Key**

```text
https://music.cwo.cc.cd/api/subscription.json?source=ikun&key=YOUR_KEY.json
```

**内置 Key**

```text
https://music.cwo.cc.cd/api/subscription.json?source=cihedai.json
```

> BakaMusic 要求订阅链接以 `.json` 结尾。  
> 需要 Key 时，加在 `key` 后；内置 Key 时，加在 `source` 后。

### 2. 单插件导入

**需要 Key**

```text
https://music.cwo.cc.cd/plugins/wy.js?source=ikun&key=YOUR_KEY
```

**免密插件**

```text
https://music.cwo.cc.cd/plugins/bilibili.js
```

### Bilibili 登录与媒体能力

`bilibili.js` 使用与桌面下载器一致的 WBI 签名和 `/x/player/wbi/playurl`，播放器
会自动回退旧版播放接口。免登录可播放公开内容；在 BakaMusic 用户变量中填写
`SESSDATA`、`BILI_COOKIE` 或兼容字段 `CK`（支持完整浏览器 Cookie）后，可访问
会员流、杜比/Hi-Res 音频、HDR/4K/8K 视频、用户投稿和私有收藏夹。登录后会刷新已缓存条目的 DASH 能力，避免旧的 128/192/320K 快照遮挡 FLAC/Hi-Res（同一条 Bilibili Hi-Res 流只显示一个音质键）和 Dolby。

下载时 `getMediaSource` 返回实际命中的音质键；例如请求 Master 但资源最高只有 320K
时会返回 `320k`，避免文件名继续显示虚假的 Master。

封面会同时写入 `artwork` 与 `coverImg`，并统一升级为 HTTPS；BakaMusic 对
Bilibili 图片使用无 Referer 加载，用于底栏封面、沉浸背景和动态取色。

插件同时提供视频 `getMvSource`（360p～8K）、音频 `getMediaSource`（128K～杜比）、
歌单/收藏夹导入、歌单搜索、每周必看/分区排行榜、歌词和评论接口。

### 汽水音乐签名与登录

`qishui.js` 的 Android `track_v2` 请求会在发送前刷新 `_rticket`、`X-SS-Req-Ticket` 与全部 X-Headers，并使用最终 URL 和原始请求体实时签名。
请在 BakaMusic 插件用户变量 `xheadersKey` 中填写 `xh_` 开头的访问 Key；插件源码不含访问 Key。
如需登录态内容，可继续在用户变量 `sessionid` 中填写纯值或包含 `sessionid=...` 的 Cookie 片段。

---

## 🔌 API

### 订阅接口

```text
GET /api/subscription.json?source=<source>&key=<key>.json
GET /api/subscription.json?source=<source>.json
```

作用：

- 扫描 `plugins/`
- 提取插件元数据
- 按音源能力过滤插件
- 返回 BakaMusic 可直接导入的订阅 JSON

实现文件：[functions/subscription.js](./functions/subscription.js)

### 插件下载接口

```text
GET /plugins/{name}.js?source=<source>&key=<key>
GET /plugins/{name}.js
```

作用：

- 读取插件原文件
- 注入 `// {{REQUEST_HANDLER}}`
- 生成 `API_URL`、`API_KEY`、`UPDATE_URL`
- 覆盖 `supportedQualities`
- 返回最终插件脚本

实现文件：[functions/plugin.js](./functions/plugin.js)

---

## 🗂️ 结构

```text
baka-plugins/
├── functions/
│   ├── plugin.js
│   ├── source-config.js
│   └── subscription.js
├── plugins/
│   ├── bilibili.js
│   ├── kg.js
│   ├── kw.js
│   ├── mg.js
│   ├── qishui.js
│   ├── qq.js
│   └── wy.js
├── index.html
├── server.js
├── netlify.toml
├── vercel.json
└── README.md
```

---

## 🧱 插件组织

顶层结构统一为：

1. 依赖与基础常量
2. 工具与格式化函数
3. 搜索相关
4. 播放 / 歌曲信息 / 歌词
5. 专辑 / 歌手
6. 歌单 / 推荐
7. 榜单
8. 评论
9. `module.exports`

导出对象通常采用：

```js
module.exports = {
  platform,
  author,
  version,
  appVersion,
  srcUrl,
  cacheControl,
  primaryKey,
  supportedQualities,
  supportedVideoQualities,
  userVariables,
  hints,
  supportedSearchType,
  async search() {},
  getMediaSource,
  // 可选：歌曲包含 mv 字段时解析 MV 视频源
  getMvSource,
  getMusicInfo,
  getLyric,
  getAlbumInfo,
  getArtistWorks,
  // 返回 { id, title, artwork, artist, description, worksNum, musicList }
  importMusicSheet,
  getMusicSheetInfo,
  getRecommendSheetTags,
  getRecommendSheetsByTag,
  getTopLists,
  getTopListDetail,
  getMusicComments,
};
```

### MV / 视频源约定

歌曲条目可用 `mv` 暴露平台 MV ID；`supportedVideoQualities` 声明可请求的
分辨率档位。网易云、QQ、酷狗、酷我、咪咕、汽水和 Bilibili 已接入该方法。插件实现
`getMvSource(musicItem, videoQuality?)` 后返回 `{ url, headers?, userAgent?,
videoQuality?, mimeType?, duration?, width?, height?, expiresAt? }`。推荐分辨率写成
`720p`、`1080p`、`4k`；播放器会在实际播放前重新校验 URL 和请求头。
Bilibili MV 优先返回带音轨的单文件 MP4，并通过 `videoQuality` 回报平台实际下发画质，
从而让播放音量、拖动和宿主下载保持一致。

---

## 🛠️ 本地运行

```bash
node server.js
```

默认地址：

```text
http://localhost:3000
```

快速测试：

```bash
curl "http://localhost:3000/api/subscription.json?source=ikun&key=test123.json"
curl "http://localhost:3000/plugins/wy.js?source=ikun&key=test123"
curl "http://localhost:3000/plugins/bilibili.js"
```

---

## 📌 维护约定

- 插件版本、音源协议、展示文案变更时，同步更新 `README.md` 和 `index.html`
- 免密插件下载链接不能拼接 `source`
- 音源能力以 [functions/source-config.js](./functions/source-config.js) 为准
- 新增或重排插件能力时，保持现有顶层结构顺序

---

## 📎 相关文件

- [functions/source-config.js](./functions/source-config.js)
- [functions/subscription.js](./functions/subscription.js)
- [functions/plugin.js](./functions/plugin.js)
- [index.html](./index.html)
