# 数据 Authority 清单

> 独立技术设计记录。不改写 `../DESIGN.md`。本文把当前 PokeMan 数据按 **Content / Realm State / Runtime Memory** 三类 authority 统一梳理。Realm State 物理 Record 结构见 [67-realm-state-records.md](./67-realm-state-records.md)，Content FSDB 物理结构见 [68-content-fsdb.md](./68-content-fsdb.md)。

# 三类 Authority

```text
Content
= 这个游戏本来怎么定义
= 安装后只读

Realm State
= 这一局已经形成、需要跨 Subsystem 共享的 mutable business facts

Runtime Memory
= 当前 Subsystem / Frame / Map / Dialogue / Battle 正在执行的 live working set
```

判断顺序：

```text
安装后只读定义？
→ Content

当前某个 Subsystem 的 live execution authority？
→ Runtime Memory

这一局已经发生，而且以后其他 Subsystem 必须继续知道？
→ Realm State

可以由 Content + authoritative State 稳定重建？
→ 不建立新的 authority
```

“将来可能要存档”本身不是把 live Runtime 数据提前复制进 Realm State 的理由。

# Content

Content 回答“游戏原本怎么定义”。

## Character

```text
struct.Character / <characterId>
├─ name
├─ description?
├─ aiCharacterText?
├─ battleActor: ContentRef
└─ defaultScenes?
```

Character identity 由 FSDB record key 提供；PokeMan source 不重复保存 `id`。

Character 不保存当前 affinity、hostile、Contract、Card 或 Battle Runtime HP。

## NPC / Graphics

```text
struct.NPC / <npcId>
├─ name
└─ sprite → resource.Graphics
```

NPC Definition 表示地图表现模板，不是 Character identity，也不是当前 Map 上的 NPC Instance。

当前不建立独立 `struct.Visual`；地图人物视觉直接通过 `resource.Graphics` 表达。

## BattleActor / BattleSkill

PokeMan 直接复用 `@loomrealm-game/battle` Content contract，不定义第二套 Battle profile / skill schema。

```text
Persistent Character
→ Character.battleActor
→ base BattleActor

Transient Encounter / Story source
→ battleActor ContentRef
→ base BattleActor
```

新 Contract 初始化：

```text
integrity = BattleActor.max_hp
skills[]  = copy(BattleActor.skills[])
```

Contract 不保存 `maxIntegrity`。

## Dialogue

```text
struct.Dialogue / <dialogueId>
├─ speakerName?
├─ lines[]
│  ├─ speaker? → Character key
│  └─ text
├─ choices?[]
│  └─ target → Dialogue key
└─ mutation? → EventStateMutation key
```

`speakerName` 只是 presentation fallback，不是 Character identity。

## Event / EventStateMutation

```text
struct.Event / <eventId>
└─ states.<stateId>.maps.<mapId>.npcs.<npcId>
   ├─ character?
   ├─ placement XOR absent:true
   ├─ battleActor?        # transient Story NPC only
   └─ interaction.dialogue?
```

```text
struct.EventStateMutation / <mutationId>
├─ from: eventId → stateId | null
└─ to: eventId → stateId | null
```

Event current state 本身不在 Content，而在 Realm State `EventStateList`。

## Encounter

```text
struct.Encounter / <decimal-mapId>
├─ spawnPoints[]
└─ templates
   └─ <templateId>
      ├─ npc
      ├─ engagement
      ├─ dialogue?
      └─ battleActor
```

当前某次 Map Enter 实际生成哪些 Encounter 不属于 Content。

## StoryIndex

```text
struct.StoryIndex / current
├─ byMap
├─ byCharacter
└─ byEvent
```

它是 Builder-generated read model，可由源 Content 重建，不进入 Realm State。

# Realm State

Realm State 回答“这一局已经形成哪些跨 Subsystem 的长期业务事实”。物理结构以 `67-realm-state-records.md` 为 canonical source。

## durable PlayerWorld checkpoint

```text
pokeman.PlayerWorld / current
→ { mapId, x, y, direction }
```

这里保存的是 **durable resume/checkpoint location**，不是 live player pose。

```text
live current map / position / direction / motion
→ Map Runtime

explicit saved/checkpoint location
→ pokeman.PlayerWorld/current
```

