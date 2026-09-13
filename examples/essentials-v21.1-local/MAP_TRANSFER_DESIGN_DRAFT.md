# 地图跳转设计草案

> 状态：Draft  
> 目录：`examples/essentials-v21.1-local`  
> 需求来源：`MAP_BEHAVIOR_REQUIREMENTS.md` 第 3 节  
> 前置能力：地图遮挡与人物行走动画已完成并进入 `main`。

本文只设计最后一项地图行为：玩家通过原版 Essentials v21.1 已有的门、楼梯、洞口或地图边缘出口，从当前地图进入目标地图，并能按原版出口关系返回。

本文当前不是实施冻结合同。真实 v21.1 event/page/command 形态、`map_connections` 精确坐标公式、connection crossing 语义和最终 acceptance fixture 尚需在 Freeze Gate 中用真实素材闭合；这些事项关闭后才能标记 `Frozen for implementation`。

---

## 1. 目标与非目标

### 1.1 本刀必须解决

- 游戏运行中从当前地图进入另一张地图，不修改启动参数、不重启 Frame。
- 原版地图事件中的静态 Transfer Player 出口能投影为 Runtime 可直接消费的事实。
- `map_connections` 表达的地图边缘连接能投影为 Runtime 可直接消费的事实。
- Event transfer 按原版触发边界区分：成功走入后触发，或向不可进入的事件格发生接触时触发；不能把所有出口一律当成“走到该格后触发”。
- 地图边缘出口在玩家尝试从边界向连接地图继续移动时触发。
- 成功跳转后，目标地图、目标格、朝向、camera、遮挡与后续 walking 都继续使用现有规则。
- 目标 Map/MapTransfer/Tileset/resource 读取或结构验证失败时显式结束当前 Frame，不能提交半加载 target authority。
- 原版可逆出口必须能 A → B → A。

### 1.2 明确不做

本刀不实现完整 RMXP/Event Interpreter，也不实现：

- 条件分支、变量目标、脚本计算出来的传送位置；
- 通用事件页选择器；
- Common Event / Script Command 执行；
- 开门动画、淡入淡出、黑屏 transition；
- connected-map 无缝同屏滚动；
- NPC、对话、战斗、菜单；
- Browser 图片 decode failure 反向上报 Runtime；
- 通用 `SceneManager`、`WorldManager`、`MapRouter`、`TransitionService`；
- 为地图跳转修改 framework Runtime/Renderer 合同。

若真实验收出口依赖上述能力之一，Freeze 前必须明确扩大范围，不能由 implementation agent 临场补 Event Interpreter 或 framework primitive。

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

当前 `struct.Map` consumer record 只有：

```ts
{
  tileset_id,
  width,
  height,
  data,
}
```

`RPG::Map.events` 没有进入这个 consumer record。因此地图跳转不能只在 `runtime.ts` 中“识别门”；必须先在 Importer/compatibility 边界把原版出口事实归一化。

关键原则：**不重开 `struct.Map`，新增独立 `struct.MapTransfer` consumer domain。**

---

## 3. Authority 边界

### 3.1 Importer / compatibility 层负责

Importer 负责理解 Essentials/RMXP 来源格式，并输出 Runtime 不需要再次解释的地图跳转事实：

- `RPG::Map.events` 中本刀支持的静态 Transfer Player 出口；
- event trigger/priority/page/command 组合对应的是 `step` 还是 `contact` Runtime boundary；
- `PBS/map_connections*.txt` 中的地图边缘关系；
- connection offset 到具体 source/target 格坐标的换算；
- source/target map 存在性、bounds 与静态结构校验；
- Event Transfer Player 的原始方向编码归一化为 Runtime `2 | 4 | 6 | 8 | null`。

`map_connections` 不预留目标朝向字段。当前 Draft 按“跨边缘保持当前移动方向”建模；Freeze 前必须用官方 v21.1 语义确认这一点，若证据相反再改 schema。

### 3.2 `@loomrealm-game/map` Runtime 负责

Runtime 只负责：

