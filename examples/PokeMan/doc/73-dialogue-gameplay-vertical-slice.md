# PokeMan Dialogue Gameplay Vertical Slice

> 状态：**Design / Ready for implementation**
> 范围：PokeMan 产品层最小 Dialogue gameplay vertical slice
> 依赖：
> - [64-dialogue.md](./64-dialogue.md)
> - [69-dialogue-web-component.md](./69-dialogue-web-component.md)
> - [72-controls-composition.md](./72-controls-composition.md)
> - [Game Control Ports](../../../doc/10-architecture/game-control-ports.md)
> - [RPG Dialogue v1 API](../../../game-libs/rpg-dialogue/RPG_DIALOGUE_V1_API.md)

本文定义下一步 PokeMan 产品验证：用已经落地的 Map NPC Interaction API、RPG Dialogue v1 semantic controls 和 PokeMan Dialogue Web Presentation，在真实 PokeMan 中跑通一个最小 gameplay closed loop。

这不是正式 Dialogue subsystem / graph runner 的最终设计。

本阶段只回答一个问题：

> **现有 PokeMan Map、Common Controls、RPG Dialogue 与 PokeMan Dialogue Web Components，能否在真实产品 composition 中正确组合成一次 NPC 对话。**

---

# 1. Target vertical

第一版固定验证：

```text
玩家在 Map 中移动
→ 面向 Professor
→ confirm
→ RPGMap emits NPCInteractEvent
→ PokeMan composition starts RPGDialogue
→ resolve Professor current NPC sprite + contentVersion
→ open Conversation
→ Dialogue Web Components overlay Map
→ reveal / confirm / choice / history / cancel
→ Conversation result returns to PokeMan caller
→ hard-coded branch executes
→ Dialogue session closes
→ Map remains live and regains controls
```

成功后才进入正式：

```text
struct.Dialogue
→ graph runner
→ Choice.target
→ EventStateMutation
→ Story / Relationship / Battle / Quest
```

本文件不提前设计这些能力。

---

# 2. Exact scope

本阶段允许修改：

```text
examples/PokeMan/subsystems/map.mjs
examples/PokeMan/package.json
package-lock.json
PokeMan tests / qualification
```

如果真实 qualification 需要 test-only fixture，可以增加 PokeMan test 文件。

本阶段不修改：

```text
examples/PokeMan/subsystems/dialogue.mjs
examples/PokeMan/subsystems/base.mjs
examples/PokeMan/game.json
examples/PokeMan/launch.hostra.json
examples/PokeMan/launch.pwa.json
@loomrealm-game/map Runtime
@loomrealm-game/rpg-dialogue Runtime
Common Controls Runtime
PokeMan Dialogue Web Components
Frozen LoomRealm contracts
```

Production Subsystem topology 继续是：

```text
base
└─ map
```

本阶段**不新增 `dialogue` Subsystem**。

---

# 3. Composition choice：same-Frame overlay

第一轮固定使用 Game Control Ports 已定义的 **same-Frame overlay**。

```text
base Frame
└─ call("map")
      ↓
    map Frame
    ├─ RPGMap
    ├─ RPGDialogue (only while NPC dialogue is active)
    ├─ one ControlsConsumer
    └─ one DirectionalControlsTracker
```

Map 与 Dialogue 使用相同：

```text
SubsystemScope
Frame
Presentation Event authority
```

Dialogue 不通过：

```text
frame.call("dialogue")
```

建立 child Frame。

原因：

1. 当前目标是验证新增 API 与 Presentation 组合，不是验证新的 Subsystem topology；
2. RPG Dialogue 已支持在 caller Frame 中创建独立 Dialogue RenderDomain；
3. Game Control Ports 已明确支持 same-Frame Map + Dialogue composition；
4. 可以保持现有 `base + map` production topology 不变；
5. 后续正式 Story / Dialogue Subsystem 仍可以独立选择 child-Frame composition，不被本 slice 锁死。

---

# 4. Test NPC：Professor only

