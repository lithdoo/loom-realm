# @loomrealm/fsdb-http

Read-only HTTP adapter for filesystem-backed FSDB directories.

> Status: **Frozen for Implementation — v1**. Runtime implementation has not started yet.

The package opens a Well-formed FSDB directory, builds a safe immutable logical index, and exposes FSDB logical objects through a small Node.js-native HTTP interface without leaking physical filesystem paths.

## Contracts

- Frozen implementation contract: [DESIGN.md](./DESIGN.md)
- Mandatory conformance cases: [CONFORMANCE.md](./CONFORMANCE.md)
- FSDB storage authority: [FSDB 目录结构详解](../../doc/fsdb/FSDB目录结构详解.md)

## Package boundary

This package is intentionally independent from LoomRealm Main, Renderer, Frame, Data Connection, Game Package and Content API.

```text
filesystem FSDB directory
        ↓
openFsdb()
        ↓
FsdbDatabase
        ↓
createFsdbHttpHandler()
        ↓
node:http RequestListener
```

`serveFsdb()` is the convenience composition that owns a database plus a `node:http` server. Express, Koa, Fastify and Hono are not core dependencies or primary integration contracts.

## Frozen v1 public shape

```ts
const db = await openFsdb({ root });
const handler = createFsdbHttpHandler(db);

// or
const service = await serveFsdb({ root, host: "127.0.0.1", port: 0 });
```

The first implementation targets Node.js `>=20`, prefers standard-library primitives, and keeps **0 runtime dependencies**. Internal implementation details may evolve as long as the Frozen v1 observable contract and conformance suite remain satisfied.
