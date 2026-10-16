# 世界数据模型

> 独立技术设计记录。不改写 `../DESIGN.md`。本文汇总当前 Character、NPC、Story、Dialogue、Encounter、Relationship、Contract、Card 与 Battle 数据职责。Realm State 物理结构以 [67-realm-state-records.md](./67-realm-state-records.md) 为准；Content FSDB 物理结构以 [68-content-fsdb.md](./68-content-fsdb.md) 为准。

相关文档：

- [数据落点](./60-data-placement.md)
- [人物](./61-character.md)
- [事件](./62-event.md)
- [固定对话](./64-dialogue.md)
- [数据模型图](./65-data-model-diagram.md)
- [数据 Authority 清单](./66-data-authority.md)
- [Realm State Record 设计](./67-realm-state-records.md)
- [Content FSDB 物理模型](./68-content-fsdb.md)

# 当前边界

1. **Character identity 与 Map 表现分离。** Character 不是 NPC；NPC Instance 也不要求对应持久 Character。
2. **PokeMan 自有 struct record identity 直接使用 FSDB key。** Character / Dialogue / Event / EventStateMutation 不在 source value 中重复保存 `id`。
3. **Relationship 保存有向长期关系；Contract 是 Relationship 内可选长期契约状态。** Relationship 可以存在而 Contract 不存在。
4. **Card 与 Relationship / Contract 分离。** Card 只表示当前随身；MVP 不建立 `cardId`。
5. **Battle Runtime 独立。** Battle live state 只由 `@loomrealm-game/battle` Simulation authority 拥有。
6. **PokeMan 不重复定义 BattleActor / BattleSkill。** Character / Encounter / Story 只保存基础 BattleActor ContentRef；Contract `skills[]` 直接复用 battle 模块的 BattleSkill id string。
7. **持久 Character 稳定引用一个基础 BattleActor。** 不因不同 NPC Definition / Map / Event 产生 BattleActor variant。
8. **Contract 从基础 BattleActor 初始化。** `integrity = max_hp`，`skills[] = copy(BattleActor.skills[])`，Integrity 上限也来自 `max_hp`。
9. **MVP 不定义 progression / training schema。**
10. **Event 是剧情状态 + scene / interaction definition。** 不扩成通用 Trigger / Action / Command engine。
11. **Event current state 使用一个 EventStateList Realm State Record。** 缺 entry = `null`。
12. **Character default scene 是纯 fallback。** 任一 active Event 提到 Character 后，default 全部退出解析。
13. **EventStateMutation 只拥有 Event state。** Relationship / Contract / Card / Battle 变化由对应业务 Runtime 处理。
14. **Dialogue 只保存线性 lines、末尾 choices 或 terminal mutation。** choices 与 mutation 互斥，但允许两者都不存在。
15. **Transient Dialogue speaker 不创建 Character。** `speakerName` 只是 presentation fallback。
16. **最终 Map scene 每张图 `npcId` 唯一。** 不同 Map 可复用相同 npcId。
17. **Encounter re-entry / defeated persistence 是 Runtime policy。** 当前不预设 Encounter persistence State。
18. **live player position 属于 Map Runtime。** `pokeman.PlayerWorld/current` 只保存 durable resume/checkpoint location。

# FSDB Content 总体结构

```text
[FSDB]PokeMan/
├─ [struct]Character/
├─ [struct]NPC/
├─ [struct]Dialogue/
├─ [struct]Event/
├─ [struct]EventStateMutation/
├─ [struct]Encounter/
├─ [struct]StoryIndex/
└─ [resource]Graphics/
```

核心 identities：

```text
struct.Character/<characterId>
struct.NPC/<npcId>
struct.Dialogue/<dialogueId>
struct.Event/<eventId>
struct.EventStateMutation/<mutationId>
struct.Encounter/<decimal-mapId>
struct.StoryIndex/current
```

PokeMan 自有 `struct.*` source value 不重复保存 record identity。

固定目标 table 的引用只保存 key；`battleActor` 作为跨 table / package definition 使用 `{namespace,key}` ContentRef。BattleSkill identity 不另建 PokeMan reference model，直接沿用 battle 模块的 `id / skillId: string`。

# Content

## Character

