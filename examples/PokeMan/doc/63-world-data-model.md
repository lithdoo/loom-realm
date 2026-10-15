# 世界数据模型

> 独立技术设计记录。不改写 `../DESIGN.md`。本文汇总当前已经确认的 Character、NPC、Visual、Story、Dialogue、EventStateMutation、Encounter、Relationship、Card 与 Battle 数据职责。精确 JSON schema、Realm State namespace/key 和持久化格式仍可继续细化。

归宿总表见 [数据落点](./60-data-placement.md)，人物细节见 [人物](./61-character.md)，Event 见 [事件](./62-event.md)，固定 Dialogue 见 [固定对话](./64-dialogue.md)，总览图见 [数据模型图](./65-data-model-diagram.md)。

## 目标

当前模型坚持几个边界：

1. **Character identity 与 Map 表现分离。** Character 不是 NPC，NPC Instance 也不要求一定对应持久 Character。
2. **Relationship 保存人与人的长期关系与契约事实。** Contract 不建立独立 authority。
3. **Card 与 Relationship 分离。** 技术数据模型里的 Card 只表示当前随身、主要服务 Pocket / Battle 的卡片状态。
4. **Battle Runtime 独立。** Battle 当前运行状态只由 `@loomrealm-game/battle` Simulation authority 拥有。
5. **PokeMan 不重复定义 BattleActor / BattleSkill。** 战斗静态数据直接复用 `@loomrealm-game/battle` 当前 Content contract。
6. **Event 保持为剧情状态与场景 / 交互定义。** 不扩成通用 Trigger / Action / Command / Flow engine。
7. **Event state 的声明式变化独立为 EventStateMutation Content。** `from` 是 AND 前置集合，`to` 是原子赋值集合；OR 用多条 Mutation 表达。
8. **Dialogue 保持为线性台词与末尾 Choice。** Choice 只跳到下一个 Dialogue；无 Choice Dialogue 可以在完成时引用一个 EventStateMutation。
9. **`choices` 与 `mutation` 互斥。** 需要状态变化的 Choice 必须先跳到新的无 Choice Dialogue，再由新 Dialogue 触发 Mutation。
10. **最终 Map 场景按 `npcId` 去重。** 同一 `npcId` 可以出现在不同 Map，但同一张 Map 的最终解析结果中只能出现一次。

## 总体关系

```text
Character Content
      │
      ├────────────→ BattleActor Content
      │                 └─ skills[] → BattleSkill Content
      │
      ├────────────→ Relationship A → B
      │                 └─ contract?
      │
      ├────────────→ NPC Instance → NPC Definition → Visual
      │
      └────────────→ current carried Card
                        holder / servant / slot / integrity

Event current state
→ mapId / npcId / placement
→ interaction.dialogue
→ Dialogue Frame
→ choices? → target Dialogue
→ terminal Dialogue
→ mutation?
→ EventStateMutation
→ validate all from
→ atomically commit all to
→ Story Resolver re-resolve

BattleActor Content
+
current carried Card state（如果来源是随身 Card）
或 Story / Encounter battle source
↓
@loomrealm-game/battle Runtime Actor
↓
Battle Simulation
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

Character 不保存当前 affinity、hostile、contract、Card Integrity 或 Battle Runtime hp。所有持久 Character 都准备好 Card / Battle 所需静态素材，但这不等于 `canContract`。

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
├─ lines[]
│  ├─ speaker?
│  └─ text
├─ choices?[]
│  ├─ text
│  └─ target Dialogue
└─ mutation? → EventStateMutation
```

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

没有 `choices` 的 Dialogue 播放完成，并在需要时成功应用 `mutation` 后，是 terminal Dialogue。Dialogue Frame 正常完成仍可返回：

```text
terminalDialogueId
```

但 Event state mutation 不再由 caller 根据 `terminalDialogueId` 查映射；Mutation 由 terminal Dialogue 自己引用。

## Event / Story

Event 是 immutable Content；Realm State 只保存各 Event 当前 `stateId`。

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
                  ├─ placement
                  └─ interaction?
                     └─ dialogue
```

职责：

```text
Event State
= 当前剧情阶段

Event State NPC
= 当前阶段这个 NPC 在哪、入口 Dialogue 是什么

Dialogue
= 台词、Choice 跳转，以及无 Choice 完成时可选的 Mutation ref
```

Event State NPC 不再维护 `terminalDialogueId → Mutation` 映射。

## EventStateMutation

EventStateMutation 是独立 Content，不嵌在某个 Event 内成为专属 transition。

```text
EventStateMutation
├─ from
│  └─ eventId → stateId
└─ to
   └─ eventId → stateId
```

### `from`：AND

一条 Mutation 的所有 `from` 项必须全部满足。

Mutation 不拥有 `or / anyOf / condition tree`。需要 OR 时，为每个分支定义独立 Mutation，由对应 Dialogue / 业务分支引用。

### `from` / `to` 不一一对应

```text
只在 from
= 前置条件

同时在 from / to
= 检查旧 state 后写入新 state

只在 to
= 直接写入目标 state
```

例如：

```yaml
from:
  professor-intro: waiting
  rival-story: before-contract

to:
  professor-intro: contracted
  rival-story: contracted
  tutorial-battle: ready
