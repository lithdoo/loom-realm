# 地图跳转设计冻结稿

> 状态：Frozen for implementation  
> 目录：`examples/essentials-v21.1-local`  
> 需求来源：`MAP_BEHAVIOR_REQUIREMENTS.md` 第 3 节  
> 证据基线：本地 Essentials v21.1 FSDB + `Maruno17/pokemon-essentials@ea7b5d56`  
> 前置能力：地图遮挡与人物行走动画已完成并进入 `main`。

本文冻结最后一项地图行为：玩家通过原版 Essentials v21.1 已有的门、楼梯、洞口或地图边缘出口，从当前地图进入目标地图，并能按原版出口关系返回。

## 实施合同

本文交给低判断力 implementation agent 机械实施。规则只有一套：

- agent **没有架构、schema、算法、文件范围、测试 harness、fixture 或 gate 选择权**；
- 任一冻结规则无法按原文实现时，**STOP 并报告 blocker**；不得自行扩大 scope、改 framework contract、补 Event Interpreter 或做近似实现；
- 除本文明确覆盖的部分外，walking/layering 已冻结的 authority、input、timer、Render latest-state、Browser stale-resource/rAF 合同继续有效；
- Section 12 是已确认的 v21.1 事实合同，不再是调查项；implementation agent 不得重新解释或放宽。

---

## 1. 目标、非目标与 authority

### 1.1 必须完成

- 游戏运行中从当前地图进入另一张地图，不修改启动参数、不重启 Frame；
- 支持本文 Section 12 冻结的静态 Transfer Player event；
- 支持本文 Section 12 冻结的 `map_connections` 边缘连接；
- event transfer 按 `step` / `contact` 两个确定 boundary 触发；
- edge transfer 在玩家从合法边缘格向地图外继续移动时触发；
- target commit 后地图、坐标、方向、camera、walking、layering 都继续使用现有规则；
- target Map/MapTransfer/Tileset/resource read 或结构验证失败时结束当前 Frame，不提交 half-loaded target authority；
- 冻结 acceptance fixture 必须 A → B → A。

### 1.2 明确不做

本刀不实现：

- 完整 RMXP/Event Interpreter；
- variable target、Conditional Branch、Script Command、Common Event；
- 通用 event page evaluator；
- 门动画、fade、黑屏 transition；
- connected-map 无缝同屏滚动；
- NPC、对话、战斗、菜单；
- Browser image decode failure 反向上报 Runtime；
- `SceneManager`、`WorldManager`、`MapRouter`、`TransitionService`；
- framework Runtime/Renderer/Data contract 修改。

遇到依赖上述能力的素材模式：按 Section 12 的 unsupported 规则处理，不得临场扩功能。

### 1.3 authority 边界

**Importer / compatibility** 负责把 RMXP/PBS 解释成 Runtime 可直接消费的事实，包括 event page/trigger/through、Transfer Player 参数、connection geometry、target tile eligibility、bounds 和 duplicate 检查。

**`@loomrealm-game/map` Runtime** 只负责 current-map authority、movement boundary、`steps/contacts/edges` lookup、target content load、atomic swap、input continuation 和 terminal failure。

**Browser** 不新增 transfer authority。target commit 后仍然只消费普通 RenderState。

---

## 2. Consumer contract：`struct.MapTransfer`

