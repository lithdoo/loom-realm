# LoomRealm 模块设计目录

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：M10–M12 Closed / M13 Web Presentation **Design Frozen / Implementation Pending**  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[渲染系统](../10-architecture/rendering-system.md)、[正式契约目录](../15-contracts/README.md)  
> 实施映射：[Phase 1 交付计划](../30-implementation/phase-1-delivery-plan.md)  
> 最近复核：2026-09-09

```text
module boundary != npm package boundary != protocol boundary != platform boundary
```

---

## 1. Module Map

| 模块 | 入口 | Current responsibility |
|---|---|---|
| Main | [main-system](./main-system/README.md) | Session/Runtime/Frame/Activation/InputTarget/DataAuthority/current Renderer authority |
| Web Renderer | [web-renderer](./web-renderer/README.md) | Main mirror、Data/Input、M11 Store、M12 private ResourceClient、M13 thin Projector |
| Game Package | [game-package](./game-package/README.md) | logical Game topology/common validation |
| `loom.map` | [loom-map](./loom-map/README.md) | M14 platform-neutral business + map-owned Web presentation |
| Hostra Desktop | [desktop-host](./desktop-host/README.md) | Hostra physical composition、Content、M13/M15 integration |
| PWA | [pwa-host](./pwa-host/README.md) | PWA Worker Runtime、M17 Renderer/Data/Content/Web presentation realization |

Desktop/PWA 是同一 logical architecture 的不同 physical realization。

---

## 2. Authority Boundaries

```text
Main
    Session / Runtime / Frame / Activation / InputTarget / DataAuthority

Subsystem
    business state / Input Interest / authoritative Render Domains / Content author usage

Renderer Store
    current per-subsystem Render replica authority

Web Projector
    reads Control topology + eligible Store facts
    owns mechanical LoomRealm-managed DOM mutation only

Business Web Component
    read-only projected state
    private Shadow DOM / Canvas / WebGL / layout state

Platform/App Composition
    Process/Worker/Window
    Control/Data physical provisioning
    Content physical binding
    presentation bootstrap environment
```

M13 精确 browser/API/currentness semantics 不在本索引重复定义；见 [Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md) 与 [Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)。

---

## 3. Closed / Frozen Slices

```text
M10 User Input         ✅ Closed
M11 Render Replication ✅ Closed
M12 Content            ✅ Closed
M13 Web Presentation   Design Frozen / implementation pending
```

M13 消费既有 Control/Data/Render/Content 能力，不重开下层 contracts。

---

## 4. M13 Web Presentation Placement

```text
Window bootstrap
→ current Control Session/DataAuthority topology ─┐
                                                 ├→ package-private reevaluation
   current per-subsystem Renderer Store ─────────┘
                                                       ↓
                                             per-subsystem eligibility
                                                       ↓
                                                thin Web Projector
                                                       ↓
                                        business-owned Custom Elements
```

完整 identity、reconnect、receiver/resource lifetime、structural failure 与 body ordering 全部由 frozen Rendering System / formal contracts 拥有；模块层不维护第二份协议正文。

---

## 5. M14 `loom.map`

同一个 map owner 提供两个 execution side：

```text
@loomrealm/map Definition
→ @loomrealm/subsystem only

map Web presentation
→ business-owned Custom Elements
→ Web Presentation API v1 consumer
```

M14 是真实 Frame/Input/Render/Content/Web Presentation 综合 consumer；不为了 coverage 强制使用 RenderEvent，也不发明第二套 resource/loading boundary。

---

## 6. Physical Placement

```text
M15 Desktop
    BrowserWindow + Renderer Control/Data/Input/Render/Content
    M13 Config/API/Projector
    M14 map-owned WC

M17 PWA
    Window/Worker + MessagePort/Data provisioning
    PWA Content realization
    same M13 logical Web presentation semantics
```

PWA 可以使用不同 storage/fetch/private browser binding，但不能改变 frozen M13 observable semantics。

---

## 7. Abstraction Rule

禁止仅为未来可能用途建立：

```text
runtime service locator
Repository / AssetManager
Renderer public Render Store
LoomRealm component library / Presentation DSL
generic layer/stacking manager
dynamic component loader
public RenderNodeIdentity framework
RenderEvent→DOM bridge without real consumer
second projection-tree/topology authority
```

业务 WC 内部选择 UI framework 不受限制，只要不接管 LoomRealm-managed host projection。