- 当前地图 authority；
- 玩家当前格与方向；
- movement attempt 与 walking completion boundary；
- 对 `steps / contacts / edges` 做直接 lookup；
- 异步加载目标 `Map/Tileset/resource/MapTransfer`；
- 成功后原子替换当前地图 authority；
- transfer 期间禁止第二个 movement/transfer；
- transfer 失败时通过 frame-local terminal channel 结束当前 Frame。

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

Browser 图片 decode failure 继续沿用既有 presentation failure policy；本刀不新增 Browser → Runtime failure channel。

---

## 4. 新 consumer domain：`struct.MapTransfer`

schema 直接对应 Runtime 的三个触发 boundary，不建立通用 Trigger/Rule hierarchy。

```ts
type Direction = 2 | 4 | 6 | 8;

type StepTransfer = Readonly<{
  x: number;
  y: number;
  targetMapId: number;
  targetX: number;
  targetY: number;
  targetDirection: Direction | null;
}>;

type ContactTransfer = Readonly<{
  x: number;
  y: number;
  direction: Direction;
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
}>;

interface MapTransferRecord {
  readonly id: number; // source map id
  readonly steps: readonly StepTransfer[];
  readonly contacts: readonly ContactTransfer[];
  readonly edges: readonly EdgeTransfer[];
}
```

### 4.1 `steps`

语义：玩家成功走入 `(x,y)`，250ms walking 完成后，在 `finishStep()` boundary 检查该格是否触发 event transfer。

因此：

- step start 不触发；
- walking 中途不触发；
- 初始 spawn 在 step-transfer tile 上不会自动触发；
- transfer 落到 reciprocal exit tile 上不会仅因 spawn 自动弹回。

### 4.2 `contacts`

语义：玩家当前站在 `(x,y)`，面向 `direction` 尝试移动；目标仍在当前 map bounds 内，但普通移动不能进入目标格。若存在匹配 contact transfer，则不播放 walking gait，直接从当前 standing boundary 发起 transfer。

Importer 必须把 event 坐标/trigger/priority 等来源语义展开成 Runtime 可直接 lookup 的具体 `(playerX, playerY, direction)`；Runtime 不需要知道 event 在哪一格，也不执行 Event Interpreter。

`ContactTransfer` 只用于 Freeze inventory 能静态证明的 player-contact transfer。不能静态证明的 event pattern fail closed。

### 4.3 `edges`

语义：玩家当前位于 `(x,y)`，向 `direction` 尝试移动时，下一格已经超出当前 map bounds；若存在匹配 edge transfer，则切换到目标地图/格。

Runtime 不解释 connection edge/offset。

`EdgeTransfer` 不携带 `targetDirection`；当前 Draft 保留 source movement direction。

### 4.4 Event `targetDirection`

只属于 `StepTransfer / ContactTransfer`：

- `null`：保留 transfer 前方向；
- `2/4/6/8`：落地后强制朝向该方向。

Importer 应把 Essentials/RMXP 的 retain-direction 编码归一化成 `null`，不要把原始编码泄漏给 Runtime。

### 4.5 唯一性与 lookup

Freeze 前必须写死：

- 同一 `(x,y)` 最多一条有效 step；
- 同一 `(x,y,direction)` 最多一条 contact；
- 同一 `(x,y,direction)` 最多一条 edge；
- duplicate/ambiguous projection 必须 importer fail closed，不能靠数组顺序选第一条。

第一刀 Runtime 直接小数组 `find`：

```ts
transfers.steps.find(...)
transfers.contacts.find(...)
transfers.edges.find(...)
```

不新增 `TransferIndex`、persistent `Map` 或其他索引层。

---

## 5. Importer 设计

### 5.1 不修改 M14 `struct.Map` 投影

当前 `m14-consumer.mjs` 继续只负责现有 Map/Tileset consumer contract。

推荐新增独立 feature module：

```text
tools/fixtures/essentials-v21.1/lib/essentials/v21.1/map-transfer-consumer.mjs
```

输入：

```text
RMXP roots
+ 已投影 Map records（用于 width/height）
+ connections family 的 PbsDocument
```

输出：

```text
MapTransfer[]
```

