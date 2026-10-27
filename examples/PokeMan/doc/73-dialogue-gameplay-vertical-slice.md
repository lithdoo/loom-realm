# PokeMan Dialogue Gameplay Vertical Slice

> 状态：**Design / Ready for implementation**
> 范围：PokeMan 产品层最小 Dialogue gameplay vertical slice
> 依赖：
> - [64-dialogue.md](./64-dialogue.md)
> - [69-dialogue-web-component.md](./69-dialogue-web-component.md)
> - [72-controls-composition.md](./72-controls-composition.md)
> - [Game Control Ports](../../../doc/10-architecture/game-control-ports.md)
> - [Frame / Call Protocol v1](../../../doc/15-contracts/frame-call-protocol-v1.md)
> - [RPG Dialogue v1 API](../../../game-libs/rpg-dialogue/RPG_DIALOGUE_V1_API.md)

本文定义下一步 PokeMan 产品验证：使用已经落地的 Map NPC Interaction API、LoomRealm canonical `frame.call(...)`、RPG Dialogue v1 semantic controls 和 PokeMan Dialogue Web Presentation，在真实 PokeMan 中跑通一次标准业务子系统调用。

本阶段明确采用独立 `dialogue` Subsystem，由 Map 通过 `frame.call("dialogue", ...)` 打开 child Frame；不再采用 same-Frame 临时创建 `RPGDialogue` 的方案。

这仍然不是正式 Dialogue graph runner 的最终设计。当前只验证：**Map NPC interaction 能否按正常 Frame / Subsystem 业务边界调用 Dialogue child Frame，并在 child 内完整运行 RPGDialogue + Web Presentation，最后安全返回 Map fresh Activation。**

---

# 1. Target vertical

第一版固定验证：

```text
玩家在 Map 中移动
→ 面向 Professor
→ confirm
→ RPGMap emits NPCInteractEvent
→ Map closes current Activation controls
→ frame.call("dialogue", exact business input)
→ Map Frame A1 suspended
→ Dialogue child Frame becomes Top Active Frame
→ Dialogue Subsystem creates RPGDialogue
→ Dialogue Subsystem owns its own ControlsConsumer
→ resolve Professor sprite + contentVersion
→ Conversation / reveal / choice / history / cancel
→ Dialogue child returns FrameOutcome
→ Dialogue child closes
→ Map Frame resumes with fresh Activation A2
→ Map creates fresh ControlsConsumer + DirectionalControlsTracker
→ Map continues without remount/reload
```

成功后才进入正式：

```text
struct.Dialogue
→ graph runner
→ Choice.target
→ EventStateMutation
→ Story / Relationship / Battle / Quest
```

# 2. Exact scope

本阶段预计修改：

```text
examples/PokeMan/subsystems/map.mjs
examples/PokeMan/subsystems/dialogue.mjs
examples/PokeMan/game.json
examples/PokeMan/launch.hostra.json
examples/PokeMan/launch.pwa.json
examples/PokeMan/package.json
package-lock.json
examples/PokeMan/scripts/prepare-pwa-content.mjs
apps/pwa/scripts/build.mjs
apps/pwa/package.json
apps/pwa/test/pokeman-bundle.test.mjs
apps/pwa/test/pokeman-map.e2e.test.mjs
apps/pwa/test/pokeman-staging.e2e.test.mjs
apps/pwa/test/staging-build.test.mjs
PokeMan focused tests / qualification
```

本阶段不修改：

```text
examples/PokeMan/subsystems/base.mjs
@loomrealm-game/map Runtime
@loomrealm-game/rpg-dialogue Runtime
@loomrealm-game/common-controls Runtime
PokeMan Dialogue Web Components
LoomRealm Frame / Call protocol
Frozen Presentation ABI
```

# 3. Composition choice：independent child-Frame Dialogue Subsystem

Production subsystem topology 完成后固定为：

```text
base
├─ map
└─ dialogue
```

