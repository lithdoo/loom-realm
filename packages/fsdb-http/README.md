# @loomrealm/fsdb-http

Read-only HTTP adapter for filesystem-backed FSDB directories.

> Status: **Pre-release / Active / Evolving**. The project has not published the current protocol; the existing `/fsdb/v1` contract is being extended in place for Root-scoped multi-database serving.

## Contracts

- HTTP/public-behavior contract: [DESIGN.md](./DESIGN.md)
- Current dependency / FSDB-core ownership / valid-handle override: [CORE_OWNERSHIP_AMENDMENT.md](./CORE_OWNERSHIP_AMENDMENT.md)
- Mandatory conformance: [CONFORMANCE.md](./CONFORMANCE.md)
- FSDB storage reference: [FSDB layout](../../doc/20-modules/fsdb-content-service/fsdb-layout.md)

The current design and conformance documents are the active pre-release contract. `serveFsdb({ root })` implements that Root-scoped contract. `createFsdbHttpHandler(db)` remains the borrowed single-database handler. No parallel route namespace or compatibility adapter is part of this contract.

## Current composition

```text
Container Root + databasePath
        ↓
@loomrealm/fsdb
        ↓
one opaque FsdbDatabase handle
        ↓
@loomrealm/fsdb-http
        ↓
createFsdbHttpHandler(db)  — borrowed single-database handler
serveFsdb({ root })        — one Root-scoped Server, lazy database handles
```

`FsdbDatabase` is opaque and Core-minted. Core owns each snapshot. `createFsdbHttpHandler(db)` borrows one caller-owned database and does not own its lifecycle. `serveFsdb({ root })` owns one Container Root, one `node:http` Server, and the database handles it opens lazily, one single-flight handle per databasePath. `service.close()` is the single lifecycle owner for those handles.

This pre-release implementation serves multiple root and nested databases from that one Server. It is not a stability promise, and it does not add a database catalog or a per-database Server. Express/Koa/Fastify/Hono are not core dependencies.
