# 歌单总数修复与验证（2026-10-22）

歌单详情使用 `sheetItem.worksNum` 返回总数，与当前页 `musicList.length` 分开。优先使用平台元数据；只有已经取得完整集合时才允许用集合长度补齐。数值字符串会归一化，空歌单保留 0，无效或未知总数不伪装成当前页数量。

网易云同时缓存官方总数与歌曲 ID，二次打开不因可访问 ID 少于官方数量而缩小总数。JOOX 保留旧的顶层元数据，同时增加宿主读取的 `sheetItem`。咪咕分页响应没有总数时，尝试现有歌单元数据接口的 `contentCount`；失败时保留已知总数。汽水的合法空歌单不再被当成无效详情丢弃。

本次未调整歌曲分页策略、播放全部行为、Flutter 展示规则或导航。某些插件原来就先完整导入再返回详情；本次没有将这些分支改为首屏分页。

## 版本

| 位置 | 文件 | 原版本 | 新版本 |
|---|---|---|---|
| baka-plugins/plugins | wy.js | 1.1.4 | 1.1.5 |
| baka-plugins/plugins | qq.js | 1.1.8 | 1.1.9 |
| baka-plugins/plugins | kg.js | 1.1.5 | 1.1.6 |
| baka-plugins/plugins | kw.js | 1.1.5 | 1.1.6 |
| baka-plugins/plugins | mg.js | 1.3.3 | 1.3.4 |
| baka-plugins/plugins | bilibili.js | 2.1.0 | 2.1.1 |
| baka-plugins/plugins | qishui.js | 3.3.0 | 3.3.1 |
| QQ音乐/Vkey | qq - l1.js | 1.1.6 | 1.1.7 |
| QQ音乐/Vkey | qq - l2.js | 1.1.6 | 1.1.7 |
| QQ音乐/Vkey | joox.js | 2.0.9 | 2.1.0 |
| QQ音乐/Vkey | joox[T].js | 3.0.2 | 3.0.3 |
| QQ音乐/Vkey | kw.js | 2.2.0 | 2.2.1 |
| QQ音乐/Vkey | 汽水音乐[K].js | 4.0.1 | 4.0.2 |
| 汽水音乐 | 汽水3.3.0.js | 3.3.0 | 3.3.1 |
| 汽水音乐 | 汽水直连.js | 5.0.0 | 5.0.1 |

## 验证范围

- Node.js v24.19.0：在 baka-plugins 执行 `npm test`。测试会解析完整插件语法，并运行真实详情函数，以模拟网络/格式化依赖验证首屏、后续页、空歌单、未知总数、网易云缓存重开、咪咕元数据补查及汽水空详情判定。外部文件位于相邻原目录时纳入运行；不在机器上时显式跳过。
- 测试中的函数提取不等于完整插件宿主运行或设备验证。以下 curl 结果仅证明当次平台响应字段。
- QQ音乐目录不是 Git 仓库；两个汽水独立文件原来未被 Git 跟踪。外部八个文件已在原路径修改、递增版本并纳入本机测试，不将这些现有完整文件和其中的本地会话配置新增进版本控制。

## curl 实测

使用 Windows `curl.exe -sS -L --max-time 20`，无需账户或付费音源密钥。原始响应仅存于本机临时目录，不提交会话、设备或诊断数据。

| 平台 | 实测请求与结果 |
|---|---|
| 网易云 | `GET https://music.163.com/api/v3/playlist/detail?id=5021087445&n=5000`：`playlist.trackCount=6614`，`trackIds.length=6592`。总数与可访问歌曲数确实不同。 |
| 酷我 | `GET http://nplserver.kuwo.cn/pl.svc?op=getlistinfo&pid=1082685104&pn=0&rn=20&encode=utf8&keyset=pl2012&vipver=MUSIC_9.1.1.2_BCS2&newver=1`：`total=603`，本页 20 首。 |
| 酷狗 | `GET http://mobilecdn.kugou.com/api/v3/special/song?specialid=125032&page=1&pagesize=100&version=9108&plat=0`：成功，总数 15，本页 15 首；没有宣称该样本验证了多页网络加载。 |
| QQ | `POST https://u.y.qq.com/cgi-bin/musicu.fcg`，`music.srfDissInfo.aiDissInfo.uniform_get_Dissinfo`，歌单 `9203537508`：请求、子请求和数据状态均为 0，`dirinfo.songnum=1`，本页 1 首。 |
| JOOX | 从 `GET https://cache.api.joox.com/page/playlistBrowse?country=hk&lang=zh_TW` 发现公开歌单，再请求 `page/playlistDetail`。样本 `track_count=105`，`tracks.items.length=105`，没有 `tracks.total_count`，说明还必须兼容 `track_count`。该接口当次没有按请求的 `num=50` 限制条数。 |
| 汽水 | 匿名 `POST https://api.qishui.com/luna/pc/discover/mix` 获取公开歌单，随后 `GET /luna/pc/playlist/detail`，歌单 `7031074411747969032`，请求 `count=20`：官方 `count_tracks=70`，`resource_cnt.track_cnt=87`，本页资源 15 条，`has_more=true`。沿用插件原有的 `count_tracks` 优先规则。 |
| 咪咕 | 当次 H5 列表、歌曲和元数据接口返回非 JSON 拦截页；旧 App 接口样本返回业务码 `200002`。修复通过回归模拟验证，尚无成功的本次在线总数证据。 |
| B站 | 匿名收藏夹发现接口当次返回非 JSON 拦截页。总数/空值处理通过回归模拟验证，尚无成功的本次在线证据。 |

没有进行线上发布、Git push 或 App 设备验证。插件更新须由原分发方式加载新版本后生效。
