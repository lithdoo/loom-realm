# @loomrealm/fsdb-http

Read-only HTTP adapter for filesystem-backed FSDB directories.

> Status: **v1 Release Candidate**. The implementation and mandatory conformance suite track the frozen contract.

The package opens a Well-formed FSDB directory, builds one safe immutable logical snapshot, and exposes FSDB logical objects through a small Node.js-native HTTP interface without leaking physical filesystem paths.

## Contracts

- Frozen implementation contract: [DESIGN.md](./DESIGN.md)
- Mandatory conformance cases: [CONFORMANCE.md](./CONFORMANCE.md)
- FSDB storage authority: [FSDB 目录结构详解](../../doc/fsdb/FSDB目录结构详解.md)

## Package boundary

```text
filesystem FSDB directory
        ↓
openFsdb()
        ↓
opaque FsdbDatabase
        ↓
createFsdbHttpHandler()
        ↓
node:http RequestListener
```

`FsdbDatabase` is an opaque package-owned handle rather than a user-constructible structural object.

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

The first implementation targets Node.js `>=20`, uses standard-library primitives, and keeps **0 runtime dependencies**. Internal implementation details may evolve only while the Frozen v1 observable contract and mandatory conformance suite remain satisfied.

## Node request boundary

Node routes a valid `CONNECT` authority-form request to the server's `connect` event and does not invoke its `RequestListener`. `createFsdbHttpHandler()` owns requests delivered through Node's `request` event. `serveFsdb()` additionally owns its server-level `connect` policy and returns the frozen `400` response for CONNECT. A caller-composed Server retains ownership of its own `connect` event policy.
