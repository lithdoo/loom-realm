# 地图跳转设计草案

> 状态：Draft — **禁止实施**  
> 目录：`examples/essentials-v21.1-local`  
> 需求来源：`MAP_BEHAVIOR_REQUIREMENTS.md` 第 3 节  
> 前置能力：地图遮挡与人物行走动画已完成并进入 `main`。

本文只设计最后一项地图行为：玩家通过原版 Essentials v21.1 已有的门、楼梯、洞口或地图边缘出口，从当前地图进入目标地图，并能按原版出口关系返回。

## 实施规则

本文件最终要交给低判断力 implementation agent 机械落地，因此规则如下：

- **只要顶部状态仍为 `Draft`，implementation agent 必须 STOP，不得开始改 production。**
- 本文出现 `FREEZE-BLOCKER` 的事项必须由设计/调查阶段先关闭并替换为确定事实。
- 状态改成 `Frozen for implementation` 后，agent **没有架构、schema、算法、文件范围、测试 harness、fixture 或 gate 选择权**。
- Frozen 后若任一规则无法按原文实现，agent 必须 STOP 并报告 blocker；不得自行扩大 scope、补 Event Interpreter、修改 framework contract 或选择“近似实现”。
- 除本文明确覆盖的部分外，已冻结的 walking/layering authority、input、timer、Render latest-state、Browser stale-resource/rAF 合同继续有效。

当前只剩真实 v21.1 source semantics 与 acceptance fixture 仍未冻结；文件范围、Runtime 状态机、failure/lifecycle、测试文件、gate 和施工顺序已在本文写死。

---

## 1. 目标与非目标

### 1.1 本刀必须解决

- 游戏运行中从当前地图进入另一张地图，不修改启动参数、不重启 Frame。
- 原版地图事件中的静态 Transfer Player 出口投影成 Runtime 可直接消费的事实。
- `map_connections` 表达的地图边缘连接投影成 Runtime 可直接消费的事实。
- Event transfer 按原版触发 boundary 区分：成功走入后触发，或 movement attempt 与阻挡 event 接触时触发。
- 地图边缘出口在玩家从边界向连接地图继续移动时触发。
- 成功 transfer 后，目标地图、目标格、方向、camera、遮挡和后续 walking 继续复用现有规则。
- 目标 Map/MapTransfer/Tileset/resource 读取或结构验证失败时显式结束当前 Frame，不能提交 half-loaded target authority。
- 原版可逆出口必须能 A → B → A。

### 1.2 明确不做

本刀不实现：

- 完整 RMXP/Event Interpreter；
- 条件分支、变量 target、Script Command 计算 target；
- 通用 event page evaluator；
- Common Event；
- 开门动画、淡入淡出、黑屏 transition；
- connected-map 无缝同屏滚动；
- NPC、对话、战斗、菜单；
- Browser 图片 decode failure 反向上报 Runtime；
- `SceneManager`、`WorldManager`、`MapRouter`、`TransitionService`；
- framework Runtime/Renderer/Data contract 修改。

真实 acceptance 若依赖以上能力之一，必须在 Freeze 前返回设计阶段；implementation agent 不得临场补能力。

---

## 2. Authority 边界

### 2.1 Importer / compatibility 层负责

Importer 负责理解 Essentials/RMXP source，并输出 Runtime 不再解释的规范事实：

- `RPG::Map.events` 中本刀支持的静态 Transfer Player；
- event trigger/priority/through/page/command 组合属于 `step` 还是 `contact` boundary；
- contact event 展开为具体 player `(x,y,direction)`；
- `PBS/map_connections*.txt` 的 line grammar、edge/offset 和双向关系；
- connection 展开为具体 source/target tile；
- source/target map、bounds、duplicate/ambiguity 静态校验；
- Event Transfer Player direction 归一化为 `2 | 4 | 6 | 8 | null`。

Runtime 不得读取或解释 EventCommand/PBS 原始结构。

### 2.2 `@loomrealm-game/map` Runtime 负责

Runtime 只负责：