一次对话的 Frame stack：

```text
base Frame
  suspended by base → map call
      │
      ▼
map Frame A1
  active
      │
      │ frame.call("dialogue", ...)
      ▼
map Frame suspended
dialogue child Frame active
      │
      │ return
      ▼
dialogue child closed
map Frame A2 active (fresh Activation)
```

职责：

```text
Map
→ 地图 / NPC interaction owner

Dialogue
→ 对话 session / conversation flow owner

Frame.call
→ 业务模块之间的调用边界

Main
→ Frame Stack / Activation / InputTarget authority
```

因此：

- Map 不 import `RPGDialogue`；
- Dialogue 不依赖 Map Runtime；
- Main 自动保证 child Frame 是唯一 Top Active Frame；
- 不使用 same-Frame `mapControlsActive/dialogueControlsActive` flag；
- Dialogue 返回后 Map 获得 fresh Activation；
- 后续正式 `struct.Dialogue` runner 可以自然落在 `dialogue.mjs`。

## 3.1 73 对 72 的 authority override

[72-controls-composition.md](./72-controls-composition.md) 描述的是已经实现并 qualified 的上一阶段 `base + map` Map-only topology。

本 vertical slice 落地后，本文 **只在以下两点 supersede 72**：

```text
production subsystem topology
→ base + map + dialogue

Map controls lifetime around child call
→ Activation-local A1 / A2 Consumers
```

72 继续作为以下事实的 authority：

```text
base owns exactly one <game-controls-input>
controls producer remains live across child Frames
Map direction mapping uses Common Controls
blocked movement semantics remain unchanged
raw Keyboard/Gamepad are not reintroduced
```

实现 Agent 不得因为 topology 增加 Dialogue 就把 controls producer 从 `base` 移走。

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

`dialogue.mjs` production import：

```js
import { RPGDialogue } from "@loomrealm-game/rpg-dialogue";
import { createControlsConsumer } from "@loomrealm-game/common-controls/subsystem";
```

因此 `@loomrealm-game/rpg-dialogue` 从 PokeMan `devDependencies` 移到 `dependencies`。

`@loomrealm-game/common-controls` 已经是 production dependency。

Map 不 import RPGDialogue。

# 7. Map → Dialogue exact business input

Map 不传 RPGDialogue request，也不传 Presentation data。

第一版 exact input：

```ts
type PokeManDialogueFrameInputV1 = {
  dialogueKey: "professor-vertical-slice";
  source: {
    mapId: number;
    npc: {
      instanceId: "professor";
      npcId: "professor";
    };
  };
};
```

调用：

```js
await frame.call("dialogue", {
  dialogueKey: "professor-vertical-slice",
  source: {
    mapId: event.mapId,
    npc: {
      instanceId: event.npc.instanceId,
      npcId: event.npc.npcId,
    },
  },
});
```

Map 不传 speaker、text、choices、sprite、contentVersion、RPGDialogue instance、controls object 或 Render data。

# 8. Dialogue Frame output

正常业务返回值：

```ts
type PokeManDialogueFrameResultV1 = {
  dialogueKey: "professor-vertical-slice";
  conclusion: "ready" | "not-yet" | "cancelled";
};
```

RPGDialogue 的 user cancel 是 child 内部普通业务结果，应转换成：

```text
completed({
  dialogueKey: "professor-vertical-slice",
  conclusion: "cancelled"
})
```

真正运行失败才返回 `failed(...)`。

# 9. Frame / Activation semantics

`frame.call` 被 Main 接受后：

```text
Map A1
→ permanently revoked
→ Map Frame suspended
→ no ordinary input
→ Dialogue child becomes Top Active Frame
```

Dialogue 返回后：

```text
Map does NOT regain A1
→ Main creates fresh A2
→ frame.resume(...)
→ code after await frame.call runs under A2
```

因此禁止：