```text
struct.Character/<characterId>
├─ name
├─ description?
├─ aiCharacterText?
├─ battleActor: ContentRef
└─ defaultScenes?
   └─ <mapId>
      └─ <npcId>
         ├─ placement
         └─ interaction?
            └─ dialogue
```

Character 不保存 affinity、hostile、Contract、Card、Battle HP 或 Runtime instanceId。

`defaultScenes` 只在当前 active Event 没有提到该 Character 时作为 fallback。

## NPC

```text
struct.NPC/<npcId>
├─ name
└─ sprite → resource.Graphics
```

PokeMan 不把 Character / Dialogue / BattleActor / Relationship 塞进 `struct.NPC`。

当前也不建立独立 `struct.Visual`；NPC 视觉直接通过 `sprite → resource.Graphics` 表达。

## BattleActor / BattleSkill

PokeMan 不定义第二套 Battle schema：

```text
Persistent Character
→ Character.battleActor
→ base BattleActor

Transient Encounter / Story source
→ battleActor ContentRef
→ base BattleActor
```

Battle 模块现有数据语义：

```text
BattleActor.skills[]
→ BattleSkill id string[]

Simulation / Decision
→ skillId: string
```

Contract 建立：

```text
target NPC Instance
→ base BattleActor
→ contract.integrity = BattleActor.max_hp
→ contract.skills[] = copy(BattleActor.skills[])
```

Contract 已建立后：

```text
Relationship.contract.integrity / skills[]
= 当前契约长期 Battle state

base BattleActor
= 静态 actor definition / max_hp / BattleSkill definitions source
```

## Dialogue

```text
struct.Dialogue/<dialogueId>
├─ speakerName?
├─ lines[]
│  ├─ speaker? → Character key
│  └─ text
├─ choices?[]
│  ├─ text
│  └─ target → Dialogue key
└─ mutation? → EventStateMutation key
```

固定：

```text
choices 与 mutation 互斥
允许两者都不存在
```

`speakerName` 不是 Character identity。

Dialogue.mutation 只改变 Event state，不创建 Contract / Card。

## Event

```text
struct.Event/<eventId>
└─ states
   └─ <stateId>
      └─ maps
         └─ <decimal-mapId>
            └─ npcs
               └─ <npcId>
                  ├─ character?
                  ├─ placement XOR absent:true
                  ├─ battleActor?        # transient Story NPC only
                  └─ interaction?
                     └─ dialogue
```

`stateId / mapId / npcId` 都由 object key 表达，不在 value 中重复写 identity。

`absent:true` 只在同时存在 `character` 时合法，并且不得同时出现 `placement / battleActor / interaction`。不建立 `absentCharacters[]` 等第二套 takeover 结构。

持久 Character directive：

```text
character exists
→ battleActor forbidden
→ resolve Character.battleActor
```

transient Story NPC：

```text
character absent
→ battleActor optional
```

`instanceId` 不属于 Event Content。

## EventStateMutation

```text
struct.EventStateMutation/<mutationId>
├─ from
│  └─ eventId → stateId | null
└─ to
   └─ eventId → stateId | null
```

当前物理约束：

```text
from exists, may be {}
to exists, must be non-empty
```

多个 `from` 是 AND；OR 用多条 Mutation。

Mutation 不保存 trigger / action / command。`to` 非空就是当前结构约束；不额外比较 `from/to` 来证明执行后一定发生值变化。

## Encounter

```text
struct.Encounter/<decimal-mapId>
├─ spawnPoints[]
└─ templates
   └─ <templateId>
      ├─ npc → NPC key
      ├─ engagement
      ├─ dialogue? → Dialogue key
      └─ battleActor → ContentRef
```

record key 就是 mapId，不重复保存 mapId 字段。

当前真正尚未冻结的是 author-authored generation distribution：生成数量如何表达，以及多个 template 的相对选择权重/概率采用哪种最小表示。

以下不作为当前 Content schema gap：

```text
seed
spawn selection algorithm
re-entry reroll
respawn
defeated persistence
```

## StoryIndex

```text
struct.StoryIndex/current
├─ byMap
├─ byCharacter
└─ byEvent
```