- current map authority；
- player `x/y/direction`；
- movement attempt 与 walking completion boundary；
- `steps / contacts / edges` lookup；
- 无 contact 时现有 tile `canMove()`；
- target Map/Tileset/resource/MapTransfer 加载；
- atomic current-map authority swap；
- transfer 并发门；
- terminal failure / abort cleanup。

### 2.3 Browser 负责

Browser 不新增 transfer authority。

成功 target commit 后 Runtime 继续发送普通 standing RenderState：

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

现有 latest-data identity、resource currentness 和 rAF cancellation 负责收敛。Browser image decode failure 继续沿用既有 presentation failure policy；本刀不增加 Browser → Runtime ACK/failure channel。

---

## 3. Consumer schema：`struct.MapTransfer`

不修改已经 Closed 的 `struct.Map`。新增独立普通 structured domain：

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

### 3.1 `steps`

`StepTransfer(x,y)` 表示玩家已经成功走入 `(x,y)`，250ms walking 完成后在 `finishStep()` boundary 触发。

禁止：

- step start 触发；
- walking progress 触发；
- spawn 时扫描 step；
- Browser 判断 step。

因此 transfer target 即使落在 reciprocal step tile，也不会仅因 spawn 自动弹回。

### 3.2 `contacts`

`ContactTransfer(x,y,direction)` 表示玩家当前站在 `(x,y)` 并尝试向 `direction` 移动时，Importer 已静态证明会接触支持的阻挡 transfer event。

Runtime **必须在 tile `canMove()` 之前查 contact**。现有 `canMove()` 只知道 tile passages，不知道 RMXP event collision。

命中 contact：

```text
source x/y 不变
direction = attempted direction
无 ActiveMove
无 gait
无 250ms timer
→ startTransfer(contact)
```

### 3.3 `edges`

`EdgeTransfer(x,y,direction)` 表示下一格已经超出当前 map bounds，且当前 source tile/direction 对应一条已规范化 connection。

Runtime 不解释 edge name/offset。

`EdgeTransfer` 不携带 `targetDirection`；Frozen 前必须用官方语义确认 crossing 保持 attempted direction。

### 3.4 Event target direction

只存在于 `StepTransfer / ContactTransfer`：

- `null`：保留 transfer 前方向；
- `2/4/6/8`：target commit 后固定朝向。

Importer 不得把 RMXP 原始 retain-direction 编码泄漏给 Runtime。

### 3.5 唯一性

Importer 必须 fail closed：

- 同一 `(x,y)` 最多一条 step；
- 同一 `(x,y,direction)` 最多一条 contact；
- 同一 `(x,y,direction)` 最多一条 edge；
- duplicate/ambiguous 不能按数组顺序选第一条。

Runtime lookup 直接小数组 `find`：

```ts
transfers.steps.find(...)
transfers.contacts.find(...)
transfers.edges.find(...)
```

禁止新增 `TransferIndex` 或 persistent `Map`。

---

## 4. Importer projection

### 4.1 唯一 production module

新增：

```text
tools/fixtures/essentials-v21.1/lib/essentials/v21.1/map-transfer-consumer.mjs
```

它接收当前 canonical/intermediate 数据：

```text
RMXP roots
+ 已投影 Map records（width/height）
+ connections family PbsDocument
```

输出：

```text
MapTransfer[]
```

`MapTransferRecord` 自带 `id`，通过现有普通 structured-domain mapper 写入 FSDB；禁止修改 FSDB mapper/framework 或 `struct.Map` shape。

### 4.2 Event projection

Importer 只支持 Freeze 后明确列出的 event patterns，并直接产出 `StepTransfer` 或 `ContactTransfer`。

Step 输出事实：

```text
source map id
landed x/y
target map id
target x/y
target direction|null
```

Contact 输出事实：

```text
source map id
player x/y
attempted direction
target map id
target x/y
target direction|null
```

任何不在 Frozen 支持表内的 page/trigger/priority/through/command 组合都 fail closed；禁止 agent 自行“理解”或执行 event。

**FREEZE-BLOCKER E1：** 在状态改为 Frozen 前，Section 16 必须填入真实 v21.1 支持表、decoded-tree 字段路径和 Transfer Player 参数位置。

### 4.3 `map_connections` projection

