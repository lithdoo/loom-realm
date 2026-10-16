# 世界数据模型

> 独立技术设计记录。不改写 `../DESIGN.md`。本文汇总当前已经确认的 Character、NPC、Visual、Story、Dialogue、EventStateMutation、Encounter、Relationship、Contract、Card 与 Battle 数据职责。精确 Content namespace/key 与部分 Realm State key 仍可继续细化。

归宿总表见 [数据落点](./60-data-placement.md)，人物细节见 [人物](./61-character.md)，Event 见 [事件](./62-event.md)，固定 Dialogue 见 [固定对话](./64-dialogue.md)，总览图见 [数据模型图](./65-data-model-diagram.md)。

## 目标

当前模型坚持几个边界：

1. **Character identity 与 Map 表现分离。** Character 不是 NPC，NPC Instance 也不要求一定对应持久 Character。
2. **Relationship 保存有向长期关系；Contract 是 Relationship 内的可选长期契约状态。** MVP Contract 只保存 `integrity + skills[]`。
3. **Card 与 Relationship / Contract 分离。** Card 只表示当前随身，以及 holder / servant / slot；不保存 Integrity 或技能集；MVP 不建立独立 `cardId`。
4. **Battle Runtime 独立。** Battle 当前运行状态只由 `@loomrealm-game/battle` Simulation authority 拥有。
5. **PokeMan 不重复定义 BattleActor / BattleSkill。** 静态战斗定义直接复用 `@loomrealm-game/battle` 当前 Content contract。
6. **Contract 默认值来自目标 NPC Instance 的 resolved battle data。** Character / BattleActor / Encounter / Story 等是解析来源；Contract 创建时 snapshot `integrity / skills[]`，创建后不随 NPC Instance 自动同步。
7. **MVP 不定义 progression / training schema。** 技能学习、等级、训练树等以后有真实玩法再扩展 Contract。
8. **Event 保持为剧情状态与场景 / 交互定义。** 不扩成通用 Trigger / Action / Command / Flow engine。
9. **Event current state 使用一个 EventStateList Realm State Record。** 列表只保存非空 state；没有 entry 等价于 `null`。
10. **Character default scene 是纯 fallback。** 只要任一 active Event State 提到某个 Character，该 Character 的所有 default scene instances 都退出解析。
11. **Event state 的声明式变化独立为 EventStateMutation Content。** `from` 是 AND 前置集合，`to` 是赋值集合；OR 用多条 Mutation 表达。
12. **Content 只定义，Runtime 执行。** 固定 Dialogue 根据 `Dialogue.mutation` 执行 Mutation；其他业务通过 `session-event` 表达事实，由 session-level 业务运行时决定是否以及执行哪个 Mutation。
13. **Transient Dialogue speaker 不创建 Character。** Dialogue 可以提供默认 `speakerName`；它只是 presentation fallback，不是 identity。
14. **Dialogue 保持为线性台词与末尾 Choice。** Choice 只跳到下一个 Dialogue；无 Choice Dialogue 可以引用一个 EventStateMutation。
15. **最终 Map 场景按 `npcId` 去重。** 同一 `npcId` 可以出现在不同 Map，但同一张 Map 的最终解析结果中只能出现一次。
16. **Encounter re-entry / persistence 属于 Runtime/gameplay policy。** 当前数据模型不预设 Encounter persistence Realm State shape。

## 总体关系

```text
Character / Encounter / Story Content
      │
      ├────────────→ BattleActor Content
      │                 ├─ max_hp
      │                 └─ skills[] → BattleSkill Content
      │
      └────────────→ PokeMan NPC Instance
                        └─ resolved battle data
                           ├─ resolved actor / max values
                           └─ resolved skills[]
                                  │
                                  └─ contract creation snapshot
                                     ↓
Relationship A → B
├─ affinity / hostile / dynamic text
└─ contract?
   ├─ integrity
   └─ skills[]

Character Content
├─ default scene instances
│  └─ only when no active Event mentions Character
└─ current carried Card projection
   └─ holder / servant / slot

Dialogue Content
→ Line.speaker? = persistent Character identity
→ Dialogue.speakerName? = default display name for non-Character speaker

Realm State EventStateList
→ active Event State
→ collect Character scene directives
→ mentioned Character: Event sources only
→ unmentioned Character: use defaults
→ merge transient NPC / Encounter sources
→ validate final (mapId,npcId) uniqueness

Current Card
+
Relationship(holder → servant).contract.integrity / skills[]
+
Character servant → BattleActor Content
↓
@loomrealm-game/battle Runtime Actor
↓
Battle Simulation

Non-Dialogue business fact
→ session-event
→ PokeMan session-level business runtime
→ decide whether / which EventStateMutation
→ update EventStateList
```