当前 Map 4 已有：

```text
instanceId = "professor"
npcId      = "professor"
x          = 10
y          = 6
direction  = 2
```

本阶段只把该 placement 改为：

```js
{
  instanceId: "professor",
  npcId: "professor",
  x: 10,
  y: 6,
  direction: 2,
  interactable: true,
}
```

其他 NPC 保持现状，不因为本验证统一变成 interactable。

特别是：

```text
rival-lab
road-bandit
route-trainee
...
```

本阶段不接 Dialogue。

因此：

```text
Map confirm
+ facing Professor directly
+ Map not busy
→ NPCInteractEvent
```

其他 NPC 不产生本 slice 的 Dialogue。

---

# 5. Why Professor

Professor 是第一轮最合适的 fixture：

- 已有 `struct.NPC/professor`；
- 已有 `struct.Character/professor`；
- 已有真实 4×4 sprite；
- NPC key 与 Character key 在这个特例中相同；
- Map 4 已有真实 placement；
- 不需要先解决 rival 的多 appearance 选择问题。

注意：

> **Professor 中 `npcId === characterId` 只是这个 fixture 的已知事实，不允许从本 slice 推导“所有 NPC 的 npcId 都等于 Character key”。**

以后像：

```text
rival-lab
rival-casual
→ Character rival
```

仍然需要正式 Story / World appearance resolver。

---

# 6. Dependency landing

当前 `@loomrealm-game/rpg-dialogue` 只在 PokeMan `devDependencies` 中用于 Presentation qualification。

本 slice 的 production `map.mjs` 会真实 import：

```js
import { RPGDialogue } from "@loomrealm-game/rpg-dialogue";
```

因此必须把：

```text
@loomrealm-game/rpg-dialogue
```

从：

```text
devDependencies
```

移动到：

```text
dependencies
```

不能同时保留两份。

现有：

```text
pretest → build @loomrealm-game/rpg-dialogue
```

如果 workspace test 仍需要，可以继续保留；dependency ownership 与 pretest build 是两个不同问题。

PWA / Hostra 的 executable topology 不因为 library dependency 改变。

---

# 7. One ControlsConsumer

当前 `map.mjs` 已经有一个：

```text
createControlsConsumer
+
createDirectionalControlsTracker
```

本 slice **继续只使用这一个 ControlsConsumer**。

禁止为了 Dialogue 再创建第二个同 Frame ControlsConsumer。

目标：

```text
controls.state / controls.event
             ↓
        one consumer
             ↓
   PokeMan same-Frame router
      ┌──────┴──────┐
      ↓             ↓
RPGMapControls   RPGDialogueControls
```

当前哪个业务 port active，是 PokeMan composition local state。

---

# 8. Composition state

`map.mjs` 增加最少 local state：

```text
activeDialogue: RPGDialogue | null
dialogueTask: Promise<void> | null
```

语义：

```text
activeDialogue === null
→ Map controls active

activeDialogue !== null
→ Dialogue controls active
→ Map movement semantic port inactive
```

不创建 Shared State。

不创建 Renderer Store fact。

不创建新的 RenderNode。

不把该 flag 暴露给 Web Components。

---

# 9. Map movement gating

DirectionalControlsTracker 在整个 Map Frame lifetime 中继续接收：

```text
controls.state
controls.event
```

包括 Dialogue 打开期间。

但 Map movement application 改为：

```js
function applyMapIntent() {
  handler.controls.setMoveIntent(
    activeDialogue === null
      ? toMapDirection(directions.direction)
      : null
  );
}
```

Dialogue 打开必须同步执行：

```text
activeDialogue = dialogue
→ handler.controls.setMoveIntent(null)
```

因此：

```text
Dialogue active
+ player presses / holds direction
→ tracker continues observing truth
→ Map moveIntent stays null
→ player does not move behind modal
```

Dialogue 关闭后：

```text
activeDialogue = null
→ applyMapIntent()
→ current tracker direction is reapplied
```

