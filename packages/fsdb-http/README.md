# @loomrealm/fsdb-http

Read-only HTTP adapter for filesystem-backed FSDB directories.

> Status: **Pre-release / Active / Evolving**. The project has not published the current protocol; the existing `/fsdb/v1` contract is being extended in place for Root-scoped multi-database serving.

## Contracts

- HTTP/public-behavior contract: [DESIGN.md](./DESIGN.md)
- Current dependency / FSDB-core ownership / valid-handle override: [CORE_OWNERSHIP_AMENDMENT.md](./CORE_OWNERSHIP_AMENDMENT.md)
- Mandatory conformance: [CONFORMANCE.md](./CONFORMANCE.md)
- FSDB storage reference: [FSDB layout](../../doc/20-modules/fsdb-content-service/fsdb-layout.md)

The current design and conformance documents are the active pre-release contract. They supersede the single-database service assumptions in the existing implementation; no parallel route namespace or compatibility adapter is planned.

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

`FsdbDatabase` is opaque and Core-minted. `createFsdbHttpHandler(db)` continues to borrow one caller-owned database. `serveFsdb({ root })` owns one Container Root, one `node:http` Server, and all database handles it opens lazily; `service.close()` is the single lifecycle owner.

The current code still implements the previous single-database composition. The multi-database contract in DESIGN.md / CONFORMANCE.md is the implementation target and is not yet claimed as implemented. Express/Koa/Fastify/Hono are not core dependencies.
