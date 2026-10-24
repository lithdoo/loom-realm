# Game Control Ports 与 Activation-scoped Common Controls Consumer 设计

> 状态：**Implemented / Qualified / Frozen**
> Executable subject：runtime `8346d15d033f93dfbb38d8d12812cdd29c90d691`；clean build graph `f051ae8eecb08a59ccf018f8afa000baeca32fe2`
> Evidence：[Game Control Ports v1 Qualification](../30-implementation/game-control-ports-v1-qualification.md)
> 适用范围：`game-libs/map`、`game-libs/rpg-dialogue`、`game-libs/game-common-controls`
> 目标：把“物理输入 / unified controls”与 Map、Dialogue 业务 Runtime 解耦，同时不新增独立 binding package
> 上游输入：[统一操控输入 Web Component](../../game-libs/game-common-controls/game-controls-input.md)
> Frame 投递：[Frame-targeted Presentation Event v1](../15-contracts/frame-targeted-presentation-event-v1.md)
> Map Control Port：[RPGMap Control Port v1](../20-modules/loom-map/control-port-v1.md)
> Dialogue Control Port：[RPG Dialogue v1 API](../../game-libs/rpg-dialogue/RPG_DIALOGUE_V1_API.md)
> Qualification 规则：[Qualification 与 Subject](../30-development/qualification.md)

本文是已落地的 game-library control-port 设计。它不修改已有 Frozen contract 的历史事实。Exact executable subject 与命令结果见 qualification evidence；后续 docs-only commit 不改变该 subject。

本文只拥有 control-port 及其消费边界，不拥有相邻系统的全部策略。以下事项仍由各自 owner 决定：

```text
Frame / Activation / top-frame wire semantics
→ existing framework contracts

<game-controls-input> producer semantics
→ existing game-common-controls contract

Map blocked/retry gameplay cadence
→ Map-specific movement contract / qualification；本次 landing 的 exact 选择见 §16

Dialogue/product concrete button mapping
→ Dialogue versioned contract or concrete product composition

input component owner / RenderDomain topology / mount lifetime
→ concrete product/example composition；本次两个 example 的 exact topology 见 §16
```

本文可以规定这些 owner 之间必须满足的接口约束，但不得替它们重新定义完整语义。

核心原则：

> **输入系统表达“玩家怎样操作设备”；Control Port 表达“玩家想让业务模块做什么”。Map / Dialogue 只依赖后者。**

同时坚持：

> **通用 controls 的采集、Frame 消费、freshness 和方向状态整理归 `@loomrealm-game/common-controls`；Map / Dialogue 的业务语义仍由各自模块拥有。**

---

## 1. 当前问题

当前两个模块都把业务逻辑与具体输入来源绑定在一起。

Map Runtime 当前同时负责：

```text
地图业务
+ keyboard.state / keyboard.event subscription
+ Keyboard code -> Direction
+ held direction tracking
+ fresh device State
+ raw input WebComponent composition
```

Dialogue Runtime 当前同时负责：

```text
Dialogue interaction
+ keyboard.event / gamepad.event subscription
+ physical key/button -> semantic action
```

这会产生三个问题：

1. Map / Dialogue 不能脱离 Keyboard/Gamepad 输入协议独立测试和复用；
2. 改键、触摸、AI、自动化测试、远程控制等新控制来源都要进入业务 Runtime；
3. unified `controls.state / controls.event` 已经完成设备归一化，但业务模块仍直接知道输入频道，抽象层没有闭环。

目标结构：

```text
Keyboard / standard Gamepad
        ↓
<game-controls-input>
        ↓
controls.state / controls.event
        ↓
@loomrealm-game/common-controls
Activation-scoped consumer / freshness / directional tracker
        ↓
product / game composition
        ↓
business Control Port
        ↓
Map / Dialogue Runtime
```

Map / Dialogue Runtime 最终不得知道：

```text
Keyboard code
Gamepad index / raw button
ControlsButtonV1
controls.state / controls.event
Presentation Event listener
fresh controls tracker
```

---

## 2. Ownership 与依赖方向

### 2.1 `@loomrealm-game/common-controls`

继续拥有已有能力：

```text
physical Keyboard / Gamepad sampling
14-button unified vocabulary
controls.state
controls.event
State refresh / freshness primitives
top-frame publication
```

本次新增**消费侧通用能力**：

```text
exact Frame presentation listener
Activation-scoped local consumer lifetime
controls payload validation
Activation-local neutral start
controls.state freshness
controls.state / controls.event callback surface
up/down/left/right held-order tracker
```

它仍然不知道：

```text
RPGMap
RPGDialogue
Battle
Menu
Inventory
story flow
map terrain
dialogue lifecycle
```

### 2.2 Map / Dialogue

只拥有业务控制语义：

```text
Map
→ current movement intent

Dialogue
→ confirm / previous / next / history / cancel
```

它们不拥有 physical/unified input binding policy。

### 2.3 Product / game composition

composition 是唯一同时知道两边的地方：

```text
common-controls vocabulary
+
具体业务 Control Port
```

它只做最后一厘米翻译：

```text
ControlsDirection "up"
→ Map Direction 8

controls button "south"
→ dialogue.controls.confirm()
```

以及决定当前哪个 semantic consumer active，例如 Dialogue overlay 打开时暂停 Map。

### 2.4 禁止反向业务依赖

禁止在 `common-controls` 中出现：

```ts
import type { RPGMapControls } from "@loomrealm-game/map";
import type { RPGDialogueControls } from "@loomrealm-game/rpg-dialogue";

bindRPGMapControls(...)
bindRPGDialogueControls(...)
```

否则通用包会逐步演化成：

```text
common-controls
├── Map binding
├── Dialogue binding
├── Battle binding
├── Menu binding
└── ...
```

这是本设计明确避免的中央业务控制器。

正确依赖方向：

```text
@loomrealm-game/common-controls
        ↑
        │ consume
product / game composition
        │
        ├──→ RPGMapControls
        └──→ RPGDialogueControls
```

Map / Dialogue core Runtime 不依赖 `common-controls`。

---

## 3. Map Control Port

Map 的控制模型是 **retained current intent**，不是按键 Event，也不是一步 movement command。

Public API 增加：

```ts
export interface RPGMapControls {
  setMoveIntent(direction: Direction | null): void;
}

export interface RPGMapHandler {
  readonly controls: RPGMapControls;

  onMapEntering(
    listener: (context: MapEnteringContext) => void | Promise<void>,
  ): () => void;

  onMapEntered(
    listener: (event: MapEnteredEvent) => void,
  ): () => void;

  run(initial: MapEntry): Promise<FrameOutcome>;
  enterMap(target: MapEntry): Promise<void>;
  setNPC(npcs: readonly NPCPlacement[]): Promise<void>;
  getSnapshot(): MapSnapshot | null;
}
```

