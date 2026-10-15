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
8. **Dialogue 保持为固定台词与内部 Choice 跳转。** 正常完成时只返回 `terminalDialogueId`，不自己改 Realm State。
9. **最终 Map 场景按 `npcId` 去重。** 同一 `npcId` 可以出现在不同 Map，但同一张 Map 的最终解析结果中只能出现一次。

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
→ terminalDialogueId
→ EventStateMutation ref
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

## Character：这个人是谁

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

确认边界：

- `id` 是人物稳定 identity；
- 作者定义的职业、性格、经历属于 Content；
- fixed AI character text 是 immutable natural-language persona；
- Character 稳定关联到 `@loomrealm-game/battle` BattleActor Content；
- 所有持久 Character 都准备好 Card / Battle 所需静态素材，但这不等于 `canContract`；
- Character 不保存当前 affinity、hostile、contract、Card Integrity 或 Battle Runtime hp。

## BattleActor / BattleSkill：直接使用 Battle package

PokeMan 当前不定义自己的 Battle Profile / Skill schema。静态战斗数据以 `@loomrealm-game/battle` 当前规范为 canonical source。

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
├─ timing
│  ├─ windup_ticks
│  └─ recovery_ticks
└─ effect
```

当前 Battle v0 没有定义的 `attack / defense / speed / MP / accuracy / critical / element / armor penetration / universal cooldown / ammo / Buff / Debuff` 等概念，不在 PokeMan 文档中提前宣称为已有字段。将来确实需要新的战斗机制时，优先扩展 `@loomrealm-game/battle`。

## Visual / NPC Definition

Visual 是可复用的视觉定义；NPC Definition 是地图表现模板，不是 Character identity。

当前 `@loomrealm-game/map` 的窄 NPC Content contract 仍是：

```text
[struct]NPC/<npcId>
├─ name
└─ sprite
```

PokeMan source Content 可以引用更丰富的 Visual，再由 Builder 投影成 Map 所需定义。

```text
npcId != characterId
```

PokeMan 对最终 NPC 地图结果要求：

```text
(mapId, npcId) 唯一
```

同一个 `npcId` 可以同时存在于多个不同 Map，但不能在同一张最终 Map 中出现两次。

## Dialogue

固定 Dialogue 是 immutable Content：

```text
Dialogue
├─ id
├─ lines[]
│  ├─ speaker?
│  └─ text
└─ choices?[]
   ├─ text
   └─ target Dialogue
```

约束：

- 一个 Dialogue 内只有线性 `lines[]`；
- Choice 只能在末尾；
- Choice 只跳到另一个 Dialogue；
- Dialogue 图允许 cycle；
- Dialogue 自己不直接修改 Relationship / Event / Battle State。

当 Dialogue 链最终播放完一个没有 `choices` 的 Dialogue 时，该 Dialogue 是 terminal Dialogue。本次 Dialogue Frame 正常完成只返回：

```text
terminalDialogueId
```

不额外增加通用 Dialogue `outcome` / `result` 字段。

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
                     ├─ dialogue
                     └─ mutations?
                        └─ terminalDialogueId → EventStateMutation ref
```

职责：

```text
Event State
= 当前剧情阶段

Event State NPC
= 当前阶段这个 NPC 在哪、怎么交互

Dialogue
= 实际台词与 Choice 内部跳转

interaction.mutations
= 固定 Dialogue 的 terminal 分支引用哪个 EventStateMutation
```

## EventStateMutation

EventStateMutation 是独立 Content，不嵌在某个 Event 内成为专属 transition。

概念 shape：

```text
EventStateMutation
├─ from
│  └─ eventId → stateId
└─ to
   └─ eventId → stateId
```

Mutation identity 由 Content key / reference 提供，因此逻辑数据本体只需要 `from` / `to`。

### `from`：AND

一条 Mutation 的所有 `from` 项必须全部满足：

```text
eventA == stateA
AND
eventB == stateB
AND
...
```

Mutation 不拥有 `or / anyOf / condition tree`。

需要 OR 时：

```text
branch A → Mutation A
branch B → Mutation B
```

每个分支单独定义一条 Mutation。

### `from` / `to` 不一一对应

两边的 Event key 集合、数量都可以不同：

