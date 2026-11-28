# Requirements

- Repair public MG comments.list failure using public MG source and the actual V2 SDK contract.
- Keep MG HTTP/business protocol in the plugin; preserve host validation and propagate real service failures.
- Preserve public versus internal plugin family separation; no internal plugin code is used.
- Reproduce with local fixtures and an upstream HTTP probe, distinguishing live and fixture evidence.
- Synchronize the MG V2 release version and distribution documentation with decimal carry semantics (1.0.9 -> 1.1.0).
- Run local review/tests, archive this task, and commit only the coherent owned change.
- External Claude/codeagent-wrapper calls are disabled by the machine override.