`RPGMapHandler.controls` 在 Handler 构造时创建一次，identity 稳定：

```ts
handler.controls === handler.controls
// true
```

### 3.1 `setMoveIntent`

合法值：

```text
2    down
4    left
6    right
8    up
null neutral / no movement intent
```

非法 runtime value 必须同步抛 `TypeError`；不能静默变成 neutral。

`setMoveIntent()`：

- 返回 `void`；
- 不等待一次 movement 完成；
- 不表示目标坐标；
- 不创建 movement queue；
- 只替换一份 retained current fact。

初始值固定：

```text
moveIntent = null
```

### 3.2 普通移动不需要 `getSnapshot()`

调用方不得使用：

```text
getSnapshot()
→ 计算 next x/y
→ 再要求 Map 移动
```

驱动普通移动。

正确链路：

```text
setMoveIntent(8)
→ Map 自己读取 authoritative x/y
→ Map 自己执行 passability / terrain / NPC / transfer 判断
→ blocked | walk | jump
```

`getSnapshot()` 仍是 Query，只用于业务观察 committed facts；它不是 Control Port 的前置步骤。

明确保持 Command / Query 分离：

```text
controls.setMoveIntent(...)
→ 写当前意图

getSnapshot()
→ 读当前事实
```

### 3.3 Retained movement semantics

Runtime 内部只保留当前 `moveIntent`。Control Port 只冻结“意图是什么”，不重新定义完整的 Map movement scheduler。

`setMoveIntent(next)` 的语义：

```text
next === current moveIntent
→ idempotent
→ 不是一条新的 movement command

null -> direction
direction A -> direction B
→ 替换 retained intent

变化发生在 movement / transfer / event 等 busy 期间
→ 只保留最新 intent
→ 不排队旧 direction
```

成功 movement step 完成后，如果 retained intent 仍非空，Map 可以继续按最新 intent 进入下一次 movement attempt，从而表达 held movement：

```text
hold up
→ walk
→ walk
→ walk

during first walk change to left
→ 当前 walk 完成
→ 后续 movement 使用最新 left intent
```

但 **blocked 后何时再次 attempt 属于 Map gameplay policy**，不由本文冻结。本文只要求：

```text
blocked / walk / jump / transfer 等 outcome
→ 仍由 Map authority 决定

重复的 controls.state refresh
→ 不能被解释成“一条新的业务 movement command”

same-value setMoveIntent(...)
→ 不能因为 transport 重复投递而改变业务含义
```

本架构层不把 blocked/retry cadence 提升为跨产品 controls contract；但为了让本次 implementation 不再留实现选择，§16 的 canonical landing 明确采用：

```text
attempt(direction) → blocked
→ 保留 moveIntent
→ 不自动 retry
→ 不创建 retry timer
→ same-value setMoveIntent 不触发 retry
→ controls.state refresh 不触发 retry

只有 moveIntent 真正发生变化后，idle Map 才把它视为新的 movement intent。
successful movement step 的 held continuation 不是 blocked retry，仍可继续消费当前 retained intent。
```

因此本次实现会有意移除“raw keyboard State refresh 偶然触发 blocked retry”的历史行为。该变化必须同时写入 Map-specific contract / tests / qualification，不能伪装成无行为变化的 private refactor。

### 3.4 Handler lifecycle

Control Port 属于 Handler lifetime，而不是单次 scene。

在 `run()` 之前：

```text
setMoveIntent(direction)
→ 保存最新 retained intent
→ 不启动 movement
```

这样 composition 可以在 Runtime 完全初始化前先写入当前 Controls State；Map 就绪时直接消费，不必等待下一次 State refresh。

首个 scene commit 后：

```text
如果 moveIntent != null
→ 正常进入 movement attempt
```

Map entry / transfer 不自动清空 `moveIntent`；持续 held intent 属于同一 Handler current fact。

Runtime terminal cleanup 后：

```text
internal moveIntent = null
后续 controls 调用不再产生 gameplay side effect
```

Handler 仍是 single-run；Control Port 不改变现有 `run()` lifecycle。

---

## 4. Dialogue Control Port

Dialogue 的控制模型是 **transient semantic command**。

下一版 public surface 增加：

```ts
export interface RPGDialogueControls {
  confirm(): void;
  previous(): void;
  next(): void;
  history(): void;
  cancel(): void;
}

export class RPGDialogue {
  readonly controls: RPGDialogueControls;

  // existing public API remains
}
```

`dialogue.controls` identity 稳定：

```ts
dialogue.controls === dialogue.controls
// true
```

Control methods：

- 返回 `void`；
- 不返回 operation Promise；
- 不缓存；
- 不 replay；
- 不 queue；
- 不携带 Keyboard/Gamepad/ControlsButton identity。

真正 Conversation completion 仍由：

```ts
await dialogue.openConversation(...)
```

表达。

### 4.1 Semantic behavior

Control Port 直接进入现有 Dialogue semantic routing：

```text
confirm
previous
next
history
cancel
```

规则保持：

```text
CONVERSATION + confirm
→ conversation.commit

CONVERSATION + previous
→ conversation.choice-previous

CONVERSATION + next
→ conversation.choice-next

HISTORY + previous
→ history.scroll-up

HISTORY + next
→ history.scroll-down

history
→ toggle CONVERSATION / HISTORY

HISTORY + cancel
→ close History and return to CONVERSATION

CONVERSATION + cancel + cancelable=true
→ settle { type: "cancelled" }

CONVERSATION + cancel + cancelable=false
→ no settlement
```

### 4.2 Lifecycle

Control methods 属于 transient user intent：

```text
READY
→ no-op

ACTIVE
→ route according to current mode

CLOSED
→ no-op
```

生命周期 timing 不因为用户输入 race 抛异常。

业务 API（例如 `setHistory`、`appendHistory`、非法 `openConversation`）继续保留原有 strict error semantics；Control Port 与业务 mutation API 不混为一类。

如果内部 RenderDomain operation 失败，仍按 Dialogue 现有 fail-stop / terminate semantics 处理。

### 4.3 v0 Frozen compatibility

当前 `RPG Dialogue v0 API` 已 Frozen。

实现本设计时：