不修改已经 Closed 的 `struct.Map` / `struct.Tileset` shape。

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
  readonly id: number;
  readonly steps: readonly StepTransfer[];
  readonly contacts: readonly ContactTransfer[];
  readonly edges: readonly EdgeTransfer[];
}
```

### 2.1 三种 boundary

`StepTransfer(x,y)`：玩家已经成功走入 `(x,y)`；只在该 walking step 的 250ms `finishStep()` boundary 查找。不得在 step start、Browser progress 或 spawn 时触发。

`ContactTransfer(x,y,direction)`：玩家站在 `(x,y)`，向 `direction` 发起 in-bounds movement attempt；Importer 已经证明这是一个本刀支持的阻挡 player-touch transfer。因此 Runtime **先查 contact，再决定是否调用普通 tile `canMove()`**。

`EdgeTransfer(x,y,direction)`：玩家站在合法边缘格 `(x,y)`，向 `direction` 的下一格已经越出 current map；Importer 已经完成 geometry、target bounds 和 target d=0 passability 过滤。Runtime 命中 edge 即可 transfer，不再解释 connection/passage。

### 2.2 target direction

仅 event transfer 有 `targetDirection`：

- `null`：保留 transfer 前方向；
- `2/4/6/8`：target commit 后固定为该方向。

`EdgeTransfer` 没有 `targetDirection`，方向保持 source attempted direction；Section 12.5 已用官方行为确认。

### 2.3 唯一性

Importer 必须保证：

- 同一 `(x,y)` 最多一条 step；
- 同一 `(x,y,direction)` 最多一条 contact；
- 同一 `(x,y,direction)` 最多一条 edge。

重复或歧义是 projection failure，不能按数组顺序挑第一条。

Runtime 直接小数组 `find`；禁止 `TransferIndex`、persistent `Map` 或其他索引层。

### 2.4 FSDB 表示：必须是 plain JSON

`struct.MapTransfer/<id>` 是 Runtime 直接读取的 consumer record，磁盘 JSON 必须就是：

```json
{
  "id": 66,
  "steps": [],
  "contacts": [],
  "edges": []
}
```

不得出现 `$id`、`$array`、`$ref`、`$typed` 等 structured graph wrapper。

Canonical `MapTransfer` domain 必须使用与 M14 `Map/Tileset` 相同的 direct-consumer entry shape：

```ts
Readonly<{
  key: string;               // String(mapId)
  value: MapTransferRecord;
}>
```

`tools/fixtures/essentials-v21.1/lib/fsdb/mapper.mjs` 只做一项局部修改：在现有两处 `Map || Tileset` direct-JSON 分支中加入 `MapTransfer`。不要泛化 mapper，也不要让 Runtime 解 structured graph encoding。

---

## 3. Importer projection

### 3.1 唯一 feature module

新增：

```text
tools/fixtures/essentials-v21.1/lib/essentials/v21.1/map-transfer-consumer.mjs
```

输入固定为：

```text
RMXP roots
+ materializeM14ConsumerDomains() 产出的 Map entries
+ materializeM14ConsumerDomains() 产出的 Tileset entries
+ remaining.domains.PbsDocuments 中 family === "connections" 的 document
```

输出固定为：

```text
readonly { key: string, value: MapTransferRecord }[]
```

每个 `struct.Map/<id>` 必须恰好生成一个 `struct.MapTransfer/<id>`；无出口也生成空 arrays，不允许 Runtime optional fallback。

### 3.2 Event projection

只实现 Section 12.1–12.3 的冻结支持表。

有效但不属于支持表的 RMXP event：**忽略，不发射 transfer，也不尝试执行 event**。

以下情况必须 projection failure，而不是静默忽略：

- 已进入支持模式的 required decoded field 类型/形状错误；
- direct Transfer Player 参数类型非法；
- target map 不存在；
- target x/y 越界；
- duplicate/ambiguous projected key。

第一刀不得实现通用 page evaluator/Event Interpreter 来扩大支持面。

### 3.3 Connection projection

每条支持的 PBS connection 按 Section 12.4 先展开双向 geometry，再用 Section 12.5 的 target d=0 eligibility 过滤。

**passability authority 只在 Importer 一次完成。**

输出的 `EdgeTransfer` 含义就是：

```text
从 source (x,y,direction) 这一脚跨边缘
→ targetMapId/targetX/targetY 已存在、在 bounds 内、且按本刀冻结 d=0 子集可落地
```

因此 Runtime 不得再次：

- 调用 source `canMove()`；
- 检查 source direction bit；
- 检查 target reverse direction bit；
- 重新读取/解释 target passage。

### 3.4 canonical dataset 集成顺序

只在 `simple-game-data.mjs` 集成，顺序固定：

```text
compile PBS / obtain PbsDocuments
→ decode Marshal
→ decode RMXP
→ materialize existing M14 Map/Tileset
→ materialize MapTransfer(RMXP roots, M14 Map, M14 Tileset, connections PbsDocument)
→ merge MapTransfer into canonical domains
→ existing compiled-data / semantic / oracle flow
```

若该顺序与既有 canonical/oracle invariant 冲突：STOP，返回设计；不得改 framework 绕过。

---

## 4. Runtime current-map 模型

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

walking 已有玩家状态继续保留：

```text
x / y / direction
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

