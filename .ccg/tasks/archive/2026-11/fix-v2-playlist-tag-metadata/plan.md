# Public V2 playlist tag metadata

Baseline: public pre-V2 commit `20bfcc9a6cc6e2709a6256a7ced53a599e35fa34`.

1. Add a playlist-tag-only adapter preserving flat category group/member order, typed IDs and all metadata. Return legacy pins separately on the first page, preserving their independent order and out-of-group entries. Keep shared charts/hot-search sliceResult unchanged.
2. Wire six maintained discovery providers and draft template to the helper. Bump only changed provider patch versions with decimal carry.
3. Compare deterministic upstream category fixtures through exact pre-V2 functions and maintained V2 handlers. Assert unsorted category/item/pin order. Cover pins outside groups, typed identity, pagination, pin-only/empty responses and tag filter passthrough.
4. Synchronize README and subscription-page display versions. Run focused Node, public/distribution and native QuickJS tests; review and archive before atomic commit.

Claude is disabled by the machine-wide user override. No external model calls. Independent local review is coordinated by the parent task; this implementer does not spawn agents.
