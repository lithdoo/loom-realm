---
layout: home
title: LoomRealm
tagline: 当前实现、正式契约与下一阶段
hero:
  name: LoomRealm
  text: 模块化游戏运行平台
  tagline: 先读已经实现的模块，再读跨角色契约；未完成事项统一进入路线图。
  actions:
    - theme: brand
      text: 已实现核心模块
      link: /20-modules/core/README
    - theme: alt
      text: 下一阶段路线图
      link: /30-implementation/roadmap
    - theme: alt
      text: 正式契约
      link: /15-contracts/README
features:
  - title: 逻辑与物理分离
    details: Game Package 声明逻辑游戏；Main/Subsystem/Renderer 遵循权威边界，Hostra 与未来 PWA 各自完成物理组合。
  - title: 当前代码是实现依据
    details: 核心模块目录列出真正存在的包、责任与测试，不再把过期里程碑过程写成当前实现。
  - title: 地图真实消费者
    details: Map 是 game-libs/map 的业务库；Bridge、Ledge、输入与浏览器渲染已进入产品，原版动态保真仍单独待资格。
  - title: 证据与待办分离
    details: 已完成过程回归 Git/ADR；现有正式资格 ledger 保留，不把旧 SHA 的 PASS 移给新实现；M16/M17 和其他缺口集中在路线图。
---

## 从这里开始

[阅读指南](./README.md) · [当前核心模块](./20-modules/core/README.md) · [架构总览](./10-architecture/system-overview.md) · [契约目录](./15-contracts/README.md) · [下一阶段](./30-implementation/roadmap.md) · [ADR](./decisions/README.md)
