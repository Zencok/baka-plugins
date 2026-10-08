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
| 网易云音乐 | `plugins/wy.js` | `1.1.2` | 音源相关、MV |
| QQ音乐 | `plugins/qq.js` | `1.1.6` | 音源相关、MV |
| 酷狗音乐 | `plugins/kg.js` | `1.1.3` | 音源相关、MV |
| 酷我音乐 | `plugins/kw.js` | `1.1.3` | 音源相关、MV |
| 咪咕音乐 | `plugins/mg.js` | `1.3.2` | 免密、8 档音质、MV |
| Bilibili | `plugins/bilibili.js` | `2.0.9` | 免密、MV、收藏夹与排行榜 |
| 汽水音乐 | `plugins/qishui.js` | `3.2.9` | 免密、MV，可配置登录态 |

> `bilibili.js`、`qishui.js`、`mg.js` 下载时不需要 `source` 或 `key`。

---

## 🌊 音源

音源配置见：[functions/source-config.js](./functions/source-config.js)

| 名称 | 标识 | Key | 支持插件 |
|---|---|---:|---|
| 全豆要（免费） | `quandouyao` | 无需填写 | wy / qq / kg / kw |
| 次合代（免费） | `cihedai` | 无需填写 | wy / qq / kg / kw |
| ikun 音源（付费） | `ikun` | 需要 | wy / qq / kg / kw |
| 聆澜音源（付费） | `linglan` | 需要 | wy / qq / kg / kw |
| OI 音源 | `oi` | 用户提供签名盐 | wy / qq / kg / kw |

> 免密插件始终包含在订阅结果中；音源相关插件会按配置过滤。

OI 的 Key 填写当前会话的 `_oi_salt`（32 位小写十六进制），不是 GUID、`_oi_three_random` 或普通卡密。本站不自动获取签名盐；缺失或格式错误时，订阅和插件下载接口均会拒绝。

---

## 🚀 导入方式

### 1. 订阅导入

**需要 Key**

```text
https://music.cwo.cc.cd/api/subscription.json?source=ikun&key=YOUR_KEY.json
https://music.cwo.cc.cd/api/subscription.json?source=oi&key=YOUR_OI_SALT.json
```

**无需 Key**

```text
https://music.cwo.cc.cd/api/subscription.json?source=cihedai.json
```

> BakaMusic 要求订阅链接以 `.json` 结尾。  
> 需要 Key 时，加在 `key` 后；无需 Key 时，加在 `source` 后。服务端会移除该后缀。

### 2. 单插件导入

**需要 Key**

```text
https://music.cwo.cc.cd/plugins/wy.js?source=ikun&key=YOUR_KEY
```

**无需 Key 的音源**

```text
https://music.cwo.cc.cd/plugins/wy.js?source=cihedai
```

**免密插件**

```text
https://music.cwo.cc.cd/plugins/bilibili.js
```

> 示例中的 `YOUR_KEY` / `YOUR_OI_SALT` 请替换为自己的值。含卡密的链接、插件文件及更新地址不要公开分享。

### 3. 平台登录配置

在 BakaMusic 的插件用户变量中填写，和音源 Key 分开配置：

- **Bilibili**：`SESSDATA` 可填纯值或完整 Cookie；`BILI_COOKIE` 用于完整 Cookie，优先使用；`CK` 是兼容别名。会员内容仍需账号具有对应权限。
- **汽水音乐**：`sessionid` 可填纯值或 `sessionid=...` 片段，过期后需更新。

登录 Cookie 同样属于敏感信息，请勿公开分享。

---

## 🔌 API

### 订阅接口

```text
GET /api/subscription.json?source=<source>&key=<key>.json
GET /api/subscription.json?source=<source>.json
```

未指定 `source` 时默认使用 `ikun`；需要 Key 的音源请传入自己的卡密。

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
- 替换 `// {{REQUEST_HANDLER}}` 占位符
- 生成 `API_URL`、`API_KEY`、`UPDATE_URL`
- 按音源配置覆盖 `supportedQualities`（配置为 `null` 时保留插件默认值）
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

需要 Node.js 18 或更高版本，无需构建。

```bash
npm ci
node server.js
```

默认地址：

```text
http://localhost:3000
```

`PORT` 可修改监听端口。调试生成的订阅及更新链接时，将 `BASE_URL` 设置为本地地址；部署到自有域名时设置为自己的服务地址，否则生成链接默认指向在线服务。

快速测试：

```bash
curl "http://localhost:3000/api/subscription.json?source=cihedai.json"
curl "http://localhost:3000/plugins/wy.js?source=cihedai"
curl "http://localhost:3000/plugins/bilibili.js"
```

Windows PowerShell 中可使用 `curl.exe`。

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