禁止 `transferId/epoch/token`、`activeTransfer`、MapSession/Scene/World manager。

### 4.1 `loadMap(mapId)`

局部 helper：

```ts
async function loadMap(mapId: number): Promise<LoadedMap>
```

固定读取顺序：

```text
1. struct.Map/<mapId>
2. validate Map
3. struct.MapTransfer/<mapId>
4. validate MapTransfer(value, mapId)
5. struct.Tileset/<map.tileset_id>
6. validate Tileset
7. resource.Graphics/Tilesets/<tileset_name>
8. build tilesetRef
9. return frozen LoadedMap
```

所有 Content read 使用 `frame.signal`；不做 cache/preload。

### 4.2 initial 与 transfer failure 分离

初始：

```text
current = await loadMap(input.mapId)
```

发生在 RenderDomain/InputListener 创建之前。initial content/read/validation/spawn failure 仍返回：

```text
MAP_ACTIVATION_FAILED
```

Frame live 后 `beginTransfer()` 的 target load/read/validation/bounds failure 通过 terminal channel 返回：

```text
MAP_TRANSFER_FAILED
```

Browser image decode failure不属于 `MAP_TRANSFER_FAILED`。

---

## 5. Activation / lifecycle

`frame(frame)` 顺序固定：

```text
1. parse/validate initial input
2. create frame-local terminal Promise/resolve state
3. define local loadMap/renderState/attempt/finishStep/beginTransfer/startTransfer helpers
4. current = await loadMap(input.mapId)
5. validate initial x/y inside current.map
6. load character resource and build playerRef
7. initialize walking state + transitioning=false
8. createRenderDomain(initial standing)
9. createInputListener(keyboard.event + keyboard.state)
10. register keyboard.event handler
11. register keyboard.state handler
12. await Promise.race(terminal, frame abort)
13. close listener
14. clear stepTimer
15. activeMove = null
16. transitioning = false
17. close RenderDomain
18. return exactly one FrameOutcome
```

RenderDomain 必须在 input handlers 注册前存在，以保持 walking 已冻结的 retained `keyboard.state` baseline 安全性。

transfer 不重建 Frame、RenderDomain 或 InputListener，也不使用 `frame.call()`。

---

## 6. Movement / transfer 状态机

### 6.1 `attempt(next)` 唯一顺序

```text
if frame.signal.aborted: return
if transitioning: return

direction = next
compute dx/dy/nx/ny
```

**A. `nx/ny` in bounds：先 contact**

```ts
const contact = current.transfers.contacts.find(
  rule => rule.x === x && rule.y === y && rule.direction === direction
);
```

命中即 `startTransfer(contact); return;`，不得调用 `canMove()`。

**B. in bounds 且无 contact：现有 walking**

- `canMove(...) === true`：capture from、commit target x/y、create ActiveMove、walking RenderState、250ms timer；
- `canMove(...) === false`：x/y 不变、清 active/timer、`nextStartPattern=1`、standing facing attempted direction；不得自动 retry 第二优先方向。

**C. `nx/ny` out of bounds：edge**

```ts
const edge = current.transfers.edges.find(
  rule => rule.x === x && rule.y === y && rule.direction === direction
);
```

- 无 edge：blocked standing；
- 有 edge：直接 `startTransfer(edge)`。

Runtime 不再做任何 edge passage 验证。edge 不创建 ActiveMove、不播放跨图 tween。

### 6.2 `finishStep(moveId)`

```text
if frame.signal.aborted: return
if activeMove?.id !== moveId: return
stepTimer = null
activeMove = null
```

然后：

```ts
const step = current.transfers.steps.find(
  rule => rule.x === x && rule.y === y
);
```

- 有 step：`startTransfer(step); return;`
- 无 step：完全沿用 walking frozen rule：held 非空则 toggle stride 并 attempt(highest held)，否则 reset stride + standing。

禁止 keydown、step start、Browser progress、spawn 扫描触发 StepTransfer。

---

## 7. Transfer transaction

### 7.1 `startTransfer()`