```text
只在 from
= 前置条件

同时在 from / to
= 检查旧 state 后写入新 state

只在 to
= 直接写入目标 state，不要求有同名 from
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

Mutation 只拥有 Event current state，不扩展到：

```text
Relationship
Contract
Card
Battle
player position
arbitrary Realm State path/value
```

因此 EventStateMutation 是声明式 Event state mutation，不是通用 mutation DSL。

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
terminalDialogueId
↓
interaction.mutations[terminalDialogueId]
↓
有 Mutation ref？
├─ 否 → Event states 不自动变化
└─ 是 → validate Mutation.from（全部 AND）
         ↓
       atomically commit Mutation.to
         ↓
       Story Resolver 重新解析场景
```

Runtime 不需要硬编码任何具体 Event state 名称。

Runtime 也不扫描全部 Mutation 自动执行。Mutation 必须被明确业务结果引用，避免形成隐式触发链、顺序依赖或自动循环。

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

当前不定义隐式 last-wins。多个来源最终同时产生同一 `(mapId, npcId)` 时，Story Resolver 必须确定性处理为冲突。

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

Encounter 可以生成 transient NPC Instance，也可以提供剧情 / 普通敌人的 Battle 输入；不要求为临时敌人建立 Character Relationship 或 Card。

Encounter 生成结果与 Story/Event 投影最终也要满足当前 Map 的 `npcId` 唯一约束。

# Realm State

## Relationship

Relationship 是有方向的人际长期状态：

```text
Relationship
├─ fromCharacterId
├─ toCharacterId
├─ affinity
├─ hostile
├─ dynamic relationship text
└─ contract?
```

`A → B` 与 `B → A` 是两份独立 Relationship。`affinity` 与 `hostile` 独立。

`contract` 表示：

```text
Relationship(A → B).contract
= A 是主公
= B 是从者
= 正式契约已经成立
```

Contract 不建立独立 Realm State object。

## Card

Card 是独立 Realm State 对象，只表示当前随身的角色卡：

```text
Card
├─ holderCharacterId
├─ servantCharacterId
├─ slot
└─ battleState
   └─ integrity
```

契约存在不意味着当前一定存在 Card。Card 的独立 `cardId` 尚未冻结。

从者有 contract 但当前不随身时，Integrity / training / progression 的长期 owner 仍待设计；不把它们为了方便偷塞回 Relationship。

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

Event definitions 与 EventStateMutation 都是 Content；Save 只保存 Event current states，不复制 Mutation。

# Runtime / Projection

## NPC Instance

NPC Instance 是当前 World / Story Resolver 投影出的地图实例：

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

传给 Map 的仍然是 `NPCPlacement`。`instanceId` 满足 Map 的实例 contract，但 PokeMan 还额外要求每个最终 `mapId` 内 `npcId` 唯一。

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

PokeMan 不定义平行的 Runtime BattleActor schema；本场 actor state 直接以 `@loomrealm-game/battle` Simulation contract 为准。

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

正常完成结果是 `terminalDialogueId`。这些都不进入 Save。

AI 自由对话继续组合 Character fixed AI text、Relationship 和当前剧情 / Card context；当前不建立独立 Conversation Memory。

# Builder / Runtime 检查边界

Builder 应检查：

- Character / NPC / Visual / Event / EventStateMutation / Map / Dialogue / BattleActor / BattleSkill 等静态引用不存在；
- Event/state / Dialogue identity 重复；
- Dialogue Choice target 不存在；
- `interaction.dialogue` / terminal Dialogue key 不存在；
- `interaction.mutations` 引用了不存在的 EventStateMutation；
- Mutation `from` / `to` 引用了不存在的 Event / state；
- Mutation 单侧重复 eventId；
- Character 引用了不存在的 BattleActor Content；
- BattleActor `skills[]` 引用了不存在的 BattleSkill；
- BattleSkill / BattleActor 不满足 Battle package validator / contract；
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
Dialogue 之间形成 cycle
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
- Mutation `from` 校验失败的产品错误表现；
- `absent` 与跨 Event NPC 冲突 / 显式 override 规则；
- Dialogue condition、本地化与 presentation metadata；
- Relationship 的最终 Realm State key / shape；
- Card 的最终 key / 是否需要独立 `cardId`；
- 非随身契约从者的 Integrity / Progression 长期 owner；
- Skill 学习 / 成长如何影响 BattleActor `skills[]` 的长期业务状态；
- Encounter re-entry / persistence；
- Guidance、训练和多卡编队；
- NPC patrol / chase / 独立移动。
