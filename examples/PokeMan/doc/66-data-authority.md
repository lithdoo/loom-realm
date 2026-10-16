# 数据 Authority 清单

> 独立技术设计记录。不改写 `../DESIGN.md`。本文把当前 PokeMan 数据按 **Content / Realm State / Runtime Memory** 三类 authority 统一梳理，作为进入具体 Record / key / JSON schema 设计前的分类基线。详细模块落点仍见 [数据落点](./60-data-placement.md)。

## 三类 Authority

当前统一使用下面的判断：

```text
Content
= 这个游戏本来怎么定义
= 安装后只读

Realm State
= 这一局已经发生了什么、现在长期是什么状态
= mutable business authority
= 需要跨 Subsystem / Frame / Save 持续时保存

Runtime Memory
= 当前这次运行正在做什么
= 当前 Frame / Map / Dialogue / Battle 的 working set
= 可以由 Content + Realm State 重算时，不提升为 State
```

可以用四条简单规则判断：

```text
所有新游戏都一样
→ Content

这一局发生后改变，而且以后必须继续知道
→ Realm State

只活在这次调用 / 这张 Map 当前实例 / 这场 Battle
→ Runtime Memory

能由 Content + Realm State 重算
→ 不为了方便重复存进 Realm State
```

“未来可能需要持久化”本身不是建立 Realm State 的理由。先确定 Runtime / gameplay policy，再只保存真正需要跨边界持续的最小事实。

# Content：静态定义

Content 回答“游戏原本怎么定义”，不记录某一局发生后的结果。

## Character

持久人物的静态定义属于 Content：

```text
Character
├─ id
├─ name
├─ description
├─ fixed AI character text
├─ tags
├─ default scene instances
├─ stable battleActorRef
└─ presentation references
```

其中：

- Character 表示“这个人是谁”；
- `default scene instances` 只是没有 active Event 接管该 Character 时的 fallback 定义；
- 持久 Character 稳定引用一个基础 BattleActor；
- 同一个 Character 的不同 NPC Instance 不改变 BattleActor identity。

Character 不保存当前 affinity、hostile、Contract、Integrity、当前 Card 或 Battle Runtime HP。

## NPC Definition / Visual

地图表现模板和视觉资源属于 Content：

```text
NPC Definition
├─ npcId
├─ name
└─ sprite

Visual / Resources
= 可复用静态表现定义与资源
```

`npcId` 不是 Character identity，NPC Definition 也不是当前地图上的 NPC Instance。

## BattleActor / BattleSkill

PokeMan 不复制第二套 Skill / Battle Actor schema，直接使用 `@loomrealm-game/battle` Content：

```text
BattleActor
├─ id
├─ name
├─ character graphics reference
├─ max_hp
└─ skills[] → BattleSkill

BattleSkill
├─ id
├─ name
├─ range
├─ damage
├─ timing
└─ effect
```

MVP 中基础 BattleActor 还负责提供新 Contract 的初始化 baseline：

```text
new Contract
→ integrity = BattleActor.max_hp
→ skills[] = copy(BattleActor.skills[])

Contract Integrity max
= BattleActor.max_hp
```

Contract 不重复保存 `maxIntegrity`。

## Dialogue

固定 Dialogue 是 immutable Content：

```text
Dialogue
├─ id
├─ speakerName?
├─ lines[]
│  ├─ speaker?
│  └─ text
├─ choices?[]
│  └─ target Dialogue
└─ mutation? → EventStateMutation
```

`Line.speaker` 引用持久 Character；`Dialogue.speakerName` 只是 transient / non-Character speaker 的默认显示名，不是 identity。

当前 Dialogue 的播放位置、pending choice 等不是 Content。

## Event / Event State

Event 定义合法剧情状态以及每个状态下的场景 / 交互：

```text
Event
├─ id
└─ states
   └─ [stateId]
      └─ maps
         └─ [mapId]
            └─ NPC scene directives
               ├─ characterId?
               ├─ placement / absent
               └─ interaction.dialogue?
```

这些 state definition 是 Content。

“这一局当前 Event 处在哪个 state”不属于 Content，而属于 Realm State 的 `EventStateList`。

## EventStateMutation

```text
EventStateMutation
├─ from
└─ to
```

它是 immutable Content，只声明 Event current state 怎么变化。

它不拥有 trigger，也不直接创建 Contract、Card、Battle 或修改 Relationship。

## Encounter Definition

Encounter 的作者定义属于 Content，例如：

```text
Encounter Definition
├─ encounter table
├─ spawn points
└─ templates
   ├─ npc reference
   ├─ behavior / category
   ├─ dialogue?
   └─ battleActorRef?
```

transient Encounter / Story NPC 需要 Battle 时，由其静态来源指向基础 BattleActor。

当前某次 Map Enter 实际随机出了哪些 Encounter，不属于 Content。

