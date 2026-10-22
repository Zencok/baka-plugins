# 作者单曲与专辑总数（2026-10-22）

## 协议与行为

`getArtistWorks(artist, page, type)` 返回 `artistItem.songCount` 与 `artistItem.albumCount`。两者分别代表作者单曲总数和专辑总数，不使用当前页长度替代，也不把含义不明确的 `worksNum` 同时当作两种统计。搜索与作者资料中已知含义的数量同步写入明确字段。数值字符串和 0 有效，缺失或无效的数量保持未知。

Flutter 接收作者元数据，分别保留两个总数，切换单曲/专辑和继续分页时不再以已加载数量覆盖总数。任一列表响应带有作者单曲统计时，均可补齐单曲总数；专辑请求使用独立的总数状态，避免与在途单曲请求互相覆盖。旧插件顶层 `total` / `totalCount` 按当前作品类型兼容解析。通用 `worksNum` 在作者模型中不再猜测为单曲数，因为历史网易云曾把专辑数放在这里。

平台没有提供统计时，界面显示“已加载 X 首歌曲/张专辑”。返回的作品只是部分列表时，即使插件停止继续请求，页尾也不再声称已经加载全部。播放按钮仍描述实际可播放的已加载列表。

网易云专辑请求增加 `limit=50` 和对应 `offset`，并遵循 `more`；其单曲接口仍是原有热门歌曲预览。本次未将热门歌曲接口替换为全量作品接口。JOOX 也仍保留原有的作者作品预览行为，没有声称已经支持完整作品分页。B站上传视频总数只用于单曲作品；该插件没有作者专辑接口，专辑请求返回空列表和未知总数，不再重复把视频当专辑。

咪咕保留作者搜索结果中的明确单曲/专辑统计。作者专辑当前来自搜索后筛选，不能把搜索命中总数当作作者专辑总数；没有明确作者统计时保持未知。

## 插件版本

| 文件 | 原版本 | 新版本 |
|---|---|---|
| baka-plugins/plugins/bilibili.js | 2.1.1 | 2.1.2 |
| baka-plugins/plugins/kg.js | 1.1.6 | 1.1.7 |
| baka-plugins/plugins/kw.js | 1.1.6 | 1.1.7 |
| baka-plugins/plugins/mg.js | 1.3.4 | 1.3.5 |
| baka-plugins/plugins/qishui.js | 3.3.1 | 3.3.2 |
| baka-plugins/plugins/qq.js | 1.1.9 | 1.2.0 |
| baka-plugins/plugins/wy.js | 1.1.5 | 1.1.6 |
| QQ音乐/Vkey/qq - l1.js | 1.1.7 | 1.1.8 |
| QQ音乐/Vkey/qq - l2.js | 1.1.7 | 1.1.8 |
| QQ音乐/Vkey/joox.js | 2.1.0 | 2.1.1 |
| QQ音乐/Vkey/joox[T].js | 3.0.3 | 3.0.4 |
| QQ音乐/Vkey/kw.js | 2.2.1 | 2.2.2 |
| QQ音乐/Vkey/汽水音乐[K].js | 4.0.2 | 4.0.3 |
| 汽水音乐/汽水3.3.0.js | 3.3.1 | 3.3.2 |
| 汽水音乐/汽水直连.js | 5.0.1 | 5.0.2 |

版本按逢 9 进位维护，QQ 分发插件从 1.1.9 升至 1.2.0，没有使用 .10。

## 验证

- Windows / Node.js v24.19.0：`npm test`，77 项通过，无跳过；覆盖本机 15 个插件的语法、字段语义、首页和后续页、零/未知总数、搜索统计、预览列表以及原歌单回归。
- `D:\flutter`：修改的服务、页面和作者测试 `flutter analyze --no-pub` 无问题。
- Flutter：`flutter test --no-pub test/artist_albums_test.dart test/workspace_collection_pages_test.dart test/collection_header_layout_test.dart test/collection_orientation_regression_test.dart test/discovery_and_large_collection_test.dart test/collection_sort_test.dart`，37 项通过。覆盖原生插件宿主元数据传递、真实 CollectionPage 分页/切换、未知统计、从专辑响应补齐单曲统计，以及共享详情布局、工作区和排序回归。
- 检查新增文案的简体、繁体和英文翻译；本次没有改动导航或主题。
- 这些是主机验证，不是 Android/iOS 设备证明。

## curl 实测

使用 `curl.exe -sS -L --max-time 20`，响应只保存在本机临时目录，不提交会话或诊断原始响应。各平台的曲库口径不同，不能跨平台比较这些样本的数量。

| 平台 / 作者样本 | 单曲总数 | 专辑总数 | 证据与限制 |
|---|---:|---:|---|
| 网易云 / 6452 | 581 | 45 | `GET /api/artist/6452` 返回 50 首热门歌曲和两项统计；`GET /api/artist/albums/6452?limit=20&offset=0` 返回 20 张专辑，`more=true`。接口域名 `music.163.com`。 |
| QQ / 0025NhlN2yWrP4 | 1011 | 43 | `u.y.qq.com/cgi-bin/musicu.fcg` 的 `GetSingerSongList` / `get_singer_album`；首屏各 20 条，分别读取 `totalNum` / `total`。 |
| 酷狗 / 3520 | 1848 | 49 | `mobilecdn.kugou.com/api/v3/singer/song` / `album`；首屏分别 100 首、20 张，状态均为 1。 |
| 酷我 / 336 | 1708 | 45 | `search.kuwo.cn/r.s` 的 `artist2music` / `albumlist`；首屏各 20 条，总数是字符串字段 `total`。 |
| 汽水 / 6816294167841343490 | 65 | 9 | `api.qishui.com/luna/pc/artists/{id}` 在 `artist_info` 中提供 `count_tracks` / `count_albums`；作品首屏返回 50 首且 `has_more=true`。 |
| JOOX / BLACKPINK | 269 | 34 | `cache.api.joox.com/page/artistDetail` 的 `artistInfo` 及嵌套 `total_count`；实际预览分别 94 首、6 张，明确不能用预览长度代替总数。 |
| 咪咕 / 112 | 未提供 | 未验证 | 原作品接口返回含格式异常的响应，经插件已有 JSON 修复后业务码 000000，当前页 50 首；未提供总数。没有伪造全量统计。 |
| B站 | 未做成功在线验证 | 无作者专辑接口 | 通过模拟真实函数返回路径检查上传数转交和专辑空列表行为。 |

需要同时更新 App 与插件后使用新协议。此次只创建本地提交，没有执行 push。外部八个文件仍在原路径更新；QQ 目录不是 Git 仓库，两个汽水独立文件原本未跟踪且含现有会话配置，没有把完整文件新增进版本控制。
