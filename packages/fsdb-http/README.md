# @loomrealm/fsdb-http

Read-only HTTP adapter for filesystem-backed FSDB directories.

> Status: **v1 / implemented and qualified**. The package is the HTTP adapter over `@loomrealm/fsdb`; its public HTTP contract remains unchanged.

## Contracts

- HTTP/public-behavior contract: [DESIGN.md](./DESIGN.md)
- Current dependency / FSDB-core ownership / valid-handle override: [CORE_OWNERSHIP_AMENDMENT.md](./CORE_OWNERSHIP_AMENDMENT.md)
- Mandatory conformance: [CONFORMANCE.md](./CONFORMANCE.md)
- FSDB storage reference: [FSDB 目录结构详解](../../doc/fsdb/FSDB目录结构详解.md)

Do not read the original DESIGN statements “0 runtime dependencies” or “only fsdb-http can mint `FsdbDatabase`” as current ownership; those exact clauses are superseded by the ownership amendment. All non-superseded HTTP behavior/security/lifecycle clauses remain in force.

## Current composition

```text
filesystem FSDB directory
        ↓
@loomrealm/fsdb
        ↓
opaque FsdbDatabase
        ↓
@loomrealm/fsdb-http
        ↓
createFsdbHttpHandler()
        ↓
node:http RequestListener
```

`FsdbDatabase` is opaque and core-minted. `createFsdbHttpHandler(db)` borrows a caller-owned database；`serveFsdb()` owns its internal database + `node:http` server and exposes one lifecycle owner through `service.close()`。

Express/Koa/Fastify/Hono are not core dependencies. Existing HTTP route/status/MIME/weak-ETag/conditional/stale/abort/close-drain/no-path-disclosure conformance remains unchanged.