Importer 必须把每条 connection 展开为具体双向 `EdgeTransfer`，Runtime 不接受 half-parsed `edge + offset`。

**FREEZE-BLOCKER C1：** Section 16 必须填入官方 v21.1 line grammar、edge 名称、offset 方向、N↔S/E↔W 坐标公式、合法范围和测试向量。

**FREEZE-BLOCKER C2：** Section 16 必须写死 crossing 的 source/target passage 规则与方向规则。

### 4.4 每张 Map 必须有 transfer record

这是固定合同，不再是“推荐”：

```text
对每个 struct.Map/<id>
必须生成 struct.MapTransfer/<id>
```

无出口：

```json
{ "id": 1, "steps": [], "contacts": [], "edges": [] }
```

Runtime 不实现 optional MapTransfer fallback。

### 4.5 canonical dataset 集成点

只在：

```text
tools/fixtures/essentials-v21.1/lib/essentials/v21.1/simple-game-data.mjs
```

集成新 projection。

固定顺序：

```text
decode Marshal
→ decode RMXP
→ materialize existing M14 Map/Tileset
→ materialize MapTransfer using RMXP roots + Map records + PbsDocuments
→ merge MapTransfer into canonical domains
→ existing compiled-data / semantic / oracle flow continues
```

若真实实现证明这个顺序无法满足既有 canonical/oracle invariant，STOP 并返回设计；禁止修改 mapper/framework 绕过。

---

## 5. Runtime current-map 模型

将 activation 时固定的 `map/tileset/tilesetRef` 收拢为：

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

玩家状态继续沿用 walking：

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

transfer 只新增一个长期状态：

```ts
let transitioning = false;
```

禁止新增：

```text
transferId
transferEpoch
transferToken
activeTransfer object
MapSession / Scene / WorldState manager
```

### 5.1 `loadMap(mapId)`

Runtime 内局部 helper：

```ts
async function loadMap(mapId: number): Promise<LoadedMap>
```

固定读取顺序：

```text
1. struct.Map/<mapId>
2. validate Map
3. struct.MapTransfer/<mapId>
4. validate MapTransfer 且 record.id === mapId
5. struct.Tileset/<map.tileset_id>
6. validate Tileset
7. resource.Graphics/Tilesets/<tileset_name>
8. build tilesetRef
9. return frozen LoadedMap snapshot
```

所有 Content read 使用 `frame.signal`。

`loadMap()` 不做长期 cache/preload。

### 5.2 initial activation 与 later transfer failure 分离

初始：

```text
current = await loadMap(input.mapId)
```

发生在 RenderDomain/InputListener 创建之前。

初始 Map/MapTransfer/Tileset/resource/read/validation/spawn failure：

```text
MAP_ACTIVATION_FAILED
```

Frame 已经 live 后由 `beginTransfer()` 加载 target 的同类 failure：

```text
MAP_TRANSFER_FAILED
```

Browser `createImageBitmap()` decode failure不属于 `MAP_TRANSFER_FAILED`。

---

## 6. Activation / lifecycle 唯一顺序

在 `frame(frame)` 中严格按以下顺序：

```text
1. parse/validate initial input
2. create frame-local terminal Promise/resolve state
3. define local loadMap/renderState/attempt/finishStep/beginTransfer/startTransfer helpers
4. current = await loadMap(input.mapId)
5. validate initial x/y inside current.map bounds
6. load player character resource and build playerRef
7. initialize x/y/direction/heldDirections/nextMoveId/nextStartPattern/activeMove/stepTimer/transitioning
8. createRenderDomain(initial standing renderState())
9. createInputListener(channels: keyboard.event + keyboard.state)
10. register keyboard.event handler
11. register keyboard.state handler
12. await Promise.race(terminal, frame abort)
13. close listener
14. clear stepTimer if any
15. activeMove = null
16. transitioning = false
17. close RenderDomain
18. return the single resolved FrameOutcome
```

关键约束：RenderDomain 必须在任何 input handler 注册前存在，保持 walking 已冻结的 retained `keyboard.state` baseline 安全性。

禁止因为 transfer 重建 InputListener、RenderDomain 或 Frame。

---

## 7. Movement / transfer 状态机

### 7.1 `attempt(next)` 唯一顺序

