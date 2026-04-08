# 🎵 BakaMusic 插件订阅服务

> 为 **BakaMusic** 提供统一的插件订阅、单插件分发、音源注入与音质覆盖。

🌐 在线地址：`https://music.cwo.cc.cd/`

---

## ✨ 特性

- 📦 统一分发 8 个平台插件
- 🔗 同时支持订阅导入与单插件导入
- 🧩 按音源动态注入请求处理器
- 🎚️ 按音源覆盖插件音质能力
- ☁️ 适配 Vercel / Netlify / 本地 Node.js

---

## 🎼 插件

| 平台 | 文件 | 版本 | 类型 |
|---|---|---:|---|
| 网易云音乐 | `plugins/wy.js` | `1.0.0` | 音源相关 |
| QQ音乐 | `plugins/qq.js` | `1.0.0` | 音源相关 |
| 酷狗音乐 | `plugins/kg.js` | `1.0.0` | 音源相关 |
| 酷我音乐 | `plugins/kw.js` | `1.0.0` | 音源相关 |
| 咪咕音乐 | `plugins/mg.js` | `1.0.0` | 音源相关 |
| Bilibili | `plugins/bilibili.js` | `1.0.0` | 免密 |
| 汽水音乐 | `plugins/qishui.js` | `1.0.0` | 免密 |
| GitCode | `plugins/git.js` | `1.0.0` | 免密 |

> `bilibili.js`、`qishui.js`、`git.js` 下载时不需要 `source` 或 `key`。

---

## 🌊 音源

音源配置见：[functions/source-config.js](./functions/source-config.js)

| 名称 | 标识 | Key | 支持插件 |
|---|---|---:|---|
| ikun 音源 | `ikun` | 需要 | wy / qq / kg / kw |
| 聆澜音源 | `linglan` | 需要 | wy / qq / kg / kw / mg |
| 溯音音源 | `suyin` | 内置 | wy |
| GD音乐台 | `xinghai` | 内置 | wy / kw |
| Huibq 音源 | `huibq` | 内置 | kw / qq |
| 长青音源 | `changqing` | 内置 | wy / qq / kg / kw / mg |
| 枫雨音源 | `fengyu` | 内置 | wy / qq / kw / mg |
| 何意味音源 | `hyw` | 内置 | wy / qq / kg / kw / mg |
| 念心音源 | `nianxin` | 内置 | 暂停 |

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
https://music.cwo.cc.cd/api/subscription.json?source=suyin.json
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
│   ├── git.js
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
  userVariables,
  hints,
  supportedSearchType,
  async search() {},
  getMediaSource,
  getMusicInfo,
  getLyric,
  getAlbumInfo,
  getArtistWorks,
  importMusicSheet,
  getMusicSheetInfo,
  getRecommendSheetTags,
  getRecommendSheetsByTag,
  getTopLists,
  getTopListDetail,
  getMusicComments,
};
```

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
