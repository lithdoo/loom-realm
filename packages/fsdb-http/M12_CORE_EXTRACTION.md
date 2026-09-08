# @loomrealm/fsdb-http — M12 Core Extraction Amendment

> 状态：**Frozen Contract Amendment**  
> 生效：M12 Content preimplementation freeze  
> 最近复核：2026-09-08  
> 原合同：[DESIGN.md](./DESIGN.md)  
> M12 冻结：[../../M12_01_CONTENT_SERVICE.md](../../M12_01_CONTENT_SERVICE.md)  
> 决策：[ADR 0030](../../doc/decisions/0030-freeze-m12-content-preimplementation-closure.md)

本文件只修订 `@loomrealm/fsdb-http` v1 原冻结合同中与 **package dependency / FSDB core ownership / valid database-handle producer** 有关的条款。除本文明确覆盖的内容外，`DESIGN.md` 与 `CONFORMANCE.md` 的 public API、HTTP observable behavior、安全不变量、lifecycle 和 conformance要求全部继续有效。

---

## 1. Reason

M12 Desktop Content Service成为 readonly FSDB logical snapshot/safe-read mechanics 的第二个真实 production consumer。

继续让这些 mechanics 私有地留在 `@loomrealm/fsdb-http` 会迫使：

```text
Desktop Content → HTTP-over-HTTP proxy
or
Desktop Content → fsdb-http private implementation
or
duplicate FSDB scanner/index/safe-open
```

三者都违反现有边界。因此 M12 进行一次机械 core extraction。

---

## 2. Superseded Dependency Clause

原 `DESIGN.md` 中：

```text
Node.js stdlib
    ↓
@loomrealm/fsdb-http

v1 保持 0 runtime dependencies
```

自 M12 起被以下 frozen dependency替代：

```text
Node.js stdlib
    ↓
@loomrealm/fsdb
    ↓
@loomrealm/fsdb-http
```

这是本 amendment 唯一允许新增的 runtime workspace dependency。

`@loomrealm/fsdb` 本身只依赖 Node stdlib，并且是正常可发布 package：

```text
name          = @loomrealm/fsdb
module        = ESM
engines       = Node >=20
publishConfig = public
exports       = root only
```

它的版本遵循当前 workspace release version。`@loomrealm/fsdb-http` 不通过 bundling、跨 workspace private import 或 unpublished hidden dependency消费它。

---

## 3. Ownership After Extraction

`@loomrealm/fsdb` owns：

```text
FSDB Well-formed validation
root / descendant physical-object safety
immutable logical snapshot/index
deterministic database descriptor bytes
ordinary entry logical identity
$info / $extend / $desc metadata logical identity
safe-open / same-handle currentness validation
OPEN / STALE / CLOSED database state
read admission / lease / close-drain mechanics
snapshot-local source validator facts
```

`@loomrealm/fsdb-http` continues to own：

```text
/fsdb/v1 request-target and route grammar
method / status precedence
HTTP metadata route spelling
Content-Type response policy
weak ETag construction
If-Match / If-None-Match semantics
Cache-Control
HTTP error/status projection
RequestListener ownership
standalone node:http Server composition
CONNECT handling owned by serveFsdb()
```

因此：

```text
FSDB domain mechanics != HTTP representation mechanics
```

---

## 4. Opaque Database Handle Amendment

原 DESIGN 中“只有 `@loomrealm/fsdb-http` 本 package 的 `openFsdb()` / internal composition 可以产生 valid `FsdbDatabase`”这一 ownership wording 被本节替代。

M12 起唯一 valid runtime producer是：

```text
@loomrealm/fsdb.openFsdb()
→ opaque FsdbDatabase
```

`@loomrealm/fsdb-http.openFsdb()` 是该 core opener 的 source-compatible re-export / projection，因此 existing consumer仍可从旧 package入口获得合法 handle。

固定：

```text
only @loomrealm/fsdb core can mint a valid FsdbDatabase handle
structural look-alike remains invalid
fsdb-http accepts the same opaque core handle
physical path/index/private implementation never becomes public
```

这不允许第三方构造、伪造或 subclass database handle。

---

## 5. Public Compatibility

`@loomrealm/fsdb-http` existing root public surface MUST remain unchanged：

```text
openFsdb
createFsdbHttpHandler
serveFsdb
FsdbDatabase
FsdbDatabaseState
OpenFsdbOptions
ServeFsdbOptions
FsdbHttpService
```

`openFsdb` 与 existing database types MAY be re-exported from `@loomrealm/fsdb`，但以下 core-only capabilities MUST NOT be re-exported by the `@loomrealm/fsdb-http` root：

```text
describeFsdb
getFsdbSnapshotId
listFsdbEntries
openFsdbObject
FsdbObjectIdentity
FsdbObjectDescriptor
FsdbReadLease
```

Existing consumers MUST NOT need source changes solely because of the extraction。

---

## 6. HTTP Compatibility

Extraction MUST preserve all existing `fsdb-http` observable/conformance behavior，including：

```text
/fsdb/v1 deterministic descriptor
ordinary struct / extend / group / resource routes
hierarchical ResourceKey
$info / $extend / $desc matrix
GET / HEAD
status precedence
MIME
weak ETag / conditional semantics
same-handle read
stale fail-closed
client abort behavior
close drain
no path disclosure
```

Internal ETag source material MAY now be obtained from `@loomrealm/fsdb` snapshot/source tags。其 internal encoding仍不是 v1 contract；HTTP validator semantics仍必须满足原 `DESIGN.md`/`CONFORMANCE.md`。

`@loomrealm/fsdb-http` MUST NOT switch to LoomRealm Content `sha256:<...>` ETag semantics。FSDB HTTP validator 与 Content version 是不同 contracts。

---

## 7. No New Framework

该 extraction 不授权新增：

```text
Repository hierarchy
StorageProvider / StorageBackend SPI
query/filter/pagination framework
Content authority
installation registry
HTTP abstraction
filesystem transaction layer
watch/hot reload system
```

`@loomrealm/fsdb` 是 Node-specific readonly FSDB domain core，不是 universal storage package。

---

## 8. Distribution / Package Evidence

因为 `@loomrealm/fsdb-http` 是 publishable package，M12 extraction必须同时证明：

```text
npm pack @loomrealm/fsdb includes its root runtime/types/docs
npm pack @loomrealm/fsdb-http declares @loomrealm/fsdb as runtime dependency
M12_CORE_EXTRACTION.md is included in fsdb-http published files
installing packed fsdb-http + fsdb resolves without monorepo-private paths
```

不得依赖 workspace source layout才能运行 published `@loomrealm/fsdb-http`。

---

## 9. Qualification

M12 必须证明：

```text
@loomrealm/fsdb build/test/pack
@loomrealm/fsdb-http build/test/pack
existing fsdb-http conformance green
existing fsdb-http public exports unchanged
valid opaque handle is core-minted / structural forgery rejected
all descriptor/ordinary/metadata reads use @loomrealm/fsdb core
no duplicate scanner/index/safe-open implementation remains in fsdb-http
packed dependency installation resolves
```

---

## 10. Freeze Statement

本 amendment 显式改变的是 `fsdb-http` 的 internal package dependency/ownership与 valid opaque-handle producer，不改变其 v1 HTTP contract。

除非证明 core extraction 与既有 FSDB HTTP observable contract存在无法通过 private realization满足的 correctness contradiction，否则实现阶段不得扩大本 amendment 的修订范围。
