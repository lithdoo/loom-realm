# LoomRealm 架构决策记录

> 层级：设计决策记录  
> 状态：Active  
> 主要定义：重大架构决策背景、取舍、current-v1 provenance 与 reopen 条件  
> 最近复核：2026-10-09

ADR 记录“为什么”；Current 可实现事实以 Architecture / Formal Contract / Module / Development 为准。历史 ADR 不得覆盖后续 Accepted correction。

## 决策列表

1. [ADR 0001：每个 System 一个 Runtime Container](./0001-system-container-per-system-id.md)
2. [ADR 0002：平台 Transport Binding](./0002-platform-transport-profiles.md)
3. [ADR 0003：统一只读 Content API](./0003-readonly-content-api.md)
4. [ADR 0004：Client State 渲染流水线](./0004-client-state-rendering-pipeline.md)
5. [ADR 0005：Game Entry 声明 Subsystem Topology](./0005-game-entry-subsystem-launchers.md)
6. [ADR 0006：Frame 与 Render 生命周期解耦](./0006-frame-render-decoupling.md)
7. [ADR 0007：Subsystem Descriptor MVP（Superseded）](./0007-subsystem-descriptor-mvp.md)
8. [ADR 0008：Desktop Node.js Direct-entry Launcher（Superseded）](./0008-desktop-nodejs-launcher-profile-v1.md)
9. [ADR 0009：Subsystem Control Protocol v1](./0009-freeze-subsystem-control-protocol-v1.md)
10. [ADR 0010：Frame / Call v1 Batch A](./0010-freeze-frame-call-protocol-v1-batch-a.md)
11. [ADR 0011：Frame / Call v1 Batch B](./0011-freeze-frame-call-protocol-v1-batch-b.md)
12. [ADR 0012：Frame / Call v1 Batch C](./0012-freeze-frame-call-protocol-v1-batch-c.md)
13. [ADR 0013：Frame / Call v1 Batch D](./0013-freeze-frame-call-protocol-v1-batch-d.md)
14. [ADR 0014：Frame / Call v1 Batch E](./0014-freeze-frame-call-protocol-v1-batch-e.md)
15. [ADR 0015：Frame / Call v1 Batch F / Freeze](./0015-freeze-frame-call-protocol-v1-batch-f.md)
16. [ADR 0016：协议边界清理与 Data Authority](./0016-protocol-boundary-cleanup.md)
17. [ADR 0017：平台是系统级 Composition Boundary](./0017-system-level-platform-composition.md)
18. [ADR 0018：首次实现前直接收口 current v1](./0018-preimplementation-v1-closure.md)
19. [ADR 0019：Game Logical Topology 与 Platform Launch Manifest 分离](./0019-platform-launch-manifest-boundary.md)
20. [ADR 0020：Game Entry 消费边界归 Platform Launcher](./0020-game-entry-consumer-boundary.md)
21. [ADR 0021：Runtime Control current-v1 mechanics](./0021-runtime-control-preimplementation-closure.md)
22. [ADR 0022：Render Update v1 freeze closure](./0022-render-update-v1-freeze-closure.md)
23. [ADR 0023：User Input v1 semantic closure（由 ADR0029 部分更新）](./0023-user-input-v1-semantic-closure.md)
24. [ADR 0024：Renderer ⇄ Subsystem Data Connection v1](./0024-renderer-subsystem-data-connection-v1-semantic-closure.md)
25. [ADR 0025：Renderer Data Profile v1（由 ADR0037 部分更新）](./0025-renderer-data-profile-v1-preimplementation-closure.md)
26. [ADR 0026：Platform 是 Session Composition Object](./0026-session-scoped-platform-instance.md)
27. [ADR 0027：Renderer Control v1 closure](./0027-freeze-renderer-control-v1-preimplementation.md)
28. [ADR 0028：Desktop Data Broker / Late Provisioning](./0028-freeze-m9-desktop-data-broker-preimplementation.md)
29. [ADR 0029：User Input mutation-gate State convergence correction](./0029-user-input-v1-mutation-gate-state-convergence.md)
30. [ADR 0030：Content core ownership closure](./0030-freeze-m12-content-preimplementation-closure.md)
31. [ADR 0031：业务拥有 Web Components，LoomRealm 只投影 Render replica](./0031-business-owned-web-component-projection.md)
32. [ADR 0032：Framework / Game Library / Example Boundary](./0032-game-library-example-boundary.md)
33. [ADR 0033：Electron-hosted Runner 的 Node mode 条件修正](./0033-electron-hostra-run-as-node.md)
34. [ADR 0034：Hostra owns Desktop Electron composition](./0034-hostra-owned-desktop-composition.md)
35. [ADR 0035：RenderDomain existing-node authoritative update](./0035-render-domain-existing-node-update.md)
36. [ADR 0036：Viewport child 独立于 Input（Profile-v2 方案由 ADR0037 修订）](./0036-viewport-state-and-renderer-data-profile-v2.md)
37. [ADR 0037：首次发布前直接修正 Profile v1，取消 v2 current 路线](./0037-direct-profile-v1-preimplementation-viewport-correction.md)