```ts
const startTransfer = (
  rule: StepTransfer | ContactTransfer | EdgeTransfer,
) => {
  if (frame.signal.aborted || transitioning) return;
  void beginTransfer(rule).catch(failTransfer);
};
```

Input handler / timer callback 不得直接 `return beginTransfer(...)`。

### 7.2 `beginTransfer()`

```ts
async function beginTransfer(
  rule: StepTransfer | ContactTransfer | EdgeTransfer,
): Promise<void>
```

入口：

```text
if frame aborted: return
if transitioning: return
transitioning = true
activeMove = null
clear stepTimer if present
stepTimer = null
nextStartPattern = 1
replace source standing RenderState
```

source authority 此时不变。step 的 source x/y 是刚完成 walking 的出口格；contact/edge 的 source x/y 不移动，direction 已是 attempted direction。

异步：

```text
const target = await loadMap(rule.targetMapId)
```

commit 前：

```text
if frame.signal.aborted: return
if !transitioning: return
validate rule.targetX/Y inside target.map
```

一次性 commit：

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

standing 必须 `pattern=0 / motion=null / cameraMotion=null`。

### 7.3 held continuation

target standing 后立即：

```text
if heldDirections.length > 0:
    attempt(highest-priority held direction)
```

不等待新的 `keyboard.state`。source-standing/target-standing/next-walking snapshots 允许被 latest-state transport coalesce。

---

## 8. Async failure / abort

frame-local terminal channel 固定为：

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

主等待：

```ts
const outcome = await Promise.race([
  terminal,
  waitForAbort(frame.signal).then(() => cancelled()),
]);
```

规则：

- abort 已发生时 `failTransfer()` 不发布 failure；
- 未 abort 时先 settle 的 outcome 胜；
- cleanup 只执行一次；
- late load completion 不得 replace closed domain；
- 禁止新增通用 Deferred/Task/ErrorBus/framework primitive。

---

## 9. Render / Browser convergence

transfer 可能投影：

```text
source standing
→ target standing
→ 若 held：target walking / blocked / next transfer
```

中间 snapshot 可以 coalesce；正确性只要求最终收敛到最新 Runtime authority。

Browser production **不得修改**。现有 `_latestData === requested`、resource currentness 和 rAF cancellation 必须保证旧地图延迟 image/rAF 不覆盖 target state。

在现有 `test/map-layering-browser.test.mjs` 增加一个 deterministic map-transfer latest-state regression，不新增 browser harness。

---

## 10. Validation

`validateMapTransferRecord(value, contentMapId)` 必须：

- exact top-level fields：`id/steps/contacts/edges`；
- `id === contentMapId`；
- `id/targetMapId` positive safe integer；
- `x/y/targetX/targetY` non-negative safe integer；
- contact/edge `direction` ∈ `2,4,6,8`；
- step/contact `targetDirection` ∈ `null,2,4,6,8`；
- edge exact fields中没有 `targetDirection`；
- 每个 nested record exact field set；
- duplicate step/contact/edge source key 拒绝；
- 返回 detached/deep-frozen normalized record，风格与现有 Map/Tileset validator 一致。

Importer 负责 source/target map existence、source coordinate、target bounds、connection target d=0 eligibility 和 projected duplicate；Runtime target load 时重复 target bounds check。

---

## 11. 文件、测试与完成门禁

### 11.1 Production ONLY

Frozen implementation 只允许修改：

```text
tools/fixtures/essentials-v21.1/lib/essentials/v21.1/map-transfer-consumer.mjs   # new
tools/fixtures/essentials-v21.1/lib/essentials/v21.1/simple-game-data.mjs
tools/fixtures/essentials-v21.1/lib/fsdb/mapper.mjs
game-libs/map/src/semantics.ts
game-libs/map/src/runtime.ts
```

mapper 只允许增加 `MapTransfer` plain-JSON direct-consumer 分支，不得做其他重构。

### 11.2 Tests ONLY

只允许新增/修改：

```text
tools/fixtures/essentials-v21.1/map-transfer-consumer.test.mjs   # new
game-libs/map/test/semantics.test.mjs
game-libs/map/test/runtime.test.mjs
test/map-layering-browser.test.mjs
```

