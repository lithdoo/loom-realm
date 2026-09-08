# FSDB Content Service 模块设计 — Superseded

> 层级：模块设计 / 历史 provenance  
> 状态：**Superseded**  
> 最近复核：2026-09-08  
> 被取代：[M12 / 01 — Desktop Content Service](../../../M12_01_CONTENT_SERVICE.md) → [M12 / 05 — Qualification and Closure](../../../M12_05_QUALIFICATION_CLOSURE.md)  
> 正式契约：[Content API v1](../../15-contracts/content-api-v1.md)  
> 决策：[ADR 0030](../../decisions/0030-freeze-m12-content-preimplementation-closure.md)

本文保留 2026-08 阶段的设计演进背景，**不再是 Current implementable model**。

旧稿曾预设：

```text
Installation Registry
fsdb.index.json / Package Index Loader
ReadonlyContentStorage / Storage Adapter
通用 Repository/cache 层
单段 Resource key
Renderer Blob/ImageBitmap/Audio/GPU resource cache
```

M12 preimplementation closure 已证明这些不是当前 slice 的必要抽象，因此不再要求实现。

Current Desktop M12 model唯一以以下链路为准：

```text
Hostra PREPARE
→ current immutable prepared installation view
→ @loomrealm/fsdb readonly logical core
→ private immutable Content Index + normalized public manifest
→ apps/desktop localhost Content Service
→ Subsystem ContentClient / Renderer-private ResourceClient
```

固定：

```text
Content capability != executable resolver
URL logical identity != filesystem path
record/group key = single logical segment
resource key = hierarchical logical ResourceKey
contentVersion = sha256:<64 lowercase hex>
Desktop bearer = Host-private scoped material
ordinary read failure != Runtime/Frame failure
```

Package ownership：

```text
@loomrealm/fsdb
    readonly Node FSDB domain core

@loomrealm/fsdb-http
    standalone FSDB HTTP projection

apps/desktop
    LoomRealm Desktop Content Service/composition

@loomrealm/subsystem
    author-facing ContentClient

@loomrealm/renderer
    private ResourceClient
```

当前 **不存在** `@loomrealm/content-service`、generic Repository、StorageProvider、InstallationManager 或 AssetManager requirement。

PWA 的 Service Worker/OPFS/Cache physical realization属于 M16；它遵守相同 logical Content API，但不复用 Node-only `@loomrealm/fsdb` storage mechanics。

任何实施者不得从本文旧章节恢复已 supersede 的 registry/repository/storage-adapter 模型。需要实现细节时，只读取 M12_01–05、Content API v1、storage-system 和 ADR 0030。