# Content

## Character

Character 是持久人物 identity。

```text
CharacterDefinition
├─ id
├─ name
├─ description
├─ fixed AI character text
├─ tags
├─ default scene instances
├─ battle actor reference
└─ presentation references
```

Character 不保存当前 affinity、hostile、Contract、Integrity 或 Battle Runtime hp。所有持久 Character 都准备好 Card / Battle 所需静态素材，但这不等于 `canContract`。

`default scene instances` 只在当前所有 active Event State 都没有提到这个 Character 时作为 fallback 使用。

## BattleActor / BattleSkill

PokeMan 不定义平行的 Battle Profile / Skill schema。静态战斗数据直接使用 `@loomrealm-game/battle`：

```text
BattleActor Content
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
├─ timing.windup_ticks
├─ timing.recovery_ticks
└─ effect
```

BattleActor 是 NPC Instance battle data 的静态来源之一。MVP 的直接 ownership 是：

```text
本体 / transient Battle actor
→ 使用 NPC Instance 当前 resolved battle data

新 Contract 建立
→ snapshot 目标 NPC Instance resolved battle data
→ Relationship.contract.integrity / skills[]

Contract 已建立后的 Card Battle
→ 使用 Relationship.contract.integrity / skills[]
```

因此 MVP 不存在另一层 `learnedSkillIds`、base/learned merge、技能树或 progression State。

## Visual / NPC Definition

Visual 是可复用视觉定义；NPC Definition 是地图表现模板，不是 Character identity。

当前 Map NPC Content contract：

```text
[struct]NPC/<npcId>
├─ name
└─ sprite
```

```text
npcId != characterId
```

最终地图结果要求：

```text
(mapId, npcId) 唯一
```

## Dialogue

固定 Dialogue 是 immutable Content：

```text
Dialogue
├─ id
├─ speakerName?        // 默认显示名；不是 Character identity
├─ lines[]
│  ├─ speaker?         // 持久 Character identity
│  └─ text
├─ choices?[]
│  ├─ text
│  └─ target Dialogue
└─ mutation? → EventStateMutation
```

Speaker 解析规则：

```text
Line.speaker 存在
→ 按持久 Character identity 解析显示

Line.speaker 不存在 + Dialogue.speakerName 存在
→ 使用默认 speakerName
→ 不产生 Character identity

两者都没有
→ 旁白
```

`speakerName` 只是 presentation data，不能参与 Relationship / Contract / Event Character takeover / Battle actor identity。

`choices` 与 `mutation` 互斥。Choice 只负责跳到另一个 Dialogue；需要改变 Event state 的分支先跳到新的无 Choice Dialogue，再由目标 Dialogue 的 `mutation` 触发 Mutation。

## Event / Story

Event 是 immutable Content：

```text
EventDefinition
├─ id
└─ states
   └─ [stateId]
      └─ maps
         └─ [mapId]
            └─ npcs
               └─ [npcId]
                  ├─ characterId?
                  ├─ placement / absent
                  └─ interaction?
                     └─ dialogue
```

`Event State NPC` 表示当前阶段对 NPC / Character 的 scene directive。只要 active Event State 中存在 `characterId = X` 的 directive，就表示这个 Event 当前提到了 Character X。

# Realm State

## EventStateList

所有 Event current state 使用**一个 Realm State Record**：

```text
EventStateList
[
  { eventId: "professor-intro", stateId: "waiting" },
  { eventId: "home-intro", stateId: "active" }
]
```

```text
有 entry
→ current state = entry.stateId

无 entry
→ current state = null
```

列表只保存非空 `stateId`。`null → stateId` 是新增 entry；`stateA → stateB` 是修改 entry；`stateId → null` 是删除 entry。

## Relationship / Contract

Relationship 是有方向的长期业务状态：

```text
Relationship
├─ fromCharacterId
├─ toCharacterId
├─ affinity
├─ hostile
├─ dynamic relationship text
└─ contract?
   ├─ integrity
   └─ skills[] → BattleSkill ids
```

`A → B` 与 `B → A` 是独立 Relationship。

存在 `contract` 对象表示 A 以主公身份与 B 建立正式契约；Contract 不建立独立 Realm State object。

MVP Contract 只保存：

- `integrity`：这份契约的 Battle Manifestation 长期完整度；
- `skills[]`：这份契约当前实际拥有的 BattleSkill ids。

建立 Contract 时，从**交互目标 NPC Instance 当前 resolved battle data**初始化 `contract.integrity / skills[]`。这里的 resolved battle data 可以由 Character/BattleActor、Encounter、Story 等来源共同解析，但 Contract 不直接绑定这些静态 source。

