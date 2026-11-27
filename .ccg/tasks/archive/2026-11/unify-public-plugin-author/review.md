# Public author metadata

User requested all public plugin author fields become BakaMusic. All14 V1/V2 templates now display BakaMusic; Apple Music already did. Subscription authors are manifest-derived, so V2 subscription entries follow the same metadata. Song/comment author fields are untouched. Existing upstream credits retained in plugins/v2/ATTRIBUTION.md. Source IDs, versions and business requests unchanged; generated draft tooling reads V1 author metadata and remains consistent.

Validation: static check14/14 metadata fields; complete npm test with actual BAKA_V2_PROBE173 pass/24 optional skips/0 fail; updated existing provider/distribution assertions verify author and subscription consistency; git diff --check passed. Local metadata/scope review passed. No external Claude invoked under machine override. Unrelated untracked user directories excluded. Commitd85dbca pushed to origin/main; deployment verification follows publication.