`MapTransferRecord` 自带 `id`，加入 canonical domains 后可走现有普通 structured-domain mapper；原则上不需要修改 FSDB framework 或现有 `struct.Map` shape。

### 5.2 Event transfer projection

Importer 从 `MapNNN.rxdata` 的 `RPG::Map.events` 中识别本刀支持的静态出口。

真实 inventory 必须先把支持的 event pattern 分类成：

```text
step
  = 成功 movement 完成后触发

contact
  = movement attempt 不能进入目标格时，因 player contact 触发
```

然后输出最终 Runtime fact，不暴露 event id/page/command list。

Step 输出：

```text
source map id
landed x/y
target map id
target x/y
target direction|null
```

Contact 输出：

```text
source map id
player x/y
attempted direction
target map id
target x/y
target direction|null
```

具体支持哪些 RMXP trigger/page/priority/command pattern **现在不冻结**。Freeze 前必须扫描真实 Essentials v21.1 acceptance 出口并写成确定算法。

若 target 依赖变量、条件分支、Script Command 或需要通用 event execution，第一刀标记 unsupported/fail closed，不猜执行结果。

### 5.3 `map_connections` projection

已有 importer 会识别 `connections` PBS family，但当前只保留 ordered-line document。

新的 transfer projection 负责：

1. 解析 v21.1 connection line；
2. 使用双方 Map width/height；
3. 校验 N↔S / E↔W 关系与 offset 合法性；
4. 将每个实际可跨越的边界格展开成具体 `EdgeTransfer`；
5. 同时生成反向边界规则；
6. 校验 target coordinate 在目标图 bounds 内。

Runtime 不接受“edge + offset”这种半解析结构。

Freeze 前必须用官方 v21.1 compiler/runtime 和真实 fixture 固定精确公式与测试向量。

### 5.4 每张 Map 都有 transfer record

推荐 importer 为每个 `struct.Map/<id>` 生成对应：

```text
struct.MapTransfer/<id>
```

无出口时：

```json
{ "id": 1, "steps": [], "contacts": [], "edges": [] }
```

这样 Runtime 不需要 optional/fallback 分支。

---

## 6. Runtime 当前地图模型

地图跳转后，把 activation 时固定的 map 常量收拢成最小 current snapshot：

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

玩家状态继续独立：

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

新增长期 transfer 状态只有：

```ts
let transitioning = false;
```

`transitioning` 同时表示“正在加载 target”与“禁止第二个 movement/transfer”。不要再增加：

```text
transferId
transferEpoch
transferToken
activeTransfer object
```

### 6.1 `loadMap(mapId)`

Runtime 内局部 helper：

```ts
async function loadMap(mapId: number): Promise<LoadedMap>
```

按顺序加载并验证：

```text
struct.Map/<mapId>
struct.MapTransfer/<mapId>
struct.Tileset/<tileset_id>
resource.Graphics/Tilesets/<tileset_name>
```

角色 sprite resource 与地图无关，继续只在 frame activation 加载一次。

`loadMap()` 不做长期 cache；不要新增 `MapCache`、`LoadedMapRepository`、LRU 或 target preload。

### 6.2 Runtime 能承诺的 resource failure 边界

Runtime 只承诺以下失败在 authority commit 前成为 `MAP_TRANSFER_FAILED`：

- `ContentClient.record()` / `resource()` reject；
- Map/MapTransfer/Tileset validation failure；
- target spawn out of bounds；
- target transfer record/content key 不一致。

Runtime 不承诺 Browser `createImageBitmap()`/实际图片 decode failure 会回传 `MAP_TRANSFER_FAILED`；该情况继续属于现有 presentation resource policy。本刀不新增 Browser → Runtime ACK/failure channel。

---

## 7. Runtime movement/transfer 状态机

### 7.1 `attempt(next)` 的确定顺序

所有 movement attempt 先：

```text
if transitioning: return

direction = next
compute nx/ny
```

然后严格分三路。

#### A. 下一格在 map bounds 内且 `canMove(...) === true`

走现有 walking：

