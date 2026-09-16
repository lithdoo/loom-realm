# Render 移动延迟与核心链路改造设计

> 状态：Implementation Specification Frozen；ADR 0035 Accepted，PR 0 治理传播已完成  
> Freeze Gate：Passed — PR 0 governance baseline `59fcd6fb3d4e6e70943780d994d750ac4f26a34e`  
> Implementation Status：**Requalification Pending** — current subject `c642cda9cee2b318b3aa8f6285de05d6b6ed6bea`；ordinary movement P95 `42.9ms` PASS，window-refresh movement P95 `96.3ms` FAIL（gate `<=50ms`）
> 日期：2026-09-15  
> 范围：`@loomrealm/subsystem`、`@loomrealm/renderer`、`@loomrealm-game/map`、`examples/essentials-v21.1-local`；`@loomrealm/data` / `@loomrealm/wire` 只做现有协议回归，不在本计划中优化  
> 目标：消除本地地图移动从方向键按下到首个可见像素变化之间的高延迟，同时保持现有 authority、Render Update v1、碰撞、换图、重连和最终收敛语义。

本文基于当前仓库代码、Map066 实际数据和 Hostra/Electron 本地链路测量。本文覆盖 `examples/essentials-v21.1-local/MAP_MOVEMENT_LATENCY_REFACTOR_DRAFT.md` 中关于问题根因、实施顺序和核心模块触发条件的结论；旧文档不得继续作为实现依据。Autotile、layering、transfer 文档中与本问题不冲突的既有约束继续有效。

> **执行结果记录（非规范性状态）：** current subject 已完成 revision rollover、closed-shape validation、单次 COW 与真实截图 smoke 修正。本地三轮合并样本为 ordinary `n=300 / P95=42.9ms`、refresh `n=90 / P95=96.3ms`，三轮 invalid 均为 `1` 且低于 5%。因此严格触发第 9.4 节“保留正确实现，停止并报告”；不得降低门槛或在本文范围内追加 backing canvas、动态 margin、新 scheduler。该状态记录不修改冻结的 normative clauses，也不改变 PR 0 baseline。

---

## 1. 决策摘要

问题的主要原因不是 `WALK_STEP_MS = 250`，也不是正常链路中 `walking` 被 `standing` 合并。真正的热路径是：每次移动只改变少量 player/camera 字段，却重新生成、校验、复制、冻结、编码、解析并再次校验包含约四百个 tile 的完整 RenderSnapshot。

本次改造冻结以下方向：

1. 先按仓库治理规则重新打开并冻结 M11 author surface；不得以“向后兼容新增”或 alpha 状态绕过现有 freeze。
2. local 启动必须保证 map source、dist 和 FSDB Presentation 一致；不再允许静默运行旧产物。
3. 保留 `RenderDomain.replace()` 作为完整状态提交和恢复基线能力。
4. 在 Subsystem author surface 增加最小的 existing-node `update()`，但不向作者暴露 `domainId`、revision、Snapshot、Patch 或发送结果。
5. `RenderManager` 把 author update 转换成仓库已经存在的 `RenderPatchV1`；不新增 wire 协议版本。
6. Renderer 为 update-only Patch 增加 copy-on-write 快路径；结构型 Patch 继续使用已有通用原子候选路径，所有路径都遵守每个 op 后的 candidate hard limits。
7. Map 首次加载、换图和重连发送完整 Snapshot；正常移动只更新 player/camera。tiles 使用有余量的 retained projection window，仅在覆盖范围不足时更新。
8. JSON 通用热路径优化移出本计划，作为独立 follow-up；本计划只要求现有 Data/Wire 协议与校验回归不变。
9. Browser backing canvas、sprite raster/placement 分离只可进入另立设计的后续阶段；不属于本文实施范围，也不引入通用 GameLoop 或 AnimationManager。
10. PR 0～4 是同一次 capability evolution；最终以最后一个改变 executable behavior 或 qualification input 的 commit 为唯一 implementation subject，在同一源码树上顺序重新关闭 M11、M14、M15，并同步全局 Current 文档。

### 1.1 设计治理前置条件

ADR 0035 接受前，`M11_01_SUBSYSTEM_RENDER_MANAGER.md` 和 `packages/subsystem/DESIGN.md` 把 `RenderDomain` 的 exact author surface 冻结为 `replace/emit/close`，并禁止编码阶段重新设计 root Render exports。大型场景完整 Snapshot 已成为主要性能瓶颈，且现有 Frozen Render Update v1 已具备可复用的 node update Patch，因此本问题满足 ADR 0004/ADR 0032 的重新评估条件。2026-09-15 已通过 Accepted ADR 0035 显式重开并重新冻结 target；旧 executable subject 的历史 Closed 与 target 尚未实现/资格化在所有 Current 文档中分开记录。

任何 `RenderDomain.update()` 实现 PR 之前必须先完成并合并一份 Accepted ADR，逐项冻结以下内容且不引入额外 public decision：

- 为什么该变更满足 ADR 0004 的重新评估条件；
- 为什么只支持完整 `replace()` 的 M11 author model 在已确认的大型 retained state 用例中不闭环，以及 correction boundary 尚无真实 compatibility obligation；
- 明确 partial-update/supersede `M11_01` / `M11_02` 中关于 exact author surface 和 publication realization 的相关结论，并更新 ADR index/navigation；
- `update()` 是同步、local、authoritative-state mutation，不是 author-visible wire/publication capability；
- exact 类型、错误分类、detach、atomicity、lifetime 与 representability 规则；
- `replace/emit/close` 的兼容性以及不暴露 domainId/revision/carrier/send outcome 的边界；
- ADR 0032 的真实 M14 workload performance-gap reopen 条件已满足，但只重开 M11 author capability，不改变 ADR 0032 的 game-library ownership boundary；
- 不重开 Render Update wire schema、M13 public presentation contract 或 M15 physical design；M14/M15 只因 executable behavior、fixture/harness 或 consumed lower-layer behavior 改变而形成新的 qualification subject；
- `M11_01_SUBSYSTEM_RENDER_MANAGER.md`、`packages/subsystem/DESIGN.md`、M11 qualification closure、package boundary、architecture Current projection 与全局 milestone ledger 的对应更新。

ADR 0035 已 Accepted；在该状态形成前只允许进行测量、原型和不改变 public surface 的准备工作。该 gate 已满足，但仍不得在第 19 节版本控制 gate 通过前合并 public API 实现。

### 1.2 冻结声明与执行方式

本文从本次修订起冻结实现选择、错误分类、状态转换、文件名、算法顺序和验收口径。执行者不得把 `MUST` / “必须”条款改成启发式，也不得自行增加本文未授权的抽象或优化。ADR 0035、PR 0 文档传播与版本控制基线已经在 header 所列 SHA 完成；执行从 PR 1 开始。

低判断力 agent 按第 14 节逐 PR 执行，并遵守以下规则：

1. 先验证 header 的 `Freeze Gate：Passed`、baseline SHA 和第 19 节；PR 0 已由维护者完成，不得重建 ADR 或重新选择 target contract。缺任一项时停在治理检查，不开始 PR 1/2。
2. 某个冻结测试或数值 gate 失败时，只修复该 PR 已授权范围；不得通过扩大 API、放宽校验或实施第 10.2 节 follow-up 绕过。
3. 本文写明“停止并报告”的条件出现时，保留复现命令、输入、期望/实际和分段数据，然后停止；执行者不承担新设计判断。
4. 只修改第 12 节列出的文件。测试揭示需要修改清单外文件时停止并报告；新增范围必须先更新本文并重新评审。
5. 不得把本文的治理术语实现成生产对象或框架；不得新增 `ChangeSubject`、`PreparedProjectionCommit`、`QualificationScenario`、generic `WorkAdmissionQueue` 或同义 abstraction。

PR 0 Accepted、本文已纳入版本控制、所有占位符为零且第 19 节 Freeze Gate 全部满足后，本文才同时具备“设计已冻结”和“可直接实施”两项状态。

### 1.3 统一 implementation subject 与关闭顺序

本文不创建新的治理系统。“qualification subject”沿用 M14/M15 现有定义：最后一个改变对应 executable behavior 或 qualification input 的 commit。PR 0 是 docs-only decision，ADR Accepted 本身不使旧 executable subject 失去 Closed；从 PR 1 的 fixture/harness input 或 PR 2 的 M11 executable behavior 首次变化开始，受影响里程碑的旧 evidence 不再证明新 subject。

执行期间状态只按下表解释，不允许各文档自行创造别名：

| 里程碑 | 本计划改变什么 | 新 subject 的处理 |
|---|---|---|
| M11 | author surface、publication、Renderer Patch realization | PR 2 起需要重新 qualification；最终按既有 local + hosted Node 20/24 root gate 在 subject `S` 上关闭 |
| M13 | 不改变 public equality/receive contract | 不重开设计；在 `S` 上运行完整 regression，失败则停止 |
| M14 | Runtime/browser behavior、Content fixture、所消费的 M11/Renderer 行为 | PR 1 起形成新 qualification subject；按既有 exact-local + hosted Node 20/24 gate 重新关闭 |
| M15 | qualification workflow 与所消费的 M14/lower-layer behavior | physical design、ADR 0034 与 Hostra baseline 不重开；在 M14 formally Closed 后对同一 `S` 重新 qualification |

`S` 精确等于 PR 0～4 中最后一个改变 executable behavior 或 qualification input 的完整 Git commit SHA；测试报告、M14 ledger 和 M15 ledger 都记录这个 SHA。最终 evidence ledger/README 的 docs-only commit 不产生新 implementation subject。关闭顺序固定为：

```text
ADR 0035 Accepted
-> PR 1..4 implementation tip S
-> M11 local + hosted Node 20/24 qualification on S
-> M13 regression on S
-> M14 exact-local + hosted Node 20/24 qualification on S
-> M14 formally Closed
-> M15 frozen-Hostra local + hosted qualification on S
-> M15 formally Closed
-> synchronize repository Current projections
-> this capability evolution Closed
```

如果 PR 1～4 分别合并到声明 Current 状态的分支，对应 qualification ledger 和全局 summary 必须在第一个产生新 subject 的 commit 同步标记 `Requalification Pending`，不得继续显示旧 subject 的无条件 `Closed`。最终证据允许由后续 docs-only commit 记录并恢复 `Closed`。若这些 PR 只作为 stacked change 尚未进入 Current 分支，旧 subject 的历史 Closed 保持有效，但不得声称 stacked tip 已 Qualified。

目标链路：

```text
trusted keydown
  -> Runtime attempt()
  -> RenderDomain.update(camera/player)
  -> RenderManager local atomic commit
  -> existing RenderPatchV1 (~sub-KiB)
  -> Renderer update-only COW commit
  -> Web Projector
  -> Browser walking interpolation
  -> first changed pixel
```

---

## 2. 已确认的事实与基线

### 2.1 实际代码事实

- `apps/desktop/src/renderer-input-source.ts` 在非 repeat keydown 时先发布 `keyboard.state`，随后发布 `keyboard.event`。
- `packages/renderer/src/internal/input-gate.ts` 的 publisher 只串行等待 carrier send Promise，不等待网络往返确认。
- `game-libs/map/src/runtime.ts` 的 `attempt()` 在合法移动时立即更新整数目标格、设置 `activeMove` 并调用 `domain.replace(renderState())`，之后才启动 250ms step timer。
- Runtime 只拥有整数格目标、碰撞、transfer 和 step boundary authority；逐像素过程由 Browser 根据 retained motion state 插值。
- `game-libs/map/src/runtime.ts` 的 walking/standing `renderState()` 都会调用 `projectVisibleTiles()`。
- `packages/subsystem/src/internal/render-manager.ts` 的 `replace()` 对完整状态执行多轮 JSON/树校验、detach/freeze 和消息大小探测。
- `packages/data/src/profile-codec.ts` 在发送和接收侧继续对完整消息执行 schema、JSON、深度和序列化校验。
- `packages/data` 已完整定义并传输 `RenderPatchV1`；`packages/renderer` 已能接收它；当前缺口是 Subsystem author/manager 没有产生 Patch。
- Renderer 当前 `onPatch()` 在应用任何 Patch 前都会深拷贝全部 roots，因此协议虽支持 Patch，接收实现仍未针对小更新优化。
- 当前 map Browser source 已具有一次 delivery prepare 和同步 `_paintPrepared()`；不应重复实施这一项。

