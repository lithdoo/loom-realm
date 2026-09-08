# LoomRealm 架构决策记录

> 层级：设计决策记录  
> 状态：Active  
> 主要定义：重大架构决策背景、取舍、current-v1 provenance 与 reopen 条件  
> 最近复核：2026-09-08

ADR 记录“为什么”；Current 可实现事实以 architecture / formal contract / implementation qualification 为准。**同一个尚未合并的 current design不通过额外 ADR人为制造历史层。**

---

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
20. [ADR 0020：Game Entry 消费边界归 Platform Launcher，Main 只接收 LogicalGameBootstrap](./0020-game-entry-consumer-boundary.md)
21. [ADR 0021：Runtime Control 首次实现前收口 current v1 mechanics](./0021-runtime-control-preimplementation-closure.md)
22. [ADR 0022：Render Update v1 freeze closure](./0022-render-update-v1-freeze-closure.md)
23. [ADR 0023：User Input v1 semantic closure（部分由 ADR 0029 更新）](./0023-user-input-v1-semantic-closure.md)
24. [ADR 0024：Renderer ⇄ Subsystem Data Connection v1 semantic closure](./0024-renderer-subsystem-data-connection-v1-semantic-closure.md)
25. [ADR 0025：Renderer Data Profile v1 preimplementation closure](./0025-renderer-data-profile-v1-preimplementation-closure.md)
26. [ADR 0026：Concrete Platform 是 Session Composition Object，Launcher 是 Platform 内部 PREPARE Component](./0026-session-scoped-platform-instance.md)
27. [ADR 0027：冻结 Renderer Control v1 与 M7 Preimplementation Closure](./0027-freeze-renderer-control-v1-preimplementation.md)
28. [ADR 0028：冻结 M9 Desktop DataConnectionBroker / Late Provisioning Core 首次实现边界](./0028-freeze-m9-desktop-data-broker-preimplementation.md)
29. [ADR 0029：User Input v1 mutation-gate State convergence correction](./0029-user-input-v1-mutation-gate-state-convergence.md)
30. [ADR 0030：冻结 M12 Content preimplementation closure](./0030-freeze-m12-content-preimplementation-closure.md)
31. [ADR 0031：业务拥有 Web Components，LoomRealm 只投影 Render replica](./0031-business-owned-web-component-projection.md)

---

## Current 修正关系

```text
ADR 0018
    first-implementation direct-current-v1 correction governance

ADR 0019 → ADR 0020 → ADR 0026
    Game / Platform / Main launch boundary

ADR 0021
    Runtime Control mechanics

ADR 0022–0025
    Render / Input / Data Connection / Renderer Data Profile closure

ADR 0027
    Renderer Control + M7 closure

ADR 0028
    M9 Desktop Data Broker / late provisioning closure

ADR 0023 → ADR 0029
    narrow User Input State convergence correction

ADR 0030
    M12 Content storage/service/Subsystem/Renderer consumer closure

ADR 0031
    M13 Web Presentation current decision
    → business-owned Custom Elements / thin Renderer projector
    → Window-level WebPresentationConfigV1
    → deterministic scoped wire-node → HTMLElement identity
    → deterministic cross-Subsystem body concatenation without global zIndex semantics
    → one Web Presentation API v1 with independent context/data receivers
    → narrow PresentationResourceClient over M12 private ResourceClient
    → no RenderEvent WC ABI / no generic layer/loader/AssetManager
```

ADR 0031不 supersede ADR 0022；M11 Render authority/replication保持 Frozen，M13只是其 physical consumer。

Formal sources：

```text
Web Presentation Config v1
→ startup JS/CSS / prepared Content / browser ready semantics

Web Presentation API v1
→ Projector ↔ WC context/data/resource ABI
```

---

## Current Decision Chains

### Game / Runtime launch

```text
ADR 0017 → 0019 → 0020 → 0026
→ Game Package + Hostra/PWA Launcher Profiles
→ Platform Composition / RuntimeHosting
```

### Runtime / Frame

```text
ADR 0009 → 0010–0015 → 0021
→ Subsystem Control + Frame/Call + Runtime Control Profile
```

### Renderer Data / Input / Render / Web Presentation

```text
ADR 0016
→ ADR 0022 / 0023 / 0024 / 0025
→ M8 Data role seam
→ ADR 0028 / M9 physical Data
→ ADR 0029 / M10 Input closure
→ M11 Render replication closure
→ ADR 0031
→ Web Presentation Config v1 + Web Presentation API v1
→ M13 Web Presentation
```

### Content

```text
ADR 0003
→ ADR 0030
→ M12 Content implementation/qualification
→ M13 bootstrap resolution + PresentationResourceClient façade
```

---

## Compatibility / Reopen Governance

Frozen Contract不得因 code reuse、framework preference、future speculation、test convenience 或 transport preference静默 reopen。

允许 reopen：

```text
demonstrated correctness/security contradiction
conflict between Frozen contracts
real consumer proves Frozen capability cannot express required semantics
real compatibility boundary requires explicit migration/versioning
```

M13应优先作为 M11 Store的 trusted physical consumer实现。业务内部 UI framework选择不构成对 Render/Web presentation authority boundary 的 reopen。

---

## Provenance Rule

Current readers优先：

```text
Architecture topic source
→ Current Normative/Frozen Contract
→ Accepted current ADR
→ Module projection
→ implementation plan/tests
```

历史 ADR/Git保留演进；旧 shape不得覆盖 Current Contract。
