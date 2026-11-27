# Public provider parity audit

Baseline: `baka-plugins@20bfcc9:plugins/{am,wy,qq,kg,kw,mg,bilibili}.js`. Target: `plugins/v2/*.js`. No internal-family algorithm was used.

This is an exhaustive export-by-export source audit with fixtures/native-host checks, not proof of live upstream availability or device UI parity. Retained means the V2 route uses the provider’s public implementation subject to the adaptations below; it does not mean identical eager return shapes or failure semantics.

## Export matrix

### am: 6 exports

| Baseline export | V2 route and reviewed behavior |
|---|---|
| `search` | Retained: search; own search-type APIs/fallbacks. |
| `getAlbumInfo` | Retained: collections.get/members album; own album APIs, AM uses upstream cursor pages. |
| `getArtistWorks` | Retained: collections.members artist; own music/album APIs and totals. |
| `getLyric` | Retained: lyrics.get; own decryption, timing, translation and fallback. |
| `getMediaSource` | Retained: media.resolve + media.prepare; own public source generator and protocol preparation. |
| `getAppleMusicKey` | Retained: media.license; public key/segment wire API with endpoint checks. |

### wy: 18 exports

| Baseline export | V2 route and reviewed behavior |
|---|---|
| `getDailyRecommendations` | Retained: discovery.daily; own account/settings/readiness and gateway. |
| `getHotSearch` | Retained: discovery.hotSearch; own endpoint/order. |
| `search` | Retained: search; own search-type APIs/fallbacks. |
| `getMediaSource` | Retained: media.resolve + media.prepare; own public source generator and protocol preparation. |
| `getMvSource` | Retained: media.video; own requested-quality fallback and metadata. |
| `getMusicInfo` | Retained: entities.get; own music metadata lookup. |
| `getMusicDetailPageUrl` | Retained: links.share; own detail URL formatter. |
| `getLyric` | Retained: lyrics.get; own decryption, timing, translation and fallback. |
| `getAlbumInfo` | Retained: collections.get/members album; own album APIs/metadata. |
| `getArtistWorks` | Retained: collections.members artist; own music/album APIs and totals. |
| `getArtistInfo` | Retained: entities.get + collections.get artist; own profile/avatar fallback. |
| `importMusicSheet` | Retained: links.resolve + collections.members snapshot; own complete import branches/order. |
| `getMusicSheetInfo` | Retained: collections.get/members sheet; own metadata and pagination. |
| `getRecommendSheetTags` | Retained: discovery.playlistTags; own pinned/group tags mapped to V2 group fields. |
| `getRecommendSheetsByTag` | Retained: discovery.playlists; own tag/filter/page APIs. |
| `getTopLists` | Retained: discovery.charts; own chart source/order/groups (WY HTML restored). |
| `getTopListDetail` | Retained: collections.get/members chart; restored kind/type dispatch to own chart routine. |
| `getMusicComments` | Retained: comments.list; own comments IDs/signatures/APIs and formatting. |

### qq: 17 exports

| Baseline export | V2 route and reviewed behavior |
|---|---|
| `getDailyRecommendations` | Retained: discovery.daily; own account/settings/readiness and gateway. |
| `getHotSearch` | Retained: discovery.hotSearch; own endpoint/order. |
| `search` | Retained: search; own search-type APIs/fallbacks. |
| `getMediaSource` | Retained: media.resolve + media.prepare; own public source generator and protocol preparation. |
| `getMvSource` | Retained: media.video; own requested-quality fallback and metadata. |
| `getMusicInfo` | Retained: entities.get; own music metadata lookup. |
| `getMusicDetailPageUrl` | Retained: links.share; own detail URL formatter. |
| `getLyric` | Retained: lyrics.get; own decryption, timing, translation and fallback. |
| `getAlbumInfo` | Retained: collections.get/members album; own album APIs/metadata. |
| `getArtistWorks` | Retained: collections.members artist; own music/album APIs and totals. |
| `importMusicSheet` | Retained: links.resolve + collections.members snapshot; own complete import branches/order. |
| `getMusicSheetInfo` | Retained: collections.get/members sheet; own metadata and pagination. |
| `getRecommendSheetTags` | Retained: discovery.playlistTags; own pinned/group tags mapped to V2 group fields. |
| `getRecommendSheetsByTag` | Retained: discovery.playlists; own tag/filter/page APIs. |
| `getTopLists` | Retained: discovery.charts; own chart source/order/groups (WY HTML restored). |
| `getTopListDetail` | Retained: collections.get/members chart; restored kind/type dispatch to own chart routine. |
| `getMusicComments` | Retained: comments.list; own comments IDs/signatures/APIs and formatting. |