```text
fromX/fromY
→ x/y authority 改为 target
→ ActiveMove
→ walking RenderState
→ 250ms timer
```

此时不检查 contact。

#### B. 下一格在 map bounds 内且 `canMove(...) === false`

先查：

```ts
transfers.contacts.find(
  rule => rule.x === x && rule.y === y && rule.direction === direction
)
```

命中：

```text
不创建 ActiveMove
不播放 gait
不启动 250ms step timer
→ startTransfer(contact)
```

未命中：按现有 blocked movement：

```text
activeMove = null
nextStartPattern = 1
standing facing attempted direction
```

#### C. 下一格超出当前 map bounds

查：

```ts
transfers.edges.find(
  rule => rule.x === x && rule.y === y && rule.direction === direction
)
```

命中后按 Freeze 后确定的 connection passability 规则验证，通过则：

```text
不创建 ActiveMove
不播放跨图 walking tween
→ startTransfer(edge)
```

无规则或 passage 不通过：按 blocked movement。

### 7.2 Step transfer：`finishStep()` boundary

成功 walking 的 timer completion：

```text
finishStep(moveId)
  ↓
确认 frame 未 abort 且 activeMove.id 匹配
  ↓
stepTimer = null
activeMove = null
  ↓
查 steps.find(x,y)
  ├─ 有 → startTransfer(step)
  └─ 无 → 现有 held-next-step / standing
```

禁止：

```text
keydown 时触发 step transfer
step start 时触发
Browser progress 触发
spawn 时扫描 step transfer
```

---

## 8. `beginTransfer()`：异步、原子 authority swap

三种 transfer 共用一个局部 helper，不新增 `TransferRule` hierarchy：

```ts
async function beginTransfer(
  rule: StepTransfer | ContactTransfer | EdgeTransfer,
): Promise<void>
```

外层只通过 `startTransfer(rule)` fire-and-catch 启动；Input handler 不直接返回 `beginTransfer()` Promise。

### 8.1 source standing boundary

开始时：

```text
if transitioning: return
transitioning = true
activeMove = null
clear stepTimer
nextStartPattern = 1

domain.replace(renderState())   // current source map, standing
```

此时 `current/x/y/direction` 仍是 source authority。

对于 step，source x/y 是已完成 walking 的出口格；对于 contact/edge，是当前未移动的 source 格。contact/edge 的 direction 已在 `attempt(next)` 开头更新为 attempted direction。

source-standing snapshot 可以被 Render transport 与后续 target snapshot coalesce；这是允许的。它的作用是正常资源时不把画面留在旧 walking pose，而不是建立 ACK boundary。

### 8.2 异步加载与 target commit

然后：

```text
const target = await loadMap(rule.targetMapId)
```

提交前再次确认：

```text
frame 未 abort
transitioning === true
rule.targetX/Y 在 target map bounds 内
```

成功后一次性：

```text
current = target
x = rule.targetX
y = rule.targetY

StepTransfer / ContactTransfer:
  direction = rule.targetDirection ?? direction

EdgeTransfer:
  direction 保持 source attempted direction

activeMove = null
nextStartPattern = 1
transitioning = false

domain.replace(renderState())   // target standing
```

目标 standing 必须是：

```text
pattern = 0
motion = null
cameraMotion = null
```

### 8.3 held input after transfer：直接使用 Runtime 已保存 intent

不等待未来的 `keyboard.state` 再投递。现有 listener 在 map transfer 前后没有重新注册，因此 retained state 不保证因 transfer 自动重放。

成功 target standing projection 后：

```text
if heldDirections.length > 0:
    attempt(highest-priority held direction)
```

这一步直接复用 Runtime 已保存的 held intent，不新增 input replay 机制。

允许 target standing snapshot 与随后 walking snapshot 被 Render transport coalesce；authority 仍然先完整 commit 到 target spawn，再开始下一次 movement attempt。

如果 held movement 命中目标图上的 blocked/contact/edge 规则，按目标图当前 `transfers` 正常处理。

### 8.4 不使用 `frame.call()`

地图跳转是同一个地图会话里的 current-map authority 变化，不是 child workflow。

禁止：

