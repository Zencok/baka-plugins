# Public V2 playlist category metadata review

Local implementation review and validation completed on 2026-11-28. External
Claude calls were prohibited by the machine-wide user override and were not run.
Independent final local review by `final_discovery_review` found no Critical or
Warning issues. It confirmed independent category/pin order, cursor handling,
pre-V2 fixture coverage and synchronized versions/documentation.

## Resolved findings

- The initial adapter moved pins ahead of categories. That changed category group
  and member order whenever pin order differed from source order. The final
  adapter leaves flat category items in source order and returns the original
  `pinned` objects separately on the first page. Later pages omit that field.
- The original parity test sorted group names and searched tags by ID, masking
  ordering regressions. It now compares complete unsorted category/item arrays and
  exact pin arrays against each legacy function. A synthetic fixture exercises
  different pin/category order and numeric/string IDs that share the same text.
- The all-source distribution fixture hardcoded the previous versions. Its
  expectation now matches the six changed packages while Apple stays at 1.0.1.

## Validation

Node v24.19.0. Existing native binary, without rebuilding application sources:
`D:/Github/Music/BakaMusicFlutter/rust/target/debug/examples/v2_probe.exe`.

With `BAKA_V2_PROBE` set to that executable:

```powershell
node --test tests/v2-playlist-tags.test.cjs tests/v2-native.test.cjs tests/v2-providers.test.cjs tests/v2-public-parity.test.cjs tests/v2-distribution.test.cjs tests/v2-packaged.test.cjs
npm test
git diff --check
```

- Focused suite: 55 tests, 54 passed, 0 failed, 1 optional isolated Netlify bundle
  fixture skipped. See `focused-tests.log`.
- Full suite: 220 tests, 196 passed, 0 failed, 24 optional packaged-bundle fixture
  tests skipped. Native tag metadata, actual HTTP pagination, public parity and
  all-source distributed provider loading ran. See `full-tests.log`.
- The new order/metadata assertions failed against the initial implementation
  before the tag-only adapter was corrected.
- Diff whitespace check passed. The maintained adapters match the draft helper;
  chart handlers still use the unchanged shared slice adapter.
- The verify-change skill's staged analysis passed with no issues and confirmed
  synchronized V2 design documentation. Its script required a CommonJS loader
  because the machine home package declares `type: module`; no skill files changed.
  The skill reports zero line counts on this host, so `git diff --cached --stat`
  and manual staged diff review supplied the actual change-size/scope check.

## Scope and compatibility

Release versions: Kuwo 1.0.3; NetEase, QQ, Kugou, Migu and Bilibili 1.0.2;
Apple unchanged at 1.0.1. V1 and source protocols are unchanged. Related client
page-level-pin support is BakaMusicFlutter `9b6ae6a`.

These are local deterministic and native host results, not proof of current
remote category endpoints, actual device UI/playback or deployed-site versions.
No publication or push is part of this task. Unrelated work stays untracked and
outside the staged release.
