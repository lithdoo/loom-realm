# LoomRealm 设计文档

本文只做**导航与 current source-of-truth 索引**，不重复定义协议字段、状态机、Web Presentation interfaces 或 milestone closure。

阅读优先级：

```text
Architecture topic
→ Formal Contract
→ Accepted current ADR
→ Module placement
→ Implementation plan / qualification
```

---

## 推荐阅读顺序

1. [产品设计总览](./00-overview/product-vision.md)
2. [文档分层与变更规则](./00-overview/document-governance.md)
3. [系统架构总览](./10-architecture/system-overview.md)
4. [平台组合系统](./10-architecture/platform-composition-system.md)
5. [运行承载系统](./10-architecture/runtime-hosting-system.md)
6. [栈式运行系统](./10-architecture/stack-runtime-system.md)
7. [通信系统](./10-architecture/communication-system.md)
8. [渲染系统](./10-architecture/rendering-system.md)
9. [Subsystem 模型](./10-architecture/subsystem-model.md)
10. [存储与内容系统](./10-architecture/storage-system.md)
11. [正式契约目录](./15-contracts/README.md)
12. [Render Update v1](./15-contracts/render-update-v1.md)
13. [Readonly Content API v1](./15-contracts/content-api-v1.md)
14. [Web Presentation Config v1](./15-contracts/web-presentation-config-v1.md)
15. [Web Presentation API v1](./15-contracts/web-presentation-api-v1.md)
16. [模块设计目录](./20-modules/README.md)
17. [Web Renderer](./20-modules/web-renderer/README.md)
18. [`loom.map`](./20-modules/loom-map/README.md)
19. [独立分包与发布架构](./30-implementation/package-architecture.md)
20. [第一阶段交付计划](./30-implementation/phase-1-delivery-plan.md)
21. [ADR 索引](./decisions/README.md)
22. [ADR 0030：M12 Content closure](./decisions/0030-freeze-m12-content-preimplementation-closure.md)
23. [ADR 0031：M13 Web Presentation current design](./decisions/0031-business-owned-web-component-projection.md)

---

## 当前已关闭主干

```text
M10 User Input
    → Subsystem InputListener
    → RendererInputSource / Effective gate

M11 Render Replication
    → Subsystem authoritative Render Domains
    → Render Update v1
    → Renderer internal committed Store

M12 Content
    → @loomrealm/fsdb
    → Desktop Content Service
    → Subsystem ContentClient
    → Renderer trusted/private ResourceClient
```

M10/M11/M12均已 Implemented / Qualified / Closed。当前 canonical executable closure gate：

```text
npm run test:m12
```

---

## M13 Current Source Map

M11没有关闭 physical Web presentation。M13 current design只由以下 source共同定义：

```text
ADR 0031
    why / ownership / rejected abstractions

Rendering System
    authority / wire-node identity / deterministic managed body ordering

Web Presentation Config v1
    startup JS/CSS / prepared Content / browser loading + ready barrier

Web Presentation API v1
    receiveRenderContext / receiveRenderData / PresentationResourceClient

Web Renderer module
    implementation placement

Phase 1 plan
    deliverables / qualification
```

关键 current facts：

```text
same live wire-node identity
(Session, subsystemKey, generation, domainId, key)
→ same HTMLElement

managed body roots
→ subsystemKey UTF-8 lexical
→ within subsystem: M11 zIndex/domainId order
→ roots order

new element
→ construct → context → insertion/structure → attrs → data
```

`subsystemKey`排序只用于 deterministic physical concatenation，不创建 cross-Subsystem global zIndex/stacking authority。

Business WC对 LoomRealm-managed projection只读；runtime resource只通过 M13 narrow `PresentationResourceClient`，不暴露 Content bearer/path/FSDB/privileged URL/private Renderer client。

M13不建立 AssetManager、dynamic component loader、global service locator、LoomRealm component library、generic layer manager、public identity framework或 RenderEvent→WC ABI。

---

## Platform Placement

```text
M6   Hostra Runtime / Runner / Control                ✅
M7   Renderer Control                                  ✅
M8   logical Data role seam                            ✅
M9   Desktop Data Broker                               ✅
M10  User Input                                        ✅
M11  Render Replication                                ✅
M12  Content                                           ✅
M13  Web Presentation                                  pending
M14  loom.map business + map-owned WC                  pending
M15  Desktop full physical E2E                         pending
M16  PWA Runtime                                       pending
M17  PWA full Renderer/Data/Input/Render/Content/Web   pending
```

---

## Documentation Governance

不要在 README/index/module/plan 中复制 formal contract interface。Summary docs只写 ownership、placement、milestone与链接；精确 schema/lifetime/error/order由 formal contract拥有。

Frozen authority、identity、lifecycle/order、failure/recovery 或 public surface只能通过对应 reopen rule修改，implementation不能静默扩张。