### 2.2 本地实测

Map066 当前样本：

| 项目 | 结果 |
|---|---:|
| 地图尺寸 | `22 x 21 x 3` |
| 单次投影非空 tile | 约 `408` |
| 完整 RenderSnapshot JSON | 约 `37,070B` |
| `RenderManager.replace()` | 约 `29.2ms/op` |
| Snapshot `encodeForRole()` | 约 `33.1ms/op` |
| Snapshot `decodeForRole()` | 约 `34.9ms/op` |
| RendererStore Snapshot commit | 约 `4.9ms/op` |
| 等价 player/camera Patch | 约 `446B` |
| Patch encode | 约 `0.37ms/op` |
| Patch decode | 约 `0.38ms/op` |

真实 Hostra/Electron 链路的少量 warm 样本：

| 阶段 | 结果 |
|---|---:|
| keydown -> Browser 收到 walking | `66..89ms` |
| keydown -> 首个位置变化 | `83..109ms` |
| 首次冷样本 keydown -> 首个位置变化 | 约 `135ms` |
| input.state sent -> render.snapshot received | `49..65ms` |
| walking snapshot -> standing snapshot | `300..323ms` |

这些样本用于定位，不足以宣称 P95。真实逐帧位置包含 `256, 257, 259 ... 288` 等中间值，因此正常本地链路中并未复现“walking 完全被 standing 覆盖”。

### 2.3 产物漂移

检查时存在：

```text
game-libs/map/browser/map.browser.js        18351 bytes
game-libs/map/dist/browser/map.browser.js   15796 bytes
FSDB Presentation/map/map.browser.js        15796 bytes
```

source 与 dist/FSDB 哈希不同。`play.bat` 只在 Desktop entry 不存在时运行 `build:m15`，而既有 FSDB Presentation 只在导入时复制。这会导致开发者阅读的代码与实际运行代码不一致，必须作为 P0 修复。

### 2.4 非根因

以下事项不得作为本次首动延迟的主要解释：

- `250ms` 是单格持续时间，不是首次输入 debounce。
- Runtime 没有逐像素 RenderState 是刻意的 authority/presentation 分层，不是状态缺失。
- 正常样本没有发生 walking snapshot 被 standing snapshot 覆盖。
- WebSocket 本身不是测得的主要耗时；大头发生在发送前后的同步 CPU 工作。
- Map066 出生点 `(8,7)` 的左、上方向不可通行；该位置的左/上无位移是碰撞结果。

---

## 3. 目标、非目标与不变量

### 3.1 性能目标

在资源已 warm、窗口可见且获得焦点的 qualification 环境中：

| 指标 | Gate |
|---|---:|
| keydown -> logical first changed pixel，P50 | `<= 35ms` |
| keydown -> logical first changed pixel，P95 | `<= 50ms` |
| 普通移动 Render message | `<= 1KiB` |
| 普通移动 Patch encode/decode | 单侧 P95 `<= 2ms` |
| 普通移动中完整 Snapshot 数量 | `0` |
| 正常本地链路完整跳格 | `0` |
| active walking 长帧 `>33.4ms` | `< 1%`；`>=1%` 按第 10.2 节停止并报告 |

性能 gate 必须记录 commit、Node/Electron/Chromium 版本、CPU/GPU、样本数、P50/P95/max。一次最快结果不能作为验收证据。

### 3.2 必须保持的语义

- Runtime `x/y` 继续是整数目标格 authority。
- Browser 不决定碰撞、transfer、地图选择或最终坐标。
- keyup 只允许当前完整 step 收敛，不允许停在半格。
- walking 路径方向只在合法格边界切换。
- collision 继续立即显示 attempted direction 的 standing pattern。
- held direction 的最后按下优先级保持不变。
- contact、edge、completed-step transfer 语义保持不变。
- Domain/Node one-shot identity、live tag stability、revision continuity 保持不变。
- carrier replacement 和重连必须由 Registry + 最新完整 Snapshot 恢复。
- stale resource、stale motion、stale map 不得覆盖 latest state。
- 调用者对象必须在同步提交时 detach；提交后修改原对象不能改变内部状态。
- 所有无效 author update 必须 local-atomic：原状态不变，不产生 publication。

### 3.3 非目标

- 不调整正式步长；`WALK_STEP_MS` 是否从 250ms 改为其他值是独立产品决策。
- 不增加 buffered turn、输入预测、运动队列或 per-frame Runtime tick。
- 不引入 Render Update v2。
- 不暴露 wire revision、domainId、carrier 或 send Promise 给游戏作者。
- 不把 walking 改为不可恢复的 RenderEvent command。
- 不为了性能跳过不可信 inbound 数据校验。
- 不在第一阶段建立通用 scene graph、diff engine、persistent collection 或 animation framework。

---

## 4. 核心模块改造总览

```text
@loomrealm/subsystem author API
  RenderDomain.replace(full state)
  RenderDomain.update(existing-node deltas)       [新增]
                |
                v
Subsystem RenderManager
  validate + detach update values
  apply COW to authoritative state
  choose Snapshot or existing RenderPatchV1
  own domainId/revision/recovery/coalescing
                |
                v
@loomrealm/data / @loomrealm/wire
  existing RenderPatchV1 schema and role direction
  regression only; no implementation change in this plan
                |
                v
Renderer RenderStore
  update-only Patch COW fast path               [新增]
  structural Patch existing isolated path        [保留]
  atomic commit + revision continuity
                |
                v
Web Projector / Browser Presentation
  retained data projection
  motion interpolation remains presentation-only
```

核心设计原则是“增加一个窄能力，复用已有协议”，而不是“增加一套框架”。

### 4.1 分层边界

| 层 | 本计划内职责 | 明确不拥有 |
|---|---|---|
| Core architecture | 通用 existing-node/Domain-level update、publication、revision、COW、atomicity | camera、tiles、motion、FSDB、Map cache policy |
| Map consumer | camera/player delta、tile projection window、Map-owned Custom Element timeline/cache | domainId、revision、Render message envelope、Wire hard-limit validator |
| Product/tooling | Hostra E2E、source/dist/FSDB 同步、性能采样 | Render authority、Map 状态与协议语义 |

依赖方向固定为 `Map -> @loomrealm/subsystem author API -> private publication -> Renderer replica -> map-owned Web Components`。下层业务用例可以触发上层能力重新评估，但不得把 `tiles`、camera 或 motion 变成通用 Core 契约。

---

## 5. `@loomrealm/subsystem` author surface

### 5.1 为什么不直接公开 `patch()`

M11 已冻结：作者不观察或管理 `domainId`、revision、Snapshot/Patch、publication cursor 和 carrier identity。直接导出 `RenderPatchOpV1` 会把 wire transport 语言泄漏到业务 SDK，也会让作者承担 insert/remove/move、revision 和重连语义。

因此本文修正早期“给 RenderDomain 增加 patch()”的简写建议，正式 API 使用 existing-node `update()`。它表达本地 authoritative state 的增量修改，RenderManager 私下决定是否编码为 Patch。

### 5.2 精确类型

在 `packages/subsystem/src/render.ts` 精确增加：

```ts
import type { JsonValue } from "@loomrealm/wire";

interface RenderStringDelta {
  readonly set?: Readonly<Record<string, string>>;
  readonly remove?: readonly string[];
}

interface RenderDataDelta {
  readonly set?: Readonly<Record<string, JsonValue>>;
  readonly remove?: readonly string[];
}

interface RenderNodeUpdate {
  readonly key: string;
  readonly attrs?: RenderStringDelta;
  readonly data?: RenderDataDelta;
}

export interface RenderDomainUpdate {
  readonly zIndex?: number;
  readonly nodes?: readonly RenderNodeUpdate[];
}

export interface RenderDomain {
  replace(state: RenderDomainState): void;
  update(update: RenderDomainUpdate): void;
  emit(event: RenderEvent): void;
  close(): void;
}
```

第一版只允许更新已有 node 的 `attrs` 和 `data` 顶层成员，以及 Domain `zIndex`。结构变化继续调用 `replace()`。不增加 insert/remove/move author API，原因是 Map 移动不需要它，而完整结构 patch 会显著扩大 identity、原子性和错误面的公共契约。

`zIndex` 必须保留。它已经是 `RenderDomainState` 的 Domain-level authoritative state，不是从 wire Patch 反推出来的新概念。`update()` 覆盖 Domain `zIndex` 与 existing-node attrs/data，才完整覆盖所有非结构性 Render state mutation；否则单独调整 zIndex 仍被迫重新提交和校验完整 roots，形成不自然的模块能力缺口。`zIndex` 可单独 update，也可与 nodes 在同一次 local-atomic commit 中更新；写回相同值允许形成 semantic no-op commit。

Root author surface 只新增一个 operation 和一个命名输入类型 `RenderDomainUpdate`。`RenderStringDelta`、`RenderDataDelta`、`RenderNodeUpdate` 是 declaration supporting types，不从 package root 导出；不得为了类型对称性扩张 root export。作者如确需提取嵌套类型，可通过 `RenderDomainUpdate` indexed access 或 `Parameters<RenderDomain["update"]>[0]` 获得。

### 5.3 Author validation

`update()` 同步执行：

```text
require live Domain
-> validate closed shape
-> validate non-empty update
-> validate zIndex
-> validate node key and target liveness
-> validate each attrs/data delta
-> detach/freeze caller-owned set values
-> build isolated candidate by COW
-> validate affected candidate facts and hard limits
-> atomic local commit
-> offer authoritative publication work
-> return
```

规则：

- `RenderDomainUpdate`、node update 和 delta container 必须是 plain object、只含 enumerable own data property并执行 closed-shape 校验；`set` 是允许任意合法 string key 的 map，但仍只接受 enumerable own data property。任意层的 accessor、symbol key、未知 container key、非普通 prototype 均抛 `TypeError`。
- optional member 的语义以 own-property presence 判定：缺失表示“不修改”；显式存在但值为 `undefined` 一律抛 `TypeError`。该规则逐层适用于 `zIndex`、`nodes`、`attrs`、`data`、`set`、`remove`，不得用 `value === undefined` 同时表示缺失和值无效。
- `nodes` 缺失或为 `[]` 都表示没有 node update；只有 own `zIndex` 也构成合法 update。既无 own `zIndex`，又无非空 `nodes` 时抛 `TypeError`。
- own `zIndex` 必须是 `-2_147_483_648..2_147_483_647` 的整数；写回当前相同值仍是合法 commit，并产生一次 publication work。
- own `nodes` 必须是 dense array，长度为 `0..4096`；sparse array、额外 own key 或超过 4096 均拒绝，超限抛 `RangeError`，其他 shape 错误抛 `TypeError`。
- 同一个 `RenderDomainUpdate` 内 node key 不得重复，避免顺序含义进入公共 API。
- `attrs`/`data` 至少有一个；delta 的 `set`/`remove` 至少一项非空。
- 同一 delta 中 `set` 与 `remove` 不得包含相同 key。
- 删除不存在成员抛 `TypeError`，与 Renderer Patch 语义一致。
- target node 不存在或已 retired 时抛 `TypeError`。
- attrs/data key、value、深度、容器成员数和 payload byte limit 与 Frozen Render Update v1 一致。
- `update()` 不允许修改 node `key`、`tag`、children，因此不会改变 live-key/tag/one-shot identity。
- hard-limit overflow 抛 `RangeError`；shape/semantic usage error 抛 `TypeError`。
- 失败时不得修改 Domain state、pending work 或 publication cursor。

错误消息文本不冻结；错误 class、接受/拒绝集合、同步抛出点和失败原子性冻结。验证必须完成后才 detach/build candidate；实现可以在不观察 caller accessor 的前提下合并只读验证遍历，但不得改变上述顺序可见结果。