- 不得直接把 v0 contract 文档改成“原来就有 controls”；
- 必须新增明确的下一版 Dialogue API contract（建议 `RPG_DIALOGUE_V1_API.md`）；
- v1 保持现有 class name、constructor、Conversation/History API 兼容，只 additive 增加 `readonly controls`；
- v0 qualification evidence 继续只证明原 v0 executable subject；
- current HEAD 不再要求继续执行旧 raw-keyboard v0 closed-loop qualification；
- 旧 `test/rpg-dialogue-v0/qualification.test.mjs` 在 v1 landing 中删除；Git history + `doc/30-implementation/rpg-dialogue-v0-qualification.md` 保留历史 evidence；
- 新增 `test/rpg-dialogue-v1/qualification.test.mjs`，以 `dialogue.controls` 为 module-level interaction entrance；
- root `test:rpg-dialogue:qualification` / `test:rpg-dialogue` 改为 current v1 qualification；
- v1 implementation 必须有新的 exact-subject qualification。

---

## 5. Common Controls Consumer

不新增 `game-libs/control-bindings` package。

消费侧能力仍然进入同一个物理 package：

```text
game-libs/game-common-controls
```

但**不得修改已经 Frozen 的 package-root ABI**。新增 API 使用独立 subpath：

```text
@loomrealm-game/common-controls/subsystem
```

现有：

```text
@loomrealm-game/common-controls
```

继续保持 `game-controls-input.md` 已冻结的 root export surface；Consumer / Directional Tracker 不从 root re-export。

### 5.1 Activation-scoped consumer

建议新增 subpath public API：

```ts
import type {
  Frame,
  PresentationEventClient,
} from "@loomrealm/subsystem";

export interface ControlsConsumerHandlers {
  readonly onState?: (
    state: ControlsStatePayloadV1,
  ) => void | Promise<void>;

  readonly onEvent?: (
    event: ControlsEventPayloadV1,
  ) => void | Promise<void>;
}

export interface ControlsConsumer {
  close(): void;
}

export function createControlsConsumer(
  presentationEvents: PresentationEventClient,
  frame: Frame,
  handlers: ControlsConsumerHandlers,
): ControlsConsumer;
```

使用者传：

```ts
scope.presentationEvents
frame
```

而不是整个 `SubsystemScope`。这样 consumer 只依赖公开 Presentation Event author API，不拥有其他 Subsystem 能力。

实现可以对 `@loomrealm/subsystem` 使用 type-only import；package metadata 仍必须声明正确依赖，不能依靠 workspace 偶然可见性。

**Activation-scoped 是 caller/composition 的 lifecycle contract，不是 Consumer 自己从事件对象推导出来的事实。** 当前 `PresentationFrameEvent` 不暴露 `activationId`，Frame suspend / resume 也不会 abort `frame.signal`。因此 Consumer 不能自动检测“同一个 Frame 已从 A1 resume 到 fresh A2”。

固定规则：

```text
current Activation begins
→ create a fresh ControlsConsumer
→ local State starts neutral

before caller relinquishes current Activation
例如 frame.call 导致 caller suspend
→ neutralize retained business port where needed
→ reset/discard local directional tracker
→ close current ControlsConsumer

frame.call resolves and caller resumes with fresh Activation
→ create a fresh ControlsConsumer
→ create/reset fresh local tracker
→ start neutral
→ only new controls.state may rebuild held truth
```

禁止让同一个 Consumer/local held cache 跨 fresh Activation 继续使用。

### 5.2 Consumer responsibilities

`createControlsConsumer()` 固定负责：

```text
create exact Frame Presentation listener
根据 handlers 只订阅需要的 controls channels
验证 event.name / payload
controls.state → createFreshControlsStateTracker
CONTROLS_STATE_STALE_MS silence → local EMPTY_CONTROLS_STATE_V1
Frame terminal abort / explicit close → cleanup listener + freshness timer
Event 不 replay
```

Framework 的 Presentation gate 已保证旧 Activation Event 不会投递到 fresh Activation；Consumer 额外负责的只是**当前创建实例内部**的 local State / freshness。Activation replacement 的 neutral reset 由上面的 caller lifecycle 通过 close + fresh create 保证。

如果提供 `onState`，Consumer 创建后本地状态先从：

```text
EMPTY_CONTROLS_STATE_V1
```

开始，并立即向 `onState` 交付一次 neutral local baseline；随后只接受该 Consumer lifetime 内实际收到的 State publication。

这不是 wire replay，也不发送任何消息，只是 consumer-local 初始事实。

如果没有 `onState`，不创建 freshness tracker。

Callback failure policy 与现有 Presentation Event handler isolation 对齐：

```text
initial onState(EMPTY...)
later onState(...)
later onEvent(...)
    ↓
sync throw
or returned Promise rejects
    ↓
failure stays local to this callback invocation
    ↓
Consumer remains live
later deliveries continue
```

Consumer 不把 callback Promise 当作 flow control：调用顺序按 delivery 顺序发生，但不等待上一 callback Promise settle，也不因为 rejected Promise 终止 Consumer。实现必须为 returned thenable 安装 rejection sink，避免 unhandled rejection。

因此 generic Consumer 只负责可靠地“交付并隔离 callback failure”；如果具体 gameplay 希望 callback failure 升级为 fatal，由 product/business callback 自己显式执行对应 fail-stop policy。

`close()`：

```text
close presentation listener
close fresh-state tracker
remove Frame abort listener
以后所有 delivery no-op
不合成 controls.event
```

业务 retained state 的 neutralization由 composition / Control Port lifecycle 明确执行；generic Consumer 不猜测业务含义。

### 5.3 Payload gate

Consumer 对 malformed payload fail closed，但本文不复制定义 controls wire schema。

Canonical payload / event-name / button-order 规则继续由现有 [统一操控输入 Web Component](../../game-libs/game-common-controls/game-controls-input.md) 与 [Game Common Controls Input v1](../15-contracts/game-common-controls-input-v1.md) 拥有。

Consumer 只负责：

```text
收到 controls.state / controls.event
→ 按 canonical v1 contract 验证
→ valid: 进入 local freshness / handler
→ invalid: drop
           不调用 handler
           不污染 local State
           不把 validation error 抛到 gameplay
```

未来 producer contract 版本变化时，应通过 versioned consumer surface 处理，而不是在本文维护第二份 wire schema。

---

## 6. Directional Controls Tracker

Map 需要 last-pressed-wins，但这个算法只依赖：

```text
up / down / left / right
controls State/Event semantics
```

因此它也是 `common-controls` 的通用 helper，不属于 Map，并与 Consumer 一起从 `@loomrealm-game/common-controls/subsystem` 导出。

建议新增：

```ts
export type ControlsDirection =
  | "up"
  | "down"
  | "left"
  | "right";

export interface DirectionalControlsTracker {
  readonly direction: ControlsDirection | null;

  acceptState(state: ControlsStatePayloadV1): void;
  acceptEvent(event: ControlsEventPayloadV1): void;
  reset(): void;
}

export function createDirectionalControlsTracker(): DirectionalControlsTracker;
```

