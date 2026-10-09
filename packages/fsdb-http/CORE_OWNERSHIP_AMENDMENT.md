# @loomrealm/fsdb-http — Core Ownership Amendment

> Status: **Frozen Contract Amendment**  
> Historical origin: Content/core extraction work later known by the M12 delivery label  
> Current provenance: [ADR 0030](../../doc/decisions/0030-freeze-m12-content-preimplementation-closure.md)

本 amendment 只修订 `@loomrealm/fsdb-http` v1 原冻结合同中与 **package dependency / FSDB core ownership / valid database-handle producer** 有关的条款。其余 `DESIGN.md` 与 `CONFORMANCE.md` public API、HTTP observable behavior、安全不变量、lifecycle 和 conformance 要求继续有效。

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

该 amendment 不授权 generic repository/storage provider/query framework/transaction/watch system，也不改变 FSDB HTTP observable contract。
