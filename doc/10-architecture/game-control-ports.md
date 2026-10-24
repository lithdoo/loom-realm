# Game Control Ports 与 Controls Binding 设计

> 状态：**Draft / Ready for implementation**
> 适用范围：`game-libs/map`、`game-libs/rpg-dialogue`、`game-libs/game-common-controls`
> 目标：把“物理输入 / unified controls”与 Map、Dialogue 业务 Runtime 解耦
> 上游输入：[统一操控输入 Web Component](../../game-libs/game-common-controls/game-controls-input.md)
> Frame 投递：[Frame-targeted Presentation Event v1](../15-contracts/frame-targeted-presentation-event-v1.md)
> Qualification 规则：[Qualification 与 Subject](../30-development/qualification.md)

本文定义下一阶段的 game-library control-port 改造。它是实现设计，不修改现有 Frozen contract 的历史事实；实现 PR 必须按本文的版本/兼容规则更新对应正式契约和 qualification evidence。

核心原则：

> **输入系统表达“玩家怎样操作设备”；Control Port 表达“玩家想让业务模块做什么”。Map / Dialogue 只依赖后者。**

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

目标结构是：

```text
Keyboard / standard Gamepad
        ↓
<game-controls-input>
        ↓
controls.state / controls.event
        ↓
Frame-scoped Control Binding
        ↓
business Control Port
        ↓
Map / Dialogue Runtime
```

Map / Dialogue Runtime 最终不得知道：

```text
Keyboard code
Gamepad index / button
ControlsButtonV1
controls.state / controls.event
Presentation Event listener
fresh controls tracker
```

---

## 2. Ownership

### 2.1 `@loomrealm-game/common-controls`

继续拥有：

```text
physical Keyboard / Gamepad sampling
14-button unified vocabulary
controls.state
controls.event
State refresh / freshness primitives
top-frame publication
```

它不知道 Map、Dialogue 或其他 gameplay module。

### 2.2 Map / Dialogue

只拥有自己的业务控制语义：

```text
Map
→ current movement intent

Dialogue
→ confirm / previous / next / history / cancel
```

它们不拥有 physical binding policy。

### 2.3 Control Binding

新增一个薄适配层：

```text
game-libs/control-bindings
@loomrealm-game/control-bindings
```

依赖方向：

```text
@loomrealm-game/control-bindings
    ├── @loomrealm-game/common-controls
    ├── @loomrealm-game/map
    ├── @loomrealm-game/rpg-dialogue
    └── @loomrealm/subsystem

@loomrealm-game/map
    └── MUST NOT depend on common-controls for Runtime input

@loomrealm-game/rpg-dialogue
    └── MUST NOT depend on common-controls for Runtime input
```

Binding 拥有：

```text
controls.* subscription
physical/unified button -> business action mapping
multi-direction arbitration
State freshness
local active/inactive composition policy
Activation teardown neutralization
```

Binding 不拥有 gameplay state，也不是 Framework input authority。

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

### 3.2 不需要 `getSnapshot()`

调用方禁止用下面这种方式驱动普通移动：

```text
getSnapshot()
→ 计算 next x/y
→ 再要求 Map 移动
```

正确链路是：

```text
setMoveIntent(8)
→ Map 自己读取 authoritative x/y
→ Map 自己执行 passability / terrain / NPC / transfer 判断
→ blocked | walk | jump
```

`getSnapshot()` 仍是 Query，只用于业务观察当前 committed facts；它不是 Control Port 的前置步骤。

因此形成明确的 Command/Query 分离：

```text
controls.setMoveIntent(...)
→ 写当前意图

getSnapshot()
→ 读当前事实
```

### 3.3 Runtime movement semantics

Runtime 内部只保留当前 `moveIntent`。

当 Runtime 已稳定且没有 movement / transfer / event operation 占用时：

```text
moveIntent != null
→ attempt(moveIntent)
```

当正在 movement 或其他互斥 operation 时：

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

blocked / walk / jump、朝向更新、Transfer、Bridge、NPC collision 等仍全部由 Map Runtime 决定，不能移到 Binding。