## Story Index

Builder 从 Character / Event 等源 Content 生成的派生索引属于 Content：

```text
Story Index
├─ by Map
├─ by Character
└─ by Event
```

它可以从源 Content 重建，因此不进入 Realm State / Save。

## 其他静态 Content

还包括：

```text
Map content
collision / transfer definitions
Battle rules / scenarios
presentation resources
UI skin / sprites / portraits
```

# Realm State：这一局的长期业务事实

Realm State 回答“这一局现在已经变成什么样”。只有需要跨当前执行过程持续存在、且不能只靠 Content 重建的业务事实才放这里。

## Player world state

当前玩家世界位置属于 Realm State：

```text
player
├─ current map
├─ position
└─ direction
```

具体最终 Record shape 后续再冻结。

## EventStateList

Event current state 的唯一 authority 是一个 Realm State Record：

```text
EventStateList
└─ entries[]
   ├─ eventId
   └─ stateId
```

规则：

```text
有 entry
→ current state = entry.stateId

无 entry
→ current state = null
```

列表不物理保存 `{ stateId: null }`。

Event definition 本身仍在 Content；State 只保存这一局当前处于哪个非空 state。

## Relationship

人物之间的有向长期关系属于 Realm State：

```text
Relationship(A → B)
├─ fromCharacterId
├─ toCharacterId
├─ affinity
├─ hostile
├─ dynamic relationship text
└─ contract?
```

`A → B` 与 `B → A` 是两份独立业务事实。

Relationship 存在不等于 Contract 已成立。可以先有 affinity / hostile / dynamic text，而 `contract` 仍为空。

## Contract

Contract 是 Relationship 内的长期状态，不建立独立 authority：

```text
Relationship(A → B)
└─ contract?
   ├─ integrity
   └─ skills[]
```

存在 `contract` 才表示正式主公 / 从者契约成立。

MVP 当前长期保存：

- `integrity`：该契约 Battle Manifestation 当前完整度；
- `skills[]`：该契约当前实际拥有的 BattleSkill ids。

创建 Contract 时，从目标 NPC Instance 找到基础 BattleActor，然后初始化：

```text
integrity = BattleActor.max_hp
skills[] = copy(BattleActor.skills[])
```

后续 Battle 结束需要长期保留的 HP 结果写回 `contract.integrity`。

MVP 不保存独立 progression / training State。

## Card

Card 是 Realm State，但只是当前随身编队事实：

```text
Card
├─ holderCharacterId
├─ servantCharacterId
└─ slot
```

Card 回答：

> 这份已经成立的 Contract 当前是否被带在身上，以及在哪个 slot。

Card 不保存：

```text
integrity
skills[]
BattleActor / BattleSkill
Character name / personality
```

MVP 不建立独立 `cardId`。

中心 UI 中的“已管理角色卡”只是对已成立 Relationship / Contract 的管理视图，不建立额外 `ManagedCard` State。

## 其他已经提交的长期业务事实

如果 Pocket / Story / 玩家选择 / 随机结果满足：

```text
已经真实发生
+
以后业务必须继续知道
+
不能由当前 Content + 其他 State 重算
```

那么它属于 Realm State。

当前只冻结这个分类原则，不在这里提前制造未出现需求的通用 StoryFact / ChoiceFact schema。

# Runtime Memory：当前执行工作集

Runtime Memory 回答“当前正在执行什么”。它不是长期业务 authority。

## Frame / Session control working set

例如：

```text
Frame stack
Activation
InputTarget
Abort / signal
current System Menu instance
current Message instance
```

这些属于 Runtime control plane，不进入 PokeMan Realm State / Save。

## NPC Instance

NPC Instance 是当前场景里的具体运行时实例：

```text
NPC Instance
├─ instanceId
├─ npcId
├─ characterId?
├─ mapId
├─ x
├─ y
├─ direction
└─ pattern?
```

它表示“这次场景里具体出现的这个 NPC”。

BattleActor 的解析规则是：

```text
persistent NPC Instance
→ characterId
→ Character.battleActorRef
→ stable base BattleActor

transient NPC Instance
→ Encounter / Story source
→ base BattleActor
```

NPC Instance 不拥有 BattleActor variant，也不保存一份长期 battle profile。

## Story Resolver 当前结果

Map Enter 时由：

```text
Story Index
+
EventStateList
+
Character defaults
+
active Event scene directives
+
Encounter runtime sources
↓
Story Resolver
↓
current NPC Instance[]
↓
NPCPlacement[]
```

这些是当前 Map 的计算结果。

因为能够由 Content + Realm State + 当前 Runtime source 重算，所以不为了读写方便复制进 Realm State。

## Dialogue 当前执行状态

例如：

```text
current dialogue id
current line index
pending choice
current Conversation interaction
LLM working context
```

