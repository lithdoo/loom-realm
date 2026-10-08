# @loomrealm/fsdb-http

Read-only HTTP adapter for filesystem-backed FSDB directories.

> Status: **v1 Release Candidate / M12 core extraction implemented and qualified**. The package is the HTTP adapter over `@loomrealm/fsdb`; its public HTTP contract remains unchanged.

The package exposes a Well-formed FSDB readonly snapshot through a small Node.js-native HTTP interface without leaking physical filesystem paths.

## Contracts

The current v1 contract is the **composition** of the original HTTP freeze plus the later frozen M12 ownership amendment:

- Original HTTP/public-behavior contract: [DESIGN.md](./DESIGN.md)
- **Current dependency / FSDB-core ownership / valid-handle producer override:** [M12_CORE_EXTRACTION.md](./M12_CORE_EXTRACTION.md)
- Mandatory conformance cases: [CONFORMANCE.md](./CONFORMANCE.md)
- FSDB storage authority: [FSDB 目录结构详解](../../doc/fsdb/FSDB目录结构详解.md)

Do not read the pre-M12 `DESIGN.md` statements “0 runtime dependencies” or “only fsdb-http can mint `FsdbDatabase`” as current ownership. Those exact clauses are explicitly superseded by the frozen M12 amendment. The original DESIGN is retained intact so the v1 HTTP freeze history remains auditable; all non-superseded HTTP observable behavior, security, lifecycle and conformance clauses remain in force.

## Current implementation

Completed M12 ownership：

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

The extraction is an ownership/dependency change, not a second FSDB model or an HTTP behavior change.

`FsdbDatabase` remains an opaque handle rather than a user-constructible structural object. The handle is minted by `@loomrealm/fsdb`; this package continues to expose source-compatible `openFsdb()` and accepts the same opaque core handle.

`createFsdbHttpHandler(db)` borrows a caller-owned database; closing the HTTP server does not close that database.

`serveFsdb()` is the standalone convenience composition. It owns an internal database plus a `node:http` server and exposes one lifecycle owner through `service.close()`; the internal database is intentionally not exposed as a service field.

Express, Koa, Fastify and Hono are not core dependencies or primary integration contracts.

## Frozen v1 public usage

```ts
const db = await openFsdb({ root });
const handler = createFsdbHttpHandler(db);

// or
const service = await serveFsdb({
  root: "/path/to/[FSDB]game",
  host: "127.0.0.1",
  port: 0,
});
```

The public `@loomrealm/fsdb-http` v1 API remains unchanged by M12.

Current implementation has exactly one runtime workspace dependency, public package `@loomrealm/fsdb`; that package itself remains Node-stdlib-only. No other runtime framework dependency is used.

## Node request boundary

Node routes a valid `CONNECT` authority-form request to the server's `connect` event and does not invoke its `RequestListener`. `createFsdbHttpHandler()` owns requests delivered through Node's `request` event. `serveFsdb()` additionally owns its server-level `connect` policy and returns the frozen `400` response for CONNECT. A caller-composed Server retains ownership of its own `connect` event policy.

## M12 implementation result

Scanner/database/index/safe-open mechanics live only in `@loomrealm/fsdb`. This package depends on and re-exports the compatible opener/types where specified; all existing `fsdb-http` conformance remains green, and clean builds remove stale pre-extraction output before packing.

Do not implement M12 by HTTP-over-HTTP proxying, cross-workspace private imports, or duplicated scanner/safe-open logic.