```text
carry A1 ControlsConsumer across the call
carry A1 DirectionalControlsTracker into A2
reuse A1 heldOrder
reuse A1 freshness timer
```

# 10. Map Controls lifecycle

`map.mjs` controls wiring 从 Frame-lifetime 一次创建改为 Activation-local：

```text
startMapControlsActivation()
stopMapControlsActivation()
```

每次 start：

```text
new DirectionalControlsTracker
new ControlsConsumer
initial neutral State
```

每次 stop：

```text
handler.controls.setMoveIntent(null)
tracker.reset()
consumer.close()
discard tracker / consumer references
```

# 11. Map child-call sequence

Professor interaction：

```text
NPCInteractEvent
→ gate duplicate dialogueTask
→ stopMapControlsActivation()
→ frame.call("dialogue", input)
→ await child outcome
→ caller resumes under fresh Activation
→ if continuation allowed:
   startMapControlsActivation()
```

必须先关闭 A1 controls，再调用 `frame.call`。

如果 call 在 commit 前因 target unavailable/not found 被拒绝，本 slice 直接 fail current Map Frame；不要重建旧 A1 controls 后假装产品正常。

# 12. Async child-call ownership

`RPGMapHandler.onNPCInteract()` 是同步 callback，Map Runtime 不 await callback Promise。

Map composition 显式拥有：

```text
dialogueTask: Promise<void> | null
```

并让 Map Frame 顶层能观察 child-call failure，例如 composition-owned failure channel 与：

```text
Promise.race(
  handler.run(...),
  ownedDialogueFailure
)
```

禁止 `void frame.call(...).catch(console.error)` 后继续运行。

# 13. Map remains rendered while suspended

Frame lifecycle 不拥有 Render lifecycle：

```text
Map Frame suspended
≠ Map RenderDomain closed
≠ Map HTMLElement removed
```

call 前 `moveIntent=null`，Map runtime保持 idle。

Dialogue child active 时：

```text
Map remains rendered underneath
+
Dialogue RenderDomain overlays Map
```

# 14. Independent dialogue.mjs

`examples/PokeMan/subsystems/dialogue.mjs` 从 empty subsystem 改为真实 `defineSubsystem(...)`。

它独立拥有：

```text
frame.params validation
RPGDialogue lifetime
Dialogue ControlsConsumer
Professor participant resolver
hard-coded vertical-slice flow
History policy
child business result
cleanup
```

# 15. Dialogue Subsystem controls

Dialogue child Frame 创建自己的：

```js
createControlsConsumer(
  scope.presentationEvents,
  frame,
  { onEvent(...) { ... } }
)
```

不创建 DirectionalControlsTracker。

| Controls button | Dialogue command |
| --- | --- |
| `south` | `dialogue.controls.confirm()` |
| `start` | `dialogue.controls.confirm()` |
| `up` | `dialogue.controls.previous()` |
| `down` | `dialogue.controls.next()` |
| `select` | `dialogue.controls.history()` |
| `east` | `dialogue.controls.cancel()` |

只处理 `action="down"` 且 `repeat=false`。

# 16. Controls naturally switch Frames

`<game-controls-input>` 继续由 `base` 挂载；它的 RenderDomain 可在 base/map/dialogue child calls 之间保持 live。

Main 决定 Top Active Frame / Activation / Presentation Interest：

```text
Map A1 active
→ controls → Map consumer

Map calls Dialogue
→ A1 revoked
→ old Map consumer already closed

Dialogue child active
→ controls → Dialogue consumer

Dialogue returns
→ child consumer closes
→ Map A2
→ fresh Map consumer
```

Map A2 必须从 neutral 开始。即使玩家仍按住方向，也只能由 A2 下新收到的 `controls.state` 重建 held truth；不能直接恢复 A1 direction。

# 17. Professor presentation participant resolver

Dialogue Subsystem真实执行 PokeMan Presentation producer chain：