### 3.4 Handler lifecycle

Control Port 属于 Handler lifetime，而不是单次 scene。

在 `run()` 之前：

```text
setMoveIntent(direction)
→ 保存最新 retained intent
→ 不启动 movement
```

这样 Binding 可以在 Runtime 完全初始化前先写入当前 Controls State；Map 就绪时直接消费，不必等待下一次 State refresh。

`run()` 开始并完成首个 scene commit 后：

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

建议下一版 public surface 增加：

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

Control methods属于 transient user intent：

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

## 5. Binding Public Surface

新 package：

```text
game-libs/control-bindings
@loomrealm-game/control-bindings
```

建议 public API 固定为：

```ts
import type { Frame, SubsystemScope } from "@loomrealm/subsystem";
import type { RPGMapControls } from "@loomrealm-game/map";
import type { RPGDialogueControls } from "@loomrealm-game/rpg-dialogue";

export interface GameControlBinding {
  readonly active: boolean;
  setActive(active: boolean): void;
  close(): void;
}

export function bindRPGMapControls(
  scope: SubsystemScope,
  frame: Frame,
  controls: RPGMapControls,
): GameControlBinding;

export function bindRPGDialogueControls(
  scope: SubsystemScope,
  frame: Frame,
  controls: RPGDialogueControls,
): GameControlBinding;
```

Binding 绑定 caller 持有的真实 `Frame` object，并使用：

```ts
scope.presentationEvents.createListener(...)
```

消费当前 Activation 的 `controls.*`。

它不读取 Main stack，不指定 Frame id / Activation id，不建立第二套 authority。

---

## 6. Map Binding

Map Binding 订阅：

```text
controls.state
controls.event
```

其中：

```text
State
→ 当前 held truth
→ movement authority input

Event
→ 只作为“最近按下方向”的 ordering hint
→ 不能代替 State truth
```

### 6.1 Direction vocabulary

只消费：

```text
up
down
left
right
```

对应：

```text
up    → 8
down  → 2
left  → 4
right → 6
```

其余 10 个 unified button 对 Map movement 不产生作用。

### 6.2 Last-pressed-wins

Default Map binding 使用 last-pressed-wins。

内部维护：

```text
freshDown: Set<up|down|left|right>
heldOrder: Direction[]
```

收到 `controls.state`：

1. 交给 `createFreshControlsStateTracker`；
2. 从 `heldOrder` 删除已经不在 State 中的方向；
3. 对 State 中存在但 `heldOrder` 尚未知的方向，按 `up, down, left, right` 顺序追加；
4. 当前 move intent = `heldOrder` 最后一项；为空则 `null`。

收到 `controls.event`：

```text
directional down + repeat=false
→ 如果该方向当前也存在于 fresh State
→ 从 heldOrder 原位置移除后追加到末尾

directional up
→ 从 heldOrder 移除

repeat=true
→ 不改变 ordering
```

Event 是 recency hint，因此 Event 丢失不会制造 stuck movement；后续 State 仍可恢复 held truth。

当 Activation 刚开始、只收到一个包含多个方向的 State、没有历史 Event 可确定 recency 时，使用上述 canonical append 顺序作为确定性 fallback，因此最后一个 held direction 获胜。

### 6.3 Freshness

`controls.state` 必须通过：

```ts
createFreshControlsStateTracker(...)
```

默认 2500ms silence fallback 到 empty：

```text
freshDown = {}
heldOrder = []
moveIntent = null
```

Map Runtime 不自己实现 freshness timer。

### 6.4 Active / inactive

Binding local `active` 是 product composition policy，不是 Framework input authority。

初始：

```text
active = true
```

`setActive(false)`：

```text
继续接收/维护 fresh State
立即 controls.setMoveIntent(null)
不把后续 State 应用到 Map
```

`setActive(true)`：

```text
立即根据当前 fresh State / heldOrder
重新 controls.setMoveIntent(currentIntent)
```

这样 Dialogue overlay 可以暂停 Map，而不需要丢失 Controls freshness。

`close()`：