### 11.3 明确禁止修改

```text
game-libs/map/browser/map.browser.js
packages/*
现有 m14-consumer.mjs / m14-consumer.test.mjs
struct.Map / struct.Tileset shape
root package scripts
closed M14/M15 qualification contracts
```

需要超出以上范围：STOP，报告 blocker。

### 11.4 Test responsibilities

**Importer test** 使用 `node:test` + `node:assert/strict`，复用 `m14-consumer.test.mjs` 的局部轻量 builders，不新增 shared test framework。必须证明：

- Section 12 event patterns 的 deterministic projection；
- unsupported event 不发射 transfer；
- malformed/target missing/out-of-bounds/duplicate fail closed；
- Section 12 connection geometry vectors；
- target d=0 blocked connection 不发射 EdgeTransfer；
- 每张 Map 都有 MapTransfer，包括 empty record；
- `simple-game-data.mjs` 集成后 canonical domain 存在；
- `mapCanonicalDataset()` 对 MapTransfer 产出 plain JSON，且 JSON 中没有 `$id/$array/$ref/$typed`。

**Semantics test** 直接覆盖 `validateMapTransferRecord()`：valid empty/step/contact/edge、unknown field、wrong content id、bad direction、duplicate keys、edge extra `targetDirection`、deep frozen result。

**Runtime test** 继续使用现有 fake ContentClient/RenderDomain/input/fake timers，不新增 production hook。至少证明：initial MapTransfer load；step timing；contact precedence；edge hit/miss（**不再测试 Runtime passage pass/fail**）；source standing；atomic target commit；direction；target Map/Tileset/MapTransfer；held continuation；no concurrent transfer；failure/abort race；no late replace；A→B→A。

**Browser test** 使用现有 Playwright/server/resource-delay harness：source delayed tileset 尚未完成时发送 target RenderData，再 resolve old source image，证明 old completion 不覆盖 target，target 最终正常 paint。

### 11.5 Exact gates

按顺序：

```bash
node --test tools/fixtures/essentials-v21.1/map-transfer-consumer.test.mjs
npm test -w @loomrealm-game/map
node --test test/map-layering-browser.test.mjs
npm run test:fixtures
npm run test:m14
```

全部 green，再检查：

```text
production diff 只含 Section 11.1 的 5 个文件
test diff 只含 Section 11.2 的 4 个文件
Browser production / packages / M14 consumer contracts 无改动
```

满足上述 gates + diff scope = **Implementation Complete**。

随后用 Section 12.6 的真实 event A↔B 与 map connection 在实际 Essentials v21.1 FSDB/example 中走通 = **Product Closed**。

不得修改既有 test/qualification contract 来让 gate 通过。

### 11.6 唯一施工顺序

```text
1. map-transfer-consumer.mjs
   - Section 12 event projection
   - Section 12 connection geometry + target d=0 filter
   - 每 Map 产出 {key,value} MapTransfer entry

2. simple-game-data.mjs
   - 按 Section 3.4 集成 MapTransfer domain

3. fsdb/mapper.mjs
   - 仅把 MapTransfer 加入 Map/Tileset 的 plain JSON 两处分支

4. semantics.ts
   - Step/Contact/Edge/MapTransfer types
   - validateMapTransferRecord()

5. runtime.ts — current map foundation
6. runtime.ts — transfer transaction/failure
7. runtime.ts — contact/edge/finishStep integration
8. importer test
9. semantics test
10. runtime test
11. browser regression
12. Section 11.5 exact gates
13. exact diff scope check
14. Section 12.6 real acceptance
```

任一步发现冻结事实无法成立：STOP，不进入下一步。

---

## 12. Frozen v21.1 evidence contract

本节已确认，无 TBD。implementation agent 只按原文投影。

证据来源：

- 本地 FSDB `[FSDB]Essentials v21.1/[resource]Data/Map*.rxdata`；
- 本地 `[resource]PBS/map_connections.txt` 与 `[resource]Data/map_connections.dat`；
- 官方 v21.1 Scripts：`Maruno17/pokemon-essentials@ea7b5d56`。

### 12.1 decoded tree 与 Transfer Player