`mapId` 是正 safe integer，与 Map package identity 一致。

## EventStateList

```text
pokeman.EventStateList / current
→ [{ eventId, stateId }]
```

```text
entry exists → current state = stateId
entry absent → current state = null
```

列表不保存 `stateId:null`。

## Relationship / Contract

```text
pokeman.Relationship / <from>/<to>
→ {
    affinity,
    hostile,
    relationshipText,
    contract?: {
      integrity,
      skills[]
    }
  }
```

`A → B` 与 `B → A` 独立。

Relationship Record 可以存在而 `contract` 缺失。存在 `contract` 才表示正式契约成立。

Contract 嵌在 Relationship 中，不建立独立 Record。

## CarriedCards

```text
pokeman.CarriedCards / <holder>
→ [{ slot, servantCharacterId }]
```

Card 只表示当前随身编队，不保存 Integrity、skills、BattleActor 或 Character 静态资料。

MVP 不建立 `cardId`。

# Runtime Memory

Runtime Memory 回答“当前正在执行什么”。

## Frame / Session control

例如：

```text
Frame stack
Activation
Input target
Abort signal
current Menu / Message frame instance
```

这些属于 Main / Frame control plane，不进入 Realm State。

## Map Runtime

live authority：

```text
current mapId
player x / y
direction
motion
scene
current NPCPlacement[]
```

Map Runtime live state 不与 `pokeman.PlayerWorld/current` 双写成两个实时 authority。只有明确 save/checkpoint workflow 才把当前位置投影成 durable resume point。

## Story Resolver / NPC Instance

```text
Content
+ EventStateList
↓
Story Resolver
↓
World-side NPC Instances
├─ instanceId
├─ npcId
├─ characterId? / source context
└─ placement
```

这些当前场景实例是 Runtime projection。

## Dialogue Runtime

```text
current dialogue id
current line index
pending choice
terminalDialogueId completion result
```

不进入 Realm State。

## Battle Runtime

```text
currentHp
tile
direction
actionState
activePlan
activeStep
protectedUntilTickExclusive
actionGeneration
decisionGeneration
```

Battle 完成以后，只有需要长期持续的 Contract Integrity 等结果写回 Realm State。

## Encounter Runtime

```text
current generated Encounter set
spawn assignments
transient body battle state
```

re-entry reroll、defeated 是否保持消失、何时清理生成结果等属于 Runtime / gameplay policy。只有真实 policy 需要长期共享事实时，再设计最小 State。

# Derived / read model 不是第四 authority

以下数据可以存在，但不形成新的业务 authority：

```text
StoryIndex
Renderer current replica
UI view model
Center "managed cards" view
resolved Map scene projection
```

它们都应能追溯到已有 Content / Realm State / Runtime authority。

# Authority 对照

| 数据 | Authority |
| --- | --- |
| Character definition | Content |
| NPC definition / sprite | Content |
| BattleActor / BattleSkill | Content |
| Dialogue / Event / Mutation | Content |
| Encounter definition | Content |
| StoryIndex | generated Content / read model |
| durable resume/checkpoint | Realm State |
| Event current state | Realm State |
| Relationship / Contract | Realm State |
| current carried Card party | Realm State |
| live map / player pose | Map Runtime |
| current NPC Instances | World / Map Runtime |
| current Dialogue cursor | Dialogue Runtime |
| current Battle actor state | Battle Runtime |
| current generated Encounter set | Encounter / World Runtime |

# 当前冻结结论

```text
Content
= immutable installation definitions
= PokeMan FSDB shape in 68-content-fsdb.md

Realm State
= cross-Subsystem mutable business facts
= physical records in 67-realm-state-records.md

Runtime Memory
= current live execution authority
```

特别固定：

```text
live player pose → Map Runtime
PlayerWorld Realm State → durable resume/checkpoint only

NPC Instance → Runtime
Event / Character scene source → Content

Battle live state → Battle Runtime
Contract integrity / skills → Realm State

Dialogue cursor → Runtime
Dialogue definition / Mutation definition → Content
```

当前不因为 Save / Load、Encounter persistence、future progression 等潜在需求建立额外通用 State bag。