```text
map A frame
  call map B frame
    call map C frame
```

否则长期 stack、return/failure 和 backtracking 都会无谓复杂化。

---

## 9. Transfer failure 与 Frame 生命周期

异步 transfer 失败不能依赖 Input handler Promise rejection 自动传播。Input business handler 的异步 rejection 不属于 Frame outcome channel，因此必须显式接回 frame-local terminal Promise。

### 9.1 唯一允许的 terminal failure 结构

frame 内局部：

```ts
let resolveTerminal!: (outcome: FrameOutcome) => void;
let terminalSettled = false;

const terminal = new Promise<FrameOutcome>((resolve) => {
  resolveTerminal = resolve;
});
```

局部 failure helper：

```ts
const failTransfer = (error: unknown) => {
  if (frame.signal.aborted || terminalSettled) return;
  terminalSettled = true;
  resolveTerminal(failed({
    code: "MAP_TRANSFER_FAILED",
    message: error instanceof Error ? error.message : "Map transfer failed",
  }));
};
```

所有异步 transfer 从同步 handler 通过：

```ts
const startTransfer = (rule: StepTransfer | ContactTransfer | EdgeTransfer) => {
  if (transitioning || frame.signal.aborted) return;
  void beginTransfer(rule).catch(failTransfer);
};
```

Input handler / timer callback 不直接 `return beginTransfer(...)`。

frame 主等待：

```ts
const outcome = await Promise.race([
  terminal,
  waitForAbort(frame.signal).then(() => cancelled()),
]);
```

然后统一 cleanup 并返回 `outcome`。

不要新增通用 `Deferred`、Task、ErrorBus 或 framework primitive。

### 9.2 Cleanup

无论 abort 或 terminal failure：

```text
close listener
clear stepTimer
stepTimer = null
activeMove = null
transitioning = false
close RenderDomain
```

### 9.3 Abort precedence

- 所有 target content read 使用 `frame.signal`；
- frame 已 abort 时 `failTransfer()` 不发布 failure；
- late target completion 不得 `domain.replace()`；
- abort 返回 `cancelled()`，不是 `MAP_TRANSFER_FAILED`。

Freeze 时测试 abort 与 load rejection 的竞争，保证只产生一个 terminal outcome。

---

## 10. Render transport 与 Browser 收敛

地图跳转继续遵循 walking 已冻结的原则：Render 是 latest-state projection，不是不可丢命令队列。

普通 transfer 的 projection 可能是：

```text
source standing
→ target standing
→ （若 held）target walking/blocked/contact/edge next state
```

中间 snapshot 可以因 backpressure 被合并。必须保证最终收敛到最新 Runtime authority：

- 旧 tileset/image completion 不能覆盖新 map；
- 旧 walking/camera rAF 不能覆盖 target state；
- target standing 后若立即继续 walking，最终以最新 target walking state 为准。

现有 Browser current-data identity 与 rAF cancellation 应提供这些性质；若测试证明有缺口，只局部修复，不增加 transition epoch/queue/ACK。

---

## 11. Validation / fail-closed 规则

`validateMapTransferRecord()` 至少验证：

- exact field set；
- `id/targetMapId` 为 positive safe integer；
- `x/y/targetX/targetY` 为 non-negative safe integer；
- contact/edge `direction` ∈ `2,4,6,8`；
- step/contact `targetDirection` 为 `null | 2 | 4 | 6 | 8`；
- edge 不允许 `targetDirection`；
- `steps/contacts/edges` 为 arrays；
- duplicate step/contact/edge source keys 拒绝；
- 当前 record `id` 必须和 Content key 一致。

Importer 能静态验证的 target map/bounds/ambiguity 应在 import 时 fail closed；Runtime 在加载 target 时仍重复验证当前实际 target bounds。

---

## 12. 推荐 production 修改面

当前 Draft 推荐最小 production 面：

```text
tools/fixtures/essentials-v21.1/lib/essentials/v21.1/map-transfer-consumer.mjs   # new
tools/fixtures/essentials-v21.1/lib/essentials/v21.1/simple-game-data.mjs      # integrate domain
game-libs/map/src/semantics.ts                                                   # validation
game-libs/map/src/runtime.ts                                                     # current map + transfer state machine
```