```text
MapNNN.rxdata root:
  kind === "RmxpObject"
  className === "RPG::Map"
  fields["@events"].kind === "Hash"
  Hash.entries[i] = [numericKey, event]
  numericKey === event.fields["@id"]

event:
  className === "RPG::Event"
  fields used: @id @name @x @y @pages

page:
  fields used: @condition @graphic @through @always_on_top @trigger @list

page graphic:
  className === "RPG::Event::Page::Graphic"
  fields used: @character_name

command list:
  page.fields["@list"].kind === "Array"
  item className === "RPG::EventCommand"
  fields: @code @indent @parameters

Transfer Player:
  code = 201
  parameters[0] = appointment: 0 direct, 1 variable
  parameters[1] = targetMapId
  parameters[2] = targetX
  parameters[3] = targetY
  parameters[4] = direction
  parameters[5] = fade (ignored)

direction:
  0 -> targetDirection null
  2/4/6/8 -> same numeric Direction
```

只支持 `parameters[0] === 0`。

### 12.2 静态 page selection

官方 `Game_Event#refresh` reverse pages。

本刀静态选择规则：只把四个 condition valid 全为 false 的 page 视为可静态命中：

```text
switch1_valid === false
switch2_valid === false
variable_valid === false
self_switch_valid === false
```

从这些 page 中取 `pageIndex` 最大者。

没有这样的 page：event unsupported，不投影。

later conditional page 不执行、不解释。例如 Map066 Door page 1 的 switch/autorun 到达动画不参与本刀。

### 12.3 Frozen event patterns

共同前提：

```text
selected page trigger === 1                  # Player Touch
selected page always_on_top === false
event name 不匹配 hiddenitem / size(...)
selected page 恰好一条 indent===0 code 201
201 parameters[0] === 0
不得存在 indent!==0 的 code 201
```

其余命令不执行、不解释。

#### E-CONTACT-1

```text
selected page through === false
selected page graphic.character_name 为非空 RubyString
```

这是官方 player collision 必然阻挡的静态子集。输出对四个方向逐一展开：

```text
delta(2)=(0,1)
delta(4)=(-1,0)
delta(6)=(1,0)
delta(8)=(0,-1)

playerX = event.x - dx
playerY = event.y - dy
```

仅 playerX/playerY 在 source map bounds 内时发射 `ContactTransfer(playerX,playerY,direction,...)`。

真实 fixture：Map066 event 1 `Door`。

#### E-STEP-1

```text
selected page through === true
projectedD0Passable(source Map/Tileset, event.x, event.y) === true
```

输出一条 StepTransfer：

```text
x = event.x
y = event.y
targetMapId = parameters[1]
targetX = parameters[2]
targetY = parameters[3]
targetDirection = parameters[4] === 0 ? null : parameters[4]
```

真实 fixture：Map049 event 4 `Hole`、Map034 event 6 `Hole`。

#### 其他 event

以下均不投影，不报“成功支持”：

- variable appointment；
- action/event-touch/autorun/parallel trigger；
- `always_on_top === true`；
- direct support table之外的 through/graphic 组合；
- hiddenitem/size event；
- nested/conditional 201；
- 无静态 page。

不要把“unsupported”升级成 Event Interpreter。

### 12.4 `map_connections` geometry

官方 compiler schema `"iyiiyi"`：

```text
mapA, edgeA, offsetA, mapB, edgeB, offsetB
```

edge 接受 N/North、S/South、E/East、W/West，归一化成 N/S/E/W；只允许 N↔S、E↔W。

本 pack offset 全是非负整数；没有负 offset，**不要发明负 offset 语义**。

```text
getMapEdge(map, edge):
  N/W -> 0
  E   -> map.width
  S   -> map.height

若 edgeA 为 N/S:
  x1=offsetA; y1=getMapEdge(mapA,edgeA)
若 edgeA 为 E/W:
  x1=getMapEdge(mapA,edgeA); y1=offsetA
对 B 同理得到 x2,y2
```

对 source standing `(sx,sy)` 与 attempted direction：

```text
delta(2)=(0,1)
delta(4)=(-1,0)
delta(6)=(1,0)
delta(8)=(0,-1)
afterX=sx+dx
afterY=sy+dy

current=mapA:
  targetMapId=mapB
  targetX=x2-x1+afterX
  targetY=y2-y1+afterY

current=mapB:
  targetMapId=mapA
  targetX=x1-x2+afterX
  targetY=y1-y2+afterY
```

