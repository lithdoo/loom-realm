---
layout: home

title: LoomRealm

titleTemplate: false

hero:
  name: LoomRealm
  text: 分层设计的模块子系统运行平台
  tagline: 从产品目标、系统架构、正式契约到模块设计和实施计划，逐层收敛可演进的运行平台。
  actions:
    - theme: brand
      text: 产品设计总览
      link: /00-overview/product-vision
    - theme: alt
      text: 系统架构
      link: /10-architecture/system-overview
    - theme: alt
      text: 阅读指南
      link: /README
    - theme: alt
      text: 查看 GitHub
      link: https://github.com/lithdoo/loom-realm

features:
  - title: 从粗到细
    details: 先定义产品目标和系统边界，再冻结协议、拆解模块，最后确定分包与实施顺序。
  - title: 单向设计依赖
    details: Overview → Architecture → Contracts → Modules → Implementation，下层不能隐式修改上层结论。
  - title: 渐进迁移
    details: 新目录成为推荐入口，旧详细文档暂时保留，后续逐篇迁移而不丢失有效设计。
---

## 推荐阅读顺序

1. [产品设计总览](./00-overview/product-vision.md)
2. [文档分层与变更规则](./00-overview/document-governance.md)
3. [系统架构总览](./10-architecture/system-overview.md)
4. [正式契约目录](./15-contracts/README.md)
5. [模块设计目录](./20-modules/README.md)
6. [实施计划目录](./30-implementation/README.md)
