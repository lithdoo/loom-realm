# @loomrealm/fsdb-http

Read-only HTTP adapter for filesystem-backed FSDB directories.

> Status: **v1 Release Candidate**. The implementation and mandatory conformance suite track the frozen contract plus the M12 core-extraction amendment.

The package exposes a Well-formed FSDB readonly snapshot through a small Node.js-native HTTP interface without leaking physical filesystem paths. From M12 onward, FSDB validation/snapshot/safe-read mechanics are owned by `@loomrealm/fsdb`; this package remains the HTTP projection.

## Contracts

- Frozen implementation contract: [DESIGN.md](./DESIGN.md)
- M12 dependency/ownership amendment: [M12_CORE_EXTRACTION.md](./M12_CORE_EXTRACTION.md)
- Mandatory conformance cases: [CONFORMANCE.md](./CONFORMANCE.md)
- FSDB storage authority: [FSDB 目录结构详解](../../doc/fsdb/FSDB目录结构详解.md)

## Package boundary

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

`FsdbDatabase` remains an opaque handle rather than a user-constructible structural object.

`createFsdbHttpHandler(db)` borrows a caller-owned database; closing the HTTP server does not close that database.

`serveFsdb()` is the standalone convenience composition. It owns an internal database plus a `node:http` server and exposes one lifecycle owner through `service.close()`; the internal database is intentionally not exposed as a service field.

Express, Koa, Fastify and Hono are not core dependencies or primary integration contracts.

## Frozen v1 public usage

```ts
const db = await openFsdb({ root });
const handler = createFsdbHttpHandler(db);

// or
const service = await serveFsdb({
  root,
  host: "127.0.0.1",
  port: 0,
});
```

The public `@loomrealm/fsdb-http` v1 API remains unchanged. Its only runtime workspace dependency is the Node-specific `@loomrealm/fsdb` core defined by the M12 amendment; `@loomrealm/fsdb` itself uses Node standard-library primitives only. Internal implementation details may evolve only while the Frozen v1 observable HTTP contract and mandatory conformance suite remain satisfied.

## Node request boundary

Node routes a valid `CONNECT` authority-form request to the server's `connect` event and does not invoke its `RequestListener`. `createFsdbHttpHandler()` owns requests delivered through Node's `request` event. `serveFsdb()` additionally owns its server-level `connect` policy and returns the frozen `400` response for CONNECT. A caller-composed Server retains ownership of its own `connect` event policy.
