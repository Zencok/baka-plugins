# Local review: public hot/latest comment threads

## Scope and outcome

Reviewed the public standalone V1/V2 implementations for WY, QQ, KG, KW, MG and Bilibili, their distribution version references and tests. All six expose actual upstream hot/latest ordering (default hot) and independently paged reply threads. Apple Music retains no comment capability. No local page sorting, eager thread N+1 fetching or quoted-parent-as-reply substitution is used. Replies retain their own delivered avatar; missing quoted-parent avatars remain missing.

V2 cursor context binds canonical sort, typed entity identity, bounded limit and opaque replyContext in addition to pre-existing provider/source/account/version context. Native continuation is preserved while slicing fixed native pages. Legacy callers retain bounded per-scope continuation metadata without retaining comment bodies. MG preserves strict primitive totals, bounded response width and native song identity resolution.

## Review findings resolved

- QQ actual upstream ReplyCnt is mapped, with SubCommentCount only as compatibility fallback. RepliedComments maps to quote, separately from actual SubComments. Confirmed CmId punctuation (!.*) is accepted. HasMore governs short-page continuation and repeated or missing non-final sequence state rejects.
- KG threads use the confirmed HTTPS gateway /index.php with x-router m.comment.service.kugou.com. The root response's top-level childrenid and resolved mixsongId are separately sealed into and validated from opaque context. Thread requests do not guess childrenid from catalogue song identity or perform an extra identity lookup.
- Shared text decoding protects HTTP/WWW URL tokens and Windows/absolute filesystem paths before decoding escaped newlines. Expanded fixtures cover www.example/news, C:\new\rock and /notes across all twelve templates.
- Confirmed quotes stay distinct for WY, QQ, KG and KW. No parent avatar is copied to a reply. Valid reply counts are metadata; previews are not advertised as complete threads.
- The existing MG native test now asserts that its local fixture redirects the actual stack-prefix route, preventing accidental external traffic from a stale URL replacement.

## Independent evidence

- WY: D:/Github/Music/Netease/api-enhanced/module/comment_music.js, comment_hot.js and comment_floor.js; existing public encryption/form helpers retained.
- QQ: D:/Github/Music/QQ音乐/QQMusicApi/qqmusic_api/comment.py and official archived wk_v17/wk_v17_common.js. A collaborating worker supplied minimal facts from successful upstream root/thread probes: CmId, Nick, Avatar, ReplyCnt, RepliedComments, SeqNo, RankScore and HasMore, plus GetReplyCommentList parameters. No internal plugin source was used.
- KG: original Android 20.8.8 static comments protocol evidence, including j70.x::t1 rank/topliked/newest and player.comment.protocol.c::m getReplyWithLike. A collaborating worker confirmed the HTTPS gateway and top-level childrenid difference from mixsongId via successful native upstream requests. D:/Github/Music/KG/artifacts/tmp/default_config_2088.json independently identifies the original comment service route.
- KW: D:/Github/Music/Kuwo/jadx_12140/sources/cn/kuwo/base/utils/o2.java X5 get_child_comment/pcid construction and NewCommentParser.java comments/child_comment_count/parent_comment parsing.
- MG: existing public official stack implementation plus LX queryType/native-ID rules. V1 obsolete HTML route was replaced by the current official JSON route.
- Bilibili: existing independent public WBI transport; actual pagination_reply.next_offset, main modes 3/2 and reply/reply thread endpoint retained.
- LX source revision 595c9138d58a06f217395a5dcc89f0289792fa0a was reference evidence, not an internal plugin implementation.

## Validation

- Before implementation, new comment fixtures failed as expected (66 failed / 1 passed at the initial stage).
- Full suite before final review corrections: npm test with BAKA_V2_PROBE set to the existing D:/Github/Music/BakaMusicFlutter/rust/target/debug/examples/v2_probe.exe: **309 total, 285 passed, 24 optional-environment skips, zero failures**.
- After final review corrections: node --test tests/public-comments.test.cjs tests/v2-mg-comments.test.cjs tests/v2-errors.test.cjs with that same existing probe: **124 passed, zero skipped, zero failed**. This includes 83 public-comment tests and the actual lean QuickJS local HTTP SDK fixture.
- New thread tests cover both V1/V2, native continuation through the final thread page, separate root/thread state, scope rejection before HTTP, real QQ schema and KG identity separation. These are protocol/fixture tests, not individual public live or device proof.
- Generated free MG and Bilibili standalone artifacts pass VM manifest checks and native lean-provider inspection. Source URLs are their existing public production routes. Paid-source generation/settings logic was not changed, and no arbitrary source/key was placed into a paid artifact.
- git diff --check passed after removing only newly introduced trailing whitespace. Local diff review found only intended plugin/comment/version/test/docs changes. No .ccg/spec directory exists; no speculative convention was added.

## Versions

| Provider | V1 | V2 |
| --- | --- | --- |
| WY | 1.1.9 | 1.0.4 |
| QQ | 1.3.3 | 1.0.3 |
| KG | 1.3.8 | 1.0.4 |
| KW | 1.2.2 | 1.0.5 |
| MG | 1.3.6 | 1.0.5 |
| Bilibili | 2.1.3 | 1.0.3 |
| Apple Music (unchanged) | 0.1.0 | 1.0.1 |

## Standalone artifacts and limits

- cc.baka.mg 1.0.5: D:/Github/Music/baka-plugins/artifacts/public-provider-runtime-20261128-comments/mg.js; SHA256 e4155caec4fc74ced58ddc183e6e22410e8ee8e5898c50351fc5ae91e8304175
- cc.baka.bilibili 1.0.3: D:/Github/Music/baka-plugins/artifacts/public-provider-runtime-20261128-comments/bilibili.js; SHA256 a718aca8c3e90ebb7ccc7c46825189ab2fa6c5bb6c11a88ff4bc8b39225b9255

The MG 1.0.5 artifact supersedes the earlier local MG 1.0.4 runtime artifact. Artifacts are local outputs, not deployed releases. Installed plugins require their normal update flow; paid installations must retain their own source/key. Upstream availability/authentication can still fail explicitly. Apple Music comments remain unsupported. Full-suite and fixture results are not device evidence, nor a claim that all public upstream thread endpoints were individually live-probed after these edits. External Claude is disabled as instructed. No Claude call, Cargo compilation, push, deployment, ADB or phone operation occurred.
