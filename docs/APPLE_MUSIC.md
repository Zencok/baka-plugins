# Apple Music 插件协议

状态（2026-11-16）：通用插件和 ikun 分发适配已实现；测试为 mock HTTP 合约测试。
客户端已实现 `apple-hls` v1 原生 AAC/ALAC 流式播放及合成主机测试；真实 API、真实解密模板和设备播放仍待验证。

## 分发与职责

`plugins/am.js` 是通用 Apple Music 插件；platform/description 不包含音源方品牌。
`functions/source-config.js` 决定音源是否提供该插件以及音质覆盖；
`functions/plugin.js` 注入 API_URL、API_KEY、UPDATE_URL、requestMusicUrl 和 requestAppleMusicApi。
更换音源时新增对应的注入适配与测试，不把新的供应商判断塞进插件。

当前 ikun 适配使用 `https://c.wwwweb.top`：

| 入口 | 注入后的 HTTP 请求 | 数据规则 |
| --- | --- | --- |
| search | POST /music/search | source=am, keyword, type=song/album/artist, page 从 1 开始, limit=20 |
| getAlbumInfo | POST /music/album | source=am, musicId, page, limit=100；读取全部分页，最多 50 页，超出明确失败 |
| getArtistWorks | POST /music/artist | source=am, musicId, view=songs/albums, page, limit=20 |
| getLyric | POST /music/lyric | source=am, musicId；返回 data 中的原始歌词文档 |
| getMediaSource | POST /music/url | source=am, musicId, quality=320k/flac/hires |
| getAppleMusicKey | POST /music/key 或返回的同源 /music/ 路径 | source=am, musicId, uri |

鉴权为 X-API-Key，由分发注入。源码参考 kunyin 的 AmProvider、AppleTemplateLoader；
kunyin 应用取流实际使用 `/app/getUrl` + `{platform:apple,authst}`。
本仓库按现有分发协议使用 `/music/url` + X-API-Key，二者不能混为一套认证。
AM 在 `/music/url` 的真实可用性仍需有效 Key 联调；失败时不自动切换 app 私有接口。

订阅地址：`/api/subscription.json?source=ikun&key=YOUR_KEY.json`。
独立插件：`/plugins/am.js?source=ikun&key=YOUR_KEY`。
其他音源的订阅和插件下载均不开放 AM，直到存在对应适配。
不要提交真实 Key 或含真实 Key 的插件产物；订阅下载链接本身包含凭据，应按私有配置处理。

## 原生媒体协议 v1

getMediaSource 返回：

```json
{
  "type": "apple-hls",
  "quality": "hires",
  "expiresAt": 1800000000,
  "appleMusic": {
    "version": 1,
    "playlistUrl": "https://media.example/track.m3u8",
    "adamId": "123456",
    "keyEndpoint": "/music/key",
    "codec": "alac",
    "audioGroup": ""
  }
}
```

`expiresAt` 是可选 Unix 秒，依据 `_cacheTTL` 计算；不能永久复用带签名地址。
有意不提供顶层 `url`：旧客户端应返回无可用播放源，而不是误播加密清单。
新客户端必须在普通 URL 校验之前按 type/version 分流，不以插件名字猜测加密方式。
source/provider 的归属由调用上下文携带，不信任返回数据来指定另一个插件。
quality 是产品档位；`flac`/`hires` 不代表容器里的编码为 FLAC，实际以初始化段识别为准。
只承诺 AAC/ALAC；不声明 Atmos、MV、歌单、账号曲库支持。

原生层解析清单后，在所属插件实例调用：

```js
getAppleMusicKey({ adamId: "123456", uri: "skd://itunes.apple.com/...", keyEndpoint: "/music/key" })
// 返回 {ctx, state, rdx, rcx, rax, r9, rbp} 模板数据，不含外层 code/data。
```

公开分片 URI `skd://itunes.apple.com/P000000000/s1/e1` 使用 musicId=0，其他使用 adamId。
keyEndpoint 仅接受注入 API 同源的 /music/ 路径；不能把鉴权头发到 SKD URI 或任意返回的主机。
模板结构和长度由 Rust 再校验，JS 不承担解密。模板不进入歌曲 JSON、日志、Dart 状态或持久缓存。
插件请求失败只返回固定错误，不透传可能携带 Key 的 Axios config/服务端错误文本。

## 元数据与歌词

search 支持 music/album/artist/lyric，lyric 搜索使用歌曲结果；歌曲 ID 保持字符串。
时长输出秒：显式 durationInMillis 优先，其余 duration 沿用 kunyin 的数值/冒号时间兼容。
专辑详情返回 `{albumItem,musicList}`，歌手作品返回 `{isEnd,data,total?}`。
hasNext 是布尔字段；测试覆盖真实形状的分页。

getLyric 优先保留完整 TTML 为 rawLrc，format=ttml，同时透传 translation、romanization、
ttml、chroma、chase；不在 JS 中把双声部、背景声或逐字时间降级成行歌词。
没有 TTML 时依次选择 chroma/chase/lyric；宿主对后两种富歌词格式的实际识别须在客户端接入中验证。
参考下载目录中的 apple-music-lyrics.js 的“原文透传”方式；不引入该脚本的独立目录 token
发现、官方登录态和第三方歌词 API，所有目录与歌词请求由当前音源注入提供。

## 验证

`node --test tests/am.test.cjs` 验证分发隔离、分页、时长、音质、TTML 原文、
播放描述、公开分片、同源模板回调、空 Key 和错误脱敏。
仓库回归使用 `npm test`。测试不访问真实音源，不能当作真实接口或播放证据。
本次结果：142 项，109 通过、33 跳过、0 失败；其中 AM 合约 9 项通过。
`node --check plugins/am.js` 和 `git diff --check` 通过。
安全扫描 am.js 无发现；分发文件的既有 MD5 协议和日志提示不在本次新增行内。
客户端设计见 BakaMusicFlutter 的 `docs/APPLE_MUSIC_INTEGRATION.md`。