原则上不需要修改：

```text
game-libs/map/browser/map.browser.js
packages/* framework
struct.Map existing shape
FSDB mapper/framework
```

如果 Freeze 调查发现必须修改上述“不需要修改”范围，必须先返回设计阶段说明原因，不能由 implementation agent 自行扩大 scope。

---

## 13. 测试闭环

### 13.1 Importer projection tests

至少固定：

- 真实支持模式的 step Transfer Player → 一个 `StepTransfer`；
- 真实支持模式的 blocked/front-contact Transfer Player → 一个或多个具体 `ContactTransfer`；
- step/contact trigger classification 与官方 v21.1 行为一致；
- retain direction → `null`；
- fixed direction → `2/4/6/8`；
- unsupported variable/script target fail closed；
- ambiguous/duplicate step/contact fail closed；
- connection N↔S / E↔W 坐标展开；
- offset 正/负边界；
- reciprocal edges；
- edge 不携带目标朝向；
- target bounds failure；
- map 无出口 → 空 `steps/contacts/edges` record。

测试向量必须来自或对应官方 v21.1 语义，不凭自创 event shape。

### 13.2 Map Runtime tests

扩展现有 `game-libs/map/test/runtime.test.mjs` harness，不为 transfer 抽生产 manager。

至少证明：

- step transfer 在 step start/249ms 不触发，`finishStep` 后触发；
- blocked in-bounds attempt 命中 contact 时不创建 gait/timer，直接 transfer；
- blocked in-bounds 无 contact 仍 standing facing attempted direction；
- passable movement 不走 contact 分支；
- out-of-bounds 有/无 edge 的分支正确；
- source standing 在 target load 完成前出现；
- transfer 成功后 `mapId/x/y/direction` 精确；
- step/contact retain/fixed direction 正确；
- edge 保持 attempted direction；
- target standing `pattern=0/motion=null/cameraMotion=null`；
- target 使用自己的 Map/Tileset/tilesetRef/MapTransfer；
- reciprocal exit 不因 spawn 自动 bounce；
- A → B → A；
- transfer 中 input 只更新 `heldDirections`，不启动 movement；
- target commit 后仍 held 时直接从 target authority 继续 attempt；
- 第二个 transfer 不能并发启动；
- content read / validation / out-of-bounds target → `MAP_TRANSFER_FAILED`；
- 从 keyboard handler 启动的 async transfer rejection 能进入 terminal failure，而不是被 handler isolation 吞掉；
- abort during target load → cancelled，无 late replace；
- abort 与 transfer rejection 竞争只返回一个 outcome。

### 13.3 Browser regression

第一刀预计不新增 Browser production 行为，因此至少继续跑既有 layering/walking browser tests。

Freeze 前审一次现有 stale-resource coverage；若它不能证明“旧地图延迟 image completion 不覆盖新 map RenderData”，就在现有 browser test 文件增加一个 integration-level case，不新增新 harness。

### 13.4 Product acceptance

必须使用真实 Essentials v21.1 FSDB：

```text
真实门/楼梯/洞口
→ 按原版触发 boundary 进入 B
→ B 的目标格/方向正确
→ walking/layering 正常
→ reciprocal exit 回到 A
```

同时固定一个真实 `map_connections` 场景验证边缘跨图。

如果 acceptance door 是 contact 型，必须明确验证“目标格不可普通走入但接触仍可 transfer”；不能只用 passable floor transfer 替代。

---

## 14. 抽象预算

允许新增的长期概念只有：

```text
MapTransferRecord
StepTransfer / ContactTransfer / EdgeTransfer data shapes
LoadedMap
transitioning boolean
beginTransfer/loadMap/startTransfer local helpers
frame-local terminal Promise/resolve
```

Importer 可以有一个 feature-specific projection module。

明确禁止：

