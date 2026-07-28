---
layout: home

title: LoomRealm

titleTemplate: false

hero:
  name: LoomRealm
  text: 进程化模块子系统运行平台
  tagline: 通过程序主系统调用栈、JSON-RPC、独立子系统进程和通用 Scope Tree 运行并呈现游戏系统。
  actions:
    - theme: brand
      text: 开始阅读
      link: /README
    - theme: alt
      text: 核心架构
      link: /architecture/main-system-and-subsystems
    - theme: alt
      text: 查看 GitHub
      link: https://github.com/lithdoo/loom-realm

features:
  - title: 主系统调用栈
    details: 入口文件指定初始子系统；子系统通过 call 入栈，通过 return 出栈并向调用者返回结果。
  - title: 跨平台模块子系统
    details: 子系统作为独立进程，以 JSON-RPC 作为正式扩展边界，不绑定单一语言、运行时或 Module ABI。
  - title: Client Scope 呈现
    details: 活动子系统直接接收用户输入并发布自己 Frame 的 Scope，渲染端按稳定 Key 协调为 DOM。
---

## 推荐阅读顺序

1. [产品定位与第一阶段范围](./overview/product-scope.md)
2. [LoomRealm 总体架构](./architecture/system-overview.md)
3. [程序主系统与模块子系统架构](./architecture/main-system-and-subsystems.md)
4. [游戏包契约 v1](./contracts/game-package-v1.md)
5. [文档阅读路径](./README.md)
