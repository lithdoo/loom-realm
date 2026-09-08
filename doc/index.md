---
layout: home

title: LoomRealm

titleTemplate: false

hero:
  name: LoomRealm
  text: 分层、跨平台的模块子系统运行平台
  tagline: 同一 logical Subsystem key / author ABI / formal semantics，可由 Hostra 与 PWA 绑定各自 physical artifacts；Main authority、Render replication、Content capability 与 business-owned Web presentation严格分层。
  actions:
    - theme: brand
      text: 产品设计总览
      link: /00-overview/product-vision
    - theme: alt
      text: 系统架构
      link: /10-architecture/system-overview
    - theme: alt
      text: 渲染系统
      link: /10-architecture/rendering-system
    - theme: alt
      text: 第一阶段计划
      link: /30-implementation/phase-1-delivery-plan
    - theme: alt
      text: 查看 GitHub
      link: https://github.com/lithdoo/loom-realm

features:
  - title: Platform-neutral Business
    details: Game Package 只声明 logical {key}；Hostra/PWA 可为同一 key 绑定不同 Definition artifact，业务 Definition 不接触 Process、Worker、WebSocket、MessagePort 或 DOM。
  - title: Authority Closed Loop
    details: Main 拥有 Runtime/Frame/Activation/InputTarget/DataAuthority；Subsystem 拥有 business Render authority；Renderer 只维护 current replica 和 physical projection。
  - title: Business-owned Web Components
    details: M13 Web Projector 只把 Render Store 投影成业务自有 Custom Elements；WC 对 attrs/data/children 等全部 projected state只读，只能修改自己的 Shadow DOM/Canvas/WebGL/private state。具体 presentation implementation 的 package/loading/registration topology由 M13实现闭环决定。
  - title: Cross-platform Equivalence
    details: Hostra/PWA 可以使用不同 physical transport/storage/presentation packaging，但必须保持相同 logical Runtime/Input/Render/Content/Web projection semantics 与 business outcome。
---

## 推荐阅读

1. [系统架构总览](./10-architecture/system-overview.md)
2. [平台组合系统](./10-architecture/platform-composition-system.md)
3. [渲染系统](./10-architecture/rendering-system.md)
4. [Subsystem 模型](./10-architecture/subsystem-model.md)
5. [正式契约目录](./15-contracts/README.md)
6. [Renderer Data Application Profile v1](./15-contracts/renderer-data-profile-v1.md)
7. [Render Update v1](./15-contracts/render-update-v1.md)
8. [Readonly Content API v1](./15-contracts/content-api-v1.md)
9. [模块设计目录](./20-modules/README.md)
10. [Web Renderer](./20-modules/web-renderer/README.md)
11. [`loom.map`](./20-modules/loom-map/README.md)
12. [独立分包与发布架构](./30-implementation/package-architecture.md)
13. [第一阶段交付计划](./30-implementation/phase-1-delivery-plan.md)
14. [ADR 0031：业务拥有 Web Components，LoomRealm 只投影 Render replica](./decisions/0031-business-owned-web-component-projection.md)
