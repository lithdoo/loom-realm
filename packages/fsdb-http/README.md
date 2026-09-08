# @loomrealm/fsdb-http

Read-only HTTP adapter for filesystem-backed FSDB directories.

> Status: **v1 Release Candidate / M12 core extraction preimplementation frozen**. The current implementation still contains the FSDB core internally; M12 will mechanically extract that core without changing this package's public HTTP contract.

The package exposes a Well-formed FSDB readonly snapshot through a small Node.js-native HTTP interface without leaking physical filesystem paths.

## Contracts

- Frozen implementation contract: [DESIGN.md](./DESIGN.md)
- M12 dependency/ownership amendment: [M12_CORE_EXTRACTION.md](./M12_CORE_EXTRACTION.md)
- Mandatory conformance cases: [CONFORMANCE.md](./CONFORMANCE.md)
- FSDB storage authority: [FSDB 目录结构详解](../../doc/fsdb/FSDB目录结构详解.md)

## Current implementation vs M12 target

Current pre-M12 implementation：

```text
filesystem FSDB directory
        ↓
@loomrealm/fsdb-http internal scanner/database
        ↓
opaque FsdbDatabase
        ↓
createFsdbHttpHandler()
        ↓
node:http RequestListener
```

Frozen M12 target：

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

`FsdbDatabase` remains an opaque handle rather than a user-constructible structural object. Under the M12 target the handle is minted by `@loomrealm/fsdb`; this package continues to expose source-compatible `openFsdb()` and accepts the same opaque core handle.

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

Current implementation uses Node standard-library primitives only. M12 implementation will add exactly one runtime workspace dependency, public package `@loomrealm/fsdb`; that package itself remains Node-stdlib-only. No other runtime framework dependency is authorized by the amendment.

## Node request boundary

Node routes a valid `CONNECT` authority-form request to the server's `connect` event and does not invoke its `RequestListener`. `createFsdbHttpHandler()` owns requests delivered through Node's `request` event. `serveFsdb()` additionally owns its server-level `connect` policy and returns the frozen `400` response for CONNECT. A caller-composed Server retains ownership of its own `connect` event policy.

## M12 implementation constraint

Until M12 implementation lands, the repository may still contain scanner/database files under this workspace. The M12 closure requires moving the shared FSDB domain mechanics into `@loomrealm/fsdb`, updating this package to depend on/re-export the core where specified, and keeping all existing `fsdb-http` conformance green.

Do not implement M12 by HTTP-over-HTTP proxying, cross-workspace private imports, or duplicated scanner/safe-open logic.
