# 地图跳转设计草案

> 状态：Draft  
> 目录：`examples/essentials-v21.1-local`  
> 需求来源：`MAP_BEHAVIOR_REQUIREMENTS.md` 第 3 节  
> 前置能力：地图遮挡与人物行走动画已完成并进入 `main`。

本文只设计最后一项地图行为：玩家通过原版 Essentials v21.1 已有的门、楼梯、洞口或地图边缘出口，从当前地图进入目标地图，并能按原版出口关系返回。

本文当前不是实施冻结合同。涉及真实 v21.1 出口形态、事件命令子集、`map_connections` 坐标换算及最终 fixture 的部分，必须在 Freeze Gate 中用真实素材闭合后才能标记 `Frozen for implementation`。

---

## 1. 目标与非目标

### 1.1 本刀必须解决

- 游戏运行中从当前地图进入另一张地图，不修改启动参数、不重启 Frame。
- 普通地图事件中的静态地图传送能投影为 Runtime 可直接消费的事实。
- `map_connections` 表达的地图边缘连接能投影为 Runtime 可直接消费的事实。
- 普通格内出口在玩家完成一步、真正到达出口格后触发。
- 地图边缘出口在玩家尝试从边界向连接地图继续移动时触发。
- 成功跳转后，目标地图、目标格、朝向、camera、遮挡与后续 walking 都继续使用现有规则。
- 目标地图、目标格、tileset/resource 缺失或非法时显式失败，不能进入空白或半切换状态。
- 原版可逆出口必须能 A → B → A。

### 1.2 明确不做

本刀不实现完整 RMXP/Event Interpreter，也不实现：

- 条件分支、变量目标、脚本计算出来的传送位置；
- 通用事件页选择器；
- Common Event / Script Command 执行；
- 开门动画、淡入淡出、黑屏 transition；
- connected-map 无缝同屏滚动；
- NPC、对话、战斗、菜单；
- 通用 `SceneManager`、`WorldManager`、`MapRouter`、`TransitionService`；
- 为地图跳转修改 framework Runtime/Renderer 合同。

若真实验收出口依赖上述能力之一，Freeze 前必须明确扩大范围，不能由 implementation agent 临场补 Event Interpreter。

---

## 2. 当前实现与真正缺口

当前 `@loomrealm-game/map` 已经拥有：

- 当前地图整数格坐标 `x/y` authority；
- passability；
- 250ms/tile walking；
- held input 与方向优先级；
- Browser rAF presentation；
- camera interpolation；
- moving layering；
- latest-state Render projection 与 stale async 收敛。

但当前 map frame 在 activation 时只加载一次：

```text
struct.Map/<initial mapId>
struct.Tileset/<map.tileset_id>
Tilesets/<tileset_name>
```

并且当前 `struct.Map` consumer record 只有：

```ts
{
  tileset_id,
  width,
  height,
  data,
}
```

`RPG::Map.events` 没有进入这个 consumer record。因此地图跳转不能只在 `runtime.ts` 中“识别门”；必须先在 Importer/compatibility 边界把原版出口事实归一化。

关键原则：**不要重开 `struct.Map`，新增独立 consumer domain。**

---

## 3. Authority 边界

### 3.1 Importer / compatibility 层负责

Importer 负责理解 Essentials/RMXP 来源格式，并输出 Runtime 不需要再次解释的地图跳转事实：

- `RPG::Map.events` 中本刀支持的静态 Transfer Player 出口；
- `PBS/map_connections*.txt` 中的地图边缘关系；
- connection offset 到具体 source/target 格坐标的换算；
- source/target map 存在性、bounds 与静态结构校验；
- 原始方向编码到 Runtime `2 | 4 | 6 | 8 | null` 的归一化。

### 3.2 `@loomrealm-game/map` Runtime 负责

Runtime 只负责：

