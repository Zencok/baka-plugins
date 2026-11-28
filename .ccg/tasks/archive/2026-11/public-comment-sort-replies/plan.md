# Plan

1. Inventory public V2/V1 capabilities and independently read research/LX references. Report the matrix before runtime changes.
2. Add fixtures for default hot, explicit hot/latest, aliases, upstream page parameters, normalized newlines, all delivered replies and independent avatars. Confirm failures before implementation.
3. Extend each of six public provider implementations in its V2 and legacy templates. Preserve upstream order and native continuation; bind V2 comment cursors to canonical sort, typed entity and bounded request limit.
4. Keep Apple Music unsupported. Preserve paid-source generation and settings. Update affected versions, README and website together.
5. Run focused/full/native tests, review locally, generate sanitized evidence, archive task and atomically commit. Report supported versus upstream-limited replies and host versus device evidence.

## Baseline matrix

| Provider | V2 capability / V1 method | Existing order | Independent reference for requested orders |
| --- | --- | --- | --- |
| WY | yes / yes | hot only | Netease/api-enhanced/module/comment_music.js and comment_hot.js |
| QQ | yes / yes | hot only | LX tx/comment.js GetHotCommentList and fcg_global_comment_h5 cmd=8 |
| KG | yes / yes | latest only; replies dropped | LX kg/comment.js rank/topliked and rank/newest |
| KW | yes / yes | latest only | LX kw/comment.js get_rec_comment and get_comment |
| MG | yes / yes | V2 latest; V1 obsolete HTML route | LX mg/comment.js queryType=2/1 with hot offset/native latest ID |
| Bilibili | yes / yes | hot only; synthesized offset | Existing independent public WBI main implementation; use real response offset with modes 3/2 |
| Apple Music | no / no | unsupported | Leave unsupported |

LX reference revision: 595c9138d58a06f217395a5dcc89f0289792fa0a. Read from src/utils/musicSdk/{wy,tx,kg,kw,mg}/comment.js. Research-directory scans for KG/Kuwo did not provide a better sorting contract than the explicit LX reference; internal deploy copies are excluded as implementation inputs.

## Thread limits

The array returned by a comments endpoint may be a preview, quote chain or available thread subset. Preserve all delivered entries and their own avatars; never advertise that preview as every reply. The parent subsequently confirmed the shared opaque replyContext contract. Independent thread endpoints and native pagination are now implemented for all six supported providers; quotes stay separate from real replies.
