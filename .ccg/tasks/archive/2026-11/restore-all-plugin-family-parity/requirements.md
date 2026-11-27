# Requirements
Audit every provider against its own final pre-V2 baseline. Internal baseline:
LyraMesh 2d240c9e788fffe7461728b73a2acba1202161cf assets/plugins; public baseline:
baka-plugins20bfcc9 plugins. Preserve original upstream APIs, auth/settings,
metadata fallbacks, import branches, media/lyrics/MV/comments/discovery logic.
Keep V2-only contracts and bounded browsing; adapt complete imports as safe
snapshots/paged enumeration. Do not copy one family's algorithms into the other.
Restore proven regressions, add own-baseline fixtures, review and run native host
checks. No Claude calls. No live deployment/push requested by this task.
