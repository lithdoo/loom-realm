# 世界数据模型

> 独立技术设计记录。不改写 `../DESIGN.md`。本文汇总当前已经确认的 Character、NPC、Visual、Story、Dialogue、Encounter、Relationship、Card 与 Battle 数据职责。精确 JSON schema、Realm State namespace/key 和持久化格式仍可继续细化。

归宿总表见 [数据落点](./60-data-placement.md)，人物细节见 [人物](./61-character.md)，Event 见 [事件](./62-event.md)，固定 Dialogue 见 [固定对话](./64-dialogue.md)，总览图见 [数据模型图](./65-data-model-diagram.md)。

## 目标

当前模型坚持几个边界：

1. **Character identity 与 Map 表现分离。** Character 不是 NPC，NPC Instance 也不要求一定对应持久 Character。
2. **Relationship 保存人与人的长期关系与契约事实。** Contract 不建立独立 authority。
3. **Card 与 Relationship 分离。** 技术数据模型里的 Card 只表示当前随身、主要服务 Pocket / Battle 的卡片状态。
4. **Battle Runtime 独立。** currentHp、cooldown、Buff/Debuff、Decision 等只属于本场 Battle。
5. **Content 尽量完整。** Character / Dialogue / Event / Encounter / Battle 静态定义都从安装 Content 取得。

## 总体关系

```text
                         ┌─────────────────────┐
                         │ Character Content   │
                         │ identity / AI /     │
                         │ Battle profile      │
                         └─────────┬───────────┘
                                   │
                    ┌──────────────┼───────────────┐
                    │              │               │
                    ▼              ▼               ▼
              Relationship     NPC Instance      Card
                 A → B             │          holder=A
                    │              │          servant=B
                    │              ▼               │
                    │        NPC Definition        │
                    │              │               │
                    │              ▼               │
                    │            Visual            │
                    │                              │
                    │ contract                     │ battle-facing state
                    └──────────────┐               │
                                   ▼               ▼
                              current carried Card ──────┐
                                                        │
Character Battle Content ────────────────────────────────┤
                                                        ▼
                                                   Battle Actor
                                                        │
                                                        ▼
                                                     Battle

Story / Encounter Battle definition ────────────────────┘
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
├─ battle profile reference
└─ presentation references
```

确认边界：

- `id` 是人物稳定 identity；
- 作者定义的职业、性格、经历属于 Content；
- fixed AI character text 是 immutable natural-language persona；
- Battle profile 提供基础能力、技能和 Battle 静态资源；
- 所有持久 Character 都准备好 Card / Battle 所需静态素材，但这不等于 `canContract`；
- Character 不保存当前 affinity、hostile、contract、Card Integrity 或 Battle currentHp。

## Battle Profile / Skill

当前只冻结归属，不冻结 Skill schema：

```text
Character Battle Content
├─ base stats
├─ skills
└─ battle presentation/resources
```

具体 Skill Content shape、参数、动作执行、成长 / 学习方式下一步单独设计。

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
   └─ optional battle profile reference
```

Encounter 可以生成 transient NPC Instance，也可以提供剧情 / 普通敌人的 Battle 输入；不要求为临时敌人建立 Character Relationship 或 Card。

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

一个 Character 可以产生 0..N 个 NPC Instance；Transient Encounter NPC 可以没有 `characterId`。

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
NPC Instance[]
↓
NPCPlacement[]
↓
@loomrealm-game/map
```

## Battle Actor

Battle Actor 是本场 Battle Runtime 的 actor，不等于 Character、Card 或 NPC Instance。

```text
BattleActor
├─ currentHp
├─ maxHp
├─ current stats
├─ resolved skills
├─ cooldown / status
├─ buff / debuff
├─ Decision state
└─ simulation state
```

### 当前随身 Card 来源

```text
Character Battle Content
+
Card battleState
↓
Battle Actor
```

### 剧情 / Encounter 临时来源

```text
Story / Encounter Battle definition
+
Character / Battle profile
↓
Battle Actor
```

临时敌人不需要 contract / Card。Battle 结束以后，Runtime actor 直接丢弃；World 只提交明确需要长期存在的业务后果。

因此：

```text
NPC Instance != Character != Relationship != Card != Battle Actor
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
│  └─ Battle Profile
│     └─ Skill
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
├─ Battle Actor
├─ Dialogue working state
├─ Story Resolver working set
└─ Renderer / animation state
```

# Builder 检查边界

Builder 应检查：

- Character / NPC / Visual / Event / Map / Dialogue / Skill 等静态引用不存在；
- Event/state / Dialogue identity 重复；
- Dialogue Choice target 不存在；
- 持久 Character speaker 不存在；
- Character Battle profile 引用了不存在的 Skill / resource；
- 同一实例集合 `instanceId` 重复；
- placement 非法；
- Story Index 与源 Content 不一致。

Builder 不应因为以下情况失败：

```text
多个 NPC Definition 使用同一个 Visual
同一个 Character 使用多个 NPC Definition
同一个 Character 出现多个 NPC Instance
同一个 Character 在同一 Map 出现多个 NPC Instance
同一个 npcId 被多个 NPC Instance 使用
Dialogue 之间形成 cycle
同一个 Character 被多个不同方向的 Relationship / contract 引用
```

# 当前继续设计的问题

- Character / NPC / Visual 的精确 Content schema / namespace；
- Event 的完整触发 / 顺序 / 冲突规则；
- Dialogue 的 outcome/result、condition、本地化与 presentation metadata；
- Relationship 的最终 Realm State key / shape；
- Card 的最终 key / 是否需要独立 `cardId`；
- **非随身契约从者的 Integrity / Progression 长期 owner；**
- **Skill Content shape、参数、执行规则、学习 / 成长；**
- Encounter re-entry / persistence；
- Guidance、训练和多卡编队；
- NPC patrol / chase / 独立移动。