### 5.4 Author update 到 wire Patch 的精确映射

一次成功 `update()` 形成恰好一个内部 update work，映射冻结如下：

- `nodes` 按 caller array 顺序映射；每个 `RenderNodeUpdate` 恰好产生一个 `{ op: "update" }`，不得拆分、排序、合并或消除 semantic no-op。
- node op 的 `key` 原样使用；`attrs` / `data` 只在对应 own member 存在时出现；delta 的 `set` object 使用 `Object.keys()` 顺序复制，`remove` 保持 caller array 顺序。
- Patch 的 `zIndex` 只在 input 有 own `zIndex` 时出现；因此 zIndex-only update 精确映射为 `ops: []` 且含 `zIndex` 的合法 Patch。
- author input 不含 `op`、`domainId`、`baseRevision` 或 `revision`；`op: "update"` 由 RenderManager 加入，identity/revision 只在 materialize 时加入。
- local commit 前，用 128-byte probe domainId、`baseRevision = Number.MAX_SAFE_INTEGER - 1`、`revision = Number.MAX_SAFE_INTEGER` 和候选 ops/zIndex 构造最坏 wire envelope；若 `jsonDepth > 64` 或 compact JSON UTF-8 大小 `> 1_048_576`，同步抛 `RangeError`。不得提交后再降级或依赖 Data local-fatal。
- update 的最终 authoritative state 还必须能通过现有最坏 Snapshot probe；Patch probe 失败不允许自动改发 Snapshot，因为 API 的可表示集合必须与当前 carrier/baseline 状态无关。

以上映射也冻结了“一个 author update -> 一个 ordinary pending work”。只有第 6.4 节的容量收敛算法可以把尚未 started 的多个 state work 替换成 Snapshot；正常路径不合并 Patch。

### 5.5 Authoritative state 的 copy-on-write

`DomainRecord.state` 继续保存完整 detached/frozen authoritative state。应用 update 时：

1. 把 node updates 按 key 放入本次调用的临时 `Map`。
2. 对 roots 做一次 DFS。
3. 未命中节点且子树未变化：复用原 frozen node。
4. 命中节点：只浅复制 attrs/data，并仅 detach/freeze `set` 中的新值；未修改的大型 JsonValue 成员复用原值。
5. 有后代变化的祖先：只复制该 node 和 children 数组。
6. 未命中的 update key 导致整个操作失败，不提交候选。
7. 验证候选后一次性替换 `domain.state`。

本计划不建立长期 parent/path index。每次 update 对 Render tree 做一次 O(node count) DFS，避免引入索引失效和双重真相；COW mutation 本身不复制未修改的大型 JsonValue，但后续完整 data limit validation 仍可能遍历它。不得把“identity 被复用”误写成“整条 update 热路径不再遍历大型成员”。若 profile 显示 node lookup P95 `> 2ms`，停止并报告，索引另立设计。

### 5.6 整体 payload 限制

Patch set value 必须独立满足 JSON 安全边界，应用后的 node.data 仍必须满足 `MAX_DATA_BYTES`。单次 author `update()` 禁止重复 node key，因此可以先构建所有 touched node 的最终候选，再分别验证其 byte/depth/member limits；不得重新验证未受影响 node 或整个 Domain。

第一版完整遍历 touched node.data，并在性能报告中单独测量“少量字段变化 + 大型 untouched member”的 `RenderDomain.update()` 完整同步耗时，不得只用小 Patch 的 codec 时间代替。本计划不实现 member metadata cache。若第 13.6 节样本中 `RenderDomain.update()` P95 `> 5ms`，执行者停止并报告 profile；该缓存属于重新评审的 follow-up，不得在本计划内自行加入。

---

## 6. `RenderManager` publication 设计

### 6.1 Work 类型

`packages/subsystem/src/internal/render-manager.ts` 当前 Work 只有 registry/snapshot/event。增加内部 state-update work：

```ts
type Work =
  | { kind: "registry"; message: RenderDomainsV1 }
  | { kind: "snapshot"; domain: DomainRecord; state: RenderDomainState }
  | {
      kind: "update";
      domain: DomainRecord;
      state: RenderDomainState;
      ops: readonly RenderNodeUpdateV1[];
      zIndex?: number;
    }
  | { kind: "event"; domain: DomainRecord; event: RenderEvent };

interface InFlightPublication {
  readonly epoch: number;
  readonly peer: SubsystemDataPeer;
  readonly work: Work;
  readonly message: RenderDomainsV1 | RenderSnapshotV1 | RenderPatchV1 | RenderEventV1;
}
```

这里的 `ops` 是内部已验证、已 detached 的 wire-compatible update ops；author API 不导出它。

`state` 表示该 work 完成后的 authoritative state，只用于第 6.3/6.4 节明确规定的 Snapshot materialization、容量收敛和 qualification，不是第二份可变 authority。

`RenderManager` 必须显式保存至多一个 `inFlight` publication，而不能只用 `sending: boolean` 表示。原因是 work 从 pending queue shift 后、send outcome 返回前，author update 仍需判断“哪个 Domain 的哪类消息正在发送”。`inFlight` 只记录 carrier-local 发送事实，不改变 authoritative state；epoch/peer 不匹配的 completion 不得触碰新 carrier。

`inFlight` 只是 `RenderManager` 内一个 nullable private record，不单独成类、service、coordinator 或 queue abstraction。它不拥有 cursor、连接或 authority；`peer/work/message` 只复用一次 started send 已经需要保留到 completion 的事实。

### 6.2 Snapshot 与 Patch 的选择

materialize 时：

```text
Registry 尚未建立 / Domain 尚未 baseline
  -> render.snapshot（即使防御性遇到 update work，也只使用其 latest state）

当前 carrier 已 baseline，work.kind == update
  -> render.patch
     baseRevision = cursor.revision
     revision = cursor.revision + 1

replace() / recovery / revision rollover
  -> render.snapshot
```

只有成功发送 Snapshot/Patch 后才推进 cursor revision。`finishSend()` 以实际 `message.type` 判断：live Domain 的 sent Snapshot/Patch 都写入 `{baselined:true, revision:message.revision}`；Registry/Event 不写 cursor。不得只按 `work.kind === "snapshot"` 更新，否则 update Patch 成功后 cursor 会停滞。作者永远看不到 revision。

`materialize(update)` 防御性发现 cursor 缺失或 `baselined === false` 时必须输出该 work `state` 的 Snapshot，不得构造 Patch、drop 或抛 author error；正常入队算法不会产生该组合，但该分支用于保证未来重构仍 fail-safe。Patch/Snapshot 在 materialize 后、调用 Data peer 前不得再被改写。

`pump()` 的发送分支明确支持：

```ts
message.type === "render.domains"  -> sendDomains
message.type === "render.snapshot" -> sendSnapshot
message.type === "render.patch"    -> sendPatch
else                                -> sendEvent
```

### 6.3 Baseline 正在发送时的 update

必须覆盖以下竞态：

```text
Snapshot revision 1 已 shift，仍在发送
-> author update()
-> cursor 尚未 baselined
```

此时不得生成 baseRevision 不确定的 Patch。入队和 materialize 只按下表执行；`Q` 表示 pending queue，`R` 表示 last successfully emitted revision：

| current carrier / Domain 状态 | 新 local mutation | 唯一动作 |
|---|---|---|
| 无 peer | replace/update | 只提交 `DomainRecord.state`，不保留 work；fresh peer 时 Registry + latest Snapshot |
| peer 有效，Registry queued 或 in-flight，Domain 未 baseline | replace/update | 在当前同 Domain、同 barrier 区间内更新已有 queued Snapshot 的 `state`；若没有则 enqueue latest Snapshot |
| Snapshot queued、未 started | replace/update | 仅当该 Snapshot 之后没有同 Domain retained Event 时更新其 `state`；否则在 Event 后 enqueue 新 Snapshot |
| Snapshot in-flight、Domain 尚未 baseline | replace/update | 在 `Q` 尾部 enqueue/更新一个 latest Snapshot；绝不生成 Patch |
| Domain baselined(`R`)，无 state send in-flight | replace | enqueue Snapshot；materialize 为 revision `R+1` |
| Domain baselined(`R`)，无 state send in-flight | update | enqueue update；materialize 为 Patch `R -> R+1` |
| Domain baselined(`R`)，Snapshot/Patch revision `R+1` in-flight | replace/update | 原样 enqueue state work；待 in-flight success 后以新 cursor materialize，不预分配 revision |
| retained Event queued/in-flight | replace/update | enqueue 在 Event 之后；Event 是该 Domain barrier，不跨越合并 |
| cursor 为 `Number.MAX_SAFE_INTEGER` | 任意下一 state work | 执行第 6.5 节 wireId rollover，fresh Registry + latest Snapshot revision 1；丢弃旧 identity 的 pending Event/state work |
| send 返回 terminal 或 Promise reject | 任意 | 执行第 6.5 节 old-peer invalidation；不得继续使用原 cursor |
| 任意状态 | Domain `close()` | 同步关闭 business Domain并从 live registry 删除；删除该 Domain 全部 pending work/cursor，不能撤回已 started send；enqueue/update latest Registry |
| manager `closeAll()` | 任意 | 同步关闭全部 Domain、递增 epoch、置 peer/inFlight 为空并清空 queue/cursors；不再接受新 work |

queued Snapshot 的 `state` 只能吸收它之后、下一个同 Domain retained Event 之前的 latest state。Snapshot in-flight 不可改写；判断必须读取 `inFlight.work`，不得从空 cursor 或全局 boolean 猜测 Domain。revision 从不在入队时分配。

Event 的唯一规则是：先同步验证 target 仍 live；无 peer 时成功后立即 drop；有 peer 且 Domain 未 baseline 时排在该 Domain queued/in-flight Snapshot 之后；已 baseline 时排在当前 queue 尾部。队列未满时追加；队列已满且存在 pending Event 时删除 index 最小的 Event 后追加本次 Event；队列已满且没有 pending Event 时 drop 本次 incoming Event，不为 transient Event 收敛或丢弃 authoritative state。Event 从不改变 cursor，不跨 peer/rollover/close replay。

### 6.4 Coalescing 与 Event barrier

不实现 Patch op 拼接、diff 或 `set/remove` 代数归一化。正常路径一个 author mutation 对应一个 pending state work。`MAX_PENDING_WORK = 1_024` 只统计 `work` 数组，不含至多一个 `inFlight`；队列中最多保留一个 Registry work，`enqueueRegistry()` 必须原位改写它而非追加第二个。

Event barrier 精确定义为：同一 Domain 一个 retained、尚未 started 的 Event 在 pending queue 中的位置。它只阻止该 Domain state work 跨过该位置收敛；不同 Domain 的 work 不是 barrier。Event 被 backpressure 删除后，其 barrier 同时消失；in-flight Event 已经从 queue 移除，但所有后来 work 天然位于它之后，不可移动到 in-flight 之前。

所有入口共同遵守下面的完整准入规则；这是 `RenderManager` 私有函数之间的一个总语义，不要求新增 queue/admission class、result enum 或 scheduler：

| incoming work | `work.length < 1_024` | `work.length >= 1_024` 的唯一动作 |
|---|---|---|
| Event | 按第 6.3 节位置追加 | 有 pending Event：删除 index 最小者并追加 incoming；无 pending Event：drop incoming |
| Registry/Snapshot/update | 按既有 registry overwrite / barrier 规则入队 | 先删除 index 最小的 pending Event；仍满时执行下述 authoritative coalescing；无法恢复 invariant 时 invalidates old peer |

每次准备追加 Registry/Snapshot/update 但 `work.length >= 1_024` 时，循环执行以下唯一算法直到有一个空位：