```text
if frame aborted: return
if transitioning: return

direction = next
compute dx/dy/nx/ny
```

之后严格三路。

#### A. `nx/ny` 在 current map bounds 内：先 contact

```ts
const contact = current.transfers.contacts.find(
  rule => rule.x === x && rule.y === y && rule.direction === direction
);
```

命中：

```text
startTransfer(contact)
return
```

不得调用 `canMove()`。

#### B. in-bounds 且没有 contact：现有 tile movement

`canMove(...) === true`：完全复用 walking start：

```text
capture fromX/fromY
x/y authority 改为 target
create ActiveMove
replace walking RenderState
set 250ms finishStep timer
```

`canMove(...) === false`：完全复用 blocked behavior：

```text
x/y 不变
activeMove = null
stepTimer = null
nextStartPattern = 1
replace standing facing attempted direction
```

不得自动尝试第二优先 held direction。

#### C. `nx/ny` 超出 current map bounds：edge

```ts
const edge = current.transfers.edges.find(
  rule => rule.x === x && rule.y === y && rule.direction === direction
);
```

无 edge：blocked standing。

有 edge：按 Frozen Section 16 的 crossing passage 公式验证；失败则 blocked standing；通过则：

```text
startTransfer(edge)
```

edge 不创建 ActiveMove、不播放跨图 walking tween。

### 7.2 `finishStep(moveId)`

先保留 walking stale guard：

```text
if frame aborted: return
if activeMove?.id !== moveId: return
```

然后：

```text
stepTimer = null
activeMove = null
```

查：

```ts
const step = current.transfers.steps.find(
  rule => rule.x === x && rule.y === y
);
```

有 step：

```text
startTransfer(step)
return
```

无 step：完全沿用 walking 已冻结规则：

```text
held 非空 → toggle nextStartPattern → attempt(highest held)
held 为空 → nextStartPattern = 1 → standing replace
```

---

## 8. `beginTransfer()` / authority swap

唯一 helper：

```ts
async function beginTransfer(
  rule: StepTransfer | ContactTransfer | EdgeTransfer,
): Promise<void>
```

### 8.1 source standing

入口：

```text
if frame aborted: return
if transitioning: return
transitioning = true
activeMove = null
if stepTimer != null: clearTimeout(stepTimer)
stepTimer = null
nextStartPattern = 1
replace current source standing RenderState
```

source authority 此时不变。

- step：source x/y 是已完成 walking 的出口格；
- contact/edge：source x/y 不移动，direction 已是 attempted direction。

source-standing snapshot 允许被 transport coalesce。

### 8.2 load + atomic commit

```text
const target = await loadMap(rule.targetMapId)
```

commit 前：

```text
if frame.signal.aborted: return
if !transitioning: return
validate rule.targetX/Y inside target.map
```

一次性提交：

```text
current = target
x = rule.targetX
y = rule.targetY

StepTransfer / ContactTransfer:
  direction = rule.targetDirection ?? direction
EdgeTransfer:
  direction unchanged

activeMove = null
nextStartPattern = 1
transitioning = false
replace target standing RenderState
```

目标 standing 必须：

```text
pattern = 0
motion = null
cameraMotion = null
```

### 8.3 held continuation

target standing replace 后立即：

```text
if heldDirections.length > 0:
    attempt(highest-priority held direction)
```

不等待新的 `keyboard.state`。允许 target-standing 与后续 target movement snapshot 被 latest-state transport 合并。

### 8.4 不使用 `frame.call()`

禁止 map A → child map B → child map C stack。地图 transfer 是同一个 map Frame 内的 current authority swap。

---

## 9. Async failure / terminal outcome

Input handler 的 async rejection 不作为 Frame outcome，因此所有 transfer 必须显式接回 frame-local terminal channel。

固定结构：

```ts
let resolveTerminal!: (outcome: FrameOutcome) => void;
let terminalSettled = false;

const terminal = new Promise<FrameOutcome>((resolve) => {
  resolveTerminal = resolve;
});
```

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

```ts
const startTransfer = (
  rule: StepTransfer | ContactTransfer | EdgeTransfer,
) => {
  if (frame.signal.aborted || transitioning) return;
  void beginTransfer(rule).catch(failTransfer);
};
```