这沿用 [Game Control Ports](../../../doc/10-architecture/game-control-ports.md) 已冻结的 same-Frame overlay policy：

> Map reactivate 后立即恢复当前 Controls State，不等待下一次 State refresh。

---

# 10. Semantic controls mapping

本 slice 冻结 PokeMan product mapping：

| Controls button | Map active | Dialogue active |
| --- | --- | --- |
| `up` | movement tracker | `dialogue.controls.previous()` |
| `down` | movement tracker | `dialogue.controls.next()` |
| `left` | movement tracker | no Dialogue command |
| `right` | movement tracker | no Dialogue command |
| `south` | `map.controls.confirm()` | `dialogue.controls.confirm()` |
| `start` | `map.controls.confirm()` | `dialogue.controls.confirm()` |
| `select` | no Map command | `dialogue.controls.history()` |
| `east` | no Map command | `dialogue.controls.cancel()` |
| other buttons | no-op | no-op |

Semantic commands只处理：

```text
event.action === "down"
AND event.repeat === false
```

因此 held keyboard repeat 不连续提交 Dialogue，也不连续触发 Map confirm。

Directional tracker 仍接收完整 State/Event，不因为 semantic routing 被跳过。

---

# 11. Current physical validation mapping

Physical mapping 仍属于 Common Controls，不属于本 slice contract。

当前 implementation 下，手工验证可以使用：

```text
ArrowUp/Down/Left/Right
→ up/down/left/right

KeyZ
→ south

Enter
→ start

KeyX
→ east

Tab
→ select
```

Gamepad 使用 canonical standard mapping：

```text
south button → south
east button  → east
select       → select
start        → start
dpad         → directions
```

如果 Common Controls 的 physical policy 未来变化，本 slice 的 semantic mapping 不变。

---

# 12. NPC interaction ownership

Map Runtime 只负责：

```text
player facing
+ adjacent NPC
+ interactable=true
+ confirm
→ NPCInteractEvent
```

PokeMan composition 负责：

```text
NPCInteractEvent
→ 是否启动 product Dialogue
```

固定 listener：

```text
event.npc.instanceId === "professor"
AND
event.npc.npcId === "professor"
→ start Professor vertical slice

anything else
→ no-op
```

不要在 Map Runtime 增加 Dialogue knowledge。

---

# 13. Async listener ownership

`RPGMapHandler.onNPCInteract()` 的 listener 是同步 callback surface：

```ts
(event: NPCInteractEvent) => void
```

Map Runtime 不 await callback Promise。

因此禁止：

```js
handler.onNPCInteract(async (event) => {
  await runDialogue();
});
```

然后假设 Map Runtime 会拥有该 Promise。

正确 composition 必须显式拥有 async task：

```text
NPCInteractEvent
→ synchronously gate activeDialogue
→ create dialogueTask
→ attach rejection handling
→ task completion clears gate
```

同一时刻最多一个 `dialogueTask`。

Unexpected Dialogue failure 不允许形成 unhandled rejection，也不允许被静默吞掉。

实现应把 unexpected task rejection 汇入当前 Map Frame 的 failure path，例如通过一个 composition-owned deferred failure 与：

```text
Promise.race(
  handler.run(...),
  dialogueFailure
)
```

收敛。

User cancel 是正常 Conversation result，不是 failure。

---

# 14. Per-interaction RPGDialogue lifetime

第一版每次 Professor interaction 创建一个新的：

```js
new RPGDialogue(scope, frame, {
  cancelable: true,
});
```

不在 Map Frame 启动时永久创建一个 RPGDialogue。

原因：

- 本 slice 的 History 只需要覆盖一次 Professor interaction；
- interaction 完成后直接关闭 Dialogue Domain，最容易验证 Map 恢复；
- 下一次再次和 Professor 对话建立 fresh Dialogue session；
- 不提前决定跨 NPC / 跨地图 History lifetime。

固定 lifecycle：

