# 世界数据模型

> 独立技术设计记录。不改写 `../DESIGN.md`。本文汇总当前已经确认的 Character、NPC、Visual、Story、Dialogue、EventStateMutation、Encounter、Relationship、Card 与 Battle 数据职责。精确 Content namespace/key 与部分 Realm State key 仍可继续细化。

归宿总表见 [数据落点](./60-data-placement.md)，人物细节见 [人物](./61-character.md)，Event 见 [事件](./62-event.md)，固定 Dialogue 见 [固定对话](./64-dialogue.md)，总览图见 [数据模型图](./65-data-model-diagram.md)。

## 目标

当前模型坚持几个边界：

1. **Character identity 与 Map 表现分离。** Character 不是 NPC，NPC Instance 也不要求一定对应持久 Character。
2. **Relationship 保存有向长期关系、契约和契约级长期状态。** affinity / hostile / contract / integrity / progression 都属于 Relationship。
3. **Card 与 Relationship 分离。** Card 只表示当前随身，以及 holder / servant / slot；不保存 Integrity / Progression。
4. **Battle Runtime 独立。** Battle 当前运行状态只由 `@loomrealm-game/battle` Simulation authority 拥有。
5. **PokeMan 不重复定义 BattleActor / BattleSkill。** 战斗静态数据直接复用 `@loomrealm-game/battle` 当前 Content contract。
6. **Event 保持为剧情状态与场景 / 交互定义。** 不扩成通用 Trigger / Action / Command / Flow engine。
7. **Event current state 使用一个 EventStateList Realm State Record。** 列表只保存非空 state；没有 entry 等价于 `null`。
8. **Character default scene 是纯 fallback。** 只要任一 active Event State 提到某个 Character，该 Character 的所有 default scene instances 都退出解析，当前 scene 完全由 Event sources 决定。
9. **Event state 的声明式变化独立为 EventStateMutation Content。** `from` 是 AND 前置集合，`to` 是赋值集合；OR 用多条 Mutation 表达。
10. **Content 只定义，Runtime 执行。** PokeMan Dialogue Subsystem 可以根据 `Dialogue.mutation` 执行 Mutation；非 Dialogue 业务通过 `session-event` 表达业务事实，由 PokeMan session-level 业务运行时决定是否以及执行哪个 Mutation。
11. **Transient Dialogue speaker 不创建 Character。** Dialogue 可以提供默认 `speakerName`；它只是 presentation fallback，不是 identity。
12. **Dialogue 保持为线性台词与末尾 Choice。** Choice 只跳到下一个 Dialogue；无 Choice Dialogue 可以引用一个 EventStateMutation。
13. **`choices` 与 `mutation` 互斥。** 需要状态变化的 Choice 必须先跳到新的无 Choice Dialogue，再由新 Dialogue 触发 Mutation。
14. **最终 Map 场景按 `npcId` 去重。** 同一 `npcId` 可以出现在不同 Map，但同一张 Map 的最终解析结果中只能出现一次。

## 总体关系

```text
Character Content
      │
      ├────────────→ BattleActor Content
      │                 └─ skills[] → BattleSkill Content
      │
      ├────────────→ Relationship A → B
      │                 ├─ affinity / hostile / contract
      │                 └─ integrity / progression
      │
      ├────────────→ default scene instances
      │                 └─ only when no active Event mentions Character
      │
      └────────────→ current carried Card
                        holder / servant / slot

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
Relationship(holder → servant).integrity / progression
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

Character 不保存当前 affinity、hostile、contract、Integrity 或 Battle Runtime hp。所有持久 Character 都准备好 Card / Battle 所需静态素材，但这不等于 `canContract`。

`default scene instances` 只在当前所有 active Event State 都没有提到这个 Character 时作为 fallback 使用；它不是与 Event placement 并列竞争的 scene source。

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

Battle v0 没有定义的 `attack / defense / speed / MP / accuracy / critical / element / universal cooldown / Buff / Debuff` 等概念，不在 PokeMan 文档中提前声明。

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

Line.speaker 不存在
+ Dialogue.speakerName 存在
→ 使用默认 speakerName
→ 不产生 Character identity

Line.speaker 不存在
+ Dialogue.speakerName 不存在
→ 旁白
```

因此随机生成的 transient Encounter NPC 不需要创建一个“通用 Character”。多个不同 transient NPC Instance 可以复用同一个带 `speakerName` 的 Dialogue，而不会被解释成同一个人。

`speakerName` 只是 presentation data：

```text
speakerName
!= characterId
!= npcId
!= instanceId
```

它不能参与 Relationship / Contract / Event Character takeover / Battle actor identity 等业务关联。

约束：

```text
choices 存在 => mutation 不允许存在
mutation 存在 => choices 不允许存在
```

Choice 只负责跳到另一个 Dialogue。