```text
EventInterpreter
SceneManager
WorldManager
MapRouter
TransitionService
TransferQueue
AnimationTimeline
MapStack
TransferRule hierarchy
TransferController
TransferIndex
transferId / transferEpoch / transferToken
activeTransfer object
MapCache
LoadedMapRepository
LRU / target preload
通用 Deferred helper
通用 async task manager
Browser → Runtime transfer ACK
```

实现策略保持局部：数组 `find`、ContentClient 直接读取、一个 `transitioning`、一个 frame-local terminal Promise。

---

## 15. Freeze 前必须关闭的事项

当前 Draft 不能直接交 implementation agent。至少关闭以下事项后才能改为 `Frozen for implementation`：

1. **真实 event inventory 与 boundary 分类**  
   扫描 acceptance 用 Essentials v21.1 门、楼梯、洞口，记录 trigger/page/priority/through/command 形态；逐个分类为 `step` 或 `contact`，明确 unsupported 集合。若真实模式不能被这两个 boundary 静态表达，先返回设计阶段，不扩 Event Interpreter。

2. **Transfer Player decoded-tree 合同**  
   写死当前 RMXP decoded tree 中 Map events/pages/list/EventCommand 的确切字段形态、Transfer Player command 参数位置、retain/fixed direction 编码。

3. **Event page 静态选择规则**  
   如果同一出口存在多 page，写死 importer 如何静态证明并选择可投影 transfer；无法静态证明的组合 fail closed。

4. **`map_connections` 精确公式**  
   根据官方 v21.1 compiler/runtime 固定 line grammar、edge 名称、offset 方向和双方坐标展开公式，并写真实测试向量。

5. **Connection crossing 语义**  
   写死跨 edge 时的 source/target passage 规则，并确认 crossing 后方向保持 source attempted direction。

6. **精确 production/test 文件与 gate 命令**  
   确认 importer test 文件、map test 文件、browser regression 文件与最终 gate；Frozen 后 implementation agent 不自行选择 harness。

7. **真实 acceptance fixture**  
   固定至少一个 event transfer A↔B 和一个 map connection，记录 map id、source/target 格、触发 boundary 与预期方向。

以下事项已经在本 Draft 中关闭，不再留给 implementation agent 选择：

- held input after transfer：直接复用 `heldDirections`，target commit 后若仍 held 就继续 `attempt()`；
- async failure propagation：只能走 frame-local terminal Promise + `startTransfer(...).catch(failTransfer)`；
- resource failure boundary：Runtime 只负责 Content read/结构验证，不承担 Browser image decode failure；
- transfer concurrency：只用 `transitioning`，不增加 transfer epoch/token/id。

---

## 16. 目标闭环

```text
Essentials v21.1 source
  │
  ├─ RPG::Map events ─────────────────────────────┐
  │                                               │
  └─ PBS map_connections ───────────────────────┐ │
                                                ▼ ▼
                              Importer compatibility projection
                                                │
                                   struct.MapTransfer/<mapId>
                                                │
                                                ▼
                                   @loomrealm-game/map Runtime
                                                │
            ┌───────────────────────┬─────────────┴──────────────┐
            │                       │                            │
   successful step complete   blocked in-bounds attempt   out-of-bounds attempt
            │                       │                            │
        step lookup             contact lookup                 edge lookup
            │                       │                            │
            └───────────────────────┴─────────────┬──────────────┘
                                                ▼
                                         startTransfer
                                                │
                                         beginTransfer
                                                │
                                  source standing projection
                                                │
                                         load target map
                                   ┌────────────┴────────────┐
                                   │                         │
                                failure                   success
                                   │                         │
                           terminal Frame failure     atomic authority swap
                                                             │
                                                   target standing projection
                                                             │
                                               heldDirections still non-empty?
                                                   ├─ yes → attempt again
                                                   └─ no  → remain standing
                                                             │
                                                             ▼
                                             existing Browser latest projection
                                                             │
                                                             ▼
                                          walking + layering continue normally
```

这条链成立时，地图跳转仍然只是 map consumer 的业务能力：Importer 负责兼容格式，Runtime 负责 authority/failure，Browser 继续只负责 projection；不需要重开 framework，也不需要实现通用 RMXP 游戏引擎。