StoryIndex 是 Builder-generated read model，不是业务 authority，可由 Character / Event 等源 Content 重建。精确派生字段可以跟随 Resolver 查询实现调整，不视为 MVP 核心业务数据缺口。

# Realm State

## durable PlayerWorld checkpoint

```text
pokeman.PlayerWorld / current
→ { mapId, x, y, direction }
```

`mapId` 是正 safe integer。

这条 Record 只表示 durable resume/checkpoint location；当前 live map / position / direction / motion 由 Map Runtime authority 拥有。

## EventStateList

```text
pokeman.EventStateList / current
→ [{ eventId, stateId }]
```

```text
entry exists → current = stateId
entry absent → current = null
```

列表只保存非空 state。

## Relationship / Contract

```text
pokeman.Relationship / <from>:<to>
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

会进入 Relationship / CarriedCards key 的 Character business id 使用 `[a-z0-9][a-z0-9._-]{0,119}`；`:` 作为 Relationship 复合 key 分隔符，因此 `A:B` 无歧义且最长 241 bytes。

`A → B` 与 `B → A` 独立。

Relationship Record 可以存在而 `contract` 缺失。存在 `contract` 才表示正式契约成立。

## CarriedCards

```text
pokeman.CarriedCards / <holder>
→ [{ slot, servantCharacterId }]
```

固定：同一 holder 内 slot 唯一、servant 唯一、按 slot 升序；Card 不保存 Integrity / skills / static Battle data。

```text
CarriedCards(A) contains B
→ Relationship(A → B).contract exists
```

# Runtime Memory

## Story / Map

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
↓
Map NPCPlacement[]
```

最终每张 Map 要求 `npcId` 唯一。

Map Runtime live authority：

```text
current mapId
player x / y
direction
motion
scene
```

## Dialogue

```text
current dialogue id
current line index
pending choice
terminalDialogueId completion result
```

这些不进入 Realm State。

## Battle

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

Battle Runtime 完成后，只有真正需要长期持续的 Contract Integrity 等结果写回 Realm State。

## Encounter

当前 generated Encounter set / spawn assignment / transient body state 默认是 Runtime Memory。

是否 re-enter reroll、击败后是否保持消失、何时清空，是 Runtime/gameplay policy，不是当前 State schema gap。

# 关键流程

## Map Enter

```text
StoryIndex
+ EventStateList
↓
active Event states
↓
mentioned Characters
├─ mentioned   → Event sources only
└─ unmentioned → Character.defaultScenes
↓
merge transient Story / Encounter sources
↓
validate final npcId uniqueness
↓
Runtime NPC Instances
↓
NPCPlacement[]
```

## Fixed Dialogue

```text
struct.Dialogue
↓
PokeMan Dialogue Subsystem
├─ speaker resolution
├─ Choice target traversal
└─ terminal mutation?
   → struct.EventStateMutation
   → pokeman.EventStateList/current commit
```

如果同一业务交互还建立 Contract，由独立 business Runtime 创建 `Relationship.contract`。

## Card Battle

```text
pokeman.CarriedCards / A
→ servant B
+
pokeman.Relationship / A:B
→ contract.integrity / skills[]
+
struct.Character / B
→ base BattleActor
↓
Battle Runtime Actor
↓
Battle Simulation
↓
long-lived integrity result
→ Relationship.contract.integrity
```

# 当前真正未决的数据问题

经过一致性复核，目前真正还需要继续设计的核心数据问题只有：

1. **Encounter authored generation 数据**：生成数量与 template 相对选择分布的最小表示。
2. **Realm State Record-level absence 语义**：`PlayerWorld/current`、`EventStateList/current`、`CarriedCards/<holder>` 从未 materialize 时的 PokeMan 业务解释。

其余以下事项不再当作 MVP 核心 data gap：

```text
BattleSkill identity / Contract.skills[] encoding
Dialogue choices XOR mutation
Event absent 的第二套结构
EventStateMutation semantic no-op proof
StoryIndex 最终派生字段
本地化 / richer presentation metadata
Encounter seed / respawn / persistence
FSDB .info.meta 文件编写本身
```

`.info.meta` / exact schema 文件仍要在实现阶段写出来，但那是把已冻结 shape 落成可执行 schema 的工作，不代表需要再发明一套业务数据模型。