```text
controls.setMoveIntent(null)
关闭 presentation listener
关闭 fresh tracker
清本地 cache
之后幂等 no-op
```

---

## 7. Dialogue Binding

Dialogue Binding 只订阅：

```text
controls.event
```

只接受：

```text
name === "input.event"
action === "down"
repeat === false
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

### 7.1 Active / inactive

`setActive(false)`：

```text
future controls.event
→ drop
```

`setActive(true)`：

```text
只接受之后的新 Event
→ 不 replay inactive 期间 Event
```

`close()` 关闭 listener；不产生任何 synthetic command。

### 7.2 Physical compatibility

当前 Dialogue v0 shipped default physical mapping包含：

```text
Enter / Space → confirm
Escape        → cancel
```

而 unified controls v1 的 fixed Keyboard aliases 是：

```text
Enter → start
Z     → south
X     → east
Tab   → select
Arrows → directions
```

因此新的 default unified Dialogue binding 的物理体验是：

```text
Enter / Z → confirm
X         → cancel
Tab       → history
ArrowUp   → previous
ArrowDown → next
```

`Space` / `Escape` 不属于 unified controls v1。

这属于 Dialogue v1 default binding policy 的显式变化，不得伪装成 v0 无变化。

如果某 product 必须保留 legacy `Space/Escape`，应在 product composition 提供独立 compatibility binding；不得把 raw Keyboard 重新塞回 Dialogue Runtime，也不得偷偷扩写 Frozen `game-controls-input` v1 mapping。

---

## 8. Composition 与 overlay

多个 Binding 可以绑定同一个 Frame，但 product 必须决定哪个 semantic consumer 当前 active。

典型 Dialogue overlay：

```ts
mapBinding.setActive(false);
dialogueBinding.setActive(true);

try {
  const result = await dialogue.openConversation(request);
  // story flow...
} finally {
  dialogueBinding.setActive(false);
  mapBinding.setActive(true);
}
```

这不是新的全局 Input Authority。

Framework 仍然只负责：

```text
current Top Active Frame
+ exact Frame/Activation
+ exact presentation Interest
```

Binding `active` 只是同一业务 composition 内的 semantic consumer switch。

必须满足：

```text
Map inactive
→ moveIntent neutral

Dialogue inactive
→ no command delivery
```

因此打开 Dialogue 时不会出现“角色还在地图上继续走”。

---

## 9. Input Component Composition

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

除非 Pointer 后续有独立的 Map public interaction contract；Pointer 不得因为历史节点存在而继续和 movement control 绑定。

Dialogue Runtime 也不再订阅 raw `keyboard.event / gamepad.event`。

最终：

```text
Product Input Host
    → game-controls-input

Map
    → business/presentation only

Dialogue
    → business/presentation only
```

---

## 10. Activation / teardown

所有 Binding 必须是 exact Frame/Activation aware 的 consumer：

```text
new Activation
→ listener/local cache starts neutral

old Activation
→ no Event inheritance

later controls.state
→ rebuild current Map intent

binding close / Frame teardown
→ Map neutralized
→ Dialogue future Events dropped
```

禁止：

```text
carry old heldOrder into new Activation
replay old Dialogue Event
retarget Event
retain Map intent after binding teardown
```

Map 的 Handler-level `moveIntent` 可以在一次 Handler 的 scene transfer 中持续，但**不能靠旧 Activation Binding cache**跨 Activation 继承。新 Binding 必须先写 neutral，再由新 Activation 实际收到的 State 重建。

---

## 11. Implementation plan

### 11.1 `game-libs/map`

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
    if no other Map code still requires it
```

必须保持：

```text
coordinates authority
passability
terrain
bridge
NPC collision
transfer
motion timing
RenderDomain authority
```

完全在 Map Runtime。

### 11.2 `game-libs/rpg-dialogue`

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

### 11.3 `game-libs/control-bindings`

新增 package：

```text
src/index.ts
src/map-binding.ts
src/dialogue-binding.ts
test/
package.json
tsconfig.json
```

职责只允许：

```text
Frame presentation listener
Controls payload validation
fresh State
binding policy
semantic control calls
```

