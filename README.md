# LoomRealm

LoomRealm 是一个以 **platform-neutral logical Subsystem topology**、Main authority、capability-oriented role boundaries 与 cross-platform composition 为核心的模块化游戏运行平台。

Phase 1 使用 RPG Maker XP / Pokémon Essentials v21.1 地图兼容作为 `loom.map` vertical validation。

---

## 当前入口

- [产品设计总览](./doc/00-overview/product-vision.md)
- [文档治理](./doc/00-overview/document-governance.md)
- [系统架构总览](./doc/10-architecture/system-overview.md)
- [渲染系统](./doc/10-architecture/rendering-system.md)
- [平台组合系统](./doc/10-architecture/platform-composition-system.md)
- [存储与内容系统](./doc/10-architecture/storage-system.md)
- [正式契约目录](./doc/15-contracts/README.md)
- [Content API v1](./doc/15-contracts/content-api-v1.md)
- [Web Presentation Config v1](./doc/15-contracts/web-presentation-config-v1.md)
- [Web Presentation API v1](./doc/15-contracts/web-presentation-api-v1.md)
- [Phase 1 交付计划](./doc/30-implementation/phase-1-delivery-plan.md)
- [Package Architecture](./doc/30-implementation/package-architecture.md)
- [ADR 0030：M12 Content 预实施闭环](./doc/decisions/0030-freeze-m12-content-preimplementation-closure.md)
- [ADR 0031：M13 Web Presentation current design](./doc/decisions/0031-business-owned-web-component-projection.md)

---

## 已关闭里程碑

### M10 — User Input ✅

- [M10 / 01](./M10_01_SUBSYSTEM_INPUT_MANAGER.md)
- [M10 / 02](./M10_02_RENDERER_INPUT_GATE.md)
- [M10 / 03](./M10_03_RENDERER_INPUT_PRODUCERS.md)
- [M10 / 04](./M10_04_VERTICAL_INTEGRATION.md)
- [M10 / 05](./M10_05_QUALIFICATION_CLOSURE.md)
- [qualification](./doc/30-implementation/m10-qualification.md)

### M11 — Render Replication ✅

- [M11 / 01](./M11_01_SUBSYSTEM_RENDER_MANAGER.md)
- [M11 / 02](./M11_02_RENDER_PUBLICATION.md)
- [M11 / 03](./M11_03_RENDERER_STORE.md)
- [M11 / 04](./M11_04_VERTICAL_INTEGRATION.md)
- [M11 / 05](./M11_05_QUALIFICATION_CLOSURE.md)
- [qualification](./doc/30-implementation/m11-qualification.md)

M11关闭 authoritative Render tree publication/replication/currentness/identity，不关闭 physical Web presentation。

### M12 — Content ✅

M12 readonly Content capability 已在 Node 20.20.2 / 24.20.0 通过同一个 `npm run test:m12` 根门禁。

- [M12 / 01](./M12_01_CONTENT_SERVICE.md)
- [M12 / 02](./M12_02_SUBSYSTEM_CONTENT_CLIENT.md)
- [M12 / 03](./M12_03_RENDERER_RESOURCE_CLIENT.md)
- [M12 / 04](./M12_04_VERTICAL_INTEGRATION.md)
- [M12 / 05](./M12_05_QUALIFICATION_CLOSURE.md)
- [qualification](./doc/30-implementation/m12-qualification.md)

---

## Authority Boundary

```text
Main
    Session / Runtime / Frame / Stack / Activation
    InputTarget / Renderer currentness / DataAuthority

Subsystem
    business state
    Input Interest / retained author state
    authoritative Render Domains
    author-facing ContentClient

Renderer
    read-only Main mirror
    current Data consumers / Input producer gate
    current Render replica
    trusted/private ResourceClient
    physical Web projection mutation

Business Web Component
    read-only consumer of LoomRealm projection
    consumer of narrow Web Presentation API capability
    owner of Shadow DOM / Canvas / WebGL / private presentation state

Platform
    executable binding / hosting
    Control/Data physical provisioning
    Content physical binding
    Renderer Window composition
```

一个 authority只允许一个 owner；Platform/DOM physical ownership不产生第二份 application authority。

---

## M13 Web Presentation Current Design

M13填补 M11 Store → physical Web presentation seam：

```text
WebPresentationConfigV1
→ prepared Content refs
→ ordered <link> / classic <script>
→ business customElements.define(...)
→ window.onload
→ Renderer Store successful commit
→ package-private post-commit seam
→ thin Web Projector
→ document.body / business-owned WC
```

### 两份 formal contract

```text
Web Presentation Config v1
→ startup JS/CSS / prepared Content / browser ready semantics

Web Presentation API v1
→ receiveRenderContext / receiveRenderData / PresentationResourceClient
```

不要在 summary docs复制完整 interface；精确 shape/lifetime/error以 formal contracts为准。

### HTMLElement identity

`RenderNode.key`只在一个 Domain内唯一，不能作为 Window-global identity。

```text
same live wire-node identity
(Session, subsystemKey, generation, domainId, key)
→ same HTMLElement
```

不同 Domain/Subsystem/fresh generation即使 key string相同也必须是不同 identity。move/reparent/reorder只移动 existing element。

### Managed body order

M11 `zIndex/domainId`只在一个 Subsystem scope内定义 logical order。M13只增加 deterministic physical concatenation：

```text
subsystemKey UTF-8 lexical
→ within subsystem: zIndex ascending
→ same zIndex: domainId UTF-8 lexical
→ roots order
```

这不创建 cross-Subsystem global zIndex/stacking authority；actual layout/stacking属于 business WC/CSS。

### WC API / runtime resources

一个 `Web Presentation API v1`包含两个独立 optional receiver：

```text
receiveRenderContext
→ Window-lifetime capability
→ before first managed insertion
→ at most once per HTMLElement

receiveRenderData
→ retained current full data
→ initial + committed data changes
```

Context V1只提供 narrow `PresentationResourceClient`：

```text
namespace + hierarchical key + expectedContentVersion
→ caller-owned bytes + MIME + actual version
```

Business WC看不到 origin/token/path/FSDB/privileged URL/private Renderer ResourceClient。

M13不建立 AssetManager、dynamic component loader、global service locator、component library、generic layer manager或 RenderEvent→WC ABI。

---

## Current Milestones

```text
M1  Foundation + Wire                  ✅
M2  Game Package                       ✅
M3  Runtime Control                    ✅
M4  Subsystem Runtime/Frame            ✅
M5  Main Core                          ✅
M6  Hostra Runtime                     ✅
M7  Renderer Control                   ✅
M8  Renderer Data                      ✅
M9  Desktop Data Broker                ✅
M10 User Input                         ✅ Closed
M11 Render Replication                 ✅ Closed
M12 Content                            ✅ Closed 2026-09-08
M13 Web Presentation                   pending
M14 loom.map                           pending
M15 Desktop full E2E                   pending
M16 PWA Runtime                        pending
M17 PWA full E2E/equivalence           pending
```

Critical path：

```text
Input → Render → Content → Web Presentation → loom.map → Desktop E2E → PWA Runtime → PWA E2E
```

当前 canonical executable closure gate仍是：

```text
npm run test:m12
```

M13实现后再建立包含真实 Chromium qualification 的 `npm run test:m13`。

---

## 本地文档

Node.js 20+：

```bash
npm install
npm run docs:dev
npm run docs:build
npm run docs:check-links
```
