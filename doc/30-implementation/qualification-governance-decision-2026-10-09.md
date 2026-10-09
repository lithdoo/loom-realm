# Qualification governance decision — 2026-10-09

The repository maintainer directed final qualification closure for the current project state.

## Performance

Current movement qualification keeps ordinary movement P95 at `<=50ms` for every qualified viewport and uses refresh P95 ceilings of `<=50ms` at 640x480, `<=75ms` at 1280x720, and `<=100ms` at 1920x1080. The former uniform refresh `<=50ms` rule remains historical evidence but no longer controls current qualification.

No sample count, invalid-sample rule, camera-only/zero-draw requirement, pixel correctness requirement, memory limit, or raw-evidence provenance rule changes.

## Terrain

Policy B is the repository policy: synthetic-only CI, legal-local original qualification, and repository-only sanitized structural facts/digests. Original restricted runtime/data/assets and raw observation logs are not committed.

The current Terrain qualification package for subject `8131f6dd140ac21edb52879eb9ec1fd1a8cd7ba9` is accepted for the declared Neutral/Bridge/Ledge slice. `TERRAIN_BEHAVIOR_CONTRACT_V1.md` is the current frozen contract. Future executable or qualification-input changes remain subject to normal staleness/requalification rules.