```text
NPCInteractEvent
→ new RPGDialogue
→ activeDialogue = instance
→ run scripted Conversations
→ finally:
     activeDialogue = null
     dialogue.close()
     applyMapIntent()
```

如果 Frame abort：

```text
RPGDialogue follows Frame abort
→ active openConversation rejects
→ cleanup remains settle-once
```

---

# 15. Professor presentation participant resolver

Dialogue Web Component 已冻结最终输入：

```ts
{
  sprite: {
    namespace: "resource.Graphics",
    key: string,
    contentVersion: string
  }
}
```

本 slice 在 PokeMan product composition 中真实执行 producer chain。

固定输入：

```text
NPCInteractEvent.npc.npcId = "professor"
known fixture Character identity = "professor"
```

resolve：

```text
scope.content.record(
  "struct.NPC",
  "professor",
  { signal: frame.signal }
)
        ↓
{
  name: "博士",
  sprite: {
    namespace: "resource.Graphics",
    key: "Characters/Professor"
  }
}
        ↓
scope.content.resource(
  "resource.Graphics",
  "Characters/Professor",
  { signal: frame.signal }
)
        ↓
resource.contentVersion
        ↓
DialogueCharacterV0
```

结果：

```js
{
  characterId: "professor",
  displayName: npc.name,
  active: true,
  data: {
    sprite: {
      namespace: npc.sprite.namespace,
      key: npc.sprite.key,
      contentVersion: resource.contentVersion,
    },
  },
}
```

本 slice 必须实际从 Content API 获取 `contentVersion`。

禁止 hard-code SHA。

---

# 16. Resolver validation boundary

因为 Map Runtime 的 NPC validator 是 private implementation，PokeMan 不能 import 它。

Product resolver 至少 fail closed 验证当前 fixture 所需 shape：

```text
record.value
→ exact { name, sprite }

name
→ non-empty string

sprite
→ exact { namespace, key }

namespace
→ "resource.Graphics"

key
→ non-empty hierarchical key
→ current fixture = "Characters/Professor"

resource.contentVersion
→ Content API returned version
```

不要读取：

```text
struct.Character/professor
```

来找 sprite。

本 slice 已知 Professor Character identity；它不是通用 Character→NPC resolver。

---

# 17. Hard-coded validation script

第一版不读取：

```text
struct.Dialogue/*
```

不解释：

```text
Choice.target
mutation
Story Index
```

使用 product-local hard-coded Conversations，只验证 RPGDialogue API 与 caller branching。

固定流程：

## 17.1 Conversation A

```text
speaker: 博士
text:    你终于来了。
choices: none
character: Professor active
```

request：

```js
{
  conversation: {
    speakerName: "博士",
    text: "你终于来了。",
    choices: [],
    data: {},
  },
  characters: [professorCharacter],
}
```

result：

```text
submitted
→ continue

cancelled
→ end interaction and return Map
```

Conversation A settle 后，Dialogue 是 READY，因此 append：

```js
dialogue.appendHistory({
  entryId: "professor-greeting",
  speakerName: "博士",
  text: "你终于来了。",
});
```

---

# 18. Conversation B：Choice

第二段：

```text
speaker: 博士
text:    准备好出发了吗？

choices:
ready     → 准备好了
not-yet   → 还没有
```

request：

```js
{
  conversation: {
    speakerName: "博士",
    text: "准备好出发了吗？",
    choices: [
      {
        choiceId: "ready",
        text: "准备好了",
        data: {},
      },
      {
        choiceId: "not-yet",
        text: "还没有",
        data: {},
      },
    ],
    data: {},
  },
  characters: [professorCharacter],
}
```

在该 Conversation ACTIVE 期间：

```text
history()
→ History 应显示 Conversation A 的 entry
```

这真实验证：

```text
caller appendHistory
→ RPGDialogue History
→ PokeMan History Web Component
```

而不是 test-only fake History。

---

# 19. Caller-owned branching

Conversation B result 由普通 PokeMan JavaScript branching 处理。