```text
scope.content.record(
  "struct.NPC",
  "professor",
  { signal: frame.signal }
)
→ name + sprite

scope.content.resource(
  sprite.namespace,
  sprite.key,
  { signal: frame.signal }
)
→ resource.contentVersion
```

构造：

```js
{
  characterId: "professor",
  displayName: "博士",
  active: true,
  data: {
    sprite: {
      namespace: "resource.Graphics",
      key: "Characters/Professor",
      contentVersion: resource.contentVersion,
    },
  },
}
```

禁止 hard-code SHA。

当前 fixture只冻结：

```text
dialogueKey = "professor-vertical-slice"
→ Character identity = "professor"
→ appearance npcId = "professor"
```

不得把 `npcId === characterId` 推广成通用规则；`rival-lab/rival-casual → Character rival` 仍属于后续 appearance resolver。

# 18. Hard-coded validation script

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

使用 product-local hard-coded Conversations，只验证 RPGDialogue API、History、choice 和 Dialogue Subsystem 内部 branching。

固定流程：

## 18.1 Conversation A

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

# 19. Conversation B：Choice

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

# 20. Dialogue-owned branching

Conversation B result 由 **Dialogue Subsystem** 自己处理：

```text
{ type: "cancelled" }
→ child conclusion = "cancelled"
→ return completed(...)

{ type: "submitted", choiceId: "ready" }
→ open Conversation C-ready

{ type: "submitted", choiceId: "not-yet" }
→ open Conversation C-not-yet
```

Map caller不解释 choiceId，也不决定 C。

这里仍然故意不使用 Dialogue graph；只是把当前 hard-coded flow 放在正确的业务 owner 中。

```text
RPGDialogue
→ 提供 Conversation interaction result

PokeMan Dialogue Subsystem
→ 拥有当前 Dialogue flow

Map
→ 只负责 NPC interaction → call Dialogue
```

# 21. Conversation C

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

C 正常提交后，Dialogue Subsystem返回：

```text
ready
→ completed({
     dialogueKey: "professor-vertical-slice",
     conclusion: "ready"
   })

not-yet
→ completed({
     dialogueKey: "professor-vertical-slice",
     conclusion: "not-yet"
   })
```

任一 Conversation 的用户 cancel：

```text
→ completed({
     dialogueKey: "professor-vertical-slice",
     conclusion: "cancelled"
   })
```

随后 child Frame return/close；Map由 Main resume到 fresh Activation。

本 slice 不写 Shared State，不记录“玩家准备好了”，不发 Quest/Event mutation。

# 22. History policy for this slice

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

# 23. Cancel behavior

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

# 24. Controls ownership across Frame call

不再存在同一 ControlsConsumer 内的 Map / Dialogue router。

Map A1：

```text
controls.state / event
→ Map Activation-local Consumer
→ Directional Tracker / map.controls.confirm()
```

call 前：

```text
moveIntent = null
tracker.reset()
consumer.close()
```

Dialogue child：

```text
controls.event
→ Dialogue child Consumer
→ RPGDialogueControls
```

Dialogue return后 Map A2：

```text
new Consumer
new Directional Tracker
initial neutral
new controls.state rebuilds truth
```

这由 Frame authority切换 controls destination，而不是 product local active flag。

# 25. Interaction race rules

## 25.1 repeated confirm

一旦 child call accepted：

```text
Map A1 suspended
→ no ordinary controls delivery to Map
→ south/start只可能进入 Dialogue child Consumer
```

所以 Dialogue 中确认不会重新触发 Professor NPC interaction。

## 25.2 movement in progress

RPGMap 已保证：

```text
confirm while active movement
→ ignored
```

PokeMan 不复制 Map busy logic。

Professor interaction被接受后，call 前必须先 `moveIntent=null`。

## 25.3 duplicate NPC event

在 child call task 建立前的本地 race使用：

```text
dialogueTask !== null
→ do not start a second call
```

call accepted 后 Map 已 suspended，本身不会再收到 ordinary confirm。

