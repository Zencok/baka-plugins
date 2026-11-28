# Requirements

- Inventory every currently distributed public V2 and legacy provider and its comment capabilities before implementation; report a support matrix.
- Add genuine upstream hot/latest selection with hot as the default. Never simulate hot or latest by locally sorting one page.
- Preserve all available replies, reply-specific avatars, and text line breaks. Unsupported services must remain explicitly unsupported.
- Use the public plugins' own APIs and the user's local research/LX references independently of internal LyraMesh code.
- Preserve public paid-template generation, installed source/key/settings policy and existing host strictness.
- Only public plugin code, its tests/docs/task records are owned here. Flutter and internal plugins belong to other agents.
- Update versions/distribution/docs consistently, run local review/tests, archive and create atomic commits. No Claude, push/deployment or phone operations.

## Confirmed thread contract

- All six supported providers accept plugin-created opaque `replyContext`; the client does not parse provider fields. Comment items may expose `replyCount`, `replyContext`, and a distinct quoted parent `quote`.
- Thread opening fetches its own first page and retains independent native continuation/retry state. Root lists do not eagerly request individual threads.
- Cursor scope includes canonical hot/latest sort, typed entity identity, limit, reply context, and existing provider/source/account/version identity.
- Apply confirmed QQ ReplyCnt/RepliedComments/HasMore/CmId punctuation and KG root childrenid facts from upstream probes; no internal implementation is copied.
