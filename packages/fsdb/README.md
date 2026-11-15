# @loomrealm/fsdb

Node-only readonly FSDB domain core extracted for M12. It owns validation, immutable logical snapshots, deterministic database descriptors, ordinary and metadata lookup, safe-open/currentness checks, read leases, and close-drain lifecycle.

Public values:

```text
openFsdb
describeFsdb
getFsdbSnapshotId
listFsdbEntries
openFsdbObject
```

Physical FSDB directory type markers are ASCII case-insensitive (e.g. `[FSDB]` / `[fsdb]`, `[STRUCT]` / `[struct]`). New writers should emit uppercase markers; logical `TableKind` values stay lowercase, and database/table/key names retain their original case-sensitive identity. Nested child FSDB directories are not part of this change.

The package depends only on Node standard-library modules. It does not own HTTP routes, LoomRealm Content hashing/version policy, installations, authorization, repositories, or storage-provider abstractions.

`FsdbReadLease.close()` is idempotent and owns stream/handle release. `FsdbDatabase.close()` stops new admission and waits for admitted leases to close.

Qualification:

```text
npm test -w @loomrealm/fsdb
npm pack -w @loomrealm/fsdb --dry-run
```