- 当前地图 authority；
- 玩家当前格与方向；
- walking completion boundary；
- 查询当前地图是否有 arrival/edge transfer；
- 异步加载目标 `Map/Tileset/resource/MapTransfer`；
- 成功后原子替换当前地图 authority；
- transfer 期间禁止启动第二个 movement/transfer；
- transfer load 失败时结束当前 Frame 为明确 failure。

Runtime **不解析**：

- `RPG::Event`；
- `RPG::EventCommand`；
- PBS connection 文本；
- Ruby/RMXP Marshal 结构。

### 3.3 Browser 负责

Browser 不新增地图跳转 authority。

成功 transfer 后 Runtime 发新的 standing RenderState：

```text
new mapId
new map size
new tileset ref
new projected tiles
new x/y
new camera
pattern = 0
motion = null
cameraMotion = null
```

现有 latest-data/resource currentness/stale guard 应自然收敛到新地图。

第一刀不需要新增 Browser production 行为。

---

## 4. 新 consumer domain：`struct.MapTransfer`

推荐新增普通 structured domain，而不是扩展已经 Closed 的 `struct.Map`。

```ts
type Direction = 2 | 4 | 6 | 8;

type ArrivalTransfer = Readonly<{
  x: number;
  y: number;
  targetMapId: number;
  targetX: number;
  targetY: number;
  targetDirection: Direction | null;
}>;

type EdgeTransfer = Readonly<{
  x: number;
  y: number;
  direction: Direction;
  targetMapId: number;
  targetX: number;
  targetY: number;
  targetDirection: Direction | null;
}>;

interface MapTransferRecord {
  readonly id: number; // source map id
  readonly arrivals: readonly ArrivalTransfer[];
  readonly edges: readonly EdgeTransfer[];
}
```

### 4.1 `arrivals`

语义：**玩家通过一次成功 walking step 到达 `(x,y)` 后**，若该格存在 arrival transfer，则在 walking completion boundary 发起 transfer。

重要：arrival 不是“角色只要站在这个格就不断触发”。

因此：

- 初始 spawn 在 arrival tile 上不会自动 transfer；
- transfer 到目标图时落在一个 reciprocal exit tile 上也不会立即弹回；
- 必须发生新的成功到格 movement 后才检查 arrival。

这条规则用于消除 A ↔ B 出口的自动 bounce。

### 4.2 `edges`

语义：玩家当前位于 `(x,y)`，向 `direction` 尝试移动时，下一格已经超出当前 map bounds；若存在匹配 edge transfer，则从当前地图切换到目标地图/格。

Runtime 不再解释 connection offset。

### 4.3 `targetDirection`

- `null`：保留 transfer 前方向；
- `2/4/6/8`：落地后强制朝向该方向。

Importer 应把 Essentials/RMXP 的 retain-direction 编码归一化成 `null`，不要把原始 `0` 泄漏给 Runtime。

### 4.4 唯一性

Freeze 前必须写死：

- 同一 `(x,y)` 最多允许一条有效 arrival；
- 同一 `(x,y,direction)` 最多允许一条 edge；
- duplicate/ambiguous projection 必须 importer fail closed，不能靠数组顺序选第一条。

---

## 5. Importer 设计

### 5.1 不修改 M14 `struct.Map` 投影

当前 `m14-consumer.mjs` 继续只负责现有 Map/Tileset consumer contract。

推荐新增独立模块，例如：

```text
tools/fixtures/essentials-v21.1/lib/essentials/v21.1/map-transfer-consumer.mjs
```

它的输入来自已经存在的 canonical/intermediate 数据：

```text
RMXP roots
+ 已投影 Map records（用于 width/height）
+ connections family 的 PbsDocument
```

输出：

```text
MapTransfer[]
```

`MapTransfer` record 自带 `id`，可走现有普通 structured-domain mapper；原则上不应为了它修改 FSDB framework。

### 5.2 Event arrival projection

Importer 从 `MapNNN.rxdata` 的 `RPG::Map.events` 中识别本刀支持的静态出口。

