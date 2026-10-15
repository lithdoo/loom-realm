# 世界数据模型

> 独立技术设计记录。不改写 `../DESIGN.md`。本文汇总当前已经确认的 Character、NPC、Visual、Story、Dialogue、Encounter、Relationship、Card 与 Battle 数据职责。精确 JSON schema、Realm State namespace/key 和持久化格式仍可继续细化。

归宿总表见 [数据落点](./60-data-placement.md)，人物细节见 [人物](./61-character.md)，Event 见 [事件](./62-event.md)，固定 Dialogue 见 [固定对话](./64-dialogue.md)，总览图见 [数据模型图](./65-data-model-diagram.md)。

## 目标

当前模型坚持几个边界：

1. **Character identity 与 Map 表现分离。** Character 不是 NPC，NPC Instance 也不要求一定对应持久 Character。
2. **Relationship 保存人与人的长期关系与契约事实。** Contract 不建立独立 authority。
3. **Card 与 Relationship 分离。** 技术数据模型里的 Card 只表示当前随身、主要服务 Pocket / Battle 的卡片状态。
4. **Battle Runtime 独立。** Battle 当前运行状态只由 `@loomrealm-game/battle` Simulation authority 拥有。
5. **PokeMan 不重复定义 BattleActor / BattleSkill。** 战斗静态数据直接复用 `@loomrealm-game/battle` 当前 Content contract。
6. **Content 尽量完整。** Character / Dialogue / Event / Encounter / Battle 静态定义都从安装 Content 取得。
7. **最终 Map 场景按 `npcId` 去重。** 同一 `npcId` 可以出现在不同 Map，但同一张 Map 的最终解析结果中只能出现一次。

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

BattleActor Content
+
current carried Card state（如果来源是随身 Card）
或 Story / Encounter battle source
↓
@loomrealm-game/battle Runtime Actor
↓
Battle Simulation
```

这张图只表达职责和引用关系，不要求所有概念物理存成一种 Record。

# Content

## Character：这个人是谁

Character 是持久人物 identity。

概念上：

```text
CharacterDefinition
├─ id
├─ name
├─ description
│  ├─ occupation
│  ├─ personality
│  └─ history
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

BattleActor Content 当前逻辑字段：

```text
BattleActor Content
├─ id
├─ name
├─ character graphics reference
├─ max_hp
└─ skills[] → BattleSkill
```

BattleSkill 当前逻辑字段：

```text
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

因此：

```text
Character
→ BattleActor Content
→ skills[]
→ BattleSkill Content
```

PokeMan 不再维护一份平行的 `SkillDefinition`，也不把 `skills[]` 复制成另一套 Character-owned definition。

当前 Battle v0 没有定义的 `attack / defense / speed / MP / accuracy / critical / element / armor penetration / universal cooldown / ammo / Buff / Debuff` 等概念，不在 PokeMan 文档中提前宣称为已有字段。将来确实需要新的战斗机制时，优先修改 / 扩展 `@loomrealm-game/battle` 的规范，再由 PokeMan 消费。

## Visual

Visual 是可复用的视觉定义：

```text
VisualDefinition
├─ id
├─ map sprite
├─ portrait
├─ battle presentation
└─ card art
```

多个 NPC Definition 可以引用同一个 Visual；同一 Character 也可以在不同场景使用不同 Visual。

## NPC Definition

NPC Definition 表示地图表现模板，不是 Character identity。

当前 `@loomrealm-game/map` 的窄 Content contract 仍是：

```text
[struct]NPC/<npcId>
├─ name
└─ sprite
```

PokeMan source Content 可以使用 `visualId` 等更方便的引用，再由 Builder 投影成 Map 所需的 `struct.NPC`。

```text
npcId != characterId
```

二者可以偶然相同，但系统不能依赖这个假设。

PokeMan 对 NPC 的地图唯一性规则是：

```text
最终场景中 (mapId, npcId) 唯一
```

所以同一个 `npcId` 可以同时存在于多个不同 Map，但不能在同一张 Map 的最终结果里出现两次。

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

## Event / Story

Event 是 Content。Realm State 只保存当前 Event state id 和其他真正不能重算的 mutable facts。

```text
EventDefinition
├─ id
└─ states
   └─ [stateId]
      ├─ dialogue references
      ├─ NPC instance / placement definitions
      └─ other story definitions