1. 删除 pending queue 中 index 最小的 Event；若删除成功，从步骤 1 重新检查容量。surviving Events 的相对顺序不变。
2. 若无 Event，按 queue index 从小到大寻找第一个 state work（Snapshot/update），其后还存在同 Domain state work。因为无 Event，此时全队列只有至多一个 Registry 和最多 256 个 Domain 的 state work；满队列必然能找到重复 Domain。
3. 对该 Domain，收集 queue 中全部 state work；取 index 最大者的 `state` 作为 latest state，在该最大 index 位置放入一个 Snapshot work，删除该 Domain 的其他全部 state work。Registry 和其他 Domain work 保持原相对顺序。
4. 若步骤 2 找不到候选，视为内部 invariant breach：调用同一个 private old-peer invalidation helper，先保存 peer 引用，再置 `peer=null`、递增 epoch、清空 inFlight/work/cursors，并 `void oldPeer.close()`；authoritative state 已提交且 author call 正常返回，fresh peer 仍以 Snapshot 收敛。不得返回 `false` 后继续使用旧 peer、静默遗失 authoritative state或向 author 抛 backpressure error。

`replace()` 入队沿用 Snapshot 的同 barrier latest-state 覆盖；`update()` 在容量未满时不得覆盖 earlier update。容量算法把 state work 收敛为 Snapshot 后，message 在真正 started 时仍相对 last successful cursor materialize 为 `R+1`。禁止发送空 ops 且无 zIndex 的 Patch。

必须逐项使用以下确定性序列测试算法：1024 updates 单 Domain；256 Domains 轮转；Registry + 1023 state work；Event 位于首/中/尾；同 Domain Event 前后 updates；in-flight Snapshot/Patch/Event 各自叠加满队列；满队列有 pending Event 时 incoming Event 替换最老 Event；满队列无 Event 时 incoming Event 被 drop。每个序列断言 queue `<=1024`、无 author mutation 静默丢失、surviving Event 顺序不变、incoming Event 的 retain/drop 与上表一致、最终 Snapshot 等于最新 authoritative state。

### 6.5 Carrier replacement、失败与恢复

保持现有语义：

- `setDataPeer(null)` 清空 carrier-local work/cursor，但保留 Domain 最新 authoritative state。
- 新 peer 建立后发送 Registry + 每个 live Domain 的最新完整 Snapshot。
- send outcome 为 terminal 或 send Promise reject 时，若 epoch/peer 仍 current，则同步设置 `peer = null`、递增 epoch、清空 `inFlight/work/cursors`；不在旧 carrier 上重试 Patch。既有 host Data lifecycle 负责之后提供 fresh peer。
- 新 carrier 不依赖旧 Patch 历史恢复。
- stale epoch completion 不得修改新 peer cursor。
- 将下一条 state work materialize 前若 cursor revision 已为 `Number.MAX_SAFE_INTEGER`：为该 Domain 分配 fresh `wireId`，删除旧 Domain 的全部 pending work和 cursor，丢弃其 pending Event，在 queue 头按 `Registry(latest registry)`、`Snapshot(latest authoritative state)` 顺序插入；Snapshot 使用 revision 1。不得发送跨 identity Patch。若 revision `MAX_SAFE_INTEGER` 的 state message仍在 in-flight，等待其 success 后再执行 rollover；失败则走 peer invalidation。
- close/closeAll 必须清除对应 update work。

`setDataPeer(null)`、peer replacement、send terminal/reject、rollover、Domain close 都先使旧 `inFlight` completion 失效，再清理旧 carrier-local state。completion 只有在 `epoch === peerEpoch && peer === currentPeer && inFlight` 精确匹配时才能提交 cursor；否则无操作。

### 6.6 为什么不用自动 diff `replace()`

自动 diff 看似不增加 author API，但调用者仍需构造完整 state，RenderManager 仍需 detach/validate 完整 tiles，并且 diff 本身会遍历两棵树。它不能消除首帧前的大对象工作，只会增加隐藏成本。因此本方案选择显式、窄范围的 `update()`。

---

## 7. `@loomrealm/data` 与 `@loomrealm/wire`

### 7.1 协议不变

以下已有类型和方向保持不变：

- `RenderNodeUpdateV1`
- `RenderPatchOpV1`
- `RenderPatchV1`
- `SubsystemDataPeer.render.sendPatch()`
- Renderer role 接收 `render.patch`

不修改字段、不提高 hard limits、不增加协议协商。核心功能改动只要求补足 Subsystem sender。

### 7.2 JSON 热路径 follow-up（不属于本计划）

当前完整 Snapshot 在 Wire/Data 中存在重复 representation/schema/depth/stringify 遍历，值得单独优化，但它不阻塞 Map Patch：小 Patch 已测编解码约 0.37ms，而本计划的核心缺口是 Subsystem sender 与 Renderer candidate application仍处理完整大型状态。

后续若单独立项，必须以新的设计/PR冻结安全边界，保持 public API 接受/拒绝集合、严格 JSON representation、inbound 不可信校验和 hard limits 不变；不得从本文件直接获得修改 `@loomrealm/wire` / `@loomrealm/data` 的实施授权。本计划只运行其现有 regression，并记录 Snapshot/refresh 成本供 follow-up 决策使用。

### 7.3 完整 Patch 热路径基准

`Patch encode/decode` 只覆盖 wire payload，不证明 retained large member 已退出 CPU 热路径。PR 2～4 必须分别记录：

```text
RenderDomain.update(camera/player) synchronous commit
RenderManager materialize + Data encode
Data decode + RendererRenderStore.onPatch atomic commit
Web Projector reevaluate + receiveRenderData delivery
Browser receive -> first changed pixel
```

每项同时记录普通 movement 与包含新 `tiles` 的 window-refresh movement。Subsystem/Renderer candidate validation 若仍扫描稳定 tiles，必须在报告中显式列出；达到第 5.6/13.6 节停止阈值时只报告，不在本计划加入 member metadata cache。

---

## 8. `@loomrealm/renderer` Patch 快路径

### 8.1 当前问题

`RenderStore.onPatch()` 当前先执行：

```ts
const roots = current.roots.map(cloneNode);
```

任何只修改少量标量、同时保留大型 JsonValue 成员的 Patch，当前都会深拷贝整个 data subtree，然后应用 op、全树 `validateTree()`、全树 freeze。Map 的 camera/tiles 是当前实测用例，但不能进入通用 Store 契约。协议增量尚未完全转化为接收端工作量增量。

### 8.2 两条实现路径

保留已有通用路径，新增 update-only 快路径：

```text
Patch 仅包含 update ops
  -> immutable copy-on-write fast path

Patch 包含 insert/remove/move
  -> existing mutable isolated candidate path
```

这样不会为了 Map 重写已经 qualification 的结构 Patch 算法。

### 8.3 update-only COW 算法

对 ops 按协议顺序应用：

1. 从当前 frozen roots 开始。
2. 若 `ops.length === 0`，只允许 Patch 含 `zIndex`：复用原 `roots/liveTags/consumedKeys`，创建新 replica wrapper 并提交 revision/zIndex；缺少 zIndex 属于 protocol-fatal。
3. 非空 ops 按顺序找到目标 key；不存在则 protocol-fatal。同一个 Patch 可以多次 update 同一 node，后一个 op 必须读取前一个 op 产生的当前 candidate，不得重新从 committed baseline 读取。
4. 每次 Patch 创建 isolated mutable COW builders：`cloneByOriginal` WeakMap 记录 frozen node/children/attrs/data 到本次 clone，`builderByKey` Map 记录已经命中的 current node builder。它们只活到本次 `onPatch()` 返回，不写入 `DomainReplica`。
5. key 首次命中时从当前 candidate DFS；沿路径对仍 frozen 的 node/children 做浅 clone并登记，已经 clone 的祖先直接复用。attrs/data 只在该容器第一次 touched 时浅 clone；Patch `set` value 必须先 detach/freeze，未修改成员复用。
6. 同 key 后续 op 直接取得 `builderByKey` 中的 mutable isolated builder并原位更新；其他 key 导致共同祖先被访问时必须复用 `cloneByOriginal` 中的 ancestor builder。因此每个目标 node、attrs/data container 和祖先 children 在一次 Patch 内最多复制一次，且后续 op 始终看到此前全部 op 的 candidate。
7. 更新操作不能改变 key/tag/children，DomainIdentity 无需重建；现有 `liveTags`、`consumedKeys` 可原样复用。
8. 每个 op 应用后立即验证该 op 影响的 attrs/data hard limits；即使后续 op 会把候选缩回，也不得接受任何中间超限 candidate。
9. 全部 ops 完成后验证最终 candidate 中 Patch schema 无法覆盖的剩余约束。update-only 不改变 node count、tree depth、key/tag/children 和 one-shot history，因此这些不变量可以由当前 committed state 加 op 类型证明，无需全树重扫。
10. 全部 ops 成功后，只递归 freeze 本次创建的 node builders、children arrays 和 attrs/data objects，并一次性提交 `{revision,zIndex,roots}`；任一失败丢弃 builders，旧 replica 完全不变。

第一版对每个首次出现的 op key 做 DFS 查找，同 key 后续 op 使用本次 Patch 临时 cache。本计划不在 `DomainReplica` 增加长期 key/path index；若首次 key lookup P95 `>2ms`，停止并报告，不能引入 observable store 或 persistent-tree package。

### 8.4 Structural sharing 与 Presentation 语义

COW 后未修改的大型 JsonValue subtree 应保持同一对象 identity，作为 Renderer-private 性能性质，使 structural comparison 可以用 `Object.is` 安全短路。该 identity 不是 Render Update 或 Web Presentation 的 observable contract，不得决定 `receiveRenderData()` 是否调用，也不向第三方 Custom Element 承诺跨 commit identity 稳定。

Web Projector 仍按 Frozen M13 的递归 JSON structural equality 决定 data change，并在变化时把最新完整 committed node.data 交给 `receiveRenderData()`；对象 identity 只能作为结构相等比较的等价快速路径。不新增 presentation patch API，断线重建和最终收敛模型不变。

### 8.5 Store 测试要求

- update-only Patch 结果与现有通用 Patch 语义相同。
- touched node/ancestor identity 改变，untouched roots/subtrees/large data members 在当前实现中保持共享；该断言属于 private performance regression，不进入 Render Update/M13 public conformance。
- set values 与入站 message 完全 detach。
- 连续 update revision 正确。
- invalid target/remove missing/set-remove overlap 等保持 protocol-fatal。
- 多 op Patch 在中间 candidate 超限、最终 candidate 又恢复合法时仍 protocol-fatal；不得只验证最终状态。
- zIndex-only Patch 复用 roots/identity，仅提交 wrapper/revision/zIndex；空 ops 且无 zIndex 仍 protocol-fatal。
- 同一 node 的多个 update op 逐个看到前一 op candidate，且只复制一次 path；顺序结果与现有通用路径一致。
- 失败 Patch 不产生部分 commit 或 presentation exposure。
- insert/remove/move qualification 全部继续通过旧路径。

---

## 9. Map Runtime 集成

### 9.1 Render node 划分保持不变

不为了性能重新设计 Web Component tree。继续使用现有 viewport/map node 和 player node：

- 完整初始状态由 `renderState()` + `replace()` 提交。
- movement hot path 使用 `update()` 更新现有节点的顶层 data 字段。

现有 local `renderState()` 必须改为显式接收要投影的 `LoadedMap`、`TileProjectionWindow`、`x/y/direction` 和 `ActiveMove | null`，不能再从已经提前修改的 `current/window/x/y/activeMove` 隐式取值；它的 viewport `tiles` 固定来自传入 `window.tiles`，不得在内部再次调用 `projectVisibleTiles()`。这只是把现有 projection function 的输入改为显式 candidate facts，不新增 `PreparedProjectionCommit`、transaction object 或 service。

### 9.2 移动更新

成功 `attempt()` 后：

```ts
domain.update({
  nodes: [
    {
      key: VIEWPORT_KEY,
      data: {
        set: {
          cameraX: targetCamera.cameraX,
          cameraY: targetCamera.cameraY,
          cameraMotion,
        },
      },
    },
    {
      key: PLAYER_KEY,
      data: {
        set: {
          x,
          y,
          screenX,
          screenY,
          direction,
          pattern: nextStartPattern,
          motion: playerMotion,
        },
      },
    },
  ],
});
```

