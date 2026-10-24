# Game Control Ports 与 Common Controls Consumer 设计

> 状态：**Draft / Ready for implementation**
> 适用范围：`game-libs/map`、`game-libs/rpg-dialogue`、`game-libs/game-common-controls`
> 目标：把“物理输入 / unified controls”与 Map、Dialogue 业务 Runtime 解耦，同时不新增独立 binding package
> 上游输入：[统一操控输入 Web Component](../../game-libs/game-common-controls/game-controls-input.md)
> Frame 投递：[Frame-targeted Presentation Event v1](../15-contracts/frame-targeted-presentation-event-v1.md)
> Qualification 规则：[Qualification 与 Subject](../30-development/qualification.md)

本文定义下一阶段的 game-library control-port 改造。它是实现设计，不修改现有 Frozen contract 的历史事实；实现 PR 必须按本文的版本/兼容规则更新对应正式契约和 qualification evidence。

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
Frame consumer / freshness / directional tracker
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

### 3.3 Runtime movement semantics

Runtime 内部只保留当前 `moveIntent`。

Runtime 已稳定且没有 movement / transfer / event operation 占用时：

```text
moveIntent != null
→ attempt(moveIntent)
```

正在 movement 或其他互斥 operation 时：

```text
setMoveIntent(newDirection)
→ 只替换 retained intent
→ 不排队旧 direction
```

当前 operation 完成后重新读取**最新** `moveIntent`：

```text
latest moveIntent != null
→ attempt(latest moveIntent)
```

因此：

```text
hold up
→ walk
→ walk
→ walk

during first walk change to left
→ 当前 walk 完成
→ 下一次 attempt(left)
```

不是：

```text
queue(up, up, left, ...)
```

blocked / walk / jump、朝向更新、Transfer、Bridge、NPC collision 等仍全部由 Map Runtime 决定，不能移到 controls consumer 或 composition。

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
- v0 qualification evidence 继续只证明原 v0 subject；
- v1 implementation 必须有新的 exact-subject qualification。

---

## 5. Common Controls Consumer

不新增 `game-libs/control-bindings` package。

消费侧能力直接进入：

```text
game-libs/game-common-controls
@loomrealm-game/common-controls
```

### 5.1 Frame-scoped consumer

建议新增 public API：

```ts
import type {
  Frame,
  PresentationEventClient,
} from "@loomrealm/subsystem";

export interface ControlsConsumerHandlers {
  readonly onState?: (
    state: ControlsStatePayloadV1,
  ) => void;

  readonly onEvent?: (
    event: ControlsEventPayloadV1,
  ) => void;
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

而不是整个 `SubsystemScope`。这样 `common-controls` 只依赖公开 Presentation Event author API，不拥有其他 Subsystem 能力。

实现可以对 `@loomrealm/subsystem` 使用 type-only import；package metadata 仍必须声明正确依赖，不能依靠 workspace 偶然可见性。

### 5.2 Consumer responsibilities

`createControlsConsumer()` 固定负责：

```text
create exact Frame Presentation listener
根据 handlers 只订阅需要的 controls channels
验证 event.name / payload
controls.state → createFreshControlsStateTracker
2500ms silence → local EMPTY_CONTROLS_STATE_V1
Frame abort / close → cleanup listener + freshness timer
Event 不 replay
旧 Activation 不继承
```

如果提供 `onState`，Consumer 创建后本地状态先从：

```text
EMPTY_CONTROLS_STATE_V1
```

开始，并立即向 `onState` 交付一次 neutral local baseline；随后只接受本次 Activation 实际收到的 State publication。

这不是 wire replay，也不发送任何消息，只是 consumer-local 初始事实。

如果没有 `onState`，不创建 freshness tracker。

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

Consumer 对 malformed payload fail closed。

`controls.state` 至少要求：

```text
name === "input.state"
data 是 plain object
exact semantic field down
down 是 ControlsButtonV1[]，无重复，规范顺序
```

`controls.event` 至少要求：

```text
name === "input.event"
data 是 plain object
action === "down" | "up"
button ∈ CONTROLS_BUTTONS_V1
repeat 是 boolean
```

invalid input：

```text
drop
不调用 handler
不污染 fresh State
不抛到 gameplay
```

---

## 6. Directional Controls Tracker

Map 需要 last-pressed-wins，但这个算法只依赖：

```text
up / down / left / right
controls State/Event semantics
```

因此它也是 `common-controls` 的通用 helper，不属于 Map。

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

Dialogue 同样只在 composition 做映射：

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

Default mapping：

| Controls button | Dialogue command |
| --- | --- |
| `south` | `confirm()` |
| `start` | `confirm()` |
| `up` | `previous()` |
| `down` | `next()` |
| `select` | `history()` |
| `east` | `cancel()` |

其他 button 不产生 Dialogue command。

`repeat:true` 不产生 semantic command。

---

## 9. Composition active policy / Dialogue overlay

哪个 semantic consumer 当前 active 是 product/game composition policy，不是 `common-controls` authority。

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

composition 只决定同一业务场景中哪个 semantic port 当前接受控制。

---

## 10. Physical compatibility

当前 Dialogue v0 shipped default physical mapping 包含：

```text
Enter / Space → confirm
Escape        → cancel
```

unified controls v1 fixed Keyboard aliases 是：

```text
Enter → start
Z     → south
X     → east
Tab   → select
Arrows → directions
```

因此新的 default unified Dialogue composition mapping 的物理体验是：

```text
Enter / Z → confirm
X         → cancel
Tab       → history
ArrowUp   → previous
ArrowDown → next
```

`Space` / `Escape` 不属于 unified controls v1。

这是 Dialogue v1 default control policy 的显式变化，不能伪装成 v0 无变化。

如果某 product 必须保留 legacy `Space/Escape`，应在 product composition 提供独立 compatibility path；不得把 raw Keyboard 重新塞回 Dialogue Runtime，也不得偷偷扩写 Frozen `game-controls-input` v1 mapping。

---

## 11. Input Component Composition

Map / Dialogue 不再负责创建 physical/unified input WebComponent。

Product / example composition 必须保证一个 Window 中存在一份活动的：

```html
<game-controls-input></game-controls-input>
```

该节点由 product-owned、持续 live 的 RenderDomain / Presentation composition 挂载。

Framework 不默认创建它。

Map RenderDomain 必须删除当前 input-owned roots：

```text
game-keyboard-input
game-pointer-input
game-gamepad-input
```

除非 Pointer 后续有独立 Map public interaction contract；Pointer 不得因为历史节点存在而继续与 movement control 绑定。

Dialogue Runtime 也不再订阅 raw `keyboard.event / gamepad.event`。

最终：

```text
Product Input Host
    → game-controls-input