不得包含 Map movement、Dialogue lifecycle 或 story logic。

### 11.4 Product / examples

更新实际 composition：

```text
mount one game-controls-input
create Map binding when Map session is active
create Dialogue binding for Dialogue session
switch active binding around overlays
close bindings at Frame/session teardown
```

Essentials / PokeMan 等安装快照如果内嵌 browser bundle，继续遵守 exact bundle fixture / qualification 规则。

---

## 12. Tests / Qualification

### 12.1 Map unit tests

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
- movement path不调用 `getSnapshot()`；
- Map Runtime source 不再出现 raw input channel subscription；
- Map Render Tree 不再包含 raw input component roots。

### 12.2 Dialogue unit tests

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
- Runtime 不再包含 `keyboard.event / gamepad.event` mapping。

### 12.3 Binding tests

Map binding：

- State `["up"]` → `setMoveIntent(8)`；
- State `[]` → null；
- last-pressed-wins；
- repeat Event 不改变 recency；
- missed Event 后 State 可恢复；
- 2500ms freshness fallback → null；
- inactive → immediate null；
- inactive 期间 State cache继续更新；
- reactivate → immediate latest fresh intent；
- close → null 且不再调用 port；
- new Activation starts neutral。

Dialogue binding：

- exact mapping table；
- only down / repeat=false；
- inactive drop；
- reactivate不 replay；
- close后 drop；
- missing exact Interest / old Activation 继续服从现有 Frame-targeted contract。

### 12.4 Integration qualification

至少有一条真实闭环：

```text
Browser trusted Keyboard/Gamepad
→ game-controls-input
→ broadcast:"top-frame"
→ control binding
→ Map / Dialogue control port
→ observable gameplay effect
```

并验证 Dialogue overlay：

```text
Map walking
→ mapBinding inactive
→ moveIntent neutral
→ Dialogue commands active
→ Dialogue closes
→ mapBinding active
→ later/current fresh State restores movement intent
```

受影响 subject 必须按 repository qualification/staleness 规则重新判断，不能沿用旧 Map / Dialogue PASS。

---

## 13. Non-goals

本次不做：

- Framework InputTarget / 新 input authority；
- 修改 `game-controls-input` Frozen v1 vocabulary；
- retained Dialogue command；
- Map pathfinding / click-to-move；
- analog stick；
- key rebinding public UI；
- Story Graph；
- Pointer business interaction；
- 把 Map / Dialogue 合并成统一 `GameControls.dispatch(string)`；
- 让 caller 通过 `getSnapshot()` 计算普通 movement。

如果未来需要 analog movement、pointer/touch、AI navigation 或 remapping，应增加新的 Binding / Control Port policy，而不是重新把 physical device dependency放回业务 Runtime。

---

## 14. Freeze / landing criteria

本设计可以直接进入 implementation PR，但在标记 Implemented 前必须满足：

1. Map / Dialogue core Runtime 不再直接消费 physical/unified input channel；
2. 两个 public Control Port 的 observable semantics 已由版本化 contract 固定；
3. `@loomrealm-game/control-bindings` 完成并覆盖 State/Event/Activation/active-toggle 边界；
4. product/example 只挂一份 unified controls input host；
5. Dialogue overlay 不再让 Map movement 穿透；
6. Map 普通 movement 不需要 `getSnapshot()`；
7. existing Map terrain/transfer/NPC qualification 与 Dialogue Conversation/History qualification 的受影响部分重新通过；
8. top-frame / common-controls qualification 保持通过；
9. docs link/build 通过；
10. exact executable subject 和 evidence 按 repository 规则记录。

完成后的核心依赖关系应是：

```text
Physical Devices
      ↓
common-controls
      ↓
control-bindings
      ↓
┌───────────────┬──────────────────┐
│ RPGMapControls│ RPGDialogueControls │
└───────┬───────┴─────────┬────────┘
        ↓                 ↓
    Map Runtime      Dialogue Runtime
```

Map 与 Dialogue 到这里才算真正从“输入设备”解耦为“业务控制端口”。
