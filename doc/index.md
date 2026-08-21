---
layout: home

title: LoomRealm

titleTemplate: false

hero:
  name: LoomRealm
  text: 分层、跨平台的模块子系统运行平台
  tagline: 同一 logical Subsystem key / author ABI / formal semantics，可由 Hostra 与 PWA 绑定各自 platform-selected Definition artifact；协议 authority 与 physical Platform topology 严格分离。
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
  - title: Platform-neutral Business
    details: Game Package 只声明 logical {key}；Hostra/PWA 可为同一 key 绑定不同 Definition artifact，业务不接触 Process、Worker、WebSocket 或 MessagePort。
  - title: Authority Closed Loop
    details: Main 拥有 Runtime/Frame/Activation/InputTarget/DataAuthority；Runtime Control 只拥有 connection-local protocol mechanics；Platform 只实现物理 topology/provisioning。
  - title: Protocol → Role 不可绕过
    details: Runtime Control 用 one reader/dispatcher、one writer、strict-monotonic Request IDs 与 finite deadlines 实现协议 mechanics；Main/Subsystem Host 继续拥有真实 authority/control-flow。
  - title: Cross-platform Equivalence
    details: WebSocket 与 MessagePort 都映射为 UTF-8 JSON text carrier unit；Hostra/PWA 不同 physical trace 必须得到相同 logical/protocol/business outcome。
---

## 推荐阅读

1. [系统架构总览](./10-architecture/system-overview.md)
2. [平台组合系统](./10-architecture/platform-composition-system.md)
3. [运行承载系统](./10-architecture/runtime-hosting-system.md)
4. [栈式运行系统](./10-architecture/stack-runtime-system.md)
5. [通信系统](./10-architecture/communication-system.md)
6. [Subsystem 模型](./10-architecture/subsystem-model.md)
7. [运行时启动与连接建立系统](./10-architecture/runtime-bootstrap-system.md)
8. [正式契约目录](./15-contracts/README.md)
9. [Runtime Control Application Profile v1](./15-contracts/runtime-control-profile-v1.md)
10. [Frame / Call v1](./15-contracts/frame-call-protocol-v1.md)
11. [Renderer Data Application Profile v1](./15-contracts/renderer-data-profile-v1.md)
12. [模块设计目录](./20-modules/README.md)
13. [测试策略](./30-implementation/testing-strategy.md)
14. [第一阶段交付计划](./30-implementation/phase-1-delivery-plan.md)
15. [ADR 0021：Runtime Control 首次实现前收口](./decisions/0021-runtime-control-preimplementation-closure.md)
