# Web 渲染端模块设计

> 层级：模块设计  
> 状态：M8 Data / M10 Input / M11 Render **Implemented + Qualified**；M12 ResourceClient **Preimplementation Frozen**  
> 稳定程度：closed lower slices / M12 private resource boundary Frozen  
> 主要定义：Renderer Control holder、Data reconciliation、Input gate/source、internal Render replica、M12 private resource bytes capability与 M14 presentation placement  
> 依赖：[渲染系统](../../10-architecture/rendering-system.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../../15-contracts/renderer-data-profile-v1.md)、[User Input v1](../../15-contracts/user-input-v1.md)、[Render Update v1](../../15-contracts/render-update-v1.md)、[Content API v1](../../15-contracts/content-api-v1.md)、[ADR 0030](../../decisions/0030-freeze-m12-content-preimplementation-closure.md)  
> 最近复核：2026-09-08

Renderer不是 Frame/Call participant。它镜像 Main committed authority，并在 current Data peers上执行 Input/Render role behavior；M12只增加 private logical resource → bytes responsibility。

---

## 1. Current Shape

```text
@loomrealm/renderer
└── one Control holder
    ├── current Control peer/snapshot
    ├── per-subsystem Data slots
    │   ├── current RendererDataPeer
    │   ├── M10 Input Registry/gate/publisher
    │   └── M11 internal Render replica
    ├── optional construction-time RendererInputSource
    └── M12 private ResourceClient composition
```

M8/M10/M11均复用同一 currentness/Data slot，不创建第二套 Renderer Session/Connection authority。M12 ResourceClient也不得成为新的 authority/currentness layer。

---

## 2. Authority / Currentness

Main publishes committed：

```text
Runtime projection
Frame / Activation / InputTarget
DataAuthority {subsystemKey,generation,dataProfile}
```

Renderer不得 create/recover Frame/Activation、modify Stack、mint Data authority/currentness或从 focus/Content availability推导 InputTarget。

Content current installation/grant是 Platform composition fact，不提升为 Renderer application authority。

---

## 3. M10 Input — Closed

Exact construction仍是：

```ts
createRendererControlHolder(
  data?: RendererDataBinding,
  input?: RendererInputSource,
)
```

一个 construction-time source object；0..1 active source subscription跟 current Control peer epoch。Effective gate：

```text
current Data
× current Control snapshot
× Main InputTarget
× active F/A
× Interest[F]
× Producer(C)
```

Source failure/late callback不得改变 Control/Data authority；Input backlog在 Renderer role内 bounded/coalesce/drop，不能把 ordinary input pressure升级成 Data local-fatal。

---

## 4. M11 Render Replica — Closed

M11 Store挂 existing desired Data identity：

```text
current Control peer
+ subsystemKey
+ generation
+ dataProfile
```

Store internal facts：current Registry、per-Domain baseline/revision、committed tree、generation-scoped observed identity history。

same-generation carrier replacement保留 identity history但重建 carrier baseline；old peer不能 mutate replacement current。Render protocol-fatal只 retire current Data peer，不直接 fail Runtime/Frame。

M11 **没有 public Render Store/subscription/presentation API**；M14 presentation继续消费 package-private current replica seam。

---

## 5. M12 Private ResourceClient — Frozen

M12不把完整 ContentClient变成 Renderer public API。Renderer只需要一个 private responsibility，语义等价于：

```ts
resource(
  namespace: string,
  hierarchicalResourceKey: string,
  expectedContentVersion: string,
  signal?: AbortSignal,
): Promise<{
  readonly bytes: Uint8Array;
  readonly mime: string;
  readonly contentVersion: string;
}>
```

固定：

```text
expectedContentVersion = sha256:<64 lowercase hex>
resourceKey = one-or-more logical segments joined by /
current response version must equal expected version
returned bytes detached from internal cache ownership
same key + different version cannot reuse stale bytes
malformed local identity/version rejected before HTTP
```

ResourceClient不创建新的 request-version header/query protocol；它读取 current logical resource并比较 `X-Loom-Content-Version`。

---

## 6. Content / Render Separation

M12只冻结：

```text
logical Content resource identity
→ version-checked bytes
```

M12不冻结：

```text
RenderNode.data → resource identity mapping
known presentation tag/component schema
PNG/JPEG decode
ImageBitmap / HTMLImageElement / AudioBuffer
Canvas / WebGL texture/object lifetime
presentation eviction/prefetch
```

这些属于 M14。

Render state不得携：

```text
Content bearer
absolute privileged Content URL
filesystem path
resource bytes capability
```

Renderer ResourceClient failure只影响当前 resource read/presentation-local future policy；不得 mutate Render Store、Main authority或 Subsystem authoritative state。

---

## 7. Resource Lifetime / Cache

```text
ResourceClient lifetime != RenderDomain lifetime
resource cache lifetime  != Frame lifetime
Data reconnect            != Content cache invalidation
```

允许 small version-safe immutable success cache + same-ID in-flight dedupe；不得提前建立 AssetManager、loader/decoder registry、observable ResourceStore或 generic Repository hierarchy。

Renderer reload/control replacement MAY创建 fresh local resource composition；logical resource identity/version semantics不变。

---

## 8. M14 Physical Presentation

```text
BrowserWindow/Web Renderer
→ current M11 Render replica
→ presentation-specific RenderNode interpretation
→ logical resource identity
→ already-qualified M12 ResourceClient
→ decode/presentation
```

M14不得通过 direct localhost URL、filesystem、`@loomrealm/fsdb` 或 `@loomrealm/fsdb-http` 绕过 ResourceClient/version/credential boundary。

M10 real DOM/Gamepad input也必须继续实现 exact `RendererInputSource` seam，不能 DOM→Data shortcut。

---

## 9. PWA / M16

PWA Renderer使用相同 logical resource/version semantics，但 physical Content实现可以是 Fetch/Service Worker/OPFS/Cache；不依赖 Node-only `@loomrealm/fsdb`。

M16比较 logical application trace与 Content response，不比较 Desktop/PWA storage/transport identity。

---

## 10. Final Invariants

1. Renderer仍不是 Frame RPC participant或 application authority owner；
2. Control holder/Data slots保持唯一 currentness facts；
3. M10 Input / M11 Render不复制 currentness；
4. M11 Render Store internal-only；
5. M12 ResourceClient private-only，不新增 public AssetManager/ContentClient；
6. resource version identity独立于 Data/Frame/RenderDomain lifetime；
7. Content failure不改变 Main/Subsystem/Render authority；
8. presentation/resource-reference schema留 M14；
9. PWA M16共享 logical semantics，不共享 Node storage mechanics。
