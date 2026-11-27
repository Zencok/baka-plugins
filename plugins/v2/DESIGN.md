# Independent public provider design

V1 remains the preserved public upstream baseline. V2 is separately distributed
and uses exact `cc.baka.*` identities, source protocols and named handlers. The
client permits only this public family to bind external LX resolvers. Internal
`lyra.mesh.*` packages use their own sources and different upstream protocols.

The development compiler statically ports business functions, retaining public
QQ uniform playlist requests, Kugou command/gcid imports, Kuwo lyric/key handling,
NetEase cryptography, Migu binary decoding, Bilibili DASH and Apple native license
envelopes. Generated HTTP adapters default to text with opportunistic JSON parsing
so HTML/text endpoints remain usable with the strict SDK. Explicit JSON requests
retain strict parsing. No runtime V1 module or npm shim is shipped.

The source-handler generator shares trusted public source wire algorithms at
server generation time, then emits direct SDK calls. Subscription metadata comes
from the current templates, preserving author information. Provider updates keep
their package ID and V2 update route; source/key selectors never change ownership.

Page boundaries respect the current request limit. Complete import snapshots
remain provider-local and bounded, with opaque reference tokens. Native imports
enumerate that exact snapshot; they never reinterpret imported command IDs through
ordinary browsing endpoints. Ordinary upstream page refetches can still observe
remote changes; no provider claims a server revision where the upstream has none.

2026-11-27: restored V1 baseline and added the separate public V2 family at 1.0.0.
Regression checks include strict SDK response parsing, lyric byte-shadowing,
bounded cursor journeys, import snapshot ownership, source wire packets,
all-source distribution, author metadata and actual native HTTP/QuickJS imports.
Production publication and device/account verification remain separate.

2026-11-27 distribution repair: Netlify explicitly rewrites V2 endpoints and
packages runtime-read generator/templates using zisi. Personalized responses use
private/no-store/no-transform. All manifests retain author and injected update
URLs. Cursor scopes include query/entity/source/account revisions; upstream
failures reject rather than producing empty success. Ordinary Apple albums,
NetEase charts and Kugou global collections fetch bounded pages. Complete
explicit imports remain separate. The initial V1 migration tool now writes only
to an explicitly selected draft directory, protecting maintained V2 fixes.

2026-11-28 Kuwo 1.0.1: the actual lean host reproduced HTTP catalog request
failure while the identical HTTPS request succeeded. All seven search.kuwo.cn
catalog call sites now use HTTPS, covering five search kinds, album metadata and
artist songs/albums. Query parameters, typed IDs and cursor behavior are unchanged.
V1 remains separate. Regression tests assert transport and returned records;
remote smoke checks are host observations, not device playback evidence.

2026-11-28 playlist category metadata: a tag-only paging adapter preserves the
public V1 category group/member order, typed IDs and all filter fields. Pins are
returned separately on the first page, preserving their independent V1 order and
pins absent from categories. Moving matching pins to the beginning of the flat
category list would corrupt category order. Chart/hot-search behavior is unchanged.
The maintained providers and migration draft helper share this adapter. Kuwo is
1.0.3; NetEase, QQ, Kugou, Migu and Bilibili are 1.0.2; Apple stays at 1.0.1.
Deterministic comparisons execute each exact pre-V2 category function, and native
QuickJS fixtures validate the extra page metadata and unmodified filter round trip.
