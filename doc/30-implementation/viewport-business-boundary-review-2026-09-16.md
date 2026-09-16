# Viewport Core / Map 业务边界 Review — 2026-09-16（修正结果）

> 状态：**Review completed / ownership corrections applied in normative candidates / Docs Freeze not signed**  
> 原审查 subject：`d0ab971d4df8626973afe0f2274b4e6a643d2c1c`；原始详细 findings留在本文件Git history与commit `508d08abca294226c57955339c61a1063d267eeb`。  
> 修正决策：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)  
> Current status：[唯一 revised-v1 qualification ledger](./viewport-profile-v1-qualification.md)；日期：2026-09-16

本次审查原目标是识别 Map业务策略是否越界进入 Core。结论：**保留真实通用尺寸观测缺口，不要将产品部署、Web source API、游戏规则或性能 fixture提升为所有消费者协议义务。** 随后用户决定首次发布前直接修正已有 Profile `/1`，不生产 `/2`。下表记录当前规范修正；不是实现/资格PASS或兼容核查完成声明。

| Finding | 原越界 | 当前 disposition / owner |
|---|---|---|
| BB-01 P1 | Profile-v2 formal MUST要求产品所有Subsystem统一`/2` | **已删除current `/2`**；revised Profile `/1`只规定选定该identity时四child完整、Main owns selection/Broker exact match；本次产品统一`/1`仅写 [qualification ledger §4](./viewport-profile-v1-qualification.md)，非universal MUST |
| BB-02 P1 | Core wire硬编码`Window.innerWidth/innerHeight` | [Viewport v1](../15-contracts/viewport-state-v1.md)只定义current Renderer composition明确指定的single CSS logical presentation surface；当前Desktop/PWA产品选择document layout viewport与Window采样、content box/letterbox验收属于实施/物理组合；不得静默变更surface身份或加surfaceId |
| BB-03 P1 | Viewport contract/test出现player/collision/transfer/menu | Core formal contract+conformance改为synthetic Frames验证Input/Frame独立且不mint mutation permit；地图行为留在[map draft](../../examples/essentials-v21.1-local/MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md)与game library |
| BB-04 P1 | 假定不存在的menu/dialog迫使Core新Frame lifecycle API | 当前`examples/essentials-v21.1/game.json`仅map，现行map行为需求未要求menu。Future overlay+held movement作为独立consumer acceptance/lifecycle risk；只有真实已接纳需求+trace证据才单独reopen，不能因viewport创建Frame API；当前slice要求resize不主动启动gameplay/terminal cleanup |
| BB-05 P2 | 当前writer容量1024被升格为协议阈值 | Core仅规定每carrier≤1 writer-admitted+≤1 latest pending且eventual convergence；`>1024`只可作当前implementation stress fixture，不是跨实现规范参数；PR0 payload/Core residual/Browser latency完全留map |

## 当前最小 Core / business split

```text
Core /1 (revised first version):
  Connection1 + Input1 + Render1 + Viewport1
  exact 3-field geometry + single designated surface + Input independence
  one reader/writer + per-carrier bounded latest + retained runtime capability
  current authority / fresh baseline / terminal diagnostic

Physical product composition:
  select one /1 rollout for this build
  designate Desktop/PWA Web document layout viewport + DOM sampling
  test real content box / placement / letterbox

Map game library and concrete example:
  default640; clamp320×240..1920×1080; 100ms settle
  camera/chunks/autotile/movement/transfer/sceneEpoch/visualEpoch
  View/Sprite private atomic visual stage; Canvas/rAF; PR0 payload/latency
  future menu continuous walk only on separate accepted consumer evidence
```

No Environment manager、Main width relay、Input bypass、new Profile `/2`、dual parser、generic priority scheduler、framework ACK或map-only Render Core fast path。

## Freeze/compatibility disposition

- ADR0037 direction Accepted，旧ADR0036的v2 portion superseded，Profile-v2 contract/conformance与v2 ledger已变 historical-only。
- Revised Profile `/1` + Viewport v1仍 Docs Freeze HOLD，**必须先在 [v1 ledger](./viewport-profile-v1-qualification.md)证明无真实外部 compatibility obligation并完成最终cross-review/Docs SHA**；旧三child executable与修正四child不能混配。
- 实现、local/hosted/product tests 尚未进行；旧PASS不得迁移。Map PR0仍需真实 dense1080 payload、Core validation residual、Browser raster和single-clock latency；Core冻结不代表性能PASS。

原始审查主文可通过 Git history复核，不应把此历史报告当作current协议SSOT。