handler/timer callback 不得 `return beginTransfer(...)`。

主等待：

```ts
const outcome = await Promise.race([
  terminal,
  waitForAbort(frame.signal).then(() => cancelled()),
]);
```

竞争规则：

- `failTransfer()` 被调用时若 `frame.signal.aborted === true`，abort/cancelled 胜；
- 否则先 settle 的 terminal/abort outcome 胜；
- cleanup 只执行一次；
- late load completion 不得 replace closed domain。

禁止通用 Deferred、Task、ErrorBus/framework primitive。

---

## 10. Render / Browser convergence

transfer 期间可能产生：

```text
source standing
→ target standing
→ 若 held：target walking / blocked / contact / edge next state
```

中间 snapshots 可以被 transport coalesce。正确性只要求最终收敛到最新 Runtime authority。

Browser production **不得修改**。

现有 Browser stale/current-data 合同必须覆盖：

- old map delayed tileset image completion 不能覆盖 new map RenderData；
- old walking/camera rAF 不能覆盖 target standing/movement；
- same resource identity 也不能绕过 `_latestData === requested` currentness。

Browser regression 必须在现有 `test/map-layering-browser.test.mjs` 添加一个 map-transfer latest-state case，不能新建 browser harness。

---

## 11. Validation / fail-closed

`validateMapTransferRecord(value, contentMapId)` 必须：

- exact top-level fields：`id/steps/contacts/edges`；
- `id === contentMapId`；
- `id/targetMapId` positive safe integer；
- `x/y/targetX/targetY` non-negative safe integer；
- contact/edge `direction` ∈ `2,4,6,8`；
- step/contact `targetDirection` ∈ `null,2,4,6,8`；
- edge exact fields中不存在 `targetDirection`；
- arrays 中每个 record exact field set；
- duplicate step/contact/edge source key 拒绝；
- 返回 detached/frozen normalized record，风格与现有 Map/Tileset validator 一致。

Importer 负责静态验证：

- source/target map 存在；
- source player coordinate 可表达且 in bounds；
- target coordinate in bounds；
- ambiguity/duplicate；
- Frozen 支持表之外的 event pattern。

Runtime 加载 target 时仍重复 target bounds 校验。

---

## 12. Production / test 文件合同

### 12.1 Production ONLY

Frozen implementation 只允许修改：

```text
tools/fixtures/essentials-v21.1/lib/essentials/v21.1/map-transfer-consumer.mjs   # new
tools/fixtures/essentials-v21.1/lib/essentials/v21.1/simple-game-data.mjs
game-libs/map/src/semantics.ts
game-libs/map/src/runtime.ts
```

### 12.2 Tests ONLY

只允许新增/修改：

```text
tools/fixtures/essentials-v21.1/map-transfer-consumer.test.mjs   # new
game-libs/map/test/runtime.test.mjs
test/map-layering-browser.test.mjs
```

### 12.3 明确禁止修改

```text
game-libs/map/browser/map.browser.js
packages/*
tools/fixtures/essentials-v21.1/lib/fsdb/mapper.mjs
现有 m14-consumer.mjs / m14-consumer.test.mjs
struct.Map / struct.Tileset shape
root/package scripts
closed M14/M15 qualification contracts
```

如果实现需要超出以上 production/test 文件：**STOP，报告 blocker，返回设计。**

---

## 13. Test harness 合同

### 13.1 Importer：新 `map-transfer-consumer.test.mjs`

使用：

```text
node:test
node:assert/strict
```

测试局部 RMXP builders 直接复制 `m14-consumer.test.mjs` 的轻量风格（`object/string/table` 等），不得为了测试新增 shared test framework。

测试同时覆盖：

- `map-transfer-consumer.mjs` 纯 projection；
- `simple-game-data.mjs` integration 后 canonical domains 确实包含 `MapTransfer`；
- `mapCanonicalDataset()` 能把 `MapTransfer` 写成 ordinary JSON struct object，无特殊 mapper 修改。

Freeze 后 Section 16 的每一个真实 event/connection vector 都必须成为 deterministic test case。