本刀推荐只接受能静态证明为 arrival-transfer 的 event/page/command 组合，并输出最终目标：

```text
source map id
source x/y
target map id
target x/y
target direction|null
```

Importer 不把 event id/page/command list 暴露到 `MapTransfer`。

具体支持哪些 RMXP trigger/page/command pattern **现在不冻结**。Freeze 前必须对真实 Essentials v21.1 FSDB 做 inventory，列出验收门/楼梯/洞口实际采用的模式，并把支持子集写成确定算法。

若一个 event 的 target 依赖变量、条件分支或脚本，第一刀应标记为 unsupported，而不是猜执行结果。

### 5.3 `map_connections` projection

已有 importer 会识别 `connections` PBS family，但当前只保留 ordered-line 文档。

新的 transfer projection 负责：

1. 解析 v21.1 connection 行；
2. 使用双方 Map width/height；
3. 校验 N↔S / E↔W 关系与 offset 合法性；
4. 将每个实际可跨越的边界格展开成具体 `EdgeTransfer`；
5. 同时生成反向边界规则；
6. 校验生成的 target coordinate 在目标图 bounds 内。

Runtime 不接受“edge + offset”这种半解析结构。

Freeze 前必须用官方 v21.1 compiler/source 和真实 fixture 固定精确坐标公式与测试向量。

---

## 6. Runtime 当前地图模型

当前 `runtime.ts` 把 `map/tileset/tilesetRef` 固定在 activation 局部常量中。

地图跳转后应改成一个最小当前地图快照：

```ts
interface LoadedMap {
  readonly mapId: number;
  readonly map: MapRecord;
  readonly tileset: TilesetRecord;
  readonly tilesetRef: ResourceRef;
  readonly transfers: MapTransferRecord;
}

let current: LoadedMap;
```

玩家状态仍然独立：

```text
x
y
direction
heldDirections[]
activeMove
nextMoveId
nextStartPattern
stepTimer
```

新增的长期 transfer 状态只建议：

```ts
let transitioning = false;
```

不要新增 `MapSession`、`Scene`、`WorldState` manager。

### 6.1 `loadMap(mapId)`

Runtime 内使用一个局部 async helper：

```ts
async function loadMap(mapId: number): Promise<LoadedMap>
```

它必须加载并验证：

```text
struct.Map/<mapId>
struct.MapTransfer/<mapId>
struct.Tileset/<tileset_id>
resource.Graphics/Tilesets/<tileset_name>
```

角色 sprite resource 与地图无关，继续只在 frame activation 加载一次。

不存在 transfer record 的策略 Freeze 前写死；推荐 importer 为每张 Map 都产出一个空 `MapTransfer`，这样 Runtime 不需要 optional fallback。

---

## 7. 普通出口状态机：step-complete 后 transfer

普通门/楼梯/洞口必须在 walking 完整到达之后触发。

现有一步流程：

```text
attempt
→ canMove
→ x/y authority 立即变 target
→ walking RenderState
→ 250ms timer
→ finishStep
```

加入 transfer 后：

```text
finishStep(moveId)
  ↓
确认 current move id / frame 未 abort
  ↓
stepTimer = null
activeMove = null
  ↓
查 arrivals[x,y]
  ├─ 有 → beginTransfer(rule)
  └─ 无 → 现有 held-next-step / standing
```

### 7.1 禁止提前触发

以下行为全部错误：

```text
keydown 时换图
step start 时换图
Browser progress 0.5 时换图
Browser 自己判断出口
```

地图 transfer 是 Runtime authority 行为，只发生在确定的逻辑 boundary。

### 7.2 连续按键

如果用户一直按住方向，当前一步落在出口上：

```text
finishStep
→ transfer 优先
→ 不先启动当前图下一步 walking
```

目标地图落地完成后如何处理仍然 held 的方向，Freeze 前必须写死。

推荐第一刀：