Tracker 不监听 Frame，不拥有 timer，不知道 Map。

### 6.1 State truth

内部维护：

```text
freshDown: Set<ControlsDirection>
heldOrder: ControlsDirection[]
```

收到 State：

1. 从 `heldOrder` 删除已经不在 State 中的方向；
2. 对 State 中存在但 `heldOrder` 尚未知的方向，按 `up, down, left, right` 顺序追加；
3. `direction = heldOrder.at(-1) ?? null`。

State 是 truth；Event 不是 held truth。

### 6.2 Event 只提供 recency hint

收到 Event：

```text
directional down + repeat=false
→ 只有当该方向当前存在于 freshDown
→ 从 heldOrder 原位置移除
→ 追加到末尾

directional up
→ 从 heldOrder 移除

repeat=true
→ 不改变 ordering

non-directional button
→ ignore
```

因为 physical edge 在 unified controls 中保证 State-before-Event，所以正常 down Event 到来时 State 已经包含该方向。

Event 丢失不会制造 stuck movement；后续 State 仍能恢复 held truth。

Activation 刚开始如果只收到一个包含多个方向的 State、没有 Event history，使用 canonical append 顺序作为确定性 fallback。

### 6.3 Reset

`reset()`：

```text
freshDown = {}
heldOrder = []
direction = null
```

Consumer 的 initial neutral / freshness fallback State 也会自然把 Tracker 收敛到 neutral。

---

## 7. Map Composition Adapter

Map 的最后一厘米映射放在实际 product/game composition，不放入 `common-controls`，也不放入 Map Runtime。

示意：

```ts
const directions = createDirectionalControlsTracker();

const consumer = createControlsConsumer(
  scope.presentationEvents,
  frame,
  {
    onState(state) {
      directions.acceptState(state);
      applyMapIntent();
    },
    onEvent(event) {
      directions.acceptEvent(event);
      applyMapIntent();
    },
  },
);

function toMapDirection(
  direction: ControlsDirection | null,
): Direction | null {
  switch (direction) {
    case "up": return 8;
    case "down": return 2;
    case "left": return 4;
    case "right": return 6;
    case null: return null;
  }
}

function applyMapIntent() {
  map.controls.setMoveIntent(
    mapControlsActive
      ? toMapDirection(directions.direction)
      : null,
  );
}
```

这里唯一知道：

```text
ControlsDirection -> Map Direction
```

的地方是 composition。

Map Runtime 本身完全不知道 controls vocabulary。

---

## 8. Dialogue Composition Adapter

Dialogue 同样只在 composition 做映射。下面只是一份**非规范示例**，用于说明边界，不冻结 product 的具体键位：

```ts
const consumer = createControlsConsumer(
  scope.presentationEvents,
  frame,
  {
    onEvent(event) {
      if (!dialogueControlsActive) return;
      if (event.action !== "down" || event.repeat) return;

      switch (event.button) {
        case "south":
        case "start":
          dialogue.controls.confirm();
          break;
        case "up":
          dialogue.controls.previous();
          break;
        case "down":
          dialogue.controls.next();
          break;
        case "select":
          dialogue.controls.history();
          break;
        case "east":
          dialogue.controls.cancel();
          break;
      }
    },
  },
);
```

这里真正由本文冻结的只有依赖方向：

```text
controls vocabulary
→ composition-owned mapping
→ RPGDialogueControls semantic command
```

具体 button mapping、是否接受 repeat、是否保留 legacy physical aliases，都由具体 product composition 决定；如果未来要成为 RPG Dialogue v1 的正式 default policy，应由 Dialogue 的 versioned contract 拥有并 qualification，而不是由本文拥有。

---

## 9. Composition policy：same-Frame overlay 与 child-Frame modal

必须区分两种不同 composition；两者不能混成同一套 active-switch 规则。

### 9.1 Same-Frame overlay

当 Map 与 Dialogue-like UI 真正在**同一个 active Frame** 内共存时，哪个 semantic consumer 当前 active 是 product/game composition policy，不是 `common-controls` authority。

典型：

```ts
function setMapControlsActive(active: boolean) {
  mapControlsActive = active;
  map.controls.setMoveIntent(
    active
      ? toMapDirection(directions.direction)
      : null,
  );
}

function setDialogueControlsActive(active: boolean) {
  dialogueControlsActive = active;
}
```

Dialogue overlay：

```ts
setMapControlsActive(false);
setDialogueControlsActive(true);

try {
  const result = await dialogue.openConversation(request);
  // story flow...
} finally {
  setDialogueControlsActive(false);
  setMapControlsActive(true);
}
```

必须满足：

```text
Map inactive
→ 立即 moveIntent = null

Map inactive 期间
→ Controls Consumer + Directional Tracker 仍继续观察当前 State/Event
→ 不把 movement intent 应用给 Map

Map reactivate
→ 立即把 tracker 当前 direction 写回 Map
→ 不等待下一次 State refresh

Dialogue inactive
→ Event 直接 drop

Dialogue reactivate
→ 只处理之后的新 Event
→ 不 replay inactive 期间 Event
```

这不是新的全局 Input Authority。

Framework 仍然只负责：

```text
current Top Active Frame
+ exact Frame/Activation
+ exact presentation Interest
```

composition 只决定同一 active Frame 内哪个 semantic port 当前接受控制。

### 9.2 Child-Frame modal

如果业务使用 LoomRealm canonical Frame call：

```text
World / Map Frame A1
→ frame.call(Dialogue)
→ World suspended
→ Dialogue child Frame becomes Top Active Frame
→ Dialogue returns
→ World resumes with fresh Activation A2
```

则**不使用 same-Frame 的 map/dialogue active flag 来模拟 Frame authority**。Main 的 Top Frame + exact Activation + Presentation Interest 已经决定 controls 的 destination。

Caller 必须在 relinquish A1 前清理 retained/local control state：

```ts
map.controls.setMoveIntent(null);
directions.reset();
consumer.close();

const result = await frame.call("dialogue", params);

// code after await runs after caller resume with fresh Activation
const nextDirections = createDirectionalControlsTracker();
const nextConsumer = createControlsConsumer(
  scope.presentationEvents,
  frame,
  nextHandlers,
);
```

fresh A2 必须从 neutral 开始；不得把 A1 的 `directions`、fresh State timer 或 Consumer 实例带到 A2。玩家如果仍真实按住方向，后续在 A2 lease 下重新接受的 `controls.state` 会重建 current held truth。