```

Event source Content 不要求跨 Event 的 `npcId` 唯一。不同 Event 可以都声明同一个 NPC；同一个 Event state 也可以让同一个 `npcId` 出现在多个不同 Map。

当前静态与 Runtime 检查边界是：

```text
同一个 Event state
→ (mapId, npcId) 不可重复

不同 Event
→ 允许重复引用同一个 npcId

Runtime 合并当前所有来源
→ 每张最终 Map 内 npcId 必须唯一
```

当前不定义隐式 last-wins。如果多个 Event 在当前 Realm State 下最终同时为同一 `(mapId, npcId)` 提供出现定义，Story Resolver 必须确定性处理为冲突。

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

Encounter 生成结果与 Story/Event 投影最终也要一起满足当前 Map 的 `npcId` 唯一约束。

# Realm State

## Relationship：A → B 的长期关系

Relationship 是有方向的：

```text
A → B
= A 与 B 当前持续存在的关系状态
```

当前概念字段：

```text
Relationship
├─ fromCharacterId
├─ toCharacterId
├─ affinity
├─ hostile
├─ dynamic relationship text
└─ contract?
```

`A → B` 与 `B → A` 是两份独立 Relationship，不要求对称。

`affinity` 与 `hostile` 独立；动态关系文本主要给 AI 理解当前关系，不代替结构化规则字段。

### Contract

Contract 不再是独立对象。

```text
Relationship(A → B).contract
= A 是主公
= B 是从者
= 正式契约已经成立
```

所以双向契约就是：

```text
player → rival   contract
rival → player   contract
```

同一个 Character 也可以被不同主公分别契约：

```text
player → rival   contract
lord-b → rival   contract
```

契约存在不意味着当前一定随身。

## Card：当前随身的战斗卡片

Card 是独立 Realm State 对象，但语义被限定为：

> **当前被某个 holder 带在身上的 Card；它主要用于 Pocket / Battle。**

当前概念字段：

```text
Card
├─ holderCharacterId
├─ servantCharacterId
├─ slot
└─ battleState
   └─ integrity
```

语义：

- holder 指当前主公；
- servant 指 Card 代表的从者；
- `slot` 是当前随身编队位置；
- `integrity` 是 Card Battle Manifestation 的完整度 / 稳定度，不是 Character 本体 HP。

Card 只有在对应 contract 已成立且该从者当前被加入随身编队时才存在：

```text
Relationship(player → rival).contract = true
+
Card(holder=player, servant=rival, slot=0)
```

如果 contract 继续存在但从者当前不随身：

```text
Relationship(player → rival).contract = true
Card(player, rival) = absent
```

Card 的独立 `cardId` 尚未冻结。

### 当前未决：非随身时的长期 Battle / Progression 状态

Card 被限定为 current carried state 后，下面这件事不能再假装已经解决：

```text
contract exists
+
servant not carried
+
integrity / training / progression 仍需跨存档存在？
```

这些事实最终由 Relationship、Center-managed state、Progression state 或其他对象拥有，**目前尚未决定**。

因此当前明确禁止重新把 Integrity 偷塞进 Relationship，只为暂时解决持久化方便。

## 其他 Realm State

还包括：

```text
Realm State
├─ player current map / position / direction
├─ Event current state
├─ Relationship[]
├─ current carried Card[]
├─ Encounter generated results that must persist
├─ Pocket / story committed facts
└─ player choices / random facts that cannot be recomputed
```

# Runtime / Projection

## NPC Instance

NPC Instance 是当前 World / Story Resolver 投影出的地图实例：

```text
NPCInstance
├─ instanceId
├─ npcId
├─ characterId?      // PokeMan business link
├─ mapId
├─ x
├─ y
├─ direction
└─ pattern?
```

传给 Map 的仍然是：

```text
NPCPlacement
├─ instanceId
├─ npcId
├─ x
├─ y
├─ direction
└─ pattern?
```

`instanceId` 满足 `@loomrealm-game/map` 的实例 contract；PokeMan 的最终业务唯一性另外要求：

```text
对每个 mapId：npcId 唯一
```

因此同一个 NPC 可以在多个不同 Map 上同时存在，但不能因为给它不同 `instanceId` 就在同一 Map 上保留两份。

一个 Character 可以产生 0..N 个 NPC Instance；如果同一 Character 在同一 Map 需要多个不同表现，它们必须使用不同 `npcId`。Transient Encounter NPC 可以没有 `characterId`。

Map Enter：

```text
Story Index
+
Event current state
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
NPC Instance[]
↓
NPCPlacement[]
↓
@loomrealm-game/map
```

## Battle Runtime Actor

PokeMan 不再定义自己的泛化 BattleActor schema；本场 actor state 直接以 `@loomrealm-game/battle` Simulation contract 为准。

当前已经存在的核心运行字段包括：

```text
Battle Runtime Actor
├─ actorId / team
├─ hp / maxHp
├─ tile
├─ direction
├─ action
├─ protectedUntilTickExclusive
├─ skills (resolved for observation / simulation)
└─ Decision / Simulation working state
```

### 当前随身 Card 来源

```text
Character
→ BattleActor Content
+
Card battleState
↓
Battle Runtime Actor
```

### 剧情 / Encounter 临时来源

```text
Story / Encounter Battle source
+
BattleActor Content
↓
Battle Runtime Actor
```

临时敌人不需要 contract / Card。Battle 结束以后，Runtime actor 直接丢弃；World 只提交明确需要长期存在的业务后果。

因此：

```text
NPC Instance != Character != Relationship != Card != Battle Runtime Actor
```

## Dialogue Runtime

固定 Dialogue 的 Runtime 只需要：

```text
current dialogue id
current line index
pending choice
```

这些不进入 Save。

AI 自由对话则组合：

```text
Character fixed AI text
+
Relationship speaker → counterpart
+
current story / Card context
↓
LLM
```

当前不建立独立 Conversation Memory。

# 数据关系摘要

```text
Content
├─ Character
│  └─ BattleActor ref
├─ BattleActor
│  └─ skills[] → BattleSkill
├─ BattleSkill
├─ NPC Definition → Visual
├─ Dialogue
├─ Event / Event State
├─ Encounter
├─ Story Index
├─ Battle rules/scenarios
└─ Map