```text
保留 heldDirections
transfer 完成后只发 standing
不在同一个 transfer completion callback 自动起步
等待下一次 keyboard event/state delivery 再继续
```

若现有 retained state 不会自然再次投递，则需在 Freeze 前调整为确定策略，不能留给 agent 猜。

---

## 8. 地图边缘 connection 状态机

普通 `canMove` 当前会因 target 超出 map bounds 返回 false。

transfer 实现后，`attempt(next)` 应先算：

```ts
const nx = x + dx;
const ny = y + dy;
```

然后：

```text
如果 nx/ny 在当前 map bounds 内
    → 走现有 canMove + walking
否则
    → 查 edges[x,y,direction]
       ├─ 无：按 blocked movement 处理
       └─ 有：验证 source 出边 passage 后 beginTransfer(edge)
```

Freeze 前必须确认原版 connection crossing 是否还需要 target-side reverse passage 校验；这一点需要真实 v21.1 语义证据，不能在 Draft 中拍板。

### 8.1 第一刀不做跨图 walking tween

edge transfer 第一刀直接切图，不同时渲染 source + target 两张地图。

因此不实现：

```text
跨地图 250ms 连续 world-space movement
两张 map 同屏拼接
跨图 camera seamless scroll
```

这属于独立功能，不是“能通过地图边缘出口”的最低闭环。

---

## 9. `beginTransfer()`：异步、原子 authority swap

推荐唯一入口：

```ts
async function beginTransfer(rule: TransferRule): Promise<void>
```

开始时：

```text
transitioning = true
activeMove = null
clear step timer
nextStartPattern = 1
```

transfer 期间：

- input event/state 仍可更新 `heldDirections`；
- `attempt()` 必须因 `transitioning` 直接返回；
- 不允许第二个 transfer 并发开始；
- 不发送 half-loaded target RenderState。

然后异步加载 target：

```text
const target = await loadMap(targetMapId)
```

在提交前验证：

```text
targetX/Y 是 non-negative safe integer
targetX < target.map.width
targetY < target.map.height
targetDirection 合法
frame 未 abort
当前 transfer 仍是最新/唯一 active transfer
```

成功后一次性提交：

```text
current = target
x = targetX
y = targetY
direction = targetDirection ?? direction
activeMove = null
nextStartPattern = 1
transitioning = false

domain.replace(renderState())
```

目标 RenderState 必须是 standing：

```text
pattern = 0
motion = null
cameraMotion = null
```

新地图的 `camera` 直接由目标 `x/y` 计算。

### 9.1 为什么不使用 `frame.call()`

地图跳转不是一个需要在当前 map frame 上堆叠 child frame 的子流程，而是同一个玩家地图会话里的 current-map authority 变化。

如果每过一扇门就：

```text
map A frame
  call map B frame
    call map C frame
```

则长期 stack、return、failure、backtracking 都会变复杂。

因此本刀不使用 `frame.call("@loomrealm-game/map", ...)` 做地图切换。

---

## 10. Transfer failure 与 Frame 生命周期

目标缺图/坏目标不能只 `console.error` 后继续停在半状态。

推荐 frame 内新增一个最小 terminal failure 通道，使长期等待从：

```text
waitForAbort(frame.signal)
```

变成逻辑等价的：

```text
Promise.race([
  waitForAbort(frame.signal),
  transferFailure,
])
```

transfer load/validation 失败时返回：

```text
failed({
  code: "MAP_TRANSFER_FAILED",
  message: ...
})
```

然后走统一 cleanup：

```text
close listener
clear stepTimer
activeMove = null
close RenderDomain
```

不要新增 ErrorBus/TaskManager。

### 10.1 Abort

Frame abort 时：

- target load 使用 `frame.signal`；
- late target completion 不得 `domain.replace()`；
- 现有 walking timer/rAF stale 合同继续成立；
- abort 返回 `cancelled()`，不是 `MAP_TRANSFER_FAILED`。