standing completion 只 update：

```text
viewport.cameraMotion = null
player.motion = null
player.pattern = 0
最终 camera/player 坐标
```

collision、transfer start/commit/failure、地图装载完成等低频或结构变化路径在本计划内固定继续 `replace()`；不得顺手迁移。所有 `replace()` 都把当前或 candidate `TileProjectionWindow` 显式传给 `renderState()`，因此 full state 不得退回 exact-visible tiles。

### 9.3 Tile projection window

不能在首次 Snapshot 后永远复用当前 exact-visible tiles，否则 camera 连续移动最终会看到空白。Runtime 保存派生缓存：

```ts
interface TileProjectionWindow {
  readonly source: LoadedMap;
  readonly minTileX: number;
  readonly minTileY: number;
  readonly maxTileX: number;
  readonly maxTileY: number;
  readonly tiles: readonly VisibleTile[];
}
```

`source` 直接引用产生该 window 的 frozen `LoadedMap`。每次成功 load/transfer commit 都整体替换 `current`，因此 `window.source === current` 足以证明缓存属于当前 Map/Tileset/ResourceRef 组合；不再创建需要编码规则的 `projectionIdentity` 字符串。ResourceRef 自身继续携带 contentVersion，stale async load 仍由既有 current/transition 检查阻止提交。

Runtime 始终保持一个 projection commit 不变量：`window.minTileX/minTileY/maxTileX/maxTileY/window.tiles` 必须描述当前 committed viewport `data.tiles` 的同一份投影内容；author boundary 会 detach 数据，所以不要求跨边界对象 identity 相同，但二者必须结构相等，且 `window` 声称的 coverage 不得大于 committed tiles 实际覆盖范围。所有 Map Render mutation 只按以下顺序执行：

```text
compute candidate business facts + nextWindow
-> build full state or update from those candidate facts and nextWindow.tiles
-> synchronous createRenderDomain / replace / update
-> only after author call succeeds install current/x/y/direction/activeMove/window
```

不得为这段顺序创建通用 transaction abstraction。使用现有 local variables 和显式参数即可；未涉及的变量保持原值。author call 抛错时，candidate business facts 和 `nextWindow` 都不得成为 current。初始 load 在 `createRenderDomain()` 成功后安装 initial `current/window`；transfer commit 在修改 `current/x/y/direction/window` 前完成 candidate state 的 `replace()`；普通 movement/window refresh 在修改 `x/y/activeMove/window` 前完成 candidate `update()`；standing completion 也先提交清除 motion 的 update，再清除 private `activeMove`。

第一版冻结规则：

- `semantics.ts` 增加不从 `src/index.ts` 导出的 `projectTilesInBounds(map, tileset, bounds)`，其中 `bounds` 精确为 `{minTileX,minTileY,maxTileX,maxTileY}` 的包含端点整数区间。它是唯一 tile traversal；现有 `projectVisibleTiles()` 委托该 helper，Runtime window projection也委托它。不得复制第二份 tile-id/blit/depth 校验循环。
- 对任意 camera `(cx,cy)`，不含 overscan 的 viewport bounds 精确为：`minX=floor(cx/32)`、`maxX=floor((cx+639)/32)`、`minY=floor(cy/32)`、`maxY=floor((cy+479)/32)`，随后 clamp 到 `0..width-1` / `0..height-1`。
- standing 候选 required bounds 等于当前 camera viewport bounds；walking 候选 required bounds 是 source camera 与 target camera viewport bounds 的逐轴 union。对 margin `m`，候选 window 是 `[required.minX-m, required.maxX+m] × [required.minY-m, required.maxY+m]` clamp 到地图边界。`m=1` 精确保持现有 `projectVisibleTiles()` 的 1-tile overscan。
- Map package 第一版固定自己的保守投影预算 `MAX_PROJECTED_DATA_BYTES = 196_608`；它只测量 MapViewRenderData 的 compact JSON UTF-8 大小，不构造 domainId/revision/Render message envelope，也不 import `@loomrealm/data` 或 `@loomrealm/wire`。该值是 Map presentation policy，不重新定义平台 hard limit。
- 候选严格按 margin `4,3,2,1` 顺序构造并选择第一个预算内候选；clamp 后四个候选相同也仍按该顺序得到 `4`。不得根据地图大小或历史刷新耗时改序。
- 预算输入是即将提交的完整 viewport node `data`：`{mapId,mapWidth,mapHeight,cameraX,cameraY,tileset,autotiles,tiles,cameraMotion}`，字段名和插入顺序与 `renderState()` 一致；大小精确计算为 `new TextEncoder().encode(JSON.stringify(candidateData)).byteLength`。不得只测 `tiles`，不得包含 player data、Render node或 message envelope。
- 当前 exact-visible + 既有 `1` tile overscan 是最低合法候选，并必须在 map load/preflight 时验证；不得依赖 author commit 后捕获 `RangeError` 猜测 coverage。
- margin `1` 仍超过 Map-owned budget 时，同步抛 `RangeError("Map projection budget exceeded")`；初始 load 在创建 Domain 前失败，transfer preflight 在替换旧 `current/window` 前失败。错误文本在 Map unit 中精确断言，避免被误分类为 Render protocol failure。
- 每次 movement 在修改 `x/y/activeMove` 之前先计算 source/target required bounds。若 `window.source === current` 且现有 window 完整包含 required bounds 扩张 `1` 后的区间，则复用同一 `tiles` 数组，viewport update 不含 `tiles`；这只保留已经 committed 的 tiles，不改变上述不变量。
- 否则按固定 `4..1` 算法同步重建 window，并在同一个 authoritative `update()` 中设置 `viewport.tiles` 与本次 camera motion；只有 update 成功后才替换 Runtime 的派生 `window` 引用。update 失败保持旧 authority/window。
- 小地图经 clamp 自然得到整图 window，不增加单独策略。最终 author representability 仍由 `RenderDomain.replace/update()` 校验。
- `window.source !== current` 或 transfer candidate 出现时必须构造 nextWindow；transfer `replace()` 成功后才同时安装 target current facts 与 nextWindow。transfer load/preflight/replace 任一步失败都保留旧 current map/window/committed tiles，不得提前把新缓存暴露为 current。
- cache 不是 collision/transfer authority；丢弃后可从当前 map/tileset 重建。

不能只 memoize `projectVisibleTiles()` 的 exact camera bounds：camera 每跨一格仍会得到新 key，无法降低传输频率。

### 9.4 Tile refresh 的延迟控制

大地图 window refresh 可能重新产生较大 Patch。实现只执行第 9.3 节固定 margin 和同步同-commit refresh，不实现提前刷新、动态 margin 或 scene/actor 拆分。分别记录 ordinary 与 refresh movement；若 refresh movement 的 first-motion-paint P95 `> 50ms`，保留正确实现，停止并报告样本和第 7.3 节分段数据，另立 follow-up。不得通过 Event、后台修改 Renderer state 或本计划内的新调度器绕过 authoritative stream。

### 9.5 Runtime 测试

- standing keydown 同步产生一个 player/camera update，而非完整 Snapshot。
- player/camera motion id、duration、from/to 一致。
- continuous held movement 每格只产生必要 update。
- standing、collision、keyup、held priority 与当前语义一致。
- coverage 内移动复用 tiles identity 且 update 不包含 tiles。
- coverage refresh 恰好一次包含新 tiles，前后画面无空白。
- margin 4 到 1 的 Map-owned budget 回退确定，Map Runtime 不读取或复制 Render message envelope limits。
- 相同 mapId 的重新 load/transfer 产生 fresh `LoadedMap` 时 projection window 失效；旧异步结果不能覆盖 current。
- map transfer 清空旧 projection window，先完整 baseline 新地图。
- abort/stale timer 不能提交新 update。

---

## 10. Browser Presentation

### 10.1 第一阶段必要改动

Map-owned `LoomRealmMapView` 和 `LoomRealmMapSprite` 各自增加一个 private active motion record：

```js
// element-private shape，不导出
{ id, fingerprint, startedAt }
```

`receiveRenderData()` 先校验 envelope/scalar/resource/motion；tiles identity 未命中第一个 cache 条件时再完成全部 tile schema 校验和静态准备，命中时复用该 identity 已经验证的事实。随后计算 fingerprint，并按以下状态机原子接受；拒绝时 `_latestData`、active motion、cache、epoch、rAF 和已绘画面全部不变：

| 当前 active motion | 新 motion | 唯一动作 |
|---|---|---|
| `null` | `null` | 保持无 timeline，立即按 authoritative target snap |
| `null` | 非 null id `N` | `{N,fingerprint,performance.now()}`，从 0 开始 |
| id `N` | `null` | 清除 active，取消旧 rAF，立即 snap |
| id `N` | 相同 id、相同 fingerprint | 保留原 `startedAt`，接受最新完整 data，不重启 timeline |
| id `N` | 相同 id、不同 fingerprint | 同步抛 `TypeError`，不改变任何状态 |
| id `N` | 新 id `M` | 用 `{M,newFingerprint,performance.now()}` 替换，从 0 开始 |

MapView fingerprint 是 compact JSON tuple `[id,durationMs,fromCameraX,fromCameraY,targetCameraX,targetCameraY]`；MapSprite fingerprint 是 `[id,durationMs,fromY,fromScreenX,fromScreenY,targetX,targetY,targetScreenX,targetScreenY,direction,pattern]`。不得包含 `tiles`、resource object identity 或接收时间。动画 progress 统一使用 `(performance.now() - active.startedAt) / durationMs`。

每次成功接收递增 element-private `_paintEpoch`，所有 async image completion 和 rAF callback 捕获该 epoch，并在执行前检查 `epoch === this._paintEpoch && requested === this._latestData && this.isConnected`。成功接收先取消旧 rAF，再按新 epoch 调度恰好一条链。`disconnectedCallback()` 的 microtask 确认仍 disconnected 后取消 rAF、递增 epoch 并清除 active motion；下一次 data delivery 从 authoritative target/新 motion 重建，不恢复旧 timeline。

MapView 同时增加以下 private cache，名称固定以便测试定位，但不成为 Web Presentation contract：

```js
this._preparedTilesSource = undefined;
this._preparedTileStatic = undefined;
```

只有 `data.tiles === this._preparedTilesSource` 且 `resourceIdentity(data.tileset)` 与七个 autotile identity 都等于 `_preparedTileStatic` 保存值时，才复用已构建的 depth buckets、used slots 和 unique resource refs；否则完整执行 tile schema traversal与静态准备并原子替换 cache。cache miss 必须产生与无 cache 相同的画面；identity 只是 Renderer-private structural sharing带来的优化机会，不是正确性条件。现有 `ResourceElement._images` 继续按 resource identity 复用 decoded image Promise/result，失败项继续删除。

### 10.2 测量后才实施

以下 backing-canvas/raster 工作不属于本文的可执行范围。PR 4 完成后，按第 13.6 节样本计算 active walking 中 `>33.4ms` frame 比例；若比例 `>=1%`，执行者停止并提交 profile/trace，另立设计，不得直接实施：

- 每个 depth layer 的静态 backing canvas。
- camera-only frame 只更新 layer transform/offset。
- autotile frame index 改变时只重绘受影响 layer。
- sprite raster identity 与 placement 分离。
- sprite identity/direction/pattern 未变时不重设 canvas width/height、不重绘 source frame，只更新位置/z-index。

任何 follow-up 仍禁止建立全局 AnimationManager。本文只授权 MapView 与 MapSprite 各自局部 rAF，并用 motion id 和测试保证起止误差不超过一个 display frame。

---

## 11. Local 构建与 FSDB 一致性

### 11.1 启动流程

新增并固定为 `examples/essentials-v21.1-local/scripts/sync-map-presentation.mjs`。`play.bat` 在设置 Hostra 环境和启动进程之前，每次都调用 `node scripts\sync-map-presentation.mjs`；非零退出立即 `exit /b`，不得因 Desktop entry 已存在而跳过构建/同步。

