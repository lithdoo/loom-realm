# 世界数据模型

> 独立技术设计记录。不改写 `../DESIGN.md`。本文汇总当前已经确认的 Character、NPC、Story、Dialogue、EventStateMutation、Encounter、Relationship、Contract、Card 与 Battle 数据职责。Content 的 FSDB 物理编码以 [Content FSDB 物理模型](./66-content-fsdb.md) 为准。

相关文档：

- [数据落点](./60-data-placement.md)
- [人物](./61-character.md)
- [事件](./62-event.md)
- [固定对话](./64-dialogue.md)
- [数据模型图](./65-data-model-diagram.md)
- [Content FSDB 物理模型](./66-content-fsdb.md)

# 当前边界

1. **Character identity 与 Map 表现分离。** Character 不是 NPC；NPC Instance 也不要求对应持久 Character。
2. **PokeMan 自有 struct record identity 直接使用 FSDB key。** Character / Dialogue / Event / EventStateMutation 不再在 source value 中重复保存 `id`。
3. **Relationship 保存有向长期关系；Contract 是 Relationship 内可选长期契约状态。** Relationship 可以存在而 Contract 不存在。
4. **Card 与 Relationship / Contract 分离。** Card 只表示当前随身，不保存 Integrity / skills；MVP 不建立 `cardId`。
5. **Battle Runtime 独立。** 当前 Battle live state 只由 `@loomrealm-game/battle` Simulation authority 拥有。
6. **PokeMan 不重复定义 BattleActor / BattleSkill。** Character / Encounter / Story 只保存基础 BattleActor ContentRef。
7. **持久 Character 稳定引用一个基础 BattleActor。** 不因不同 NPC Definition / Map / Event 产生 BattleActor variant。
8. **Contract 从基础 BattleActor 初始化。** `integrity = max_hp`，`skills[] = copy(BattleActor.skills[])`，Integrity 上限也来自 `max_hp`。
9. **MVP 不定义 progression / training schema。**
10. **Event 是剧情状态 + scene / interaction definition。** 不扩成通用 Trigger / Action / Command engine。
11. **Event current state 使用一个 EventStateList Realm State Record。** 缺 entry = `null`。
12. **Character default scene 是纯 fallback。** 任一 active Event 提到 Character 后，default 全部退出解析。
13. **EventStateMutation 只拥有 Event state。** Relationship / Contract / Card / Battle 变化由对应业务 Runtime 处理。
14. **Dialogue 只保存线性 lines、末尾 choices 或 terminal mutation。**
15. **Transient Dialogue speaker 不创建 Character。** `speakerName` 只是 presentation fallback。
16. **最终 Map scene 每张图 `npcId` 唯一。** 不同 Map 可复用相同 npcId。
17. **Encounter re-entry / defeated persistence 是 Runtime policy。** 当前不预设 Encounter persistence State。
18. **live player position 属于 Map Runtime。** Realm State 只有产品明确需要时才保存 durable resume/checkpoint location。

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

其中：

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

固定目标 table 的引用只保存 key；BattleActor 这类 package namespace 尚未最终冻结的引用保存：

```json
{
  "namespace": "...",
  "key": "..."
}
```

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

`defaultScenes` 只在当前 active Event 没有提到这个 Character 时作为 fallback。

## NPC

Map package 已有窄 contract：

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
choices XOR mutation
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
                  ├─ battleActor?        # only transient Story NPC
                  └─ interaction?
                     └─ dialogue
```

`stateId / mapId / npcId` 都由 object key 表达，不在 value 中重复写 identity。

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

`null` 是 Event 空状态语义：

```text
from null → require no EventStateList entry
to null   → remove EventStateList entry
```

Mutation 不保存 trigger / action / command。

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

当前 generation 的 `weight / probability / count / seed / respawn` 尚未冻结。

## StoryIndex

```text
struct.StoryIndex/current
├─ byMap
├─ byCharacter
└─ byEvent
```

StoryIndex 是 Builder-generated read model，不是业务 authority，可由 Character / Event 等源 Content 重建。

# Realm State

## EventStateList

```text
EventStateList
[
  { eventId, stateId },
  ...
]
```

```text
entry exists → current = stateId
entry absent → current = null
```

只存非空 state。

## Relationship / Contract

```text
Relationship
├─ fromCharacterId
├─ toCharacterId
├─ affinity
├─ hostile
├─ dynamic relationship text
└─ contract?
   ├─ integrity
   └─ skills[]
```

`A → B` 与 `B → A` 独立。

Relationship 可以存在而 Contract 不存在；存在 `contract` 对象才表示正式契约成立。

Contract 不建立独立 Realm State authority。

## Card

```text
Card
├─ holderCharacterId
├─ servantCharacterId
└─ slot
```

Card 只表示当前随身。

```text
Contract exists + Card absent
→ 契约仍存在，只是当前不随身
```

Card 不保存 Integrity、skills 或静态 Battle / Character 数据。

MVP 无 `cardId`。

## Resume location

live map / position / direction 的 authority 是 Map Runtime。

如果 Save / Load 需要恢复位置，Realm State 可以保存一个 durable resume/checkpoint value；它不是第二份 live pose authority。

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
   → EventStateList commit
```

如果同一业务交互还建立 Contract，由独立 business Runtime 创建 `Relationship.contract`。

## Card Battle

```text
Card(holder=A, servant=B)
+
Relationship(A→B).contract.integrity / skills[]
+
Character B.battleActor
↓
Battle Runtime Actor
↓
Battle Simulation
↓
long-lived integrity result
→ Relationship.contract.integrity
```

# 当前真正未决的数据问题

1. Relationship / Contract Realm State 最终 physical encoding。
2. Card Realm State 最终 list/record layout 与唯一约束。
3. EventStateList Realm State 最终 namespace / key。
4. Battle package 正式 BattleActor / BattleSkill serialization namespace / key/reference encoding。
5. Encounter generation 的概率、数量、seed 等 Content 参数。
6. StoryIndex 最终为了 Resolver 查询保留哪些派生字段。

以下不再是 Content physical-schema gap：

```text
Character / Dialogue / Event / Mutation / Encounter table identity
PokeMan struct record 是否重复保存 id
Event state/map/npc identity 是否重复写 value
Event placement / absent basic JSON shape
Event / Character source 是否保存 instanceId
Persistent Character / transient Story NPC 的 base BattleActor 引用位置
Encounter record 是否重复保存 mapId
```