---

## 11. Render transport 与 Browser 收敛

地图跳转继续遵循 walking 已冻结的原则：Render 是 latest-state projection，不是不可丢命令队列。

成功 transfer 最终只需要一个完整 target standing snapshot。

若 source standing snapshot 与 target snapshot 因 backpressure 被合并，允许 Browser 直接看到 target；必须保证：

- 不会保留旧 tileset canvas；
- 旧 resource async completion 不能覆盖新 map；
- 旧 walking/camera rAF 不能覆盖 target standing；
- 最终收敛到 target authority。

现有 Browser current-data identity 与 rAF cancellation 应已经提供这些性质；若测试证明不够，再局部修复，不预先增加 transition epoch/queue。

---

## 12. Validation / fail-closed 规则

`validateMapTransferRecord()` 应至少验证：

- exact field set；
- `id/targetMapId` 为 positive safe integer；
- `x/y/targetX/targetY` 为 non-negative safe integer；
- edge `direction` ∈ `2,4,6,8`；
- `targetDirection` 为 `null | 2 | 4 | 6 | 8`；
- `arrivals/edges` 为 frozen-compatible arrays；
- duplicate source keys 拒绝；
- 当前 record `id` 必须和 Content key 一致。

Runtime 加载 target 时再次做与 target Map bounds 相关的动态验证。

Importer 能静态验证的关系应尽量在 importer fail closed，不把坏数据推迟到玩家走到门口才发现。

---

## 13. 推荐 production 修改面

当前 Draft 推荐的最小 production 面：

```text
tools/fixtures/essentials-v21.1/lib/essentials/v21.1/map-transfer-consumer.mjs   # new
tools/fixtures/essentials-v21.1/lib/essentials/v21.1/simple-game-data.mjs      # integrate domain
game-libs/map/src/semantics.ts                                                   # validation / lookup
game-libs/map/src/runtime.ts                                                     # current map + transfer state machine
```

原则上不需要修改：

```text
game-libs/map/browser/map.browser.js
packages/* framework
struct.Map existing shape
```

如果 Freeze 调查发现必须改 mapper/framework/Browser，必须先解释为什么当前边界无法完成需求，不能由 implementation agent 自行扩 scope。

---

## 14. 测试闭环

### 14.1 Importer projection tests

至少固定：

- 一个真实/static Transfer Player → 一个 arrival；
- retain direction → `null`；
- fixed direction → `2/4/6/8`；
- unsupported variable/script target fail closed；
- duplicate arrival fail closed；
- connection N↔S 坐标展开；
- connection E↔W 坐标展开；
- offset 正/负边界；
- reciprocal edges；
- target bounds failure；
- map 无出口 → 空 record。

测试向量必须来自或对应官方 v21.1 语义，不凭自创格式。

### 14.2 Map Runtime tests

在现有 `game-libs/map/test/runtime.test.mjs` harness 上扩展，不为 transfer 抽生产 manager。

至少证明：

- arrival 在 step start 不触发；
- 249ms/未 completion 不触发；
- finishStep 后触发；
- transfer 成功后 `mapId/x/y/direction` 精确；
- target standing `pattern=0/motion=null/cameraMotion=null`；
- target 使用自己的 Map/Tileset/tilesetRef；
- reciprocal exit 不因 spawn 自动 bounce；
- A → B → A；
- transfer 中 input 不启动 movement；
- edge 无规则仍按 blocked；
- edge 有规则才 transfer；
- target missing / out-of-bounds → `MAP_TRANSFER_FAILED`；
- abort during target load → cancelled，无 late replace。

### 14.3 Browser regression

第一刀预计不新增 Browser production 行为，因此至少继续跑现有：

```text
map layering browser tests
walking browser tests
```

建议增加一个 integration-level latest-state case：旧地图 resource 延迟完成后不能覆盖已经切到的新地图。但是否需要新增测试，在 Freeze 前根据现有 stale-resource coverage 决定。