### kg: 18 exports

| Baseline export | V2 route and reviewed behavior |
|---|---|
| `getDailyRecommendations` | Retained: discovery.daily; own account/settings/readiness and gateway. |
| `getHotSearch` | Retained: discovery.hotSearch; own endpoint/order. |
| `search` | Retained: search; own search-type APIs/fallbacks. |
| `getMediaSource` | Retained: media.resolve + media.prepare; own public source generator and protocol preparation. |
| `getMvSource` | Retained: media.video; own requested-quality fallback and metadata. |
| `getMusicInfo` | Retained: entities.get; own music metadata lookup. |
| `getMusicDetailPageUrl` | Retained: links.share; own detail URL formatter. |
| `getTopLists` | Retained: discovery.charts; own chart source/order/groups (WY HTML restored). |
| `getLyric` | Retained: lyrics.get; own decryption, timing, translation and fallback. |
| `getTopListDetail` | Retained: collections.get/members chart; restored kind/type dispatch to own chart routine. |
| `getAlbumInfo` | Retained: collections.get/members album; own album APIs/metadata. |
| `getArtistWorks` | Retained: collections.members artist; own music/album APIs and totals. |
| `getArtistInfo` | Retained: entities.get + collections.get artist; own profile/avatar fallback. |
| `importMusicSheet` | Retained: links.resolve + collections.members snapshot; own complete import branches/order. |
| `getMusicSheetInfo` | Retained: collections.get/members sheet; own metadata and pagination. |
| `getMusicComments` | Retained: comments.list; own comments IDs/signatures/APIs and formatting. |
| `getRecommendSheetTags` | Retained: discovery.playlistTags; own pinned/group tags mapped to V2 group fields. |
| `getRecommendSheetsByTag` | Retained: discovery.playlists; own tag/filter/page APIs. |

### kw: 17 exports

| Baseline export | V2 route and reviewed behavior |
|---|---|
| `getDailyRecommendations` | Retained: discovery.daily; own account/settings/readiness and gateway. |
| `getHotSearch` | Retained: discovery.hotSearch; own endpoint/order. |
| `search` | Retained: search; own search-type APIs/fallbacks. |
| `getMediaSource` | Retained: media.resolve + media.prepare; own public source generator and protocol preparation. |
| `getMvSource` | Retained: media.video; own requested-quality fallback and metadata. |
| `getMusicInfo` | Retained: entities.get; own music metadata lookup. |
| `getMusicDetailPageUrl` | Retained: links.share; own detail URL formatter. |
| `getLyric` | Retained: lyrics.get; own decryption, timing, translation and fallback. |
| `getAlbumInfo` | Retained: collections.get/members album; own album APIs/metadata. |
| `getArtistWorks` | Retained: collections.members artist; own music/album APIs and totals. |
| `importMusicSheet` | Retained: links.resolve + collections.members snapshot; own complete import branches/order. |
| `getMusicSheetInfo` | Retained: collections.get/members sheet; own metadata and pagination. |
| `getRecommendSheetTags` | Retained: discovery.playlistTags; own pinned/group tags mapped to V2 group fields. |
| `getRecommendSheetsByTag` | Retained: discovery.playlists; own tag/filter/page APIs. |
| `getTopLists` | Retained: discovery.charts; own chart source/order/groups (WY HTML restored). |
| `getTopListDetail` | Retained: collections.get/members chart; restored kind/type dispatch to own chart routine. |
| `getMusicComments` | Retained: comments.list; own comments IDs/signatures/APIs and formatting. |