如果某个分支需要改变 Event state：

```text
Dialogue A
→ Choice
   ├─ target Dialogue B
   │    └─ mutation → Mutation B
   └─ target Dialogue C
        └─ no mutation
```

Dialogue Content 不执行 Mutation。PokeMan Dialogue Subsystem 是 Runtime executor；`@loomrealm-game/rpg-dialogue` 只是底层 Conversation interaction / presentation library。

没有 `choices` 的 Dialogue 播放完成，并在需要时由 Dialogue Subsystem 成功应用 `mutation` 后，是 terminal Dialogue。Dialogue Frame 正常完成仍可返回：

```text
terminalDialogueId
```

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

职责：

```text
Event State
= 某个合法剧情阶段的 Content

Event State NPC
= 当前阶段对 NPC / Character 的 scene directive

Dialogue
= 台词、默认 speakerName、Choice 跳转，以及无 Choice 完成时可选的 Mutation ref
```

Event State NPC 不维护 `terminalDialogueId → Mutation` 映射。

对持久 Character，Event State 中只要有 `characterId = X` 的 scene directive，就表示当前 active Event 已经提到 Character X。只有 `npcId`、没有 `characterId` 的 transient / 非 Character NPC source 不参与 Character default fallback 判定。

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

业务读取：

```text
有 entry
→ current state = entry.stateId

无 entry
→ current state = null
→ Event 当前未启动 / 空状态
```

列表约束：

- `eventId` 唯一；
- 只保存非空 `stateId`；
- `stateId` 必须属于对应 Event；
- `null` 不作为列表项存储。

安装初始化 Realm State baseline 直接安装 EventStateList，只列出开局已启动的 Event。

Event lifecycle 不单独建 API：

```text
null → stateId
= 新增 entry / 启动 Event

stateA → stateB
= 修改 entry / 推进 Event

stateId → null
= 删除 entry / 清空 Event
```

EventStateList Realm State Record 的最终 namespace / key 名字仍待 schema 冻结，但“一个列表 Record”已经确认。

## Relationship

Relationship 是有方向的长期业务状态：

```text
Relationship
├─ fromCharacterId
├─ toCharacterId
├─ affinity
├─ hostile
├─ dynamic relationship text
├─ contract?
├─ integrity?
└─ progression / training?
```

`A → B` 与 `B → A` 是独立 Relationship。

`contract` 表示 A 以主公身份与 B 建立正式契约。Integrity、训练 / Progression 也属于这份有向契约的长期状态，所以即使当前 Card 不存在，它们仍然存在。

同一个 Character 被不同主公契约时，各自 Relationship 的 affinity、Integrity、Progression 相互独立。

Contract 不建立独立 Realm State object。

## Card

Card 是独立 Realm State 对象，但只表示当前随身：

```text
Card
├─ holderCharacterId
├─ servantCharacterId
└─ slot
```

语义：

```text
Relationship(A → B).contract = true
→ 契约长期存在

Card(A, B) exists
→ 当前随身

Card(A, B) absent
→ 当前不随身
→ Relationship / integrity / progression 不受影响
```

Card 不保存 Integrity、Progression 或 BattleActor / BattleSkill 数据。

Card 的独立 `cardId` 是否需要存在尚未冻结。

## 其他 Realm State

```text
Realm State
├─ player current map / position / direction
├─ EventStateList Record
├─ Relationship[]
├─ current carried Card[]
├─ Encounter generated results that must persist
├─ Pocket / story committed facts
└─ player choices / random facts that cannot be recomputed
```

Event、Dialogue 与 EventStateMutation definitions 都是 Content；Save 只保存实际 mutable facts。

# EventStateMutation

EventStateMutation 是独立 Content，不嵌在某个 Event 内成为专属 transition，也不声明自己的 trigger。

```text
EventStateMutation
├─ from
│  └─ eventId → stateId | null
└─ to
   └─ eventId → stateId | null
```

## `from`：AND

一条 Mutation 的所有 `from` 项必须全部满足。`null` 表示 EventStateList 当前没有该 `eventId` entry：

```text
eventA == stateA
AND
eventB == null
```

Mutation 不拥有 `or / anyOf / condition tree`。需要 OR 时，为每个分支定义独立 Mutation，由具体业务路径选择对应 Mutation。

## `from` / `to` 不一一对应

```text
只在 from
= 前置条件

同时在 from / to
= 检查旧 state 后修改 / 删除 entry

只在 to
= 直接新增 / 修改 / 删除 entry
```

例如：

```yaml
from:
  professor-intro: waiting
  rival-story: null

to:
  professor-intro: contracted
  rival-story: contracted
  tutorial-battle: ready
```

清空 Event：

```yaml
from:
  tutorial-battle: completed

to:
  tutorial-battle: null
  town-route: open
```

