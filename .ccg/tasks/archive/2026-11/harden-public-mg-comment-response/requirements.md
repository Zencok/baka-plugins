# Requirements

- Reject non-primitive MG commentNums before numeric conversion, including arrays such as [0].
- Reject upstream comment arrays wider than the requested bounded page size.
- Keep strict host schema, existing errors, public-family boundaries and source/settings policy intact.
- Add regressions, synchronize the MG version/docs/distribution assertions, run targeted and full tests, review locally and archive with an atomic commit.
- Regenerate the MG standalone artifact and report its SHA-256. No push, deployment, device interaction or Claude calls.