common-controls
    → producer + Frame consumer + directional helper

Map
    → business / presentation only

Dialogue
    → business / presentation only
```

---

## 12. Activation / teardown

`createControlsConsumer` 绑定 caller 持有的真实 `Frame` object。

必须保持：

```text
new Activation
→ Consumer local State starts neutral
→ Directional Tracker starts / resets neutral

old Activation
→ Event 不继承

later controls.state
→ rebuild current held truth

Frame abort / Consumer close
→ listener + freshness cleanup
→ no replay / retarget
```

禁止：

```text
carry old heldOrder into new Activation
replay old Dialogue Event
retarget Event
use old Activation cached State as new truth
```

Map 的 Handler-level `moveIntent` 可以在同一 Handler 的 scene transfer 中持续，但不能靠旧 Activation consumer cache 跨 Activation 继承。

当 composition 销毁 Map controls wiring 时，必须显式：

```ts
map.controls.setMoveIntent(null);
directions.reset();
consumer.close();
```

保证 retained business intent 不泄漏。

---

## 13. Implementation plan

### 13.1 `game-libs/game-common-controls`

新增建议：

```text
src/consumer.ts
    createControlsConsumer
    payload validation
    Frame abort cleanup
    State freshness integration

src/directional-controls.ts
    ControlsDirection
    createDirectionalControlsTracker
    State truth + Event recency ordering

src/index.ts
    export consumer / directional public API

package.json
    declare @loomrealm/subsystem dependency required by public type surface
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
    if no other Map core code still requires it
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

实际 composition 直接：

```text
mount one game-controls-input
create common-controls consumer
create directional tracker where needed
translate generic controls to module Control Port
switch local active flags around overlays
neutralize Map before teardown
close consumers at Frame/session teardown
```

如果以后多个产品出现完全相同的业务 mapping，可以再抽 product-level helper；这不是本次架构要求，也不能反向污染 `common-controls`。

---

## 14. Tests / Qualification

### 14.1 Common controls consumer tests

至少覆盖：

- Consumer 只订阅请求的 controls channels；
- initial `onState(EMPTY_CONTROLS_STATE_V1)`；
- valid State delivery；
- valid Event delivery；
- malformed State/Event fail closed；
- State 默认 2500ms fallback；
- Event 不 replay；
- close 幂等；
- Frame abort cleanup；
- old Activation 不进入新 consumer；
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
- held intent 在 step 完成后继续；
- movement 中改方向只影响下一 attempt，不排队旧 direction；
- `setMoveIntent(null)` 在当前 step 完成后停止继续移动；
- blocked movement 仍完全由 Map authority 决定；
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

- exact mapping table；
- only down / repeat=false；
- inactive drop；
- reactivate不 replay；
- close后不再产生 command。

Overlay：

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

### 14.5 Integration qualification

至少有一条真实闭环：

```text
Browser trusted Keyboard/Gamepad
→ game-controls-input
→ broadcast:"top-frame"
→ createControlsConsumer
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

## 16. Freeze / landing criteria

本设计可以直接进入 implementation PR，但在标记 Implemented 前必须满足：

1. Map / Dialogue core Runtime 不再直接消费 physical/unified input channel；
2. 两个 public Control Port 的 observable semantics 已由版本化 contract 固定；
3. `@loomrealm-game/common-controls` 提供 Frame-scoped Consumer 与 Directional Tracker；
4. `common-controls` 不依赖 Map / Dialogue；
5. 不存在独立 `control-bindings` package；
6. product/example 只挂一份 unified controls input host；
7. Dialogue overlay 不再让 Map movement 穿透；
8. Map 普通 movement 不需要 `getSnapshot()`；
9. existing Map terrain/transfer/NPC qualification 与 Dialogue Conversation/History qualification 的受影响部分重新通过；
10. top-frame / common-controls qualification 保持通过；
11. docs link/build 通过；
12. exact executable subject 和 evidence 按 repository 规则记录。

完成后的核心依赖关系：

```text
Physical Devices
      ↓
@loomrealm-game/common-controls
 producer + consumer + directional tracker
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
