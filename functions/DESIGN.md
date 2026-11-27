# V2 distribution and source adapters

V2 routes are separate from V1 on Express/Vercel and Netlify. Netlify force-rewrites both subscription aliases and `/v2/plugins/:plugin` to dynamic functions; the `zisi` bundle preserves the runtime filesystem layout and includes `plugins/**` plus `functions/**`. `v2-source-handler.js` reads the trusted public V1 generator at runtime to emit SDK-only V2 algorithms, so omitting that file breaks function initialization. Test extracted official bundles independently of the repository.

Personalized JavaScript must retain the exact first line `// @baka-provider 2`. Subscription JSON remains a document containing `plugins`; it must never be inspected as a script. Both responses use private/no-store/no-transform cache policy so intermediaries are instructed to preserve source comments and credential-specific bytes. Manifest IDs and source protocols remain independent from distribution URLs. V2 versions are `1.0.0`, with stable public `cc.baka.*` IDs.

Run the app's native fetch, isolated inspection and registry restore against the subscription, not only VM tests of local templates. `tests/v2-native-distribution.py` does this without printing or persisting credentials. An optional native matrix covers every generated source/provider combination. The local Flutter URL-import flow is separately exercised against the deployed subscription.

Provider paging binds cursors to request identity, capability, source, revisions and hashed account settings. Network/authorization failures propagate instead of becoming empty pages. Apple album requests fetch one upstream page. Maintained V2 templates are authoritative; the V1 migration tool requires a separate draft output directory and cannot overwrite them.

# 星海令牌适配

`plugin.js` 生成的星海独立源及次合代、全豆要的星海线路共用令牌客户端，协议参考上游脚本内部版本 `v3.2.17`。

- 信任边界：令牌由星海 HTTPS `token.php` 签发；设备 ID 仅用于关联请求，随机值不承担签名或身份认证职责。本地不再构造 Base64 认证令牌。
- 令牌只保存在插件运行内存中，缓存 4 分钟，并合并并发获取请求。获取失败时停止该星海请求，不发送空令牌或过期令牌；聚合源可继续原有备用线路。
- 解析请求携带 `X-Token`、`X-Client: XingHaiMusicSource/v3.2.17 (unknown)` 和 `User-Agent: lx-music`。令牌不发送给念心、QQ s01s 或音频链接。
- `auth.tk_mismatch === true`、`auth.device_id === "untrusted-token"` 或 `auth.tk_error` 触发失效和刷新，每次解析最多重试一次，避免反复鉴权失败造成请求循环。
- 已知限制：令牌服务及播放解析由上游控制；服务不可用、授权限制或网络出口变化仍可能导致请求失败。本适配不加入许可卡密或扩大平台、音质范围。