## 原子 commit

对应 PokeMan Runtime 执行 Mutation 时：

```text
read EventStateList + version
↓
校验全部 from
↓
生成新 EventStateList
  to = stateId → upsert entry
  to = null    → delete entry
↓
state.commit()
  condition = EventStateList version
  write     = 新 EventStateList
```

全部 Event 变化通过一个 Record replacement 原子提交。

Mutation 只拥有 Event current state，不扩展到 Relationship / Contract / Card / Battle / player position / arbitrary Realm State path/value。

# Dialogue → EventStateMutation

固定 NPC Dialogue 的运行链：

```text
玩家与 NPC 交互
↓
World 根据 EventStateList 找到当前 Event state / mapId / npcId
↓
interaction.dialogue
↓
frame.call(PokeMan Dialogue Subsystem)
↓
Dialogue Subsystem 读取 Dialogue Content
↓
按 Line.speaker / Dialogue.speakerName 解析当前说话者显示
↓
使用 @loomrealm-game/rpg-dialogue 展示当前 Conversation
↓
有 choices？
├─ 是 → 选择 target Dialogue，继续 Dialogue graph
└─ 否 → 有 mutation？
         ├─ 否 → complete
         └─ 是 → Dialogue Subsystem 读取 EventStateMutation
                  ↓
                scope.state.read(EventStateList)
                  ↓
                validate from
                  ↓
                生成新 EventStateList
                  ↓
                scope.state.commit()
                  ↓
                complete
↓
返回 terminalDialogueId
```

固定 Dialogue 的 `mutation` reference 是 Dialogue Content 自己的一部分；Dialogue Subsystem 根据这条明确引用执行 Mutation。

# 非 Dialogue 业务 → session-event → EventStateMutation

Battle、World、Encounter 等非 Dialogue 业务不需要为了剧情推进在自己的 Content 中增加 `mutationRef`。

这些业务先在 Runtime 通过 `session-event` 表达已经发生的业务事实，例如概念上的：

```text
BattleCompleted
MapEntered / DestinationReached
EncounterCompleted
```

PokeMan 的 session-level 业务运行时捕获相关事件，根据事件 payload、当前业务上下文和 EventStateList 判断这件事是否应该推进剧情，并在需要时选择对应 EventStateMutation 执行：

```text
业务 Subsystem
→ session-event：发生了什么
→ PokeMan session-level 业务运行时
→ 判断这件事对剧情意味着什么
→ 如需要，选择 EventStateMutation
→ 更新 EventStateList
```

因此职责是：

```text
session-event
= 发生了什么

PokeMan session-level 业务运行时
= 这件事对剧情意味着什么

EventStateMutation
= Event state 怎么改
```

`session-event` 不需要携带 EventStateMutation identity，Mutation 也不拥有 trigger。Runtime 不扫描全部 Mutation 自动执行。

# Character scene fallback / Event takeover

Character default scene 与 Event scene 的关系已经固定：

```text
当前没有任何 active Event State 提到 Character X
→ 使用 Character X 的 default scene instances

当前至少一个 active Event State 提到 Character X
→ Character X 的所有 default scene instances 全部退出解析
→ X 当前 scene 完全由相关 Event sources 决定
```

“提到 Character”指 active Event State 中存在明确 `characterId = X` 的 scene directive。

`absent` 是一种 Event scene directive，但不拥有跨 Event 的压制优先级。它只表示：

```text
这个 Event 当前提到了 Character X
但这个 Event 不为 X 提供 placement
```

因此：

```text
Event A → X absent
Event B → X placement at town

→ default 关闭
→ A 不贡献 placement
→ B 贡献 town placement
→ 最终使用 town placement
```

如果所有提到 X 的 active Event 都没有提供 placement，则 X 当前不出现。

多个 Event placement 可以合并；最终继续检查 `(mapId,npcId)` 唯一。不同 Map 上使用同一 `npcId` 允许，同一 Map 最终重复同一 `npcId` 则 deterministic conflict，不做隐式 last-wins。

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

Transient Encounter NPC 使用固定 Dialogue 时，如果只需要一个通用说话者显示名，直接由该 Dialogue 的 `speakerName` 提供，例如 `speakerName: 路霸`。这不会给 NPC 建立 Character identity。

# Runtime / Projection

## NPC Instance

```text
NPCInstance
├─ instanceId
├─ npcId
├─ characterId?
├─ mapId
├─ x
├─ y
├─ direction
└─ pattern?
```

`instanceId` 满足 Map 实例 contract；PokeMan 额外要求每个最终 `mapId` 内 `npcId` 唯一。

Map Enter：

```text
Story Index
+
EventStateList
+
Character / Event Content
+
Encounter generated state
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
NPCPlacement[]
↓
@loomrealm-game/map
```

## Battle Runtime Actor

