# Viewport Core 模块落点：Data / Renderer / Subsystem

> 层级：模块设计；状态：**Implementation target / Docs Freeze HOLD / not implemented**；2026-09-18。
> 上游：[通信系统](../10-architecture/communication-system.md)、[Subsystem 模型](../10-architecture/subsystem-model.md)、[ADR0036](../decisions/0036-preimplementation-viewport-profile-v1-correction.md)。唯一正式语义：[完整 Profile /1](../15-contracts/renderer-data-profile-v1.md)、[Viewport child](../15-contracts/viewport-state-v1.md)；[conformance](../15-contracts/viewport-state-conformance-v1.md)；[批准及资格账本](../30-implementation/viewport-core-freeze-ledger.md)。

本文件只定位实现，不重复定义 wire/schema/状态机/测试门槛。M8 历史代码与 `packages/data/DESIGN.md` 描述的旧 Input+Render-only 模型是**改造前实现现状**，不代表本次四-child 已实现；其受影响接口的确切增量见 [Data 包窄修订单](../../packages/data/VIEWPORT-V1-CORRECTION.md)，其他既有实现责任不变。

## 唯一运行链

```text
platform-injected viewport source（本轮以 fake source 代表）
→ @loomrealm/renderer 当前 Control participant 的 latest valid observation
→ current RendererDataPeer.viewport bounded publisher
→ @loomrealm/data 同一条既有 serialized writer、reader 与 Profile /1 demux
→ 当前 SubsystemDataPeer.onViewportState
→ @loomrealm/subsystem Runtime-scoped manager
→ business scope.viewport (readonly)
```

| 包/位置 | 新责任 | 明确不能拥有 |
|---|---|---|
| `packages/data` | `viewport.state` exact codec、角色方向、terminal family、每 peer 有界 publisher；复用一个 reader/writer | 窗口测量、current Main authority、Frame 或 Map |
| `packages/renderer` | 注入可选第三参数 source、participant-bound startup/latest、对每个 current Data peer 重新发布 baseline、身份隔离 | Window/DOM 硬编码、M13 Store/Projector mutation、InputTarget gate |
| `packages/subsystem` | Runtime 初始化时创建稳定只读 `scope.viewport`，当前 peer 路由、retention、订阅异常 containment 与 terminal cleanup | 测量源、Frame mutation permit、地图更新或真实像素尺寸 |
| `test/` 与各包 `test/` | 真实 holder + Data peers + host 的可控 architecture vertical 和新增 conformance | 用 mock-only/synthetic first paint 证明 Desktop/Map 产品闭环 |

安装顺序与 currentness 由 [Viewport child §§5–6](../15-contracts/viewport-state-v1.md) 唯一定义，发布算法由其 §4 唯一定义；不要把同一状态机复制到模块文档。修改精确文件、阶段退出与 STOP 由[账本 §§3–5](../30-implementation/viewport-core-freeze-ledger.md)唯一拥有。

**不改** `game-libs/map/**`、`apps/desktop/**`、PWA adapter、Main、PlatformPorts、Foundation、Wire、RuntimeControl、RendererControl、M13 或 `play.bat`；无物理窗口源时不合成尺寸。正式签署之后 Agent 才能写生产代码。Docs Frozen、implementation、architecture qualification、product dynamic resize 是相互独立的状态。