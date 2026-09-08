# LoomRealm 模块设计目录

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：M10–M12 Closed / M13 Web Presentation Pending  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[渲染系统](../10-architecture/rendering-system.md)、[正式契约目录](../15-contracts/README.md)、[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)  
> 实施映射：[Phase 1 交付计划](../30-implementation/phase-1-delivery-plan.md)  
> 最近复核：2026-09-08

```text
module boundary != npm package boundary != protocol boundary != platform boundary
```

---

## 1. Module Map

| 模块 | 入口 | Current responsibility |
|---|---|---|
| Main | [main-system](./main-system/README.md) | Session/Runtime/Frame/Activation/InputTarget/DataAuthority/current Renderer authority |
| Web Renderer | [web-renderer](./web-renderer/README.md) | Main mirror、Data/Input、M11 Store、M12 private ResourceClient、M13 Projector |
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
    current authoritative Render replica

Web Projector
    mechanical committed Store → DOM projection

Business Web Component
    read-only projected state
    private Shadow DOM / Canvas / WebGL / layout state

Platform/App Composition
    Process/Worker/Window
    Control/Data physical provisioning
    Content physical binding
    presentation bootstrap environment
```

M13精确 browser/API semantics不在本索引重复定义；见 Config/API formal contracts。

---

## 3. Closed Slices

```text
M10 User Input        ✅
M11 Render Replication ✅
M12 Content           ✅
```

M11只关闭 Render authority/replication；M12只关闭 readonly Content boundary。M13消费这些既有能力，不重开下层 contracts。

---

## 4. M13 Web Presentation

```text
WebPresentationConfigV1
→ ordered browser bootstrap
→ window.onload
→ committed Renderer Store
→ package-private post-commit seam
→ thin Web Projector
→ document.body / business-owned WC
```

关键 architecture facts：

```text
same live wire-node identity
(Session, subsystemKey, generation, domainId, key)
→ same HTMLElement

managed root order
→ subsystemKey UTF-8 lexical
→ within subsystem: M11 zIndex/domainId order
→ roots order
```

裸 `key` 不是 Window-global identity；M13也不创建 cross-Subsystem global zIndex authority。

Web Presentation API v1统一治理独立的 `receiveRenderContext` / `receiveRenderData`，并提供 narrow `PresentationResourceClient`。Business WC看不到 Content credential/path/FSDB/private Renderer client。

---

## 5. M14 `loom.map`

同一个 map owner提供两个 execution side：

```text
@loomrealm/map Definition
→ @loomrealm/subsystem only

map Web presentation
→ business-owned Custom Elements
→ Web Presentation API v1 consumer
```

M14是真实 Frame/Input/Render/Content/Web Presentation综合 consumer；不为了 API coverage 强制使用 RenderEvent，也不发明第二套 resource/loading boundary。

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

PWA可以使用不同 storage/fetch/private browser binding，但不能改变 identity/order/API observable semantics。

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
second projection-tree authority
```

业务 WC内部选择 UI framework不受限制，只要不接管 LoomRealm-managed host projection。