这些只服务当前 Dialogue 调用。

Dialogue Frame 完成后返回的 `terminalDialogueId` 也是一次 completion result，不是 Realm State。

## Battle Runtime Actor

一场 Battle 内的权威运行状态属于 Battle Runtime：

```text
Battle Runtime Actor
├─ hp / maxHp
├─ tile / direction
├─ action state
├─ active plan / step
├─ protectedUntilTickExclusive
├─ resolved skills
└─ Decision / Simulation working state
```

Card Battle 开始时：

```text
Character stable BattleActor Content
+
Relationship.contract.integrity / skills[]
+
current Card selection
↓
Battle Runtime Actor
```

Battle 结束后，只把需要长期保留的结果写回 Realm State，例如：

```text
Battle hp
→ Relationship.contract.integrity
```

其余 Battle Runtime working state 丢弃。

## 本体 / transient actor 当前 HP

世界本体或 transient NPC 直接参战时：

```text
base BattleActor.max_hp
↓
本场 Battle hp
```

这个 HP 只表示本场战斗状态，不自动成为 Character 的长期生命条。

Battle 完成后默认丢弃，除非未来某个明确产品规则要求把特定结果提升为 Realm State。

## 当前生成的 Encounter

当前一次 Map Enter 里：

```text
生成了哪些 Encounter
选择了哪些 spawn point
当前接触 / 视野 / 战斗状态
```

先全部属于 Runtime Memory。

当前明确不预设：

```text
EncounterGeneratedState
defeatedIds[]
spawn snapshot
seed Record
```

“重新进图是否重 roll、击败后是否继续消失、是否跨 Session 保留”等首先属于 Runtime / gameplay policy。只有以后确实需要某个事实跨边界持续时，才把最小必要部分提升成 Realm State。

## Renderer / presentation working set

例如：

```text
Renderer replica
camera
animation
current visual projection
```

属于表现运行时，不是 PokeMan 业务 authority。

# 总表

| 数据 | Content | Realm State | Runtime Memory |
| --- | :---: | :---: | :---: |
| Character identity / description / fixed AI text | ✓ | | |
| Character → stable BattleActor ref | ✓ | | |
| NPC Definition / Visual | ✓ | | |
| BattleActor / BattleSkill | ✓ | | |
| Dialogue definitions | ✓ | | |
| Event / Event State definitions | ✓ | | |
| EventStateMutation | ✓ | | |
| Encounter table / template / spawn definitions | ✓ | | |
| Story Index | ✓ | | |
| Map / collision / transfer definitions | ✓ | | |
| player current map / position / direction | | ✓ | |
| EventStateList | | ✓ | |
| Relationship affinity / hostile / dynamic text | | ✓ | |
| Relationship.contract integrity / skills[] | | ✓ | |
| current carried Card / slot | | ✓ | |
| committed Pocket / Story / choice facts that truly must persist | | ✓ | |
| Frame stack / Activation / InputTarget | | | ✓ |
| current NPC Instance | | | ✓ |
| current Story Resolver result / NPCPlacement[] | | | ✓ |
| current Dialogue id / line / pending choice | | | ✓ |
| terminalDialogueId completion result | | | ✓ |
| Battle Runtime Actor / Decision / Simulation working state | | | ✓ |
| direct-body / transient actor current Battle HP | | | ✓ |
| current generated Encounter set / spawn selection | | | ✓ |
| Renderer replica / camera / animation | | | ✓ |

# Save 边界

Save 保存的是选中的 Realm State snapshot，而不是把当前运行时全部序列化。

当前明确会进入 Save 的长期事实包括：

```text
player current map / position / direction
EventStateList
Relationship[]
  └─ optional contract.integrity / skills[]
current carried Card[]
其他已经确认必须长期存在的 Pocket / Story facts
```

Save 不重复保存：

```text
Character / NPC / Visual Content
BattleActor / BattleSkill Content
Dialogue / Event / EventStateMutation definitions
Story Index
current NPC Instance
Story Resolver computed result
Dialogue current line
Battle Runtime Actor
Frame stack / Activation
Renderer replica
```

Encounter generated results 当前也不假定进入 Save；等 Runtime persistence policy 真正确认后再决定。

# 当前分类结论

进入下一步具体 schema 设计前，当前数据 authority 可以浓缩成：

```text
Content
= 规则、作者定义、静态资源、可重建索引

Realm State
= 这一局已经提交并且以后还必须知道的 mutable business facts

Runtime Memory
= 当前执行过程和可以重算的 working set
```

因此下一阶段设计 Record / key / JSON shape 时，应优先针对已经确认的 Realm State：

```text
player world state
EventStateList
Relationship / Contract
current carried Card
```

而不是把 NPC Instance、Dialogue 当前进度、Battle Runtime 或 Encounter 当前生成结果提前做成持久 State。