```

### `to`：原子 commit

Runtime 先验证全部 `from`，成功后把全部 `to` 在一次 Realm State commit 中一起写入。

Mutation 只拥有 Event current state，不扩展到 Relationship / Contract / Card / Battle / player position / arbitrary Realm State path/value。

## Dialogue → EventStateMutation

固定 NPC Dialogue 的运行链：

```text
玩家与 NPC 交互
↓
World 找到当前 Event / state / mapId / npcId
↓
interaction.dialogue
↓
frame.call(Dialogue)
↓
播放 lines
↓
有 choices？
├─ 是 → 选择 target Dialogue，继续 Dialogue graph
└─ 否 → 有 mutation？
         ├─ 否 → complete
         └─ 是 → validate Mutation.from（全部 AND）
                  ↓
                atomically commit Mutation.to
                  ↓
                Story Resolver 重新解析场景
                  ↓
                complete
↓
返回 terminalDialogueId
```

Runtime 不硬编码具体 Event state 名称，也不扫描全部 Mutation 自动执行。Mutation 必须被明确 Dialogue 或其他业务结果引用。

未来 Battle 完成、到达地点等业务也可以显式引用同一种 Mutation，但 Mutation 本身不拥有 trigger。

## Event NPC source 与最终 Map 唯一性

不同 Event 可以都声明同一个 NPC；同一个 Event state 也可以让同一 `npcId` 出现在多个不同 Map。

```text
同一个 Event state
→ (mapId, npcId) 不可重复

不同 Event
→ 允许重复引用同一个 npcId

Runtime 合并当前所有来源
→ 每张最终 Map 内 npcId 必须唯一
```

多个来源最终同时产生同一 `(mapId, npcId)` 时，Story Resolver 确定性报冲突，不做隐式 last-wins。

Story Index 是 Builder 生成的派生 Content：

```text
Story Index
├─ by Map
├─ by Character
└─ by Event
```

它可以重建，不进入 Save。

## Encounter

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

# Realm State

## Relationship

```text
Relationship
├─ fromCharacterId
├─ toCharacterId
├─ affinity
├─ hostile
├─ dynamic relationship text
└─ contract?
```

`A → B` 与 `B → A` 是独立 Relationship。Contract 不建立独立 Realm State object。

## Card

Card 是独立 Realm State 对象，只表示当前随身角色卡：

```text
Card
├─ holderCharacterId
├─ servantCharacterId
├─ slot
└─ battleState
   └─ integrity
```

契约存在不意味着当前一定存在 Card。Card 的独立 `cardId` 尚未冻结。

从者有 contract 但当前不随身时，Integrity / training / progression 的长期 owner 仍待设计。

## 其他 Realm State

```text
Realm State
├─ player current map / position / direction
├─ Event current state[]
├─ Relationship[]
├─ current carried Card[]
├─ Encounter generated results that must persist
├─ Pocket / story committed facts
└─ player choices / random facts that cannot be recomputed
```

Event、Dialogue 与 EventStateMutation definitions 都是 Content；Save 只保存实际 mutable facts。

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
Event current states
+
Character / Event Content
+
Encounter generated state
↓
Story Resolver
↓
合并 NPC sources
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
Character
→ BattleActor Content
+
Card battleState（随身 Card 来源时）
或 Story / Encounter Battle source
↓
Battle Runtime Actor
```

临时敌人不需要 contract / Card。Battle 结束以后 Runtime actor 丢弃，World 只提交明确需要长期存在的业务后果。

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

正常完成结果是 `terminalDialogueId`。Mutation definition 与 Dialogue working state 都不进入 Save。

# Builder / Runtime 检查边界

Builder 应检查：

- Character / NPC / Visual / Event / EventStateMutation / Map / Dialogue / BattleActor / BattleSkill 等静态引用不存在；
- Event/state / Dialogue identity 重复；
- Dialogue Choice target 不存在；
- 同一个 Dialogue 同时存在 `choices` 与 `mutation`；
- Dialogue `mutation` 引用了不存在的 EventStateMutation；
- `interaction.dialogue` 不存在；
- Mutation `from` / `to` 引用了不存在的 Event / state；
- Mutation 单侧重复 eventId；
- Character / BattleActor / BattleSkill 引用不合法；
- 同一个 Event state 内重复 `(mapId, npcId)`；
- placement 非法；
- Story Index 与源 Content 不一致。

Builder 不应因为以下情况失败：

```text
Mutation.from 有多个 Event
Mutation.to 有多个 Event
Mutation.from / to 的 Event key 集合不同
多个独立 Mutation 表达 OR 分支
同一个 npcId 被多个不同 Event 引用
同一个 npcId 在同一 Event state 中出现在多个不同 Map
同一个 Character 被多个 Event 引用
Dialogue 之间形成合法 cycle
同一个 Character 被多个 Relationship / contract 引用
```

Runtime：

- 只应用被明确引用的 Mutation；
- Mutation 的全部 `from` 必须同时匹配；
- Mutation 的全部 `to` 必须原子提交；
- 不扫描 Mutation 自动触发；
- 合并当前 NPC 来源后，每张最终 Map 内 `npcId` 唯一。

# 当前继续设计的问题

- Character / NPC / Visual 的精确 Content schema / namespace；
- Character 到 BattleActor Content 的最终引用编码；
- Event / EventStateMutation 的最终 Content namespace / key；
- 非 Dialogue 业务如何引用 Mutation；
- Dialogue mutation `from` 校验失败的产品错误表现；
- `absent` 与跨 Event NPC 冲突 / 显式 override 规则；
- Dialogue condition、本地化与 presentation metadata；
- Relationship 的最终 Realm State key / shape；
- Card 的最终 key / 是否需要独立 `cardId`；
- 非随身契约从者的 Integrity / Progression 长期 owner；
- Skill 学习 / 成长如何影响 BattleActor `skills[]` 的长期业务状态；
- Encounter re-entry / persistence；
- Guidance、训练和多卡编队；
- NPC patrol / chase / 独立移动。