Child Dialogue Frame 自己创建属于它当前 Activation 的 Consumer；它结束时关闭自己的 Consumer。这样：

```text
Frame authority
→ 决定“输入发给哪个 Frame”

composition adapter
→ 决定“这个 Frame 收到 controls 后映射成什么业务动作”
```

---

## 10. Dialogue migration compatibility

这是迁移约束，不是新的 default key-binding contract。

当前 Dialogue v0 的 shipped physical policy 包含 `Space` / `Escape`，而 unified controls v1 的固定 vocabulary / Keyboard aliases 并不能无损表达这两项。具体差异以现有 Dialogue v0 contract 与 `game-controls-input` Frozen contract 为准。

因此任何 product 从 raw Keyboard/Gamepad 迁到 unified controls 时，都必须显式选择：

```text
accept a new product-level mapping
or
provide a product-owned compatibility path
```

不得：

```text
为了兼容而把 raw Keyboard dependency 放回 Dialogue Runtime
为了兼容而偷偷修改 Frozen game-controls-input v1 mapping
在本文宣称某一套 product mapping 是全局默认
```

如果 RPG Dialogue v1 需要正式冻结新的 default control policy，应由 Dialogue v1 contract 单独定义。

---

## 11. Input Component Composition

Map / Dialogue core 不再拥有 physical/unified input component composition。Map 当前为输入而创建的 raw Keyboard/Gamepad roots 必须从 Map movement path 移出；Dialogue Runtime 也不再订阅 raw `keyboard.event / gamepad.event`。

至于 `<game-controls-input>` 由哪个 subsystem / RenderDomain 挂载、是否跨 Frame call 持续存在、何时 mount/unmount，全部属于**具体 product/example composition**，通用架构不指定唯一 topology。

为了让当前 implementation 可以一次闭环，§16 只对本次两个 canonical example 指定私有 `base` Subsystem landing；这不是新的 framework/game-library contract。

本文只要求具体 composition 遵守现有 producer contract：

```text
需要 unified controls 时
→ product 自己提供可用的 <game-controls-input>

one Window
→ at most one active <game-controls-input>

Framework
→ 不默认创建 producer
```

Pointer 仍是独立能力；是否需要 `game-pointer-input` 由具体业务决定，不因 Map 历史上存在 pointer root 就自动保留或删除。

最终依赖边界是：

```text
product-owned input composition
    → game-controls-input (when chosen)

common-controls/subsystem
    → Activation-local consumer primitives

Map / Dialogue
    → business / presentation only
```

---

## 12. Activation / teardown

`createControlsConsumer` 通过真实 `Frame` object 建立 exact Presentation Interest，但**Consumer/local cache 的使用 lifetime 是当前 Activation**。

必须保持：

```text
new Activation
→ fresh Consumer
→ fresh/reset Directional Tracker
→ local State starts neutral

old Activation revoked / caller about to suspend
→ neutralize retained business intent
→ reset/discard tracker
→ close Consumer

old Activation Event
→ Framework gate rejects for fresh Activation

later controls.state accepted under fresh Activation
→ rebuild current held truth

Frame terminal abort / Consumer close
→ listener + freshness cleanup
→ no replay / retarget
```

禁止：

```text
carry one Consumer across A1 -> suspend -> A2
carry old heldOrder into new Activation
use old freshness timer in new Activation
replay old Dialogue Event
retarget Event
use old Activation cached State as new truth
```

Map 的 Handler-level `moveIntent` 可以在同一 Handler 的 scene transfer 中持续，因为 scene transfer 不等于 Frame Activation replacement；但一旦 caller relinquishes Activation，composition 必须先 neutralize它。

销毁或结束当前 Activation controls wiring 时，Map 至少执行：

```ts
map.controls.setMoveIntent(null);
directions.reset();
consumer.close();
```

fresh Activation 再创建新的 Consumer/Tracker。

---

## 13. Implementation plan

### 13.1 `game-libs/game-common-controls`

新增建议：

```text
src/consumer.ts
    createControlsConsumer
    payload validation
    Frame terminal abort cleanup
    State freshness integration

src/directional-controls.ts
    ControlsDirection
    createDirectionalControlsTracker
    State truth + Event recency ordering

src/subsystem.ts
    exact public entry for Consumer / Directional Tracker
    MUST NOT be re-exported from root src/index.ts

package.json
    add "./subsystem" export -> dist/subsystem.js + dist/subsystem.d.ts
    keep existing "." root export surface exact
    declare @loomrealm/subsystem dependency required by subpath public type surface
    no dependency on Map / Dialogue
```

现有：

```text
browser/device-input.browser.ts
controls-machine.ts
raw device sources
```

不因为本次消费侧改造改变 Frozen producer semantics。

### 13.2 `game-libs/map`

修改：

```text
src/runtime.ts
    remove SessionEvent raw keyboard subscription
    remove createFreshDeviceStateTracker
    remove codeByDirection / fallbackCodes / receiveKeyboardEvent
    add retained moveIntent
    add stable RPGMapControls object
    movement completion reads latest moveIntent
    cleanup neutralizes/detaches controls
    remove raw input Render roots

src/index.ts
    export RPGMapControls

package.json
    remove @loomrealm-game/common-controls dependency
    remove "prebuild": "npm run build -w @loomrealm-game/common-controls"
    no residual build-time coupling to common-controls
```

必须保持以下 authority 完全在 Map Runtime：

```text
coordinates
passability
terrain
bridge
NPC collision
transfer
motion timing
RenderDomain
```

### 13.3 `game-libs/rpg-dialogue`

修改：

```text
src/runtime.ts
    keep Web Presentation submit subscription
    remove keyboard.event / gamepad.event subscription
    expose stable controls object
    controls methods call semantic routeSafely(...)

src/model.ts / src/index.ts
    export RPGDialogueControls

RPG_DIALOGUE_V1_API.md
    freeze additive v1 public surface
    keep v0 contract as historical compatibility baseline
```

现有 Conversation / History / Render projection semantics 不因这次 control refactor 重写。

### 13.4 Product / examples

不新增 `control-bindings` package。

通用要求：

```text
product owns input component placement/lifetime
respect one-active-producer-per-Window contract
business Frame owns its Activation-local consumer/tracker
translate generic controls to module Control Port in product composition
same-Frame overlay → local active flags
child-Frame modal → close/neutralize before call, fresh create after resume
```

本次 repository landing 的两个 concrete examples、文件结构与依赖变化由 §16 exact 指定。以后其他产品可以采用不同 product-owned topology，只要满足上述边界；不得把本次 `base` topology 反向提升成 framework/game-library mandatory shape。

---

## 14. Tests / Qualification

### 14.1 Common controls consumer tests

至少覆盖：

