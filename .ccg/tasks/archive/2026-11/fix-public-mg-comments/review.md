# Local review and validation

## Root cause and scope

- The original public V1-derived `music.migu.cn/v3/api/comment/listComments` now redirects to the official V5 site and returns HTTP 200 HTML (observed 2026-11-28). The strict V2 SDK correctly returns text; the plugin cannot treat this as the old `returnCode/items` JSON. No host schema change is needed.
- The current official `u.musicapp.migu.cn/MIGUM3.0/user/comment/stack/v1.0` uses native song IDs and `commentId` continuation. Copyright IDs can return misleading zero-comment success; copyright-only records resolve through the existing official resource-info service first.
- Public API discovery was cross-checked against the public compatibility project `Domdkw/miguMusic-api-enhanced/src/modules/comment.ts`, then tested directly against official MG upstream. No source from internal LyraMesh plugins was used.
- Only public V2 MG changes. It independently owns its protocol; the legacy V1 template is not a generated input and is not changed. Newest comments form one cursor stream; the separately returned hot preview is not duplicated into that stream.

## Review

- Native song identity, current comments/replies/user/likes fields, explicit China-time timestamps, and total mapping inspected against live payloads.
- The existing per-request/account/version bound cursor wraps MG native comment-ID continuation. It validates continuation shape and rejects nonadvancing pages. Other provider and MG collection pagination paths are untouched.
- HTTP/network/service/HTML/malformed-JSON-shape/missing-identity failures reject; only a validated zero total with an empty comment list returns an empty success.
- Package version 1.0.3 agrees with generated subscription/plugin results, website, README, and all version assertions. Decimal carry convention remains applicable (1.0.9 -> 1.1.0); this release does not reach a carry boundary.
- No `.ccg/spec` exists in this repository. Local review found no blocking issue. External Claude/codeagent-wrapper was never invoked, per machine override.

## Validation

- Before implementation, four new MG behavior fixtures failed; the native fixture was initially skipped without its environment variable.
- Targeted tests with the actual lean probe: 39/39 passed, including the local-HTTP native QuickJS protocol fixture. Fixtures cover native-ID selection, copyright lookup failures, replies/timestamps, cursor continuation, separate hot previews, invalid responses, and a repeated page.
- Full suite: `BAKA_V2_PROBE=D:/Github/Music/BakaMusicFlutter/rust/target/debug/examples/v2_probe.exe npm test`: 228 tests, 204 passed, 24 optional-environment skips, zero failures. Native distribution/loading and MG protocol fixture tests ran.
- `git diff --check` passed. No adb, cargo compilation, push, or deployment occurred.

## Live versus fixture evidence

- Real existing lean QuickJS host, unmodified official upstream, 2026-11-28: MG search for 晴天 returned native ID 3790007 and copyright ID 60054701923.
- `comments.list` first page (limit 3) returned 3 comments, total 56396, continuation; the next page returned 3 different comment IDs. All mapped text/timestamps were valid.
- A saved record with ID equal to copyright ID resolved the official resource-info response to 3790007 and returned the same first three comments.
- Sanitized machine-readable live evidence is in `live-probe-summary.json`; raw comment bodies, avatars and downloaded website source are intentionally excluded from the commit.
- This proves the plugin protocol through the actual host, not device/UI integration or every upstream song.

## Distribution

- Origin is `https://github.com/Zencok/baka-plugins.git`, current branch `main`; no push was performed.
- Both checked-in deployment configs preserve dynamic V2 generation. Netlify routes `/api/v2/subscription` and `/v2/plugins/:plugin` to `functions/v2-subscription.js` and `functions/v2-plugin.js`; Vercel routes through `server.js` and includes `plugins/**` plus `functions/**`.
- Local entry: `node server.js`. A future authorized `git push origin main` publishes the commits to GitHub; any hosted automatic deployment linkage must be verified separately.
- The MG standalone artifact is rendered by the public handler, preserving the source-free `https://music.cwo.cc.cd/v2/plugins/mg.js` update URL and existing SDK settings contract. Paid-provider templates must be rendered with the installed source/key rather than silently replacing the listener source.

- Rendered standalone MG 1.0.3 artifact also passed actual lean QuickJS live upstream comments (3 items, total 56396, continuation), preserving the public source-free update URL.
- The optional installed verify-change analyzer could not execute in the machine user package context (`require`/`parseCliArgs` module mismatch); the same scope, docs, test, and staged-diff checks were completed manually.