```text
resolve repo/example/exactly-one FSDB
-> npm run build:m15（cwd = repo root，每次执行）
-> 从 map dist 读取 browser JS/CSS
-> transactional pair replace FSDB 中两个 Presentation 资源
-> 比较 source/dist/FSDB 内容哈希
-> 一致后启动 Hostra
```

脚本只允许更新：

```text
[resource]Presentation/map/map.browser.js.js
[resource]Presentation/map/map.css.css
```

脚本 CLI 精确为无参数同步模式和唯一可选参数 `--check`：无参数执行 build + transactional replace + verify；`--check` 执行 build + verify，发现不一致但不写入。未知参数退出码 `2`；构建、发现、I/O、回滚或 hash 失败退出码 `1`；成功为 `0`。

发现规则精确为 example root 的直接子目录中名称以 `[FSDB]` 开头的目录必须恰好一个；Presentation 根必须是该 FSDB 下恰好一个 literal `[resource]Presentation` 目录，目标固定为上文两个 regular file，拒绝 symlink。输入固定读取 `game-libs/map/dist/browser/map.browser.js` 与 `map.css`。

替换协议固定为：backup 名为每个 target 后追加 `.loomrealm-sync.backup`，staging 名为追加 `.loomrealm-sync.<pid>.<random>.tmp`。启动时若任一 backup 存在，先把每个存在的 backup 恢复到其 target（必要时删除本次中断留下的新 target），未出现 backup 的另一个 target保持不动，然后删除同模式 staging 并重新从 build 开始。在目标同目录写两个 staging file并 fsync/close；读取两个旧目标的 bytes/hash；按 JS、CSS 顺序分别执行“旧 target rename 为固定 backup、staging rename 为 target”。任一步失败都从存在的 backup 恢复原文件并删除 staging；只有两个目标都替换且 SHA-256 分别等于 dist 后才删除两个 backup。进程崩溃无法保证跨两个文件的文件系统原子性，因此不得把“两个 rename”宣称为真正 multi-file atomic transaction。

不得重导入整个 FSDB，不得覆盖 save、map 数据或用户其他资源。失败输出必须包含阶段、repo/example/FSDB/两个 source/两个 target 的绝对路径、期望/实际 SHA-256 和再次运行的精确命令。日志不得输出资源内容。

### 11.2 Source 与 dist 的定义

当前 `game-libs/map/scripts/copy-browser.mjs` 对 JS/CSS 做字节复制，因此同步脚本在 build 后必须验证三方 SHA-256：source = dist = FSDB。若未来 map build 引入转换，必须先更新该 build 脚本契约和本文；当前实现者不得放宽三方相等。

`test/m15-hostra-product.test.mjs` 增加 temp fixture，直接 import 脚本导出的 `syncMapPresentation({repoRoot, exampleRoot, runBuild, checkOnly, fileOps})`：生产省略 `fileOps` 并使用 `node:fs/promises`；测试传只覆盖 `rename` 的 wrapper，在第二个 staging-to-target rename 时抛错，其余方法委托真实 fs。测试传 `runBuild:false`，覆盖唯一 FSDB、成功双文件替换、`--check` 无写入、第二个 rename 故障回滚两文件、symlink拒绝、stale backup 恢复、hash mismatch 非零。该 function 只从此 `.mjs` 导出，不进入 package surface。CLI 入口只在 `import.meta.url === pathToFileURL(process.argv[1]).href` 时运行；生产调用固定传 `runBuild:true`。

---

## 12. 文件改动清单

### 12.1 核心必改

```text
doc/decisions/0035-render-domain-existing-node-update.md
doc/decisions/README.md
README.md                                              # Current milestone projection；PR 0 记录已接受演进，最终 closure 同步状态
doc/10-architecture/subsystem-model.md                 # exact RenderDomain author surface
doc/30-implementation/README.md                        # milestone navigation/status projection
doc/30-implementation/phase-1-delivery-plan.md         # overall M11/M14/M15 status and next-milestone ledger
M11_01_SUBSYSTEM_RENDER_MANAGER.md
M11_02_RENDER_PUBLICATION.md
M11_05_QUALIFICATION_CLOSURE.md
packages/subsystem/DESIGN.md
packages/subsystem/IMPLEMENTATION-REVIEW.md
doc/30-implementation/m11-qualification.md
doc/30-implementation/m11-final-closure-review.md

packages/subsystem/src/render.ts
packages/subsystem/src/index.ts                         # 只新增 RenderDomainUpdate root type
packages/subsystem/src/internal/render-manager.ts
packages/subsystem/test/render-manager.test.mjs
packages/subsystem/test/author.test.mjs

packages/renderer/src/internal/render-store.ts
packages/renderer/test/render-store.test.mjs

test/render-update-v1/evidence-patch.mjs
test/render-update-v1/qualification.test.mjs            # 仅补 sender/receiver vertical evidence
test/m11-boundary.test.mjs                              # 冻结新的最小 author surface
```

`packages/data/src/model.ts`、`render-codec.ts`、`peers.ts` 不修改；它们已有所需协议。其测试若失败，先确认本计划改动是否违反现有契约；无法在已授权模块修复时停止并报告，不在本 PR 扩大 Data/Wire 范围。

`doc/10-architecture/rendering-system.md` 的 authority layering、M13 Web Presentation contract、`M13_03_WEB_PROJECTOR.md` 和 M13 qualification contract 只运行/人工核对回归，不修改语义。Renderer structural sharing 不得被传播为 M13 object-identity contract；若核对发现文字仍准确则不制造无信息改动，若回归揭示与本改动无关的既有 structural-equality 缺陷，停止并另报，不混入本计划。

### 12.2 Map 与产品

```text
M14_02_MAP_GAME_LIBRARY.md
M14_04_REAL_GAME_VERTICAL.md
M14_05_QUALIFICATION_CLOSURE.md
doc/20-modules/loom-map/README.md
doc/30-implementation/m14-qualification.md
doc/30-implementation/m15-qualification.md             # 新 implementation subject 与 frozen-Hostra evidence ledger

game-libs/map/src/runtime.ts
game-libs/map/src/semantics.ts
game-libs/map/test/runtime.test.mjs
game-libs/map/test/semantics.test.mjs
game-libs/map/browser/map.browser.js
apps/desktop/src/renderer-input-source.ts              # 仅 qualification-only optional Window hook
test/map-layering-browser.test.mjs

examples/essentials-v21.1-local/play.bat
examples/essentials-v21.1-local/scripts/sync-map-presentation.mjs
test/m15-hostra-product.test.mjs                       # 直接扩展既有 canonical Hostra/CDP vertical，含 latency qualification
```

`M15_05_QUALIFICATION_CLOSURE.md`、ADR 0034 与 `M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md` 的 physical closure contract 保持不变；本计划复用它们并更新 live evidence ledger，不以性能测试为由重开 M15 physical design。不得借本改造修改 collision、transfer 数据格式、save schema 或 FSDB archive 格式。

### 12.3 范围控制

本计划不是单个大 PR。Core sender、Renderer COW、Map/window、Browser timeline 和 local 产物同步必须保持独立提交边界。任一阶段未满足自己的 correctness gate 时，不得靠同时修改下一层来掩盖问题。

`packages/data` / `packages/wire` 的 Frozen schema、model、peer、codec 和 representation semantics 必须保持不变；JSON 热路径 follow-up 不得借本计划混入。Backing canvas/sprite raster PR 不属于 Core Complete 或 Map Complete 的前置条件。

---

## 13. 测试与 qualification 矩阵

### 13.1 Subsystem unit

- create/replace 行为完全兼容。
- update existing node attrs/data/zIndex 成功。
- 空 update、重复 target、missing target、closed Domain、非法 JSON、超限全部 local-atomic fail。
- optional member 缺失与显式 `undefined` 逐层区分；unknown/accessor/symbol/prototype/sparse array 均按第 5.3 节拒绝。
- nodes 顺序一对一映射 wire update ops；zIndex-only 形成 `ops: []` Patch；4096/4097 ops 和最坏 message probe 边界精确覆盖。
- 调用后修改原 delta/value 不影响 authoritative state。
- 未修改的大型 JsonValue/reference 在内部 COW state 中保持共享；该断言是 private performance regression，不是 public identity contract。
- baseline 前 update 形成 latest Snapshot。
- baseline 后 update 形成 revision 连续 Patch。
- in-flight baseline 期间 update 不产生 invalid baseRevision。
- in-flight 必须能区分 Domain 和 message kind；stale completion 不改变新 peer/cursor。
- Event barrier 前后不错误合并。
- baseline 缺少成员时的 `set -> remove` 保持有序 ops 或收敛为 Snapshot，不得错误归一化为单独 remove。
- pending queue 满时 authoritative state 最终仍收敛，不得静默丢失 update；incoming Event 的 oldest-event replacement / no-event drop 两个分支精确断言。
- 第 6.4 节列出的容量序列和第 6.3 节 transition table 每一行都有独立断言。
- carrier lost/replacement 只以最新 Snapshot 恢复。
- revision exhaustion 仍 rollover。
- close/closeAll 清理 update work。

### 13.2 Data/Wire regression

- 现有 Render Update v1 fixtures 全量通过。
- Snapshot/Patch 接受/拒绝集合不变。
- role direction 不变。
- hard limits 边界值不变。
- accessor、prototype、cycle、sparse array、invalid Unicode 等 adversarial cases 不变。
- 记录 Snapshot/Patch encode/decode benchmark，但 benchmark 不使用不稳定 wall-clock 断言污染普通 unit tests；CI qualification 使用专用稳定机器或宽松回归阈值。

### 13.3 Renderer unit

- update-only 快路径与通用路径结果等价。
- untouched large JsonValue subtree 在当前实现中保持共享，同时 M13 structural data-change 语义不变。
- Patch 原子失败。
- 每个 op 后的中间 candidate hard limits 都被验证；“中间超限、最终缩回”仍 protocol-fatal。
- zIndex-only Patch 只更换 replica wrapper；同一 node 多 update op 顺序读取当前 candidate 且只复制一次 path。
- revision gap/base mismatch 仍 protocol-fatal。
- structural ops 全部现有 qualification 通过。
- presentation facts 只在完整 commit 后可见。

### 13.4 Map unit/browser

- motion state correctness。
- tile window coverage、refresh、invalidation。
- 初始 load、collision、transfer start/commit/failure、ordinary movement、window refresh 和 standing completion 逐项断言：committed viewport tiles 与 current window 投影内容一致，window coverage 不超过 committed tiles；author call 故障注入后 candidate current/position/motion/window 均未安装。
- window 的 Map-owned projection budget/margin 回退和 fresh LoadedMap invalidation。
- viewport/source-target union/margin/clamp 公式按边界整数逐项测试，projected item 类型保持 `VisibleTile`。
- motion 状态表六行分别测试；same-id/same-fingerprint 不重启，same-id/different-fingerprint 原子拒绝，disconnect/async/rAF stale callback 均被 epoch fence。
- tiles cache identity hit 跳过静态重建，任一 identity miss 完整重建且与无 cache 画面相同。
- intermediate pixel、pattern boundary、final snap。
- collision/transfer/layering/autotile/stale-resource regression。

### 13.5 Full E2E

完整延迟资格测试不创建第二个 test game、manifest、Runtime entry、Desktop launcher 或 browser entry，也不新建 `test/render-movement-latency.test.mjs`。直接在既有 `test/m15-hostra-product.test.mjs` 中增加测试，复用该文件现有 `launchHostra()`、Hostra RPC、Playwright `chromium.connectOverCDP()`、窗口发现和 cleanup 路径；不得复制一份直接 Electron/minimal host harness。

