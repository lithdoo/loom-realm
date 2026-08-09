---
layout: home

title: LoomRealm

titleTemplate: false

hero:
  name: LoomRealm
  text: 分层设计的模块子系统运行平台
  tagline: 从产品目标、系统架构、正式契约到模块设计和实施计划，逐层收敛可实现、可验证的运行平台。
  actions:
    - theme: brand
      text: 产品设计总览
      link: /00-overview/product-vision
    - theme: alt
      text: 系统架构
      link: /10-architecture/system-overview
    - theme: alt
      text: 正式契约
      link: /15-contracts/README
    - theme: alt
      text: 查看 GitHub
      link: https://github.com/lithdoo/loom-realm

features:
  - title: 单一当前入口
    details: 当前协议只保留可实现版本；被替代的协议正文从文档树移除，设计历史由 ADR 与 Git history 保存。
  - title: 单向设计依赖
    details: Overview → Architecture → Contracts → Modules → Implementation，下层不能隐式修改上层结论。
  - title: 兼容边界明确
    details: 协议版本表示真实互操作边界，不作为设计稿迭代编号；首次实现前可直接修正 first-version contract。
---

## 推荐阅读顺序

1. [产品设计总览](./00-overview/product-vision.md)
2. [文档分层与变更规则](./00-overview/document-governance.md)
3. [系统架构总览](./10-architecture/system-overview.md)
4. [正式契约目录](./15-contracts/README.md)
5. [模块设计目录](./20-modules/README.md)
6. [实施计划目录](./30-implementation/README.md)
