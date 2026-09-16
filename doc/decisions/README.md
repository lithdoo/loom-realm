# LoomRealm 架构决策记录

> 层级：设计决策记录 · 状态：Active  
> 主要定义：重大架构决策、partial supersession、current-v1 provenance与 reopen 条件  
> 最近复核：2026-09-16

ADR解释 why；实际 current semantics由 architecture/formal contracts/milestone physical SSOT/唯一 qualification ledger拥有。历史 proposal不得反向覆盖后续 Accepted correction。

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
21. [ADR 0021：Runtime Control 首次实现前收口 current v1 mechanics](./0021-runtime-control-preimplementation-closure.md)
22. [ADR 0022：Render Update v1 freeze closure](./0022-render-update-v1-freeze-closure.md)
23. [ADR 0023：User Input v1 semantic closure（部分由 ADR0029 更新）](./0023-user-input-v1-semantic-closure.md)
24. [ADR 0024：Renderer ⇄ Subsystem Data Connection v1 semantic closure](./0024-renderer-subsystem-data-connection-v1-semantic-closure.md)
25. [ADR 0025：Renderer Data Profile v1 closure（组合部分由 ADR0037 更新）](./0025-renderer-data-profile-v1-preimplementation-closure.md)
26. [ADR 0026：Platform Session Composition Object](./0026-session-scoped-platform-instance.md)
27. [ADR 0027：Renderer Control v1 / M7 closure](./0027-freeze-renderer-control-v1-preimplementation.md)
28. [ADR 0028：M9 DataConnectionBroker closure](./0028-freeze-m9-desktop-data-broker-preimplementation.md)
29. [ADR 0029：Input mutation-gate State convergence](./0029-user-input-v1-mutation-gate-state-convergence.md)
30. [ADR 0030：M12 Content preimplementation closure](./0030-freeze-m12-content-preimplementation-closure.md)
31. [ADR 0031：业务拥有 Web Components](./0031-business-owned-web-component-projection.md)
32. [ADR 0032：Framework / Game Library / Example Boundary](./0032-game-library-example-boundary.md)
33. [ADR 0033：Conditional Electron Runner Node mode](./0033-electron-hostra-run-as-node.md)
34. [ADR 0034：Hostra owns Desktop Electron composition](./0034-hostra-owned-desktop-composition.md)
35. [ADR 0035：RenderDomain existing-node authoritative update](./0035-render-domain-existing-node-update.md)
36. [ADR 0036：Viewport gap；Profile v2部分已被 ADR0037替代](./0036-viewport-state-and-renderer-data-profile-v2.md)
37. **[ADR 0037：首次发布前直接修正 Profile `/1`，拒绝虚假 `/2`，业务 policy归消费者](./0037-direct-profile-v1-preimplementation-viewport-correction.md)**

## Current correction chains

```text
ADR0018 → document-governance first-implementation direct v1 policy
ADR0019 → 0020 → 0026: Game/Platform/Main launch boundary
ADR0021: Runtime Control mechanics
ADR0022–0024: Render/Input/Data Connection child contracts
ADR0023 → 0029: Input State convergence correction
ADR0025 → ADR0037: Profile v1 shared mechanics retained; child composition corrected
ADR0030: M12 Content
ADR0031: M13 WC ownership
ADR0032: M14 framework/game library/example boundary
ADR0033 (conditional) → ADR0034 (canonical M15): Hostra physical ownership
ADR0035: M11 RenderDomain.update existing-node author API; no Render wire v2
ADR0036 (viewport real gap) → ADR0037 (direct corrected Profile v1)
```

ADR0037明确：保留 ADR0036 的 viewport 非 Input事实，撤销其必须新建`renderer-data/2`和uniform `/2` protocol要求；ADR0025的single reader/writer、terminal、Platform authority不变，历史三-child组合由 revised `/1`四 child取代。Direct preimplementation reset能否最终签署，仍需 [唯一 v1 ledger](../30-implementation/viewport-profile-v1-qualification.md) 记录真实外部 compatibility assessment；未发GitHub release不等于没有npm/private consumer。

## Current protocol/consumer chain

```text
ADR0016 → ADR0022/23/24/25 → M8 Data role/M9 Broker
→ ADR0029 M10 Input → M11 Render/ADR0035 author delta
→ ADR0036 real viewport gap → ADR0037 direct-first-v1 correction
→ Renderer Data Profile /1 revised + Viewport State v1 [Docs Freeze HOLD]
→ ADR0031 M13 business WC ownership
→ ADR0032 game-libs/map consumer / map PR0 qualification
```

**唯一当前 Data Profile target**：`loomrealm.renderer-data/1 = Connection1 + Input1 + Render1 + Viewport1`，old executable三 child `/1`仅 historical，Profile `/2`草案Superseded never implemented。Core source指定single CSS logical presentation surface，当前Web product选择document layout viewport/`innerWidth`，map policy/menus/Canvas performance属于消费者；两份 conformance在修正后 SHA重验，不沿用旧 PASS。

## Other current chains

Game/Runtime launch：ADR0017→0019→0020→0026→Game Package/Launcher→Platform Composition/RuntimeHosting。Conditional Electron：ADR0033只有相关 precondition成立时适用；canonical M15：ADR0034→Hostra shell→HOSTRA_SUBCMD LoomRealm Desktop plain Node→existing Runner。Runtime/Frame：ADR0009→0010–0015→0021。Content：ADR0003→0030→M12→M13 resources。Framework consumer：ADR0032→M14 map→ADR0037 viewport gap→ADR0034 M15 product。

## Current normative / evidence pointers

- [Profile v1 revised](../15-contracts/renderer-data-profile-v1.md)：四 child，preimplementation candidate，Docs Freeze HOLD。
- [Viewport State v1](../15-contracts/viewport-state-v1.md)：readonly retained geometry candidate。
- [Profile v1 Conformance fixtureSetRevision 3](../15-contracts/renderer-data-profile-conformance-v1.md)及[Viewport Conformance](../15-contracts/viewport-state-conformance-v1.md)：executable-ready candidate；真实PASS在实现后记录。
- [Viewport/revised v1 ledger](../30-implementation/viewport-profile-v1-qualification.md)：唯一live maturity、compatibility与evidence owner。
- [M15 recomposition SSOT](../../M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md)：canonical Hostra physical composition。

Frozen协议不能因reuse、test convenience或未来假设静默reopen；真实纠正应有ADR/compatibility proof/全树传播/新evidence。历史 ADR、superseded v2 contract/conformance、旧 qualification不能覆盖当前 SSOT。