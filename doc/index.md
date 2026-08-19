---
layout: home

title: LoomRealm

titleTemplate: false

hero:
  name: LoomRealm
  text: 分层设计的模块子系统运行平台
  tagline: 统一 application semantics，以 Hostra Desktop 与 PWA 两套 Platform Composition 承载同一 Main / Renderer / Subsystem / Content 核心。
  actions:
    - theme: brand
      text: 产品设计总览
      link: /00-overview/product-vision
    - theme: alt
      text: 系统架构
      link: /10-architecture/system-overview
    - theme: alt
      text: 平台组合
      link: /10-architecture/platform-composition-system
    - theme: alt
      text: 正式契约
      link: /15-contracts/README
    - theme: alt
      text: 查看 GitHub
      link: https://github.com/lithdoo/loom-realm

features:
  - title: Platform-neutral Core
    details: Main、Renderer、Subsystem、Content 保持平台无关；Process/Worker、WebSocket/MessagePort、HTTP/Service Worker 由 Platform Composition 注入。
  - title: 单向设计依赖
    details: Overview → Architecture → Contracts → Modules → Implementation，下层不能隐式修改上层结论。
  - title: 跨平台语义等价
    details: Hostra Desktop 与 PWA 可以拥有不同 physical trace，但必须对同一 abstract application trace 得到等价 Runtime/Frame/Input/Render/Content 结果。
---

## 推荐阅读顺序

1. [产品设计总览](./00-overview/product-vision.md)
2. [文档分层与变更规则](./00-overview/document-governance.md)
3. [系统架构总览](./10-architecture/system-overview.md)
4. [平台组合系统](./10-architecture/platform-composition-system.md)
5. [运行时启动与连接建立系统](./10-architecture/runtime-bootstrap-system.md)
6. [正式契约目录](./15-contracts/README.md)
7. [模块设计目录](./20-modules/README.md)
8. [实施计划目录](./30-implementation/README.md)
