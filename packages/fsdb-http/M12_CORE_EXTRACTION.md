# @loomrealm/fsdb-http — M12 Core Extraction Amendment

> 状态：**Frozen Contract Amendment**  
> 生效：M12 Content preimplementation freeze  
> 最近复核：2026-09-08  
> 原合同：[DESIGN.md](./DESIGN.md)  
> M12 冻结：[../../M12_01_CONTENT_SERVICE.md](../../M12_01_CONTENT_SERVICE.md)

本文件只修订 `@loomrealm/fsdb-http` v1 原冻结合同中与 **package dependency / internal ownership** 有关的条款。除本文明确覆盖的内容外，`DESIGN.md` 与 `CONFORMANCE.md` 的 public API、HTTP observable behavior、安全不变量、lifecycle 和 conformance要求全部继续有效。

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

这是本 amendment 唯一允许新增的 runtime package dependency。

`@loomrealm/fsdb` 本身只依赖 Node stdlib。

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

## 4. Public Compatibility

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

## 5. HTTP Compatibility

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

## 6. No New Framework

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

## 7. Qualification

M12 必须证明：

```text
@loomrealm/fsdb build/test/pack
@loomrealm/fsdb-http build/test/pack
existing fsdb-http conformance green
existing fsdb-http public exports unchanged
all descriptor/ordinary/metadata reads use @loomrealm/fsdb core
no duplicate scanner/index/safe-open implementation remains in fsdb-http
```

---

## 8. Freeze Statement

本 amendment 显式改变的是 `fsdb-http` 的 internal package dependency/ownership，不改变其 v1 HTTP contract。

除非证明 core extraction 与既有 FSDB HTTP observable contract存在无法通过 private realization满足的 correctness contradiction，否则实现阶段不得扩大本 amendment 的修订范围。