PokeMan 不定义平行 Runtime BattleActor schema；本场 actor state 直接以 `@loomrealm-game/battle` Simulation contract 为准。

```text
Card(holder=A, servant=B)
+
Relationship(A → B).integrity / progression
+
Character B → BattleActor Content
↓
Battle Runtime Actor
```

Card Battle Manifestation 的初始 HP 来自 Relationship.integrity；Battle 结束后长期 Integrity 写回同一 Relationship。

临时敌人不需要 contract / Card。Battle 结束以后 Runtime actor 丢弃，游戏业务只提交明确需要长期存在的后果。

因此：

```text
NPC Instance != Character != Relationship != Card != Battle Runtime Actor
```

## Dialogue Runtime

固定 Dialogue Runtime 只维护：

```text
current dialogue id
current line index
pending choice
```

正常完成结果是 `terminalDialogueId`。`speakerName`、Mutation definition 与 Dialogue working state 都不进入 Save；`speakerName` 来自 immutable Dialogue Content。

# Builder / Runtime 检查边界

Builder 应检查：

- Character / NPC / Visual / Event / EventStateMutation / Map / Dialogue / BattleActor / BattleSkill 等静态引用不存在；
- Event/state / Dialogue identity 重复；
- 安装初始化 EventStateList 重复 `eventId`；
- EventStateList 中的 `eventId / stateId` 引用了不存在的 Event / state；
- Dialogue Choice target 不存在；
- 持久 Character `Line.speaker` 引用了不存在的 Character；
- 同一个 Dialogue 同时存在 `choices` 与 `mutation`；
- Dialogue `mutation` 引用了不存在的 EventStateMutation；
- `interaction.dialogue` 不存在；
- Mutation `from` / `to` 中非空 `stateId` 引用了不存在的 Event state；
- Mutation 单侧重复 eventId；
- Character / BattleActor / BattleSkill 引用不合法；
- 同一个 Event state 内重复 `(mapId,npcId)`；
- placement 非法；
- Story Index 与源 Content 不一致。

Builder 不应因为以下情况失败：

```text
安装 EventStateList 不包含全部 Event
Mutation.from 有多个 Event
Mutation.to 有多个 Event
Mutation.from / to 的 Event key 集合不同
Mutation 使用 null → stateId 启动 Event
Mutation 使用 stateId → null 清空 Event
多个独立 Mutation 表达 OR 分支
同一个 npcId 被多个不同 Event 引用
同一个 npcId 在同一 Event state 中出现在多个不同 Map
同一个 Character 被多个 Event 引用
一个 Event 对 Character 声明 absent、另一个 Event 对同一 Character 提供 placement
Dialogue 之间形成合法 cycle
同一个 Character 被多个 Relationship / contract 引用
transient NPC 复用带 speakerName 的 Dialogue
```

Runtime：

- EventStateList 是 Event current state 的 Realm State authority；
- EventStateList 内 `eventId` 唯一；
- 缺 entry 等价于 Event current state `null`；
- 缺 entry 的 Event 不参与 Event State 投影；
- active Event 一旦提到 Character，该 Character default scene fallback 全部关闭；
- `absent` 不压制另一个 Event 的明确 placement；
- `Dialogue.speakerName` 只是显示 fallback，不产生 Character identity；
- Content 不执行 Mutation；
- Dialogue 根据明确 `Dialogue.mutation` 执行 Mutation；
- 非 Dialogue 业务通过 `session-event` 表达业务事实，session-level 业务运行时决定是否以及执行哪个 Mutation；
- Battle / Map / Encounter Content 不因剧情推进增加 Mutation ref；
- Mutation 的全部 `from` 必须同时匹配，包括显式 `null`；
- Mutation 用 EventStateList Record version 做 OCC；
- Mutation 的全部 `to` 通过一次 EventStateList replacement 原子提交；
- 不扫描 Mutation 自动触发；
- Battle 的契约级长期 Integrity / Progression 回写 Relationship，而不是 Card；
- 合并当前 NPC 来源后，每张最终 Map 内 `npcId` 唯一。

# 当前继续设计的数据问题

- Character / NPC / Visual 的精确 Content schema / namespace；
- Character 到 BattleActor Content 的最终引用编码；
- Event / EventStateMutation 的最终 Content namespace / key；
- EventStateList Realm State Record 的最终 namespace / key 名字；
- Event placement / `instanceId` / `absent` 的最终 JSON shape；
- Dialogue condition、本地化与 presentation metadata；
- Relationship 的最终 Realm State key / 精确 progression shape；
- Card 的最终 key / 是否需要独立 `cardId`；
- Skill 学习 / 成长如何影响 BattleActor `skills[]` 的长期业务状态；
- Encounter re-entry / persistence；
- Guidance、训练和多卡编队；
- NPC patrol / chase / 独立移动。