Contract 创建是 snapshot：创建以后 NPC Instance 的变化不会自动同步到已有 Contract。NPC 本体某场 Battle 的当前 HP 也不直接等于 Contract Integrity。

同一个 Character 被不同主公契约时，各自 Contract 的 Integrity 与技能集相互独立。

MVP 不定义 `progression / training` 字段；未来成长玩法再扩展 Contract。

## Card

Card 是独立 Realm State 对象，但只表示当前随身：

```text
Card
├─ holderCharacterId
├─ servantCharacterId
└─ slot
```

```text
Relationship(A → B).contract exists
→ 契约长期存在

Card(A, B) exists
→ 当前随身

Card(A, B) absent
→ 当前不随身
→ Relationship / Contract 不受影响
```

Card 不保存 Integrity、技能集或 BattleActor / BattleSkill 数据。

**MVP 不建立独立 Card identity / `cardId`。** Card 只是 holder / servant / slot 组成的当前随身事实。最终采用列表 Record 还是其他物理布局、以及必要唯一约束，仍可在 Realm State schema 收口时决定。

## 其他 Realm State

```text
Realm State
├─ player current map / position / direction
├─ EventStateList Record
├─ Relationship[]
│  └─ optional Contract integrity / skills[]
├─ current carried Card[]
├─ Pocket / story committed facts
└─ player choices / random facts that cannot be recomputed
```

当前不预设 Encounter generated state。Encounter re-entry / persistence 行为没有冻结以前，不为它提前设计 Realm State 物理结构。

# EventStateMutation

EventStateMutation 是独立 Content，不声明自己的 trigger：

```text
EventStateMutation
├─ from
│  └─ eventId → stateId | null
└─ to
   └─ eventId → stateId | null
```

同一条 Mutation 的多个 `from` 全部是 AND；需要 OR 时定义多条 Mutation。Mutation 只改变 Event current state，不扩展到 Relationship / Contract / Card / Battle 等其他 State。

执行时读取 `EventStateList + version`、校验全部 `from`、生成新列表，再一次 `state.commit()` 替换整个 EventStateList。

# Dialogue 与非 Dialogue Mutation 路径

固定 Dialogue：

```text
Dialogue Content.mutation
→ PokeMan Dialogue Subsystem
→ validate from
→ replace EventStateList
```

非 Dialogue 业务：

```text
Battle / World / Encounter Runtime
→ session-event：发生了什么
→ PokeMan session-level 业务运行时
→ 判断这件事对剧情意味着什么
→ 如需要，选择 EventStateMutation
→ 更新 EventStateList
```

Battle / Map / Encounter Content 不为了剧情推进增加 `mutationRef`；`session-event` 也不需要携带 Mutation identity。

# Character scene fallback / Event takeover

```text
当前没有任何 active Event State 提到 Character X
→ 使用 Character X 的 default scene instances

当前至少一个 active Event State 提到 Character X
→ Character X 的所有 default scene instances 全部退出解析
→ X 当前 scene 完全由相关 Event sources 决定
```

`absent` 表示这个 Event 当前提到了 Character X，但本 Event 不为 X 提供 placement。它不压制另一个 Event 的明确 placement，也不建立 Event priority。

多个 Event placement 合并后继续检查最终 `(mapId,npcId)` 唯一；不做隐式 last-wins。

# Encounter

Visible Encounter Content 至少表达：

```text
EncounterDefinition
├─ map encounter table
├─ spawn points
└─ encounter templates
   ├─ npc definition reference
   ├─ type / behavior category
   ├─ optional dialogue reference
   └─ optional BattleActor reference
```

Encounter 可以生成 transient NPC Instance，也可以提供临时 Battle 输入；不要求为临时敌人建立 Character Relationship 或 Card。

Transient Encounter NPC 使用固定 Dialogue 时，如果只需要一个通用说话者显示名，直接由该 Dialogue 的 `speakerName` 提供。

Encounter re-entry / persistence（重新 roll、击败结果是否保留、生成结果何时清理、是否跨 Session）属于 Runtime / gameplay behavior policy。当前数据模型不假定存在 `EncounterGeneratedState`、seed record、generated instance snapshot 或 defeated-id list。

# Runtime / Projection

## NPC Instance

PokeMan World-side NPC Instance 是业务运行时实例，可以比 Map `NPCPlacement` 丰富：

```text
NPCInstance
├─ instanceId
├─ npcId
├─ characterId?
├─ mapId
├─ x
├─ y
├─ direction
├─ pattern?
└─ resolved battle data
   ├─ resolved actor / max values
   └─ resolved skills[]
```

