# Public QuickJS V2 providers

These seven templates are adapted from this repository's public V1 providers at
`20bfcc9`. LyraMesh's internal QQ playlist, Kugou and other upstream APIs are a
separate implementation and must not be copied into this family.

Packages initially started at `1.0.0`; Kuwo is now `1.0.2` and the other six
providers are `1.0.1`. This revision restores public-baseline dispatch, chart
groups, import selection and media quality policy; Kuwo also retains its earlier
search, album and artist catalog HTTPS fixes. Stable package IDs are:
`cc.baka.am`, `cc.baka.wy`, `cc.baka.qq`,
`cc.baka.kg`, `cc.baka.kw`, `cc.baka.mg`, `cc.baka.bilibili`. Their source protocol
IDs are `{platform}.v1`; that suffix versions the catalog protocol, not the plugin
API. The manifest API version is 2. The public display author is `BakaMusic`;
upstream credits remain in [ATTRIBUTION.md](ATTRIBUTION.md). Settings are preserved.

## Distribution and authoring

Use `/api/v2/subscription` and `/v2/plugins/qq` (the `.json`/`.js` route aliases
also work). Responses, not filenames or MIME types, identify imports. Source and
key parameters are encoded without adding or stripping suffixes. V1 templates
and routes remain independent and retain their original versions.

Distributed files export `manifest` and grouped `handlers`. They use QuickJS
JavaScript plus the HTTP, byte, text, crypto, storage and logging SDK; no npm,
browser or Node globals are installed. Provider-owned lyric/key protocols remain
independently updatable. Keep `// @baka-provider 2` as the first line, including
after obfuscation. Preserve exported manifest/handler and SDK property names.
Pure-JS protection can run if compatible with this environment; arbitrary VMP
outputs require testing and still obey memory/execution limits.

Manifests and handlers follow catalog/search, collection, discovery, media,
lyrics, comments and links order. Format with two spaces, double quotes, 100
columns and LF. `build.cjs` is a development-only static migration tool: it reads
the preserved public V1 business functions, emits direct V2 handlers and SDK
calls, and is never loaded by a distributed plugin. The maintained V2 files are
authoritative: migration output predates V2 fixes and must only be used as drafts.
Set `BAKA_V2_DRAFT_DIR` to a separate directory; overwriting this directory is rejected.
Review and manually port upstream protocol changes, preserving V2 handlers and tests.
Set `BAKA_PRETTIER_MODULE` to the installed Prettier module when regenerating:

```sh
BAKA_V2_DRAFT_DIR=/tmp/baka-v2-drafts node plugins/v2/build.cjs
node --test tests/v2-providers.test.cjs tests/v2-distribution.test.cjs
```

## Paging and imports

The current host accepts request limits 1–100 and defaults to 30. This is not a
fixed 30-song protocol. Providers must return at most the requested limit. Opaque
cursors retain the upstream page and offset so a 100-song source response can
be consumed in smaller requests without losing songs. Grouped charts retain their
category labels. Invalid/nonprogressing pages fail explicitly.

Explicit imports preserve the public provider's complete import protocol. A
single active snapshot per SDK instance (maximum 100,000 tracks, ten-minute
expiry) lets the native importer enumerate bounded pages without refetching the
collection, changing a Kugou command code into a curated playlist ID, or dropping
Kuwo share URL authorization. Expired/superseded references require a fresh import.
Ordinary collection browsing continues to use upstream pages.

Page cursors are bound to the provider, capability, query, typed entity,
source URL, revisions and account settings. Reusing a cursor after these change
fails explicitly; account values are hashed rather than embedded in cursors.
Upstream network and authorization errors remain errors, never successful empty
pages. Apple album browsing fetches one upstream page per request.

## Native validation

Set `BAKA_V2_PROBE` to the built client's `v2_probe` executable, then run:

```sh
node --test tests/v2-native.test.cjs tests/v2-public-parity.test.cjs
python tests/v2-native-import.py PATH_TO_BAKA_FFI_DLL
```

These execute the real lean QuickJS SDK and native import enumerator against local
HTTP fixtures. They do not establish remote service uptime, account authorization
or device playback. See [DESIGN.md](DESIGN.md).


Plugin version increments follow the maintained decimal carry convention: after 1.0.9 comes 1.1.0, not 1.0.10. Bump every modified package and synchronize distribution versions.