### mg: 16 exports

| Baseline export | V2 route and reviewed behavior |
|---|---|
| `getHotSearch` | Retained: discovery.hotSearch; own endpoint/order. |
| `search` | Retained: search; own search-type APIs/fallbacks. |
| `getMediaSource` | Retained: media.resolve + media.prepare; own public source generator and protocol preparation. |
| `getMvSource` | Retained: media.video; own requested-quality fallback and metadata. |
| `getMusicInfo` | Retained: entities.get; own music metadata lookup. |
| `getMusicDetailPageUrl` | Retained: links.share; own detail URL formatter. |
| `getLyric` | Retained: lyrics.get; own decryption, timing, translation and fallback. |
| `getAlbumInfo` | Retained: collections.get/members album; own album APIs/metadata. |
| `getArtistWorks` | Retained: collections.members artist; own music/album APIs and totals. |
| `importMusicSheet` | Retained: links.resolve + collections.members snapshot; own complete import branches/order. |
| `getMusicSheetInfo` | Retained: collections.get/members sheet; own metadata and pagination. |
| `getRecommendSheetTags` | Retained: discovery.playlistTags; own pinned/group tags mapped to V2 group fields. |
| `getRecommendSheetsByTag` | Retained: discovery.playlists; own tag/filter/page APIs. |
| `getTopLists` | Retained: discovery.charts; own chart source/order/groups (WY HTML restored). |
| `getTopListDetail` | Retained: collections.get/members chart; restored kind/type dispatch to own chart routine. |
| `getMusicComments` | Retained: comments.list; own comments IDs/signatures/APIs and formatting. |

### bilibili: 17 exports

| Baseline export | V2 route and reviewed behavior |
|---|---|
| `getHotSearch` | Retained: discovery.hotSearch; own endpoint/order. |
| `search` | Retained: search; own search-type APIs/fallbacks. |
| `getMediaSource` | Retained: media.resolve + media.prepare; own public source generator and protocol preparation. |
| `getMvSource` | Retained: media.video; own requested-quality fallback and metadata. |
| `getMusicInfo` | Retained: entities.get; own music metadata lookup. |
| `getMusicDetailPageUrl` | Retained: links.share; own detail URL formatter. |
| `getLyric` | Retained: lyrics.get; own decryption, timing, translation and fallback. |
| `getAlbumInfo` | Retained: collections.get/members album; own album APIs/metadata. |
| `getArtistWorks` | Retained: collections.members artist; own music/album APIs and totals. |
| `importMusicSheet` | Retained: links.resolve + collections.members snapshot; own complete import branches/order. |
| `importMusicItem` | Retained: entities.get URL + links.resolve explicit music; single BV/AV import. |
| `getMusicSheetInfo` | Retained: collections.get/members sheet; own metadata and pagination. |
| `getRecommendSheetTags` | Retained: discovery.playlistTags; own pinned/group tags mapped to V2 group fields. |
| `getRecommendSheetsByTag` | Retained: discovery.playlists; own tag/filter/page APIs. |
| `getTopLists` | Retained: discovery.charts; own chart source/order/groups (WY HTML restored). |
| `getTopListDetail` | Retained: collections.get/members chart; restored kind/type dispatch to own chart routine. |
| `getMusicComments` | Retained: comments.list; own comments IDs/signatures/APIs and formatting. |

## Helper review and repaired differences