- Consumer 只订阅请求的 controls channels；
- initial `onState(EMPTY_CONTROLS_STATE_V1)`；
- valid State delivery；
- valid Event delivery；
- malformed State/Event fail closed；
- State 按 `CONTROLS_STATE_STALE_MS` fallback；
- Event 不 replay；
- close 幂等；
- Frame terminal abort cleanup；
- Consumer 不尝试从 PresentationFrameEvent 推导 activationId；
- A1 consumer close 后，fresh A2 consumer 从 EMPTY 开始；
- old Activation Event 不进入 fresh Activation；
- initial neutral callback sync throw isolated；
- State/Event callback sync throw isolated，later delivery 继续；
- returned rejected Promise isolated，不产生 unhandled rejection，不阻塞 later delivery；
- root `@loomrealm-game/common-controls` export surface 保持原 Frozen ABI；
- `@loomrealm-game/common-controls/subsystem` exact export surface 单独测试；
- 不引入 Map / Dialogue package dependency。

Directional Tracker：

- State `["up"]` → direction `"up"`；
- State empty → null；
- last-pressed-wins；
- repeat Event 不改变 recency；
- Event 丢失后 State 仍能恢复 truth；
- simultaneous State without Event history 使用 deterministic canonical fallback；
- non-directional button ignore；
- reset → null。

### 14.2 Map unit tests

至少覆盖：

- `controls` stable identity；
- initial `moveIntent=null`；
- pre-run `setMoveIntent(8)` retained，首 scene ready 后开始向上；
- held intent 在成功 step 完成后继续；
- movement 中改方向只影响下一 attempt，不排队旧 direction；
- `setMoveIntent(null)` 在当前 step 完成后停止继续移动；
- same-value `setMoveIntent` idempotent，不代表新的 movement command；
- controls State refresh 不通过重复 setter 偷偷成为新的业务 command；
- blocked 后 retained intent 保留但不自动 retry；
- blocked 后无 retry timer；
- neutral/other direction 后再次写 direction 属于真实 intent change，可在 idle 时重新 attempt；
- blocked movement 的碰撞/passability authority 仍完全由 Map Runtime 决定；
- Map-specific contract / qualification 显式记录本次 blocked/retry 行为变化；
- transfer / NPC / bridge semantics 不迁出 Runtime；
- invalid direction runtime value throws `TypeError`；
- terminal cleanup 后 controls 不产生 gameplay side effect；
- movement path 不调用 `getSnapshot()`；
- Map Runtime source 不再出现 raw/unified input subscription；
- Map Render Tree 不再包含 raw input component roots。

### 14.3 Dialogue unit tests

至少覆盖：

- `controls` stable identity；
- READY command no-op；
- ACTIVE confirm / previous / next；
- HISTORY previous / next；
- history toggle；
- cancel precedence；
- cancelable=false；
- CLOSED command no-op；
- controls methods不 queue/replay；
- Runtime 只保留 Web Presentation business submit subscription；
- Runtime 不再包含 `keyboard.event / gamepad.event / controls.event` mapping。

### 14.4 Composition tests

Map：

- State `["up"]` → tracker `"up"` → `setMoveIntent(8)`；
- State `[]` → null；
- inactive → immediate `setMoveIntent(null)`；
- inactive 期间 tracker 继续更新；
- reactivate → immediate latest tracker direction；
- teardown → null + reset + consumer close。

Dialogue：

- composition-selected mapping 能驱动对应 semantic command；
- architecture qualification 不冻结具体 button table；
- inactive drop；
- reactivate不 replay；
- close后不再产生 command。

Same-Frame overlay：

```text
Map walking
→ Map controls inactive
→ moveIntent neutral
→ Dialogue controls active
→ Dialogue closes
→ Dialogue inactive
→ Map active
→ current tracker direction immediately restores movement intent
```

Child-Frame modal：

```text
World A1 controls live
→ before frame.call: Map neutral + tracker reset + consumer close
→ child Dialogue Frame owns fresh consumer
→ child returns
→ World resumes as fresh A2
→ fresh consumer/tracker start neutral
→ only A2 controls.state may restore held movement
```

Canonical example composition：

```text
Essentials base Frame
PokeMan base Frame
→ each owns exactly one product-private game-controls-input RenderNode
→ base calls map as child Frame
→ base suspension does not destroy its RenderDomain
→ top-frame publication therefore reaches current Map child

Map child Frame
→ owns fresh ControlsConsumer + Directional Tracker
→ maps generic direction to RPGMapControls
→ teardown neutral + reset + close
```

### 14.5 Integration qualification

至少有一条真实闭环：

```text
Browser trusted Keyboard/Gamepad
→ game-controls-input
→ broadcast:"top-frame"
→ @loomrealm-game/common-controls/subsystem
→ fresh Activation-scoped createControlsConsumer
→ composition mapping
→ Map / Dialogue Control Port
→ observable gameplay effect
```

受影响 subject 必须按 repository qualification/staleness 规则重新判断，不能沿用旧 Map / Dialogue PASS。

---

## 15. Non-goals

本次不做：

- 独立 `@loomrealm-game/control-bindings` package；
- `common-controls` import Map / Dialogue；
- 修改已 Frozen 的 `@loomrealm-game/common-controls` root export surface；
- 把本次 example-private `base` topology 提升为所有 product 的 mandatory topology；
- 把本次 Map blocked landing policy 提升为 common-controls / Framework contract；
- 在本文冻结某个 product 的 Dialogue button mapping；
- Framework InputTarget / 新 input authority；
- 修改 `game-controls-input` Frozen v1 vocabulary；
- retained Dialogue command；
- Map pathfinding / click-to-move；
- analog stick；
- key rebinding public UI；
- Story Graph；
- Pointer business interaction；
- 统一 `GameControls.dispatch(string)`；
- 让 caller 通过 `getSnapshot()` 计算普通 movement。

如果未来需要 analog movement、pointer/touch、AI navigation 或 remapping，应增加通用 controls primitive 或 product composition policy，而不是重新把 physical device dependency 放回业务 Runtime。

---

## 16. Canonical implementation landing profile

本节只回答“**当前 repository 这一轮到底怎么落**”。它不是新的跨产品 mandatory architecture；目的是让 coding agent 不再自行选择 product topology、blocked retry、Dialogue qualification 或 callback failure policy。

### 16.1 Exact change set

本次必须闭环以下位置：