Realm State
├─ Relationship A → B
│  ├─ affinity
│  ├─ hostile
│  ├─ dynamic text
│  └─ contract
├─ Card (current carried only)
│  ├─ holder
│  ├─ servant
│  ├─ slot
│  └─ integrity
├─ Event current state
├─ player world state
└─ persistent Encounter / story facts

Runtime
├─ NPC Instance
├─ @loomrealm-game/battle Runtime Actor / Simulation
├─ Dialogue working state
├─ Story Resolver working set
└─ Renderer / animation state
```

# Builder / Runtime 检查边界

Builder 应检查：

- Character / NPC / Visual / Event / Map / Dialogue / BattleActor / BattleSkill 等静态引用不存在；
- Event/state / Dialogue identity 重复；
- Dialogue Choice target 不存在；
- 持久 Character speaker 不存在；
- Character 引用了不存在的 BattleActor Content；
- BattleActor `skills[]` 引用了不存在的 BattleSkill；
- BattleSkill / BattleActor 本身不满足 Battle package 的 validator / contract；
- 同一个 Event state 内重复 `(mapId, npcId)`；
- 单个定义中重复 `instanceId`；
- placement 非法；
- Story Index 与源 Content 不一致。

Builder 不应因为以下情况失败：

```text
多个 NPC Definition 使用同一个 Visual
同一个 Character 使用多个 NPC Definition
同一个 npcId 被多个不同 Event 引用
同一个 npcId 在同一 Event state 中出现在多个不同 Map
同一个 Character 被多个 Event 引用
同一个 Character 出现在多个不同 Map
Dialogue 之间形成 cycle
同一个 Character 被多个不同方向的 Relationship / contract 引用
```

Runtime 在合并 Story / Character / Encounter 等当前来源后，必须对每个最终 Map 检查 `npcId` 唯一。不同来源最终产生同一 `(mapId, npcId)` 时，当前规则是确定性冲突，不是隐式覆盖。

# 当前继续设计的问题

- Character / NPC / Visual 的精确 Content schema / namespace；
- Character 到 BattleActor Content 的最终引用编码；
- Event 的状态推进触发、`absent` 与跨 Event 冲突 / 显式 override 规则；
- Dialogue 的 outcome/result、condition、本地化与 presentation metadata；
- Relationship 的最终 Realm State key / shape；
- Card 的最终 key / 是否需要独立 `cardId`；
- **非随身契约从者的 Integrity / Progression 长期 owner；**
- Skill 学习 / 成长如何影响 BattleActor `skills[]` 的长期业务状态；
- Encounter re-entry / persistence；
- Guidance、训练和多卡编队；
- NPC patrol / chase / 独立移动。