```text
{ type: "cancelled" }
→ end interaction

{ type: "submitted", choiceId: "ready" }
→ open Conversation C-ready

{ type: "submitted", choiceId: "not-yet" }
→ open Conversation C-not-yet
```

这里故意不使用 Dialogue graph。

它证明 Frozen RPG Dialogue API 的设计边界：

> RPG Dialogue 返回 interaction result；caller 决定下一步业务 flow。

---

# 20. Conversation C

## ready

```text
博士：
很好，出发吧。
```

## not-yet

```text
博士：
准备好以后再来找我。
```

均无 choices。

Conversation C 提交或 cancel 后：

```text
interaction complete
→ dialogue.close()
→ Dialogue RenderDomain removed
→ Map remains live
→ Map controls restored
```

本 slice 不写 Shared State。

不记录“玩家准备好了”。

不发 Quest/Event mutation。

---

# 21. History policy for this slice

本 slice History 只用于验证 session API。

固定：

```text
A submitted
→ append A

B submitted
→ append B

C
→ no need to append before closing session
```

B settle 后、打开 C 前可以追加：

```js
dialogue.appendHistory({
  entryId: "professor-question",
  speakerName: "博士",
  text: "准备好出发了吗？",
});
```

不要把 choice text 自动写成 History entry。

这不是正式 transcript policy。

正式游戏以后由 Dialogue/Story caller 单独定义。

---

# 22. Cancel behavior

RPGDialogue 使用：

```text
cancelable: true
```

固定语义：

```text
Conversation + east
→ current openConversation()
   resolves { type: "cancelled" }
→ end entire Professor interaction
→ close Dialogue
→ return Map
```

History 中：

```text
east
→ close History
→ return same Conversation
```

不会直接取消 Conversation，因为 RPGDialogue v1 已拥有该 precedence。

PokeMan composition 不重复实现 History cancel precedence。

---

# 23. Input router order

每个 valid `controls.event` 建议按以下顺序处理：

```text
1. directions.acceptEvent(event)
2. applyMapIntent()
3. if action !== down or repeat=true:
     stop semantic routing
4. if activeDialogue !== null:
     route Dialogue semantic command
   else:
     route Map semantic command
```

State：

```text
directions.acceptState(state)
→ applyMapIntent()
```

这样：

- directional truth 始终更新；
- Dialogue active 时 Map 始终 neutral；
- semantic press 不 replay；
- Dialogue 结束后可以立即恢复当前 held direction。

---

# 24. Interaction race rules

必须处理：

## 24.1 repeated confirm

```text
activeDialogue !== null
→ south/start routes to Dialogue
→ MUST NOT call map.controls.confirm()
```

所以玩家在 Dialogue 中继续按确认不会重新触发 Professor NPC interaction。

## 24.2 movement in progress

RPGMap 已保证：

```text
confirm while active movement
→ ignored
```

PokeMan 不复制 Map busy logic。

## 24.3 double NPC event

即使未来出现 duplicate business notification：

```text
dialogueTask !== null
OR activeDialogue !== null
→ startProfessorDialogue no-op
```

同一时刻不得创建第二个 RPGDialogue。

## 24.4 stale async resolution

如果 Frame 已 abort：

```text
Content reads reject/cancel
RPGDialogue terminates
task must not reopen Map/Dialogue state
```

finally cleanup 必须 idempotent。

---

# 25. Render / Presentation composition

本 slice 真实运行两个 RenderDomain：

```text
Map RenderDomain
+
RPGDialogue RenderDomain
```

PokeMan Dialogue Presentation 已验证：

```text
lr-dialogue-view CSS overlay
→ z-index 20
→ same Window above lr-map-view
```

本 slice 不修改：

```text
presentation/dialogue.browser.js
presentation/dialogue.css
presentation.json
```

除非 implementation 发现与真实 gameplay vertical 有新的 reproducible correctness bug。

不能为了业务接线再次重写组件状态机。

---

# 26. Production topology remains unchanged

完成后仍必须是：