`128 x 8` 地图只是 canonical product vertical 的 test-owned Content variant。测试用 `node:fs/promises.cp(source, temporaryInstallation, {recursive:true})` 复制既有 prepared `examples/essentials-v21.1` installation，只改临时唯一 `[FSDB]`，保持同一 `game.json`、`launch.hostra.json`、Subsystem Runtime module、Map browser module 与 `presentation.json`。fixture 规则固定为：新增 `[struct]Map/900001.json`，其 object 字段精确为 `tileset_id=1`、`width=128`、`height=8`、`data.dimensions=3`、`data.xSize=128`、`data.ySize=8`、`data.zSize=3`；`data.values` 精确由 `Array(1024).fill(384)` 后接 `Array(2048).fill(0)` 组成，共 3072 项。创建 `[struct]MapTransfer` 时同时写入与现有 struct group 相同内容 `{}` 的 `.info.meta`，新增 `900001.json` 为 `{id:900001,steps:[],contacts:[],edges:[]}`，并把临时 `1.json` 固定为 `{id:1,steps:[],contacts:[{x:10,y:8,direction:8,targetMapId:900001,targetX:8,targetY:4,targetDirection:6}],edges:[]}`。测试从未修改的 manifest 出生点先发送一次真实 `ArrowUp` 进入该 Map，等待 projected `mapId===900001` 后才 warmup/采样。

临时 installation 的 absolute path 只通过现有 `LOOMREALM_DESKTOP_INSTALLATION_ROOT` seam 传给同一个 `apps/desktop/dist/main-entry.js`。不得修改或提交第三方 source corpus，不得从测试直接调用 Main、Map Runtime、RenderStore、Web Component 或注入 business state。qualification hook 只观察时间点；输入仍由 Hostra-owned Window 的真实 DOM keyboard path 产生。若 checked-in fixture 的 Map 1 出生点、Tileset 1 或 tile 384 不再满足上述已冻结前提，测试必须明确失败并要求维护者重新评审 fixture，不得自动搜索替代坐标/tile 或修改 manifest。

真实 `[FSDB]Essentials v21.1` 精确覆盖：

1. Map066 出生点向右、向下的 warm 首动延迟。
2. 在可四向通行区域分别测试上下左右。
3. 使用上述 qualification-only 可循环、无 collision/transfer 的 `128 x 8` Content record，出生点 `(8,4)`，向右 100 格；地图 tile/tileset 固定使用 fixture 中可通过的同一普通 tile，记录每格间隔和完整 Snapshot 数量。真实 Map066 不承担 100 格路径可达性。
4. 横纵急转、两键重叠、短 tap、keyup。
5. Map066 -> Map067、Map066 -> Map002 transfer。
6. projection window refresh 边界。
7. 多帧 autotile 与 player/camera 同时运动。
8. 窗口失焦/恢复、carrier replacement、重连和关闭。
9. source/dist mismatch 必须阻止启动；FSDB-only mismatch 由无参数同步模式修复，修复后仍 mismatch 必须阻止启动；`--check` 对任一 mismatch 非零且不写入。
10. sync script 的成功、check-only、symlink、第二文件替换失败双回滚和 stale backup recovery 全部通过 temp fixture。

时间线逐项记录：

```text
input-captured
runtime-input-received
runtime-render-committed
data-message-encoded(type/bytes)
renderer-message-decoded
renderer-store-committed
presentation-received
browser-first-motion-paint
browser-motion-complete
```

分段报告还必须给出 `RenderDomain.update()`、RenderManager materialize/encode、decode/Store commit、Web Projector delivery 的 P50/P95/max，并分别标注 ordinary movement 与 tile-window refresh。只报告 codec 的小 Patch 时间不能作为 Core 性能结论。

生产构建不得默认输出逐帧日志；使用 qualification-only hook 或显式测试开关。

### 13.6 性能采样协议

性能资格测试固定使用 release build、窗口 `640 x 480`、device scale factor `1`、窗口可见且聚焦、关闭 DevTools。报告记录 commit、OS、Node/Electron/Chromium、CPU/GPU、显示刷新率和是否硬件加速；缺任一项则样本无效。

每个场景先执行 20 次合法移动 warmup，不计入统计；随后顺序执行 100 次合法移动，ordinary 与 window-refresh 分组分别统计。若 refresh 不足 30 个样本，重复可循环地图直到 refresh 样本达到 30，ordinary 仍只取前 100 个。任何 collision、transfer、失焦、resource decode、carrier replacement 或测试 hook 丢失的样本标记 invalid，不得混入；invalid 超过总尝试的 5% 时整轮失败并报告。

统计算法固定为 nearest-rank：升序排列 `N` 个值，P50 取下标 `ceil(0.50*N)-1`，P95 取 `ceil(0.95*N)-1`，max 取最后一项；单位 ms，原始样本随报告提交。端到端 gate 的 `input-captured` 与 `browser-first-motion-paint` 都在 Desktop Renderer 的同一个 Window realm，用该 realm 的 `performance.now()` 相减。各 package 分段只用各自进程的 monotonic clock计算本段 duration；不得把不同进程的裸 `performance.now()` 相减。跨进程 absolute timestamp只作诊断，统一记录 `performance.timeOrigin + performance.now()`。不得删除合法 outlier，不得取多轮最佳值。执行三轮，gate 使用三轮合并后的样本；任一轮环境失效则重跑整轮。

`input-captured` 是非 repeat direction keydown handler 的首条语句；`browser-first-motion-paint` 是 MapView 或 MapSprite 第一次计算出区别于上一 committed painted position 的 camera/screen position，并已经执行对应 canvas draw/position style write 后的 qualification hook。两者差值是本文的 logical first changed pixel；它不声称等于物理 vsync。另用 Playwright 对 keydown 前截图与后续每个 `requestAnimationFrame` 后截图做像素差，首个非零 diff 必须在 logical hook 后一个 display frame 内，否则该样本失败。

qualification hook 固定为 Window 上不导出的可选 function `__loomrealmMovementQualification(record)`；测试在发送 keydown 前通过页面 evaluate 安装，生产默认不存在。record 精确为 `{name, at, detail}`，其中 `at = performance.now()`，`detail` 对 input 为 `{code}`，对 paint 为 `{element:"map-view"|"map-sprite",motionId,visualX,visualY}`。`renderer-input-source.ts` 和 `map.browser.js` 每次调用都先读取 function、确认 `typeof === "function"` 并在 `try/catch` 中调用；hook 抛错不得改变产品行为。测试用 `at` 只比较同 Window records，并在每个样本后清空 collector。

frame duration 使用相邻 Map-owned animation rAF callback 的 monotonic timestamp 差；只统计 active walking progress `(0,1)` 的区间。`>33.4ms` 比例的分母是这些区间内全部相邻 frame；零 frame 或 hook timeout 视为场景失败。每次等待 first paint timeout 固定 `1_000ms`，motion complete timeout 固定 `2_000ms`；超时保留为失败样本，不得丢弃。

分段 timer 的起止点固定为：

| 名称 | 起点 | 终点 |
|---|---|---|
| author commit | 进入 `RenderDomain.update()` | local state 与 work 原子提交完成 |
| materialize/encode | `pump()` 选中 work | `sendPatch()` 返回 Promise 之前的同步 encode 完成 hook |
| decode/store | Data 收到 raw text | `RenderStore.onPatch()` atomic commit 完成 |
| projector delivery | Store commit | 对变化 node 的 `receiveRenderData()` 返回 |
| browser first motion | `receiveRenderData()` 接受 data | 首个 `browser-first-motion-paint` hook |

普通 movement 额外冻结：message compact JSON UTF-8 `<=1024` bytes、Patch encode P95 `<=2ms`、decode P95 `<=2ms`、author commit P95 `<=5ms`。任何 gate 未达标都停止并报告对应 raw samples/profile；不得自行启用第 5.6 节 metadata cache或第 10.2 节 raster follow-up。

---

## 14. 实施与提交顺序

### PR 0：设计治理闭环

> 状态：Complete — governance baseline `59fcd6fb3d4e6e70943780d994d750ac4f26a34e`；执行 agent 不重复本阶段。

```text
docs(render): reopen and freeze existing-node author update capability
docs(subsystem): update M11 author surface and qualification closure
```

创建 `doc/decisions/0035-render-domain-existing-node-update.md`，其 status 先为 `Proposed`，内容逐项引用本文第 5、6、8 节，不重新选择 API。维护者按 ADR 0004 审核并把 status 改为 `Accepted` 后，在 M11 design/publication/closure 文档中冻结 target contract；`subsystem-model.md`、root/implementation README、phase plan 和 qualification ledger 在 PR 0 只增加“旧 executable subject 仍 Closed、Accepted evolution 尚未实现/资格化”的显式 notice，不得提前把 Current implementation code block 改成已经存在 `update()`。PR 2 实现进入 Current 分支时，才同步 exact Current interface 并把 M11 标记为 `Requalification Pending`。这一 commit 合并才算 PR 0 完成。执行 agent 不得自行把未评审 ADR 标为 Accepted。PR 0 完成前不得开始或合并 PR 2；PR 1 可独立准备，但一旦把新 fixture/harness qualification input 合并到 Current 分支，就必须按第 1.3 节把 M14/M15 ledger 标记为 `Requalification Pending`。

### PR 1：可复现基线和产物一致性

```text
test(map): add real movement latency/message-size trace
build(example): synchronize map dist and FSDB presentation
```

不改变移动行为。冻结 baseline、哈希检查和测量方法。完整 E2E 直接扩展 `test/m15-hostra-product.test.mjs` 的现有 Hostra/CDP vertical，并通过临时 installation Content variant 驱动 128 x 8 地图；不得创建第二个测试入口或 physical path。

### PR 2：Subsystem author update + Patch publication

```text
feat(subsystem): add existing-node render domain updates
feat(subsystem): publish retained updates as RenderPatchV1
test(render): qualify update baseline/revision/recovery semantics
```

不改 Map，不改 Renderer 快路径。用现有 Renderer 通用 Patch 路径先证明功能契约。若本 PR 进入 Current 分支，M11 ledger 同 commit 标记新 subject `Requalification Pending`，不得继续引用旧实现的无条件 Closed。

### PR 3：Renderer update-only COW

```text
perf(renderer): apply update-only render patches with copy-on-write
```

保持结构 Patch 旧路径和所有 qualification；update-only 路径增加每个 op 后的 candidate-limit validation，不得只验证最终状态。

### PR 4：Map 迁移

```text
perf(map): publish player and camera movement as retained updates
perf(map): retain a bounded tile projection window
fix(map-browser): preserve motion timeline across same-id delivery
```

本 PR 后冻结最后一个 executable/qualification-input commit 为 subject `S`，运行第 13.6、17、18 节全部 gate；未达到时按冻结的停止/报告规则处理。任何修复若改变 executable behavior 或 qualification input，都产生新的 `S` 并使此前对旧 SHA 的样本失效。

### Final Closure：同一 subject 重新定版

PR 4 后不再增加产品实现。按第 1.3 节顺序在同一个 `S` 上取得 M11、M13 regression、M14 和 M15 evidence；先在 `m14-qualification.md` formally close M14，再在 `m15-qualification.md` formally close M15。随后只用 docs-only commit 更新 M11/M14/M15 Current 文档、root/implementation README、phase plan 和本文件完成状态；该 evidence commit 不改变 `S`。任一资格失败只允许回到对应 PR 的已授权模块修复；修复后重新选取 `S` 并重跑全部下游 evidence，不得局部沿用旧 SHA 的 PASS。

### 非本计划 PR：Browser raster follow-up

本文不创建该 PR。只有 PR 0～4 完成且第 10.2 节数值条件触发后，由维护者另立设计；本执行 agent 在报告处停止：

```text
perf(map-browser): cache static tile backing layers
perf(map-browser): separate sprite raster and placement
```

---

## 15. 风险、回滚与兼容性

### 15.1 公共 API 风险

`RenderDomain.update()` 对只消费 SDK-minted handle 的现有业务保持运行时兼容，且 `replace/emit/close` 不变；但给 TypeScript `RenderDomain` 增加必需方法会使结构化实现该 interface 的 mock/test double 产生源码不兼容。它改变了已经冻结的 exact M11 author surface，必须先由 Accepted ADR 按 Frozen preimplementation correction 正式重开，并同步更新 M11 文档、Subsystem DESIGN、qualification closure 和 package boundary。alpha 状态不能替代治理流程。它不改变 Render Update wire schema，因此不新增协议版本，但仍必须明确 release note。

