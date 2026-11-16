# @loomrealm/fsdb-http — Core Ownership Amendment

> Status: **Historical ownership amendment / current package-boundary reference**  
> Historical origin: Content/core extraction work later known by the M12 delivery label  
> Current provenance: [ADR 0030](../../doc/decisions/0030-freeze-m12-content-preimplementation-closure.md)

本 amendment 记录 `@loomrealm/fsdb-http` 的 **package dependency / FSDB core ownership / valid database-handle producer** 边界。它不是 HTTP 协议冻结声明，也不限制项目在正式发布前原地调整 public API 或 route semantics。当前 HTTP observable behavior、Root-scoped database routes、lifecycle 和 conformance 以持续演进的 `DESIGN.md` 与 `CONFORMANCE.md` 为准。

## Dependency and ownership

```text
Node.js stdlib
    ↓
@loomrealm/fsdb
    ↓
@loomrealm/fsdb-http
```

`@loomrealm/fsdb` owns readonly FSDB well-formed validation、physical-object safety、immutable logical snapshot/index、descriptor bytes、safe-open/currentness、OPEN/STALE/CLOSED state、read lease/close-drain 与 source-validator facts。

`@loomrealm/fsdb-http` owns `/fsdb/v1` route grammar、method/status precedence、HTTP metadata spelling、Content-Type、weak ETag/conditional semantics、Cache-Control、HTTP error projection、RequestListener/standalone server 与 CONNECT policy。

## Opaque handle

唯一 valid runtime producer 是 `@loomrealm/fsdb.openFsdb()`；`@loomrealm/fsdb-http.openFsdb()` 是 source-compatible re-export/projection。Structural look-alike remains invalid。

## Compatibility

`@loomrealm/fsdb-http` root public surface保持：`openFsdb`、`createFsdbHttpHandler`、`serveFsdb`、`FsdbDatabase`、`FsdbDatabaseState`、`OpenFsdbOptions`、`ServeFsdbOptions`、`FsdbHttpService`。Core-only describe/list/open-object/lease capabilities 不从 HTTP package root re-export。

该 amendment 不授权 generic repository/storage provider/query framework/transaction/watch system。它只记录 package ownership；FSDB HTTP 当前 observable contract 由 DESIGN.md / CONFORMANCE.md 定义并在发布前原地演进。