### 13.2 Runtime：扩展现有 `game-libs/map/test/runtime.test.mjs`

继续使用现有 fake ContentClient、fake RenderDomain、input handlers、fake global timers。不得新增 production test hook。

至少证明：

- initial load 读取 MapTransfer，缺失/非法 → `MAP_ACTIVATION_FAILED`；
- step 在 start/249ms 不触发，`finishStep` 后触发；
- contact 优先于本可通过的 tile `canMove()`；
- contact 不改变 source x/y、不创建 gait/timer；
- in-bounds no-contact passable → walking；
- in-bounds no-contact blocked → standing；
- out-of-bounds edge 有/无及 passage pass/fail；
- source standing 在 delayed target load 完成前出现；
- target commit 的 mapId/x/y/direction/camera/tileset/MapTransfer 正确；
- step/contact retain/fixed direction；
- edge direction 按 Frozen 规则；
- reciprocal spawn 不自动 step bounce；
- A → B → A；
- transfer 中 input 只更新 held intent；
- target commit 后 held 立即继续 target attempt；
- 第二 transfer 不并发；
- transfer Content read/validation/target bounds failure → `MAP_TRANSFER_FAILED`；
- keyboard handler 发起的 async rejection 进入 terminal outcome；
- abort during load → cancelled；
- abort/rejection race 单 outcome；
- abort 后 no late replace。

Runtime tests 继续不用固定 wall-clock sleep。

### 13.3 Browser：扩展现有 `test/map-layering-browser.test.mjs`

必须增加一个 deterministic latest-state regression：

```text
1. source map RenderData 使用 delayed tileset image resource
2. source paint/decode 尚未完成时发送 target map RenderData
3. resolve old source image
4. 证明 old completion 不改变 target canvas/current state
5. target 最终正常 paint
```

继续使用现有 Playwright/server/resource-delay harness；不新增 browser test 文件。

---

## 14. 精确 gate 与 Implementation Complete

Frozen implementation 完成后按顺序执行：

```bash
node --test tools/fixtures/essentials-v21.1/map-transfer-consumer.test.mjs
npm test -w @loomrealm-game/map
node --test test/map-layering-browser.test.mjs
npm run test:fixtures
npm run test:m14
```

全部 green 后再检查：

```text
production diff 只包含 Section 12.1 的 4 个文件
test diff 只包含 Section 12.2 的 3 个文件
Browser production / packages / mapper / M14 contracts 均无改动
```

同时完成 Section 16 固定的真实 event A↔B 和 map connection product acceptance，才可标记 **Implementation Complete**。

不得修改既有 test/qualification contract 来“让 gate 通过”。

---

## 15. Frozen 后唯一施工顺序

implementation agent 必须按以下顺序，不自行重排设计：

```text
1. map-transfer-consumer.mjs
   - 实现 Frozen Section 16 event decoder/projection
   - 实现 Frozen connection formula
   - 产出每 Map 的 MapTransfer record

2. simple-game-data.mjs
   - 按 Section 4.5 集成 MapTransfer domain

3. semantics.ts
   - 加 Step/Contact/Edge/MapTransfer types
   - validateMapTransferRecord()

4. runtime.ts — current map foundation
   - LoadedMap
   - loadMap()
   - initial activation 改用 loadMap()
   - initial failure 仍 MAP_ACTIVATION_FAILED

5. runtime.ts — transfer lifecycle
   - terminal Promise
   - transitioning
   - startTransfer/beginTransfer
   - source standing / target atomic commit

6. runtime.ts — movement integration
   - contact precedence
   - edge path
   - finishStep step lookup
   - held continuation

7. importer test
8. runtime test
9. browser regression
10. 运行 Section 14 exact gates
11. 检查 exact diff scope
12. 跑 Section 16 real acceptance
```

任一步发现 Frozen 事实无法成立：STOP，不进入下一步。

---

## 16. FREEZE-BLOCKERS：必须由真实 v21.1 证据填满

**本节只要还有 `TBD`，顶部状态就不得改为 Frozen。implementation agent 不负责调查本节。**

### 16.1 E1 — Event decoded-tree 与支持表

必须填入当前 importer decoded tree 的精确字段路径和支持模式。最终格式必须达到如下粒度：