```text
game-libs/game-common-controls
game-libs/map
game-libs/rpg-dialogue

examples/essentials-v21.1
examples/PokeMan

examples/PokeMan/launch.pwa.json
examples/PokeMan/scripts/prepare-pwa-content.mjs
apps/pwa/scripts/build.mjs
apps/pwa/src/pokeman-window-entry.ts
apps/pwa/test/pokeman-bundle.test.mjs
apps/pwa/test/pokeman-map.e2e.test.mjs

root package.json / package-lock.json
affected module docs / qualification evidence
```

不得只完成三个 library 而留下 canonical examples 继续依赖 Map-owned raw input roots；也不得把 PokeMan Desktop 改成 `base + map` 后，继续让其 PWA bundle / staging / qualification 假定只有一个 `map` executable。

### 16.2 Example-private Base Subsystem

Essentials 与 PokeMan 各自新增自己的 private infrastructure Subsystem：

```text
Game
└─ base
   ├─ owns one <game-controls-input> RenderNode
   └─ frame.call("map", initialMapParams)
          ↓
        map Frame
```

这里的 `base`：

- 是 example/product-private Subsystem；
- 不是 `@loomrealm-game/*` library；
- 不是 Framework authority；
- 不消费 `controls.state/event`；
- 不知道 `RPGMapControls` / `RPGDialogueControls`；
- 只负责该 example 的长期 product infrastructure producer composition。

Canonical Base Frame 结构：

```ts
export default defineSubsystem((scope) => ({
  async frame(frame) {
    const inputHost = scope.createRenderDomain({
      zIndex: 0,
      roots: [{
        key: "game-controls-input",
        tag: "game-controls-input",
        attrs: {},
        data: {},
        children: [],
      }],
    });

    try {
      return await frame.call("map", frame.params);
    } finally {
      inputHost.close();
    }
  },
}));
```

现有 Framework contract 已保证：

```text
base calls map
→ base Frame suspends
→ base RenderDomain is not automatically destroyed/hidden
→ game-controls-input remains live
→ broadcast:"top-frame" targets active Map child
```

Base 不得自己订阅 controls 再转发给 child；否则会变成第二个中央 Input Authority。

两个 example 的 Game Entry / Hostra topology 固定改为：

```text
initial subsystem = base
registered subsystems = base + map

launch.hostra.json
base -> subsystems/base.mjs
map  -> subsystems/map.mjs
```

原来的 Map initial params 原样作为 Base Frame params，并由 Base 原样传给 child Map。

### 16.3 Example Map composition

两个 example 的 `subsystems/map.mjs` 都是 product composition seam。它们负责：

```text
construct RPGMapHandler
create DirectionalControlsTracker
create Activation-local ControlsConsumer
ControlsDirection -> Direction mapping
write handler.controls.setMoveIntent(...)
run Map
finally neutral + reset + close
```

概念结构：

```ts
const map = new RPGMapBuilder(scope, frame).build(...);
const directions = createDirectionalControlsTracker();

const apply = () => {
  map.controls.setMoveIntent(toMapDirection(directions.direction));
};

const consumer = createControlsConsumer(
  scope.presentationEvents,
  frame,
  {
    onState(state) {
      directions.acceptState(state);
      apply();
    },
    onEvent(event) {
      directions.acceptEvent(event);
      apply();
    },
  },
);

try {
  return await map.run(...);
} finally {
  map.controls.setMoveIntent(null);
  directions.reset();
  consumer.close();
}
```

本次 Map-only child 不执行 nested `frame.call()`，所以一个 Map Frame Activation 使用一套 Consumer/Tracker 即可。未来 World/Dialogue/Battle composition 仍必须遵循本文 Activation-scoped close/fresh-create 规则。

### 16.4 Exact package changes

`@loomrealm-game/common-controls`：

```text
add dependency @loomrealm/subsystem
add "./subsystem" package export
root "." exact exports unchanged
src/index.ts does not re-export subsystem consumer API
```

`@loomrealm-game/map`：

```text
remove @loomrealm-game/common-controls dependency
remove common-controls prebuild script
Map core has zero raw/unified controls dependency
```

`@loomrealm-example/essentials-v21.1`：

```text
already depends on @loomrealm-game/common-controls
add subsystems/base.mjs
change game.json / launch.hostra.json to base + map topology
map.mjs imports @loomrealm-game/common-controls/subsystem
```

`@loomrealm-example/pokeman`：

```text
add @loomrealm-game/common-controls dependency
add subsystems/base.mjs
change game.json / launch.hostra.json to base + map topology
map.mjs imports @loomrealm-game/common-controls/subsystem
```

两边 Presentation 必须继续加载 `controls/device-input.browser.js`，使 `game-controls-input` custom element 已注册；具体资源同步继续由各 example 现有 Presentation pipeline 拥有。

### 16.5 Map blocked policy for this landing

本次 Map-specific behavior 固定为：

```text
direction intent starts/changes while idle
→ attempt latest direction

successful step completes and intent still non-null
→ continue with latest direction

attempt → blocked
→ update Map-owned blocked/facing facts as appropriate
→ keep moveIntent
→ STOP
→ no automatic retry
→ no timer
→ no retry from controls State refresh
→ no retry from same-value setMoveIntent

player releases/changes direction, then supplies a direction again
→ genuine intent change
→ idle Map may attempt again
```

本次 `setNPC`、passability mutation 等 world changes **不隐式唤醒 blocked retained intent**。未来若 Map 需要这种“障碍消失后自动继续”的 gameplay，可由 Map-specific contract 新增明确 wake-up semantics；不得借 controls transport refresh 实现。

### 16.6 Consumer callback failure policy

所有 handler invocation 使用同一 isolation policy，包括 initial neutral：

```text
onState(EMPTY)
onState(valid/fallback State)
onEvent(valid Event)
```

固定：

```text
sync throw
→ swallow locally

returned Promise rejects
→ attach rejection sink
→ swallow locally

callback is slow/pending
→ does not block subsequent delivery

callback failure
→ does not close Consumer
→ does not alter freshness truth
→ does not synthesize Event
```

如果 gameplay 需要 fail-stop，callback 自己显式进入业务 failure path；generic Consumer 不拥有该 policy。

### 16.7 Dialogue v1 migration and qualification

当前 HEAD landing 将 `RPGDialogue` 作为 v1 implementation：

```text
RPG_DIALOGUE_V0_API.md
RPG_DIALOGUE_V0_PRESENTATION.md
doc/30-implementation/rpg-dialogue-v0-qualification.md
→ historical Frozen/evidence, unchanged

RPG_DIALOGUE_V1_API.md
→ new current public contract
→ v0 business/Presentation surface retained
→ add readonly controls
→ raw keyboard/gamepad mapping removed from Runtime
```

Qualification 文件：

```text
delete current-tree test/rpg-dialogue-v0/qualification.test.mjs
add test/rpg-dialogue-v1/qualification.test.mjs
add test/game-control-ports-v1/qualification.test.mjs
```