```json
{
  "initial": {
    "subsystem": "base"
  },
  "subsystems": [
    { "key": "base" },
    { "key": "map" }
  ]
}
```

Hostra/PWA manifests 仍只安装：

```text
base
map
```

区别只是：

```text
map executable
→ production dependency @loomrealm-game/rpg-dialogue
→ same Frame creates RPGDialogue when needed
```

不要因为看到 RPGDialogue 就新增：

```text
{ key: "dialogue" }
```

Subsystem。

---

# 27. Initial spawn policy

不要为了方便手工验证修改 production：

```text
game.json initial map
```

正式游戏仍从当前起点启动。

自动 qualification 可以使用 test-only input / fixture 直接把玩家放到 Map 4 Professor 附近。

test-only fixture 不得写回 production Game Entry。

推荐 test setup：

```text
mapId = 4
player adjacent to Professor
player facing Professor
```

具体相邻 tile 必须由测试根据真实 Map passability 验证后选择，不能假设坐标一定可站立。

---

# 28. Required tests

至少增加 PokeMan-level tests 覆盖以下四层。

## 28.1 Placement

证明：

```text
Professor interactable=true
other current fixtures unchanged
```

## 28.2 Product controls composition

使用真实 Common Controls consumer semantics 或等价 focused harness，证明：

```text
Map active:
south/start down → map.confirm

Dialogue active:
south/start → dialogue.confirm
up → dialogue.previous
down → dialogue.next
select → dialogue.history
east → dialogue.cancel

repeat=true
→ no semantic command

Dialogue active
→ Map moveIntent = null

Dialogue closes
→ current tracker direction reapplied
```

## 28.3 Producer

使用真实 Content fixture 证明：

```text
struct.NPC/professor
→ sprite namespace/key
→ Content resource
→ real contentVersion
→ exact DialogueCharacterV0.data.sprite
```

不得 hard-code version。

## 28.4 Real gameplay vertical

真实 Chromium / WebProjector / PokeMan Presentation 下验证：

```text
real Map visible
→ Professor NPC visible
→ player faces Professor
→ semantic confirm
→ real NPCInteractEvent
→ real RPGDialogue
→ real PokeMan Dialogue Web Components
→ Conversation A
→ Conversation B choices
→ History
→ choice result
→ Conversation C branch
→ Dialogue closes
→ same Map remains live
→ movement works again
```

这才是本文件的核心 qualification。

---

# 29. Hostra / PWA evidence

至少现有受影响 qualification 必须继续 PASS：

```text
PokeMan package tests
PokeMan Presentation tests
PokeMan Staging Qualification
PWA content/build qualification
RPG Dialogue v1 qualification
Game Control Ports qualification
Map tests
```

如果可以合理复用现有 PokeMan staging browser harness，应增加一次真实 product interaction。

不要只用 fake `RPGDialogue.controls` 对象证明 closed loop。

---

# 30. Manual acceptance path

开发者可用当前 Common Controls keyboard policy手工验证：

```text
1. 启动 PokeMan
2. 前往研究所 Map 4
3. 走到 Professor 正前方
4. 按 Z 或 Enter
5. Dialogue Modal 出现
6. 第一段逐字显示
7. 第一次 confirm 在 revealing 时只 reveal all
8. 再次 confirm 提交第一段
9. 第二段出现 choices
10. ArrowUp/ArrowDown 改变 choice
11. Tab 打开 History
12. History 中能看到“你终于来了。”
13. X 关闭 History，回到同一 choice state
14. 提交 ready / not-yet
15. 出现对应第三段
16. 提交或取消
17. Dialogue Modal 消失
18. Map 没有 reload / remount
19. 玩家可以继续移动
20. 再次面对 Professor 可建立 fresh Dialogue session
```

---

# 31. Observable invariants

整个 vertical slice 必须保持：