All baseline top-level helper names are inventoried in `public-inventory.json`. No baseline export is missing. The only absent helper name is Migu `requestMusicUrl`: distribution uses the generated public source resolver instead; default `miguMusicUrl` is retained. Captured draft/helper comparisons are evidence of differences, not equivalence proofs; differences were checked against original baseline source.

| Provider | Review |
|---|---|
| am | ID/envelope/row normalization retained. Album eager 50-page materialization becomes bounded upstream-page enumeration. Search/artist/key/lyric/media APIs retained. |
| wy | SDK AES/RSA/random/bytes replace packages. Own quality/song normalization, playlist batches, comments and daily flow retained. Restored chart HTML h2/ul groups instead of the ungrouped JSON substitute. WY/QQ advertised-quality checks restored. |
| qq | Own detail/batch/comment APIs, daily account/source flow, media encrypted-key preservation, MV quality selection and metadata retained. |
| kg | Own hash/detail/image fallbacks, MV hash stream rules, album/artist/tag/special/collection APIs and GCID/share imports retained. Numeric/special collection browsing is lazy; share imports use complete snapshots. Restored quality-specific sqhash/320hash choice before source adapter. |
| kw | Own artist/artwork/search fallback, XOR/base64 lyrics and wire APIs retained. Previous search/artist/album HTTPS fixes remain. Restored advertised-quality fallback and MUSIC_ ID stripping before source invocation; string source URLs normalize to {url, quality}. |
| mg | Own V3 signature/search/fallback APIs and album/artist lookup fallbacks retained. Playlist HTML extraction restored to `.row.J_CopySong`, excluding unrelated data-cid attributes, scripts and comments. |
| bilibili | Own cookies/WBI/fingerprint/player/view fallback, audio/video qualities, AVC selection, favorites/series/season/multipart import branches retained. URL/AV single import restored; existing raw BV entities still keep cid/artwork/metadata via getMusicInfo. |

## V2 adaptations and explicit limits

- Native `kind` and legacy `type` dispatch accept artist/album/chart and track/music, playlist/sheet aliases. Cursor binding hashes the normalized kind to reject same-ID cross-kind reuse.
- Bounded browsing returns items/nextCursor. Collection metadata omits embedded member lists. Completed imports use ten-minute in-memory snapshots capped at 100000 tracks; expired or restarted sessions require reimport. WY chart details use the same public playlist batch API with bounded pages.
- Public response/HTTP failures are explicit where V1 returned empty success. Existing V2 error fixtures cover these intentional differences; optional metadata/artwork fallbacks remain. KW retains its baseline media-source failure fallback.
- Bilibili default links.resolve stays collection-oriented. Explicit type/kind music or track invokes single-track import; entities.get accepts music URL/AV input. Bare AV links have no baseline collection import and should use explicit music resolution.
- SDK crypto/text/bytes/HTTP replaces packages and DOM. WY HTML and Migu row parsing implement the public selectors used by those endpoints; this does not claim a general HTML parser.
- Apple has no baseline entity/comments/discovery/import export. Migu/Bilibili have no daily export. These unsupported capabilities were not invented.
- Source wire algorithms/settings come from this repository’s public source generator. No internal QQ/Kugou/import endpoint is substituted. No live deployment, external Claude review or device validation ran.

## Validation

- New tests/v2-public-parity.test.cjs: collection dispatch across all seven for native/legacy kinds; normalized cursor isolation; actual WY HTML groups; Migu row selector; Bilibili URL/track/default collection routes and raw-BV metadata; WY/QQ quality guard, KG hash choice and KW fallback.
- Native v2_probe.exe: real QuickJS/HTTP SDK executes WY HTML chart groups and Bilibili URL track lookup. Existing native suite loads every generated source/provider and paginates a 250-track QQ HTTP fixture.
- Targeted native + parity run: 9 passed, 0 failed, 0 skipped. Full npm test with BAKA_V2_PROBE configured: 204 tests, 180 passed, 0 failed, 24 skipped (optional packaged-bundle checks without their separate environment). git diff --check passed.