回滚 Map 使用 update 时，只需恢复为 `replace(renderState())`；核心 API 可以保留，不影响旧作者。

### 15.2 Patch 连续性风险

最高风险是 baseline in-flight、队列合并和 send failure 导致 baseRevision 错误。缓解方式：revision 只在 materialize/send-success 边界由 RenderManager cursor 产生；任何新 carrier 都用 Snapshot，不跨 carrier 重放 Patch。

### 15.3 原子性风险

Subsystem 和 Renderer 的 COW 都必须先构建隔离候选，再一次提交引用。禁止边验证边修改 live state。Renderer 必须在每个 op 后验证受影响 candidate hard limits，并在最终统一提交；故障注入测试需在每类 op/limit 失败后比较完整旧快照。

### 15.4 身份复用风险

结构共享只能复用已经 frozen、已经 committed 的内部值。不得复用 caller-owned 或 inbound message-owned mutable value。所有 delta `set` 值都必须 detach/freeze 后才能进入 live state。

### 15.5 JSON follow-up 越界风险

本计划不授权通用 JSON 实现修改。若 profile 证明仍需优化，必须另立设计与 PR；任何 adversarial regression 或接受集合变化都阻止合并，不能用本计划的性能目标为降低校验辩护。

### 15.6 Tile window 风险

coverage 计算错误或 full `replace()` 重新投影较小 tiles、却保留较大 private window，都会产生画面边缘空白。所有路径必须满足第 9.3 节 projection commit 不变量，并用基于 tile bounds 的确定性测试覆盖 camera source、target、overscan、边界裁剪、collision 和 transfer；不要用截图肉眼代替 coverage/committed-content 断言。

---

## 16. 明确拒绝的多余抽象

本轮不增加：

- 自动通用 Render tree diff engine；
- 第二套 Patch schema；
- author-visible revision/cursor/session；
- RenderStore public observable/subscription；
- persistent collection package；
- scene state service；
- motion protocol v2；
- reliable RenderEvent animation queue；
- client prediction/reconciliation；
- 全局 animation scheduler/GameLoop；
- `ChangeSubject` production model 或 milestone workflow engine；
- `PreparedProjectionCommit` / generic projection transaction；
- generic `WorkAdmissionQueue`、admission result enum 或 scheduler；
- `QualificationScenario` framework、第二套 game/manifest/Runtime/browser entry；
- 为两三个 map node 建立长期 path index；
- 每个 JSON member 的字节/深度 metadata cache（本计划无论 profile 结果都不实施，触发阈值后停止并另立设计）。

允许新增的 public abstraction 只有 `RenderDomain.update()` 及其唯一命名输入类型 `RenderDomainUpdate`；它们组成 existing-node + Domain-level authoritative delta 的一个最小 author 能力。`inFlight` 只是 RenderManager private nullable record，`TileProjectionWindow` 只是 Map-private 派生缓存；现有 `renderState` 只增加显式 candidate 参数，现有 M15 product test 只增加 Content variant 和观测。以上均不得提升为 service、framework 或 package surface。

---

## 17. 必须执行的命令

PR 2、PR 3 的每个 code commit 逐条执行：

```bash
npm test -w @loomrealm/wire
npm test -w @loomrealm/data
npm test -w @loomrealm/subsystem
npm test -w @loomrealm/renderer
npm run test:m11:qualification:run
node --test test/m11-boundary.test.mjs
npm run test:m13:qualification:run
```

PR 4 的每个 code commit 除上述命令外逐条执行：

```bash
npm test -w @loomrealm-game/map
node --test test/map-layering-browser.test.mjs
npm run test:m15:desktop
npm run test:m15:hostra
```

PR 0 执行 `npm run docs:check-links`；PR 1 执行 `npm run build:m15`、`node --test test/m15-hostra-product.test.mjs` 和同步脚本 `--check`。最终 subject `S` 固定逐条执行 `npm run test:m11`、`npm run test:m13`、`npm run test:m14`、`npm run test:m15`；M11 hosted Node 20/24、M14 hosted Node 20/24 和 M15 hosted frozen-Hostra evidence 必须全部指向同一 `S`。任一命令非零都阻止对应 PR/closure 完成；不得用“与本改动无关”直接跳过，无法在授权范围内修复时按第 1.2 节停止并报告。性能报告和功能测试结果都必须保留；功能绿色但性能未达标不能宣布问题关闭。

---

## 18. 完成定义

### Core Complete

- existing-node author update ADR 已 Accepted，M11 author-surface/Subsystem DESIGN/qualification closure 已同步。
- `RenderDomain.update()` public contract、错误、detach、atomicity 已冻结并测试。
- Subsystem steady-state update 使用现有 `RenderPatchV1`。
- baseline/in-flight/reconnect/failure/rollover/Event barrier 全部 qualification。
- 满队列 incoming Event 和 authoritative work 共用第 6.4 节完整准入语义，没有未定义 drop 分支。
- Renderer update-only Patch 不再深拷贝整个 Render tree，未修改大型 JsonValue 在当前实现中保持 private structural sharing；public presentation 仍只承诺结构语义。
- Renderer 对每个 Patch op 后的 candidate limits 均进行等价验证，中间超限不能被后续 op 掩盖。
- Render Update v1 wire schema、direction 和 hard limits 未改变。
- 完整 Patch 热路径分段数据已记录，不能只以 codec benchmark 代替。

### Map Complete

- M14 Current 文档已从“只使用完整 replace”更新为“复用通用 author update，但不定义 Map-specific delta protocol”。
- 正常移动不调用完整 `replace(renderState())`，不发送完整 Snapshot。
- 普通 movement message `<= 1KiB`。
- tiles 在 coverage 内不重新投影、不重新传输。
- window 使用 frozen bounds、Map-owned budget 和 margin 回退规则，并在 fresh `LoadedMap` commit 时可靠失效。
- 初始 load、full replace、movement update、standing completion 和 transfer 全部满足 current/window/committed tiles 的 projection commit 不变量；失败 candidate 不污染 current private state。
- window refresh、换图和重连仍完整正确。
- collision、transfer、held precedence、keyup、layering、autotile 和最终坐标无回归。

### Product Closed

- local launcher 不再允许 source/dist/FSDB 漂移。
- qualification 环境 warm keydown -> logical first changed pixel P95 `<= 50ms`，且截图 pixel diff 在其后一个 display frame 内出现。
- 正常本地运行存在连续中间像素，完整跳格为 0。
- 100 格连续移动无非预期完整 Snapshot，Patch revision 连续。
- 报告明确区分 cold resource cost、ordinary movement 和 tile-window refresh cost。
- latency qualification 通过既有 M15 Hostra/CDP product test 和临时 Content installation 完成，没有第二个 game/manifest/Runtime/browser path，也没有业务状态注入。

### Governance Closed

- ADR 0035 已 Accepted，ADR 0004/0032 reopen rationale、M11 correction boundary 与 M15 physical-design non-reopen 已记录。
- M11 local/hosted Node 20/24 qualification、M13 regression、M14 exact-local/hosted Node 20/24 和 M15 frozen-Hostra evidence 全部指向同一 subject `S`。
- M14 先 formally Closed，M15 后 formally Closed；M11/M14/M15 qualification ledger 不再引用旧 subject 证明新实现。
- `README.md`、`subsystem-model.md`、implementation README、phase plan、M11/M14 Current 文档与 M15 evidence ledger 已同步，没有同时存在的冲突 Current 事实。
- 最终 evidence/status 更新是 docs-only descendant，不改变 `S`；维护者在本文件记录 `Freeze Gate：Passed` 的 specification commit 和最终 capability evolution closure 的 subject `S`，执行 agent 不自行修改本规范。

只有 Core Complete、Map Complete、Product Closed 和 Governance Closed 同时满足，才能把本问题标记为完成。

---

## 19. Implementation Freeze Gate

本节是交给低判断力 agent 前的机械检查表。PR 0 合并前由维护者填写；除“外部治理状态”外，任何未满足项都表示本文需要继续修订，而不是让执行者临场决定。

### 19.1 文档静态 gate

- [x] 本文件已纳入版本控制，不再是 untracked worktree 文件；PR 0 governance baseline 为 `59fcd6fb3d4e6e70943780d994d750ac4f26a34e`。
- [x] `doc/decisions/0035-render-domain-existing-node-update.md` 已由维护者标记 `Accepted`，ADR README 已链接。
- [x] M11 author/publication 文档、Subsystem DESIGN/IMPLEMENTATION-REVIEW 和 M11 closure contract 已冻结新的 target surface；`subsystem-model.md`、M11 qualification ledger 与全局计划导航已加入 Accepted-but-not-implemented notice，没有提前声称 Current code 已有 `update()`，并明确区分旧 executable subject 的历史 Closed 与新演进尚未 Qualified。M14/M15 Current/evidence 文档随最终 subject 实现同步，不是 PR 2 前置 gate。
- [x] 文档中不存在 angle-bracket placeholder、待办/待定标记、未定文件名或需要实现者判断的主观规范性分支；TypeScript generic syntax 不计为 placeholder。
- [x] 第 12 节既有文件路径存在；新增文件的父目录存在。
- [x] Markdown code fence 为偶数且全部闭合，`npm run docs:check-links` 通过。

### 19.2 契约 gate

- [x] `zIndex` 保留，zIndex-only update 的 author、wire、Renderer 行为一致。
- [x] optional own-property、显式 `undefined`、closed shape、错误 class 和 local atomicity 已冻结。
- [x] author update 到 Patch 的 op 顺序、数量、字段 presence、4096 上限和最坏 message probe 已冻结。
- [x] no-peer/baseline queued/in-flight/baselined/Event/revision max/send failure/close 的 transition 无空白分支。
- [x] queue-full 对 incoming Event 与 authoritative work 都只有第 6.4 节一个完整算法，不存在未定 drop、静默丢失 authoritative work 或 Patch algebra normalization。
- [x] Renderer zIndex-only、同 node 多 op、逐 op limit validation、commit atomicity 已冻结。
- [x] Map viewport/union/margin/clamp、budget 输入、fallback 顺序、failure timing、projection commit 不变量与 `VisibleTile` 类型已冻结。
- [x] Browser fingerprint、same-id collision、startedAt、epoch/rAF/disconnect 和 cache invalidation 已冻结。
- [x] sync 脚本名、CLI、发现规则、双文件 rollback、hash、exit code 和 fixture 已冻结。
- [x] 性能 warmup/sample/statistic/timeout/first-paint/100-step fixture 已冻结，且 fixture 只通过既有 M15 Hostra/CDP vertical 的临时 Content installation 进入产品链路。

### 19.3 范围与执行 gate

- [x] Data/Wire schema/codec/model 明确只回归，不在改动范围。
- [x] M13 public equality/receive semantics 不变；Renderer identity sharing 仅为 private regression。
- [x] Core 没有 camera/tiles/motion/FSDB 名词进入 public contract；Map 不构造 wire envelope或管理 revision。
- [x] 第 10.2 节和 JSON/member-index 优化都是 stop-and-report follow-up，不是隐含实施项。
- [x] 统一 subject `S`、M11 -> M14 -> M15 closure 顺序、全局 Current 传播与 docs-only evidence 规则已冻结。
- [x] 未引入 `PreparedProjectionCommit`、generic work-admission 或 qualification-scenario framework；测试没有第二个 game/manifest/Runtime/browser path。
- [x] PR 0～4 每一阶段都有独立测试命令、完成条件和失败停止点。
- [x] 实施 agent 被明确告知不得自行更改本文；发现矛盾时停止并报告文档行号。

全部 checkbox 已由维护者基于 header 所列 PR 0 governance baseline确认；本次只写入 gate evidence/status 的 docs-only descendant不改变该 normative baseline。此后任何修改本规范 normative content 的 commit 都使 Freeze Gate失效，必须重新完成静态/治理复核并记录新的 baseline SHA；未修改本规范的 PR 1～4 实现不改变 specification baseline。执行 agent从 PR 1开始，发现规范矛盾时停止并报告，不自行改写本文件。