### 14.4 Product acceptance

必须使用真实 Essentials v21.1 FSDB，而不是只用 fake map：

```text
A 地图
→ 正常 walking 进入真实门/楼梯/洞口
→ B 地图正确目标格/方向
→ walking/layering 正常
→ 按原版 reciprocal exit 回到 A
```

另选一个真实 map connection 场景验证边缘跨图。

---

## 15. 抽象预算

本刀允许新增的长期概念只有：

```text
MapTransferRecord
LoadedMap
transitioning boolean
beginTransfer/loadMap local helpers
```

Importer 可以有一个 feature-specific projection module。

禁止为了这刀引入：

```text
EventInterpreter
SceneManager
WorldManager
MapRouter
TransitionService
TransferQueue
AnimationTimeline
MapStack
通用 async task manager
```

若未来需要事件执行、fade 或 seamless connected maps，再以真实需求单独设计。

---

## 16. Freeze 前必须关闭的事项

当前 Draft 不能直接交 implementation agent。至少关闭以下事项后才能改为 `Frozen for implementation`：

1. **真实 event inventory**  
   扫描验收用 Essentials v21.1 地图出口，确认门、楼梯、洞口实际 event trigger/page/command 形态；明确第一刀支持集合与 unsupported 集合。

2. **Transfer Player 解码合同**  
   写死当前 RMXP decoded tree 中 `RPG::Map.events/pages/list/RPG::EventCommand` 的确切字段形态、Transfer Player command 参数位置、retain/fixed direction 编码。

3. **Event page 选择规则**  
   如果同一出口存在多 page，必须决定 importer 如何静态选出可投影 transfer，或明确哪些 page 组合 fail closed。不能由 Runtime 执行通用 page evaluator。

4. **`map_connections` 精确公式**  
   根据官方 v21.1 compiler/runtime 固定 line grammar、edge 名称、offset 方向和双方坐标展开公式，并写测试向量。

5. **Connection passability**  
   写死跨 edge 时只校验 source passage，还是同时校验 target reverse passage，与原版语义一致。

6. **held input after transfer**  
   确认 retained `keyboard.state` 的现有投递语义，写死 transfer 完成后是立即按 held direction 起步，还是必须等下一次 input delivery；避免落地自动多走一格或必须松开重按。

7. **async terminal failure 的具体实现**  
   在现有 subsystem API 下写死最小 Promise/cleanup 结构，不引入 framework primitive。

8. **精确 production/test 文件与 gate 命令**  
   确认 importer test 文件、map test 文件和最终命令；Frozen 后 implementation agent 不再自行选择 harness。

9. **真实 acceptance fixture**  
   固定至少一个 event transfer A↔B 和一个 map connection 场景，记录 map id、source/target 格与预期方向。

---

## 17. 目标闭环

```text
Essentials v21.1 source
  │
  ├─ RPG::Map events ─────────────┐
  │                               │
  └─ PBS map_connections ───────┐ │
                                ▼ ▼
                    Importer compatibility projection
                                │
                     struct.MapTransfer/<mapId>
                                │
                                ▼
                   @loomrealm-game/map Runtime
                                │
             ┌──────────────────┴──────────────────┐
             │                                     │
     successful step complete              out-of-bounds attempt
             │                                     │
        arrival lookup                         edge lookup
             │                                     │
             └──────────────────┬──────────────────┘
                                ▼
                         beginTransfer
                                │
                         load target map
                                │
                     validate full target
                                │
                   atomic authority replacement
                                │
                                ▼
                   standing target RenderState
                                │
                                ▼
                existing Browser latest projection
                                │
                                ▼
               walking + layering continue normally
```

这条链成立时，地图跳转仍然只是 map consumer 的业务能力：Importer 负责兼容格式，Runtime 负责 authority，Browser 负责 projection，不需要重开 framework 或实现通用 RMXP 游戏引擎。