## 25.4 stale / terminal cleanup

如果 Map Frame terminal、Runtime failure或 child-call unwind发生：

```text
old Map Consumer remains closed
old tracker remains discarded
child Dialogue owns its own cleanup
```

不得在 terminal path 私自重建 Map controls。

只有正常 child return + valid Map resume 后，才创建 A2 controls wiring。

# 26. Render / Presentation composition

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

# 27. Production topology after this slice

完成后 exact topology：

```json
{
  "initial": {
    "subsystem": "base"
  },
  "subsystems": [
    { "key": "base" },
    { "key": "map" },
    { "key": "dialogue" }
  ]
}
```

Hostra：

```text
base     -> subsystems/base.mjs
map      -> subsystems/map.mjs
dialogue -> subsystems/dialogue.mjs
```

PWA 使用相同 subsystem topology，并必须把 `dialogue.mjs` 纳入 installed executable index。

`base` 继续只拥有 unified controls producer lifetime；它不变成 Dialogue orchestrator。

# 28. Initial spawn policy

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

# 29. Required tests

至少覆盖五层。

## 29.1 Topology / placement

```text
game.json = base + map + dialogue
launch.hostra = base + map + dialogue
launch.pwa = base + map + dialogue
Professor interactable=true
other current NPC fixtures unchanged
```

## 29.2 Map child-call / Activation controls

```text
Map A1:
south/start → map.controls.confirm()

Professor NPCInteractEvent
→ exact frame.call("dialogue", input)

before call:
→ moveIntent=null
→ A1 consumer closed
→ A1 tracker reset/discarded

child active:
→ old A1 delivery cannot affect Map

after child return:
→ Map resumed under fresh A2
→ A2 Consumer is a new instance
→ A2 Tracker is a new instance
→ A2 starts neutral
→ only new A2 controls.state rebuilds held truth
```

## 29.3 Dialogue Subsystem

```text
exact frame.params validation
one child-frame ControlsConsumer
south/start → confirm
up/down → previous/next
select → history
east → cancel
repeat=true → no command
RPGDialogue lifecycle / cleanup
exact completed / failed child outcomes
```

## 29.4 Producer / dialogue flow

使用真实 Content fixture：

```text
struct.NPC/professor
→ sprite namespace/key
→ Content resource
→ real contentVersion
→ exact DialogueCharacterV0.data.sprite
```

并覆盖 A、History、B、ready/not-yet、Dialogue-owned branching、C、user cancel。

不得 hard-code contentVersion。

## 29.5 Real Frame-stack gameplay vertical

```text
base → map A1
real Map visible
Professor NPC visible
semantic confirm
real NPCInteractEvent
real frame.call("dialogue")
Map A1 suspended
Dialogue child is Top Active Frame
real RPGDialogue
real PokeMan Dialogue Web Components
History / Choice work
child returns
Map A2 fresh Activation
same Map RenderDomain / HTMLElement remains
fresh Map controls work
movement works again
```

这次只证明两个 RenderDomain同 Window共存是不够的；必须验证真实 call / suspend / child / return / resume。

# 30. Hostra / PWA evidence

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

# 31. Manual acceptance path

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

# 32. Observable invariants

```text
Map RenderDomain / HTMLElement
→ child Dialogue期间保持 live

Map A1
→ call前 moveIntent neutral
→ controls wiring closed

Dialogue child
→ 唯一 Top Active Frame
→ own ControlsConsumer
→ own RPGDialogue
→ own Dialogue flow

History
→ remains inside child Dialogue Frame

child completed
→ child closes
→ Map resumes fresh A2

Map A2
→ fresh Consumer / Tracker
→ neutral baseline
→ same Map scene / Handler / RenderDomain

second Professor interaction
→ new child Frame
→ new RPGDialogue
→ fresh History
```

# 33. Failure policy

Unexpected：