## Current supersession relationships

```text
ADR0018
    pre-release/current-v1 correction governance

ADR0017 → ADR0019 → ADR0020 → ADR0026
    Game / Platform / Main launch boundary

ADR0009 → ADR0010–0015 → ADR0021
    Runtime Control + Frame/Call mechanics

ADR0016
    → ADR0022 / 0023 / 0024 / 0025
    → ADR0028 / ADR0029 / ADR0035 / ADR0031
    Renderer Data / Input / Render / Presentation chain

ADR0025 → ADR0036 → ADR0037
    Viewport addition and corrected four-child renderer-data /1

ADR0003 → ADR0030
    Content / FSDB core ownership

ADR0032
    framework / reusable game library / concrete game boundary

ADR0033 (conditional Electron composition)
    coexistence with
ADR0034 (canonical Desktop outer Hostra ownership)
```

ADR0033 只在 RuntimeHosting composition process 本身是 Electron 的条件下成立；ADR0034 定义 canonical Desktop outer host ownership。ADR0035 只修正 existing-node Render author surface，不重开 Render Update wire semantics。ADR0037 取消 `/2` current 路线，采用 governed corrected `/1`。

## Current decision chains

### Launch / hosting

```text
ADR0017 → 0019 → 0020 → 0026
→ Game Package + Platform Launcher Profiles
→ Platform Composition / RuntimeHosting
```

Desktop physical outer owner：ADR0034。条件式 Electron Runner execution：ADR0033。

### Runtime / frame

```text
ADR0009 → ADR0010–0015 → ADR0021
→ Subsystem Control + Frame/Call + Runtime Control
```

### Renderer data / input / render / presentation

```text
ADR0016
→ ADR0022 / 0023 / 0024 / 0025
→ ADR0028 / ADR0029
→ ADR0035
→ ADR0031
```

Viewport correction 追加 ADR0036→0037，并由 [Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md) 与 [Viewport State v1](../15-contracts/viewport-state-v1.md) formalize。

### Content

```text
ADR0003 → ADR0030
→ Content API + FSDB core / adapter ownership
```

### Game libraries / products

```text
ADR0032
→ reusable game libraries + concrete examples
→ Desktop / PWA product compositions consume public framework boundaries
```

## Current formal sources

Current reader 应优先进入：

- [系统架构](../10-architecture/system-overview.md)
- [正式契约目录](../15-contracts/README.md)
- [模块目录](../20-modules/README.md)
- [开发与资格](../30-development/README.md)

ADR 只提供 decision provenance；历史 implementation/qualification ledger 不能覆盖上述 Current sources。

## Reopen governance

Frozen Contract 不得因 code reuse、framework preference、future speculation、test convenience 或 transport preference 静默 reopen。

允许 reopen 的典型条件：

```text
demonstrated correctness/security contradiction
conflict between Frozen contracts
real consumer proves frozen capability cannot express required semantics
real compatibility boundary requires explicit migration/versioning
```

重大 correction 必须记录 superseded scope、compatibility obligation、未改变内容与 qualification impact。

## Provenance rule

```text
Current topic Architecture / Contract
→ Accepted ADR explaining why
→ Module realization
→ Development / qualification rules
→ Git / historical evidence for old subjects
```

不要从旧 milestone、旧 PR review、Superseded ADR 或历史 PASS 反推当前产品事实。
