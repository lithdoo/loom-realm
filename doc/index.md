---
layout: home
title: LoomRealm
tagline: 当前产品、正式契约与开发规则
hero:
  name: LoomRealm
  text: 模块化游戏运行平台
  tagline: 先读当前模块和架构，再读跨角色契约；开发与资格采用 capability/subject 模型，不再以 milestone 组织 Current 文档。
  actions:
    - theme: brand
      text: 已实现核心模块
      link: /20-modules/core/README
    - theme: alt
      text: 系统架构
      link: /10-architecture/system-overview
    - theme: alt
      text: 开发与资格
      link: /30-development/README
features:
  - title: 单一 Authority
    details: Main、Realm State、Subsystem、Renderer、Content 各自拥有明确且不重叠的 authoritative state；物理平台差异不改变逻辑语义。
  - title: Contract-first
    details: Architecture 定义责任与 topology，Contracts 定义可互操作边界，Modules 投影当前实现；Frozen、Implemented、Qualified 明确区分。
  - title: Capability-based maintenance
    details: 新改动按 capability、authority impact、contract impact 与 qualification subject 管理，不再新增 M18/M19 式阶段文档。
  - title: Evidence 与 Current 分离
    details: 历史 SHA、机器、样本与 P95 可作为 evidence 保留，但 Current 状态只由当前产品文档和同 subject 资格结果定义。
---

## 从这里开始

[阅读指南](./README.md) · [当前核心模块](./20-modules/core/README.md) · [架构总览](./10-architecture/system-overview.md) · [契约目录](./15-contracts/README.md) · [开发与资格](./30-development/README.md) · [ADR](./decisions/README.md)
