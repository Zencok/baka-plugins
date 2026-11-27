# Required behavior

Restore public V2 playlist discovery parity with each provider's exact public
pre-V2 implementation at `20bfcc9a6cc6e2709a6256a7ced53a599e35fa34`.

- Keep complete nonempty category groups and members in the original source order.
- Preserve the legacy common/pinned list independently, including its own order,
  typed IDs and entries absent from all category groups.
- Preserve opaque tag fields such as Kuwo `digest` and pass the selected filter
  object to the existing playlist operation without coercion.
- Retain bounded category pagination and leave charts/hot-search behavior intact.
- Apply this only to the six discovery providers and their migration draft helper.
  Increment changed package versions and synchronize visible release documentation.
- Verify exact old/new category results with local deterministic fixtures and the
  existing real native QuickJS host. Review and archive an atomic commit; do not push.

Client compatibility: page-level pins require the app support implemented in
BakaMusicFlutter commit `9b6ae6a`. Installed packages must be refreshed to obtain
the pinned metadata. Existing app-side grouping repairs and plugin updates are
separate parts of the complete journey.

Unrelated site/Netlify, Apple, artifact and previous audit work must remain intact.