删除 current-tree v0 executable test 不删除历史 evidence；旧 commit 仍是 v0 exact executable subject。

Root scripts 固定提供：

```text
test:rpg-dialogue-v1:qualification:run
test:rpg-dialogue-v1:qualification

test:rpg-dialogue:qualification
→ alias/current lane for v1

test:rpg-dialogue
→ package tests + v1 qualification

test:game-control-ports:qualification:run
test:game-control-ports:qualification
```

`test/rpg-dialogue-v1/qualification.test.mjs` 必须证明 semantic Control Port：

```text
dialogue.controls.*
→ existing semantic routing
→ Render Event
→ Web Presentation
→ submit
→ Conversation result
```

`test/game-control-ports-v1/qualification.test.mjs` 至少用真实 Browser keyboard path 证明一个 Map closed loop，并证明 Dialogue composition mapping 可经统一 controls 驱动 semantic port：

```text
Playwright keyboard
→ game-controls-input
→ broadcast:"top-frame"
→ ControlsConsumer
→ product mapping
→ RPGMapControls / RPGDialogueControls
→ observable effect
```

Gamepad physical mapping 继续由 Frozen producer qualification 覆盖；本次 control-port integration qualification 不要求伪造浏览器 Gamepad API 来重复证明 producer contract。

### 16.8 Product-specific docs

本次 landing 同步维护：

```text
[examples/essentials-v21.1/CONTROL_COMPOSITION.md](../../examples/essentials-v21.1/CONTROL_COMPOSITION.md)
[examples/PokeMan/doc/72-controls-composition.md](../../examples/PokeMan/doc/72-controls-composition.md)
```

这些文档拥有各自 `base + map` topology。主设计只引用它们作为本次 canonical examples，不把该 topology 推广成所有 future product 的 mandatory shape。

### 16.9 PokeMan PWA dual-executable migration

PokeMan 当前已经存在真实 PWA product/qualification，不能把它当作未来非目标。Desktop / Hostra topology 迁为 `base + map` 时，PWA 必须同一 PR 一起迁移。

Canonical PWA executable set：

```text
subsystems/base.mjs
subsystems/map.mjs
```

必须同步更新：

```text
examples/PokeMan/launch.pwa.json
examples/PokeMan/scripts/prepare-pwa-content.mjs

apps/pwa/scripts/build.mjs
apps/pwa/src/pokeman-window-entry.ts
apps/pwa/test/pokeman-bundle.test.mjs
apps/pwa/test/pokeman-map.e2e.test.mjs
```

PWA fixture/bundle shape 应表达 plural executable collection，而不是继续使用单一 `executable` 字段作为 PokeMan product truth。两个 executable 都必须：

```text
logicalModule exact matches launch.pwa.json
MIME = text/javascript
closed browser ESM graph
no bare npm imports in installed output
content/version participates in product bundle identity
```

Qualification 至少证明：

```text
Game Entry initial = base
PWA launch manifest = base + map
installed executable index = base + map

base starts
→ owns live game-controls-input
→ calls map child

Browser keyboard
→ game-controls-input
→ top-frame
→ Map Consumer
→ RPGMapControls
→ real movement / collision / transfer

session restart
→ base + map topology recreates cleanly
→ no duplicate producer
→ no stale retained input
```

不得保留以下 current single-map assumptions：

```text
PokeManBundleFile.executable: string
executables = [ map only ]
qualification build emits only pokeman-map-subsystem.mjs
E2E install supplies only subsystems/map.mjs
report/check says "仍只有 map subsystem"
```

这只是 PokeMan product composition 迁移，不修改 PWA Launcher / Installer 的通用多-executable contract。

---

## 17. Freeze / landing criteria

本设计可以直接进入 implementation PR，但在标记 Implemented 前必须满足：

1. Map / Dialogue core Runtime 不再直接消费 physical/unified input channel；
2. 两个 public Control Port 的 observable semantics 已由版本化 contract 固定；
3. `@loomrealm-game/common-controls/subsystem` 提供 Activation-scoped Consumer 与 Directional Tracker；
4. 已 Frozen 的 `@loomrealm-game/common-controls` root export surface 保持 exact 不变；
5. `common-controls` 不依赖 Map / Dialogue；
6. 不存在独立 `control-bindings` package；
7. Essentials 与 PokeMan 都按 §16 建立 example-private `base + map` topology，且一个 Window 只有一个 active unified producer；
8. Base 只拥有 producer，不消费/转发 controls；Map child 拥有自己的 Activation-local Consumer/Tracker；
9. same-Frame overlay 与 child-Frame modal 的通用消费模式仍按本文 Activation lifecycle 执行；
10. child-call 前 retained business intent 的 neutral/fresh-resume 规则有 executable evidence；
11. Map Control Port retained/same-value/blocked-no-auto-retry 语义有 Map-specific executable tests；
12. Consumer initial/later callback throw/rejection isolation 有 executable tests；
13. Map 普通 movement 不需要 `getSnapshot()`；
14. Dialogue v1 contract、v1 qualification 与 root current scripts 已替代 current-tree v0 raw-input lane；v0 evidence 保持历史不变；
15. Dialogue concrete product button mapping 仍由 product 或 Dialogue versioned contract 拥有，不由本文冻结；
16. existing Map terrain/transfer/NPC qualification 与 Dialogue Conversation/History semantic qualification 的受影响部分重新通过；
17. top-frame / game-controls-input producer qualification 保持通过；
18. PokeMan Desktop/PWA 都已迁为 `base + map`；PWA bundle/install/index/staging/E2E 不再存在 single-map executable assumption；
19. root `build:m14/m15/m17` 与相关 qualification lanes 在 clean dist 下显式构建所需 common-controls，不依赖 Map prebuild 或旧 dist；
20. Essentials / PokeMan product tests 与 control-port real-browser closed loop 通过；
21. docs link/build 通过；
22. exact executable subject 和 evidence 按 repository 规则记录。

完成后的核心依赖关系：

```text
Physical Devices
      ↓
@loomrealm-game/common-controls
 producer + frozen root ABI
      │
      └─ @loomrealm-game/common-controls/subsystem
         Activation-scoped consumer + directional tracker
      ↓
product / game composition
      ↓
┌────────────────┬─────────────────────┐
│ RPGMapControls │ RPGDialogueControls │
└───────┬────────┴──────────┬──────────┘
        ↓                   ↓
    Map Runtime        Dialogue Runtime
```

到这里，Map 与 Dialogue 才真正从“输入设备/输入协议”解耦为“业务控制端口”，同时不额外制造一个只为转发而存在的 package。