这里 `resolved battle data` 表示职责，不冻结最终 JSON 必须采用嵌套字段。它可以由 Character/BattleActor、Encounter、Story 等来源解析。

`instanceId` 满足 Map 实例 contract；PokeMan 额外要求每个最终 `mapId` 内 `npcId` 唯一。

Map Enter：

```text
Story Index
+
EventStateList
+
Character / Event Content
+
Encounter Runtime sources
↓
读取相关 active Event State
↓
收集 active Event 明确提到的 Character 集合
↓
未被 Event 提到的 Character → default scene instances
被 Event 提到的 Character   → Event scene directives only
↓
合并 transient NPC / Encounter sources
↓
校验当前 Map npcId 唯一
↓
PokeMan NPC Instance[]
↓
NPCPlacement[]
```

## Battle Runtime Actor

Card Battle：

```text
Card(holder=A, servant=B)
+
Relationship(A → B).contract.integrity / skills[]
+
Character B → BattleActor Content
↓
Battle Runtime Actor
```

Card Battle Manifestation 的初始 HP 来自 `contract.integrity`，当前可用技能来自 `contract.skills[]`；Battle 结束后长期 Integrity 写回同一 Contract。

没有 Contract 的本体 / transient actor：

```text
NPC Instance resolved battle data
↓
Battle Runtime Actor
```

因此：

```text
NPC Instance != Character != Relationship != Contract != Card != Battle Runtime Actor
```

# Builder / Runtime 检查边界

Builder 应检查：

- Character / NPC / Visual / Event / EventStateMutation / Map / Dialogue / BattleActor / BattleSkill 等静态引用不存在；
- Event/state / Dialogue identity 重复；
- 安装初始化 EventStateList 重复 `eventId` 或引用不存在的 Event/state；
- Dialogue Choice target / Character speaker / Mutation ref 不存在；
- 同一个 Dialogue 同时存在 `choices` 与 `mutation`；
- Mutation 非空 state 引用不存在；
- Character / Encounter / Story battle source 引用不合法；
- BattleActor / BattleSkill 引用不合法；
- 可静态判断的 NPC Instance battle source / resolved skill 引用不合法；
- 初始化 Contract 的 `skills[]` 引用了不存在的 BattleSkill；
- 同一个 Event state 内重复 `(mapId,npcId)`；
- placement 非法；
- Story Index 与源 Content 不一致。

Builder 不应因为跨 Event 重复引用同一个 NPC / Character、合法 Dialogue cycle、多个主公分别 Contract 同一 Character、transient NPC 复用 `speakerName` Dialogue 而失败。

Runtime 保证：

- EventStateList 是 Event current state authority；
- Character default fallback / Event takeover 按已确认规则解析；
- `Dialogue.speakerName` 只是显示 fallback；
- Content 不执行 Mutation；
- 固定 Dialogue 和 session-event 两条 Mutation 触发路径保持分离；
- Contract 创建时从目标 NPC Instance resolved battle data 生成 snapshot；
- 已有 Contract 不随 NPC Instance 后续变化自动同步；
- Card Battle 使用 `Relationship.contract.integrity / skills[]`；
- 没有 Contract 的本体 / transient actor 使用 NPC Instance resolved battle data；
- 合并当前 NPC 来源后，每张最终 Map 内 `npcId` 唯一。

# 当前继续设计的数据问题

当前真正还需要继续冻结的数据问题：

- Character / NPC / Visual 的精确 Content schema / namespace；
- **NPC Instance battle source / resolved battle data 的最终引用与 schema**，包括 Character / Encounter / Story 如何解析到 BattleActor，以及 Contract 初始化所需默认字段如何表达；
- Character 到 BattleActor Content 的最终引用编码；
- Event / EventStateMutation 的最终 Content namespace / key；
- EventStateList Realm State Record 的最终 namespace / key 名字；
- Event placement / `instanceId` / `absent` 的最终 JSON shape；
- Relationship / Contract 的最终 Realm State key / JSON shape；
- Card 的最终 Realm State 物理布局与必要唯一约束；**不再设计独立 Card identity / `cardId`**。

以下不再作为 MVP 数据模型缺口：

```text
Relationship progression / training shape
技能学习 / base+learned merge
transient Encounter speaker identity
非 Dialogue Content mutationRef
Card identity / cardId
Contract 默认值来自哪里
Encounter re-entry / persistence
Mutation failure UI / retry policy
```

其中 Encounter re-entry / persistence 与 Mutation failure policy 属于 Runtime / gameplay execution 设计；不是当前数据物理结构问题。