只枚举这一脚会越界的 source 边格。target 越界则不发射，不作为 import error；geometry overlap 为空也只是 0 条 EdgeTransfer。

冻结向量：

```text
PBS L18  2,W,0,66,E,0
Map066 (21,8) dir6 -> Map002 (0,8)
Map002 (0,8) dir4 -> Map066 (21,8)

PBS L12  7,S,0,5,N,2
Map007 (16,42) dir2 -> Map005 (18,0)
Map005 (18,0) dir8 -> Map007 (16,42)

PBS L24  7,E,0,23,W,78
geometry overlap = 0 EdgeTransfer
```

### 12.5 Target d=0 eligibility 与 edge direction

官方 edge path 不走普通 source `super` passability，而是到 target map 做 `passable?(targetX,targetY,0)`。

本刀缺少 terrain_tags/NPC，因此冻结成当前 consumer 可表达的 d=0 子集，并只在 Importer 执行：

```text
projectedD0Passable(map, tileset, x, y):
  out of bounds -> false
  for z in [2,1,0]:
    tileId = map.data[x,y,z]
    tileId === 0 -> continue
    tileId 越出 passages/priorities -> projection failure
    passage = passages[tileId]
    priority = priorities[tileId]
    (passage & 0x0F) === 0x0F -> false
    priority === 0 -> true
  return true
```

不检查 source direction bit，不检查 target reverse direction bit；忽略 terrain `ignore_passability/surf/bridge` 和 target NPC event collision。

只有 `projectedD0Passable(target) === true` 才写 EdgeTransfer。

crossing 后方向保持 attempted direction；官方 `setCurrentMap` 只 moveto 不 turn。

冻结 blocked 样本：PBS `66,N,18,5,S,0` 的几何落地格 passage=0x0F，因此生成 0 条 edge。

### 12.6 Real acceptance fixtures

**Event contact A→B→A**

```text
Map066 player (12,8), dir8
→ event 1 "Door" at (12,7)
→ Map067 (4,7), targetDirection=8

return:
Map067 player (4,7), dir2
→ event 1 "Exit" at (4,8)
→ Map066 (12,7), targetDirection=null
```

Map066 Door 的静态 selected page：trigger=1、through=false、always_on_top=false、non-empty character graphic；201 = `[0,67,4,7,8,1]`。conditional arrival page 不参与本刀。

**Map connection A→B→A**

```text
Map066 (21,8), dir6 -> Map002 (0,8), dir6
Map002 (0,8), dir4  -> Map066 (21,8), dir4
PBS: 2,W,0,66,E,0
```

fixture 必须来自实际 Essentials v21.1 FSDB/source，不得用 fake map 代替 Product Closed。

---

## 13. 抽象预算

允许新增的长期概念只有：

```text
MapTransferRecord
StepTransfer / ContactTransfer / EdgeTransfer data shapes
LoadedMap
transitioning boolean
loadMap / startTransfer / beginTransfer local helpers
frame-local terminal Promise/resolve
```

允许一个 feature-specific importer module；mapper 只增加 `MapTransfer` direct-JSON case。

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
MapCache / LoadedMapRepository / LRU / target preload
通用 Deferred / async task manager
Browser -> Runtime transfer ACK
```

---

## 14. 最终闭环

```text
Essentials v21.1 RMXP events + PBS connections
                    |
                    v
        map-transfer-consumer.mjs
        - static event projection
        - connection geometry
        - target d=0 eligibility
                    |
                    v
          plain struct.MapTransfer/<id>
                    |
                    v
          @loomrealm-game/map Runtime
        /            |             \
   contact       finishStep         edge
     |               |               |
     +---------------+---------------+
                     |
               startTransfer
                     |
              source standing
                     |
               load target
                /          \
            failure       success
              |              |
        terminal outcome  atomic current swap
                             |
                       target standing
                             |
                    held? -> attempt again
                             |
                     existing Browser
```

这份文档已经是 Frozen implementation contract。implementation agent 按 Section 11.6 机械实施；任意冲突 STOP 返回设计。