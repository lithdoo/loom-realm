# LoomRealm 架构决策记录

> 层级：决策索引；状态：Active；2026-09-18。本页仅导航，不复制正式契约与资格状态。

## 历史决策索引

1. [ADR0001 System Container](./0001-system-container-per-system-id.md)
2. [ADR0002 Platform Transport](./0002-platform-transport-profiles.md)
3. [ADR0003 Content API](./0003-readonly-content-api.md)
4. [ADR0004 Rendering Pipeline](./0004-client-state-rendering-pipeline.md)
5. [ADR0005 Game Entry](./0005-game-entry-subsystem-launchers.md)
6. [ADR0006 Frame/Render](./0006-frame-render-decoupling.md)
7. [ADR0007 Descriptor historical](./0007-subsystem-descriptor-mvp.md)
8. [ADR0008 Launcher historical](./0008-desktop-nodejs-launcher-profile-v1.md)
9. [ADR0009 Subsystem Control](./0009-freeze-subsystem-control-protocol-v1.md)
10. [ADR0010 Frame A](./0010-freeze-frame-call-protocol-v1-batch-a.md)
11. [ADR0011 Frame B](./0011-freeze-frame-call-protocol-v1-batch-b.md)
12. [ADR0012 Frame C](./0012-freeze-frame-call-protocol-v1-batch-c.md)
13. [ADR0013 Frame D](./0013-freeze-frame-call-protocol-v1-batch-d.md)
14. [ADR0014 Frame E](./0014-freeze-frame-call-protocol-v1-batch-e.md)
15. [ADR0015 Frame F](./0015-freeze-frame-call-protocol-v1-batch-f.md)
16. [ADR0016 Authority cleanup](./0016-protocol-boundary-cleanup.md)
17. [ADR0017 Platform composition](./0017-system-level-platform-composition.md)
18. [ADR0018 Preimplementation direct-v1](./0018-preimplementation-v1-closure.md)
19. [ADR0019 Launch manifest](./0019-platform-launch-manifest-boundary.md)
20. [ADR0020 Game Entry consumer](./0020-game-entry-consumer-boundary.md)
21. [ADR0021 Runtime Control](./0021-runtime-control-preimplementation-closure.md)
22. [ADR0022 Render](./0022-render-update-v1-freeze-closure.md)
23. [ADR0023 User Input](./0023-user-input-v1-semantic-closure.md)
24. [ADR0024 Data Connection](./0024-renderer-subsystem-data-connection-v1-semantic-closure.md)
25. [ADR0025 Data Profile original closure](./0025-renderer-data-profile-v1-preimplementation-closure.md)
26. [ADR0026 Session Platform](./0026-session-scoped-platform-instance.md)
27. [ADR0027 Renderer Control](./0027-freeze-renderer-control-v1-preimplementation.md)
28. [ADR0028 M9 Data Broker](./0028-freeze-m9-desktop-data-broker-preimplementation.md)
29. [ADR0029 Input convergence](./0029-user-input-v1-mutation-gate-state-convergence.md)
30. [ADR0030 Content closure](./0030-freeze-m12-content-preimplementation-closure.md)
31. [ADR0031 Business Web Components](./0031-business-owned-web-component-projection.md)
32. [ADR0032 Game library boundary](./0032-game-library-example-boundary.md)
33. [ADR0033 conditional Electron runner](./0033-electron-hostra-run-as-node.md)
34. [ADR0034 Hostra Desktop](./0034-hostra-owned-desktop-composition.md)
35. [ADR0035 RenderDomain update](./0035-render-domain-existing-node-update.md)
36. [ADR0036 Viewport Profile /1 preimplementation correction](./0036-preimplementation-viewport-profile-v1-correction.md)

## Current correction chain

ADR0018 建立首次实现前 direct-v1 治理。ADR0016 → ADR0022/0023/0024/0025 确立旧 Render/Input/Connection/Profile；ADR0029 仅修订 Input convergence；**ADR0036 显式更新 ADR0025 的 Profile closed child set**，目标从三 child 修订为四 child，其他 frozen 语义不变。[当前 Profile](../15-contracts/renderer-data-profile-v1.md)、[Viewport child](../15-contracts/viewport-state-v1.md)、[freeze ledger](../30-implementation/viewport-core-freeze-ledger.md) 分别拥有规范和 live status。旧原文留存在 Profile baseline；不得把 ADR0025 历史三-child组合当作本修订候选的 current shape。

ADR0019→0020→0026 定义 Game/Platform launch，ADR0021 定义 Runtime Control；ADR0031 定义 Web Presentation；ADR0032 定义 Map 框架边界；ADR0033 只在 Electron composition 前提下有效，ADR0034 定义 canonical Hostra Desktop；ADR0035 更新 RenderDomain author API，不改变 Render wire。ADR0036 **不**改变这些 authority/physical owner，也未批准 Map/Desktop 动态缩放的产品实现。

正式 Docs Freeze 与生产代码资格是两个独立 gate；[document governance](../00-overview/document-governance.md) 要求被审批的同一个 docs SHA 可追溯，不能凭索引的日期自称 Frozen。