```text
Map HTMLElement / RenderDomain
→ Dialogue 打开期间保持 live

Dialogue active
→ Map movement = neutral

History
→ 不恢复 Map controls

Conversation result
→ caller receives exact RPGDialogue result

Dialogue close
→ only Dialogue Domain closes

Map
→ remains current scene / same gameplay Frame

second Professor interaction
→ fresh RPGDialogue session
→ fresh History
```

---

# 32. Failure policy

第一轮不是 production Story system，但不能静默吞 correctness failure。

Unexpected：

```text
NPC content invalid
resource resolve failure
RPGDialogue open failure
Presentation/session establishment failure
unexpected branch value
```

必须进入 composition-owned failure path并使当前 PokeMan Map Frame fail-stop / surface test failure。

不得：

```text
console.error + pretend success
catch {} + continue
fallback to fake sprite SHA
fallback to fake Dialogue result
```

User：

```text
cancelled
```

是正常业务 result，不属于 failure。

---

# 33. Explicit non-goals

本 slice 不实现：

```text
struct.Dialogue loader
Dialogue graph runner
Choice.target
Dialogue.mutation
EventStateMutation
Story Index
Relationship
Quest
Inventory
Battle launch
Map transfer from Dialogue
persistent transcript
Shared State Dialogue history
speaker Character resolver
generic NPC→Character resolver
rival appearance resolver
multiple NPC Dialogue content
pointer/touch Dialogue controls
physical key hint UI
```

如果实现 Agent 开始设计这些内容，属于 scope creep。

---

# 34. What this proves

本 slice 成功后，我们获得的证据是：

```text
Map Control Port
+ NPC Interaction API
+ Common Controls composition
+ RPG Dialogue v1 Control Port
+ RPG Dialogue Conversation/History API
+ PokeMan character sprite producer
+ PokeMan Dialogue Web Components
+ LoomRealm multi-Domain Web Presentation
```

在真实 PokeMan 产品代码中可以组合工作。

它**不证明**：

```text
PokeMan 正式 Dialogue subsystem 已设计完成
Story graph 已设计完成
Content Dialogue schema 已经适合 runtime runner
```

---

# 35. Exit criteria

只有以下全部成立，本 vertical slice 才算完成：

```text
[ ] Professor placement interactable=true
[ ] other NPC interaction scope unchanged
[ ] @loomrealm-game/rpg-dialogue is production dependency
[ ] production topology remains base + map
[ ] only one ControlsConsumer exists in Map Frame
[ ] Map confirm routes through RPGMapControls.confirm()
[ ] Dialogue controls route through RPGDialogue.controls
[ ] Dialogue active immediately neutralizes Map movement
[ ] held direction truth continues tracking during Dialogue
[ ] Map reactivation reapplies current tracker direction
[ ] Professor sprite ref resolves through real Content API
[ ] no hard-coded contentVersion
[ ] no Web Component Content query
[ ] Conversation A works
[ ] caller appendHistory works
[ ] Conversation B choices work
[ ] History shows prior entry
[ ] History cancel returns same Conversation
[ ] choice result reaches caller
[ ] hard-coded caller branching opens correct Conversation C
[ ] user cancel exits cleanly
[ ] Dialogue Domain closes after interaction
[ ] Map Domain/scene remains live
[ ] player can move again
[ ] second interaction creates fresh Dialogue session
[ ] unexpected async failure is owned and not unhandled
[ ] Hostra qualification passes
[ ] PWA qualification passes
[ ] Map tests pass
[ ] RPG Dialogue v1 tests pass
[ ] Game Control Ports tests pass
```

---

# 36. Next step after qualification

只有本 vertical slice 通过后，再单独设计：

```text
PokeMan Dialogue subsystem / runner
```

届时再决定：

- `struct.Dialogue` 如何加载；
- Line / Choice 如何依次执行；
- `Choice.target` 的 exact semantics；
- Character → current NPC appearance 如何由 Story/World context resolve；
- mutation 在何时提交；
- Dialogue 是否使用 child Frame；
- History 是否进入 Shared State；
- NPC interaction 如何映射 Dialogue key。

这些决策不应倒灌到当前最小验证。
