# ADR 0030：冻结 M12 Content 预实施闭环

> 状态：Accepted  
> 日期：2026-09-08  
> 影响范围：Readonly Content API、Desktop Content composition、FSDB core ownership、Subsystem/Renderer Content projection、M13/M14/M16 交付边界  
> 更新：[ADR 0003](./0003-readonly-content-api.md) 的首次实现 realization 细节  
> 实施基线：[M12 / 01](https://github.com/lithdoo/loom-realm/blob/main/M12_01_CONTENT_SERVICE.md) → [M12 / 05](https://github.com/lithdoo/loom-realm/blob/main/M12_05_QUALIFICATION_CLOSURE.md)

## 背景

ADR 0003 正确确立了 logical readonly Content API、Desktop HTTP / PWA Fetch realization、physical path 隐藏以及 Content 与 executable capability 分离，但其 2026-08 初版 realization 仍预设：

```text
fsdb.index.json
Installation Registry
通用 Repository / Storage Adapter
client-selected contentVersion
单段 Resource key
```

到 M12 开工前，仓库已经拥有真实 `@loomrealm/fsdb-http` 实现、冻结的 Hostra PREPARE/Runner/Data/Render 边界，以及 M13/M14 两个具体 Content consumers。继续保留旧 realization 会迫使实现重复 FSDB mechanics、提前建立没有当前 consumer 的 framework，或使 Current 文档树出现双事实源。

## 决定

M12 current first implementation 冻结为：

```text
Hostra PREPARE
→ current immutable prepared installation view
→ @loomrealm/fsdb readonly logical core
→ private immutable Content Index + normalized public manifest
→ Desktop localhost Content Service
→ Subsystem ContentClient / Renderer-private ResourceClient
```

### FSDB ownership

新增 exactly one Node-specific workspace package：

```text
@loomrealm/fsdb
```

它机械承接现有 `@loomrealm/fsdb-http` 的 readonly FSDB domain mechanics：validation、snapshot/index、database descriptor、ordinary/metadata logical lookup、safe-open、source-currentness、read lease/close-drain。

`@loomrealm/fsdb-http` 变成该 core 的 HTTP projection；existing root public API 与 HTTP observable contract保持兼容。具体 dependency/ownership 修订见 `packages/fsdb-http/M12_CORE_EXTRACTION.md`。

`@loomrealm/fsdb` 是正常可发布 workspace dependency，不是 hidden cross-workspace private source，也不是 universal storage framework。

### Desktop installation view

M12 只服务 current prepared installation；不为第一版建立 global mutable `InstallationRegistry`、generic Repository 或 persistent package catalog framework。

```text
one successful prepare
→ one opaque installationId
→ normalized public GameEntry manifest
→ one @loomrealm/fsdb snapshot
→ one private immutable Content Index
```

未来 Installer/PWA persistent registry 可在真实 consumer 出现时独立 materialize，不反向改变 M12 logical Content semantics。

### Content identity/version

Content API v1 current model使用：

```text
record/group key = one logical segment
resource key     = one-or-more logical segments joined by /
contentVersion   = sha256:<64 lowercase hex>
```

`contentVersion` hash exact successful full-body representation bytes；ETag 是 quoted exact contentVersion。它不是 FSDB snapshotId/fingerprint，也不是 client-selected historical-version protocol。

### Author/Renderer projections

Subsystem M12 root只 materialize真实 business consumer需要的：

```text
ContentClient.record(...)
ContentClient.resource(...)
```

不为 HTTP surface symmetry 预先发布 `manifest()`、`group()`、`head()`、raw fetch、URL builder 或 repository abstraction。

Renderer只增加 private logical resource identity → version-checked bytes responsibility；RenderNode → resource identity 与 DOM/Canvas/WebGL/Audio presentation仍属于 M14。

## 对 ADR 0003 的更新

ADR 0003 以下原则继续有效：

```text
logical readonly Content API
Desktop localhost HTTP
PWA same-origin Fetch / Service Worker
physical path不进入 business/Renderer
Content capability != executable capability
Content Service不拥有 Runtime/Frame authority
```

以下旧 realization 不再是 Current implementation requirement：

```text
mandatory fsdb.index.json artifact
global Installation Registry in M12
generic ReadonlyContentStorage / Repository framework
Subsystem client显式提交 installationId
client-selected historical contentVersion request
single-segment-only Resource key
Renderer Blob/ImageBitmap/Audio/GPU cache in M12
```

历史文字保留为设计演进 provenance，但不能覆盖 Content API v1 + M12_01–05 current baseline。

## 不做的抽象

M12 不新增：

```text
@loomrealm/content-core
@loomrealm/content-service package
Repository hierarchy
StorageProvider / StorageBackend SPI
InstallationManager / global registry
AssetManager / decoder plugin system
Content RPC / credential profile
filesystem transaction / copy-on-read store
```

如果后续 milestone 出现第二个真实 production consumer，再按 demand-driven rule提取最小共享 seam。

## 跨里程碑边界

```text
M12  Content capability + Desktop service + two consumers
M13  loom.map consumes frozen Subsystem ContentClient
M14  Desktop presentation consumes qualified Renderer ResourceClient
M15  PWA Runtime only; no full Content claim
M16  PWA Content physical realization + Hostra/PWA logical equivalence
```

Node-only `@loomrealm/fsdb` 不成为 PWA storage abstraction；PWA可以用 OPFS/Cache/Service Worker实现相同 Content API observable semantics。

## 结果

- M12 编码阶段不得重新选择 package ownership、public author surface、logical identity、contentVersion、credential flow、failure/lifetime 或 qualification shape；
- `@loomrealm/fsdb-http` 保持 standalone HTTP adapter identity，同时依赖 `@loomrealm/fsdb`；
- M13/M14 获得两个明确且不互相污染的 Content consumption seams；
- M16 比较 logical Content response，不比较 Desktop FSDB 与 PWA storage mechanics；
- 仓库 Current docs必须传播本 ADR，旧 module/package target不得继续作为可实施模型。

## 重新打开条件

只有以下之一成立才重新打开受影响条目：

```text
formal Content API 与 production implementation存在无法由 private realization解决的 correctness contradiction
M13/M14 first real consumer证明冻结 author/resource capability缺少必要语义
PWA M16证明当前 logical Content contract无法保持跨平台等价
```

实现困难、package symmetry、未来可能用途或测试便利都不是 reopen 理由。