```text
RMXP Map event path:
TBD

RPG::Event fields used:
TBD

RPG::Event::Page fields used:
TBD

EventCommand list path:
TBD

Transfer Player command code:
TBD

Transfer Player parameters:
  target map id: TBD
  target x: TBD
  target y: TBD
  direction: TBD

retain-direction raw value -> null:
TBD
fixed direction raw values -> 2/4/6/8:
TBD
```

支持模式必须列成穷举表，例如：

```text
Pattern E-STEP-1
  trigger = TBD
  priority = TBD
  through = TBD
  page selection = TBD
  command requirements = TBD
  output = StepTransfer

Pattern E-CONTACT-1
  trigger = TBD
  priority = TBD
  through = TBD
  page selection = TBD
  command requirements = TBD
  contact player coordinate formula = TBD
  output = ContactTransfer
```

不在支持表的 event → fail closed。

### 16.2 E2 — 多 page 静态选择

必须写死：

```text
page count/conditions 如何判断可静态投影: TBD
选择哪个 page: TBD
哪些 condition 允许: TBD
哪些组合直接 unsupported: TBD
```

不得留给 Runtime 或 implementation agent 选择。

### 16.3 C1 — `map_connections` grammar 与坐标公式

必须写死：

```text
line fields: TBD
edge names/encoding: TBD
offset sign semantics: TBD

N -> S:
  source coordinate formula: TBD
  target coordinate formula: TBD
  valid overlap range: TBD

S -> N:
  ... TBD

E -> W:
  ... TBD

W -> E:
  ... TBD
```

必须附至少一个正 offset、一个负 offset、一个边界 overlap 的真实/官方测试向量。

### 16.4 C2 — Connection crossing passage / direction

必须写死：

```text
source passage check: TBD
target reverse passage check: TBD
other target passage check: TBD
crossing direction after commit: TBD
```

### 16.5 A1 — 真实 acceptance fixtures

Event transfer：

```text
source mapId: TBD
source player start x/y: TBD
attempt/step direction: TBD
boundary type: step | contact = TBD
target mapId: TBD
target x/y: TBD
target direction: TBD
reciprocal return rule: TBD
```

Map connection：

```text
source mapId: TBD
source edge x/y/direction: TBD
target mapId: TBD
target x/y/direction: TBD
expected reciprocal crossing: TBD
```

记录的 fixture 必须来自实际 Essentials v21.1 FSDB/source，而不是自造 fake map。

---

## 17. 抽象预算

允许新增的长期概念只有：

```text
MapTransferRecord
StepTransfer / ContactTransfer / EdgeTransfer data shapes
LoadedMap
transitioning boolean
loadMap / startTransfer / beginTransfer local helpers
frame-local terminal Promise/resolve
```

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

---

## 18. 最终闭环

```text
Essentials v21.1 source
  │
  ├─ RPG::Map events ─────────────────────────────────────┐
  │                                                       │
  └─ PBS map_connections ───────────────────────────────┐ │
                                                        ▼ ▼
                                      Importer compatibility projection
                                                        │
                                           struct.MapTransfer/<mapId>
                                                        │
                                                        ▼
                                           @loomrealm-game/map Runtime
                                                        │
                  ┌─────────────────────────┬─────────────┴──────────────┐
                  │                         │                            │
         in-bounds attempt            successful step complete   out-of-bounds attempt
                  │                         │                            │
             contact lookup              step lookup                  edge lookup
          ┌───────┴───────┐                 │                            │
        match          no match              │                            │
          │                │                  │                            │
          │          tile canMove()           │                            │
          │        ┌───────┴───────┐          │                            │
          │      walk           blocked       │                            │
          │        │              │           │                            │
          └────────┴──────────────┴───────────┴─────────────┬──────────────┘
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

当 Section 16 全部由真实 v21.1 证据填满、所有 `TBD` 清零后：

1. 将顶部状态改为 `Frozen for implementation`；
2. 不再修改 Sections 1–15、17–18 的架构/状态机/file scope/harness/gate；
3. implementation agent 按 Section 15 机械实施；
4. 任意冲突均 STOP 返回设计。