```text
frame.call target unavailable
invalid Dialogue Frame input
NPC content invalid
resource resolve failure
RPGDialogue open failure
Presentation/session establishment failure
unexpected result / choice
child Frame failed outcome
```

必须进入明确 failure path；不能 `console.error` 后假装成功。

Map child call得到 `failed` 时不得重新创建正常 A2 gameplay controls然后继续。

用户在 RPGDialogue 中的 `{ type: "cancelled" }` 是正常业务结果，由 Dialogue Subsystem转换成：

```text
completed({ conclusion:"cancelled" })
```

不是 child failure。

# 34. Explicit non-goals

本 slice 不实现：

```text
struct.Dialogue loader
generic Dialogue graph runner
Choice.target
Dialogue.mutation
EventStateMutation
Story Index
Relationship
Quest
Inventory
Battle launch
persistent transcript
Shared State Dialogue history
generic NPC→Dialogue mapping
generic Character→NPC resolver
rival appearance resolver
multiple NPC Dialogue content
pointer/touch Dialogue gameplay
physical key hint UI
```

但与旧方案不同：

> **独立 `dialogue` Subsystem、child Frame、其 ControlsConsumer 与 hard-coded flow 已属于本 slice 正式实现范围。**

# 35. What this proves

成功后获得的证据是：

```text
RPGMap NPC Interaction
→ canonical frame.call business boundary
→ independent PokeMan Dialogue Subsystem
→ child Frame Input authority
→ RPGDialogue v1
→ PokeMan Dialogue Web Components
→ child return
→ fresh Map Activation
```

同时证明：

```text
Frame lifecycle
Render lifecycle
Controls Activation lifecycle
```

没有被错误混为一谈。

它仍不证明正式 `struct.Dialogue` graph runner / Story mutation设计已经完成。

# 36. Exit criteria

```text
[ ] production topology = base + map + dialogue
[ ] dialogue.mjs 不再是 empty subsystem
[ ] Professor interactable=true
[ ] other NPC interaction scope unchanged
[ ] Map 不 import RPGDialogue
[ ] Map 使用 frame.call("dialogue", exact input)
[ ] @loomrealm-game/rpg-dialogue 是 production dependency
[ ] Map A1 consumer 在 call 前关闭
[ ] Map moveIntent 在 call 前 neutral
[ ] A1 tracker reset/discard
[ ] Dialogue child owns fresh ControlsConsumer
[ ] child 是真实 Top Active Frame
[ ] Map suspended期间不接 ordinary controls
[ ] Professor sprite通过真实 Content API resolve
[ ] no hard-coded contentVersion
[ ] Conversation A works
[ ] History works
[ ] Conversation B choice works
[ ] Dialogue Subsystem owns branching
[ ] Conversation C works
[ ] user cancel → normal completed child result
[ ] unexpected failure → failed child outcome
[ ] child close释放 Dialogue resources
[ ] Map resumes fresh A2
[ ] A2 uses new Consumer/Tracker
[ ] A2 starts neutral
[ ] old A1 State/Event不泄漏
[ ] same Map RenderDomain / HTMLElement / scene remain live
[ ] movement after resume works
[ ] second interaction creates fresh child Frame
[ ] Hostra qualification passes
[ ] PWA dialogue executable installed
[ ] PWA qualification passes
[ ] Map tests pass
[ ] RPG Dialogue v1 tests pass
[ ] Game Control Ports tests pass
[ ] relevant Frame / Call conformance regressions pass
```

# 37. Next step after qualification

本 vertical slice通过后，再设计正式：

```text
PokeMan Dialogue runner
```

届时再决定：

- `struct.Dialogue` 如何读取；
- Line sequence；
- `Choice.target` exact semantics；
- generic NPC → Dialogue mapping；
- Character / appearance resolver；
- mutation commit timing；
- Story / World caller；
- History persistence。

**是否使用独立 Dialogue Subsystem / child Frame 已在本 slice 中确定，不再作为后续待决项。**

