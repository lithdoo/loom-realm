# 世界数据模型

> 独立技术设计记录。不改写 `../DESIGN.md`。本文把已经讨论确认的 Character、NPC、Visual、Story、Encounter、Relationship、Contract、Card 与 Battle 的数据职责放在同一张图里。精确 JSON schema、Realm State namespace/key 和持久化格式仍可在实现前继续细化。

归宿总表见 [数据落点](./60-data-placement.md)，人物与场景实例细节见 [人物](./61-character.md)，Event 见 [事件](./62-event.md)。

## 目标

这套数据模型优先满足四个方向：

1. **人物身份与地图表现分离。** Character 不是 NPC，NPC 也不要求一定对应持久 Character。
2. **剧情尽量数据驱动。** 剧情规则、Event State、静态 Dialogue 与场景实例定义优先留在 Content，不硬编码进 World，也不把可重算结果重复写进存档。
3. **Realm State 只保留真正动态事实。** Event current state、Relationship、Contract、Card、玩家位置、需要持续存在的随机结果等进入 State；由 Content + State 可重算的场景投影不重复保存。
4. **复用与动态生成都是正常能力。** 多个 NPC 可以共用同一套形象；同一 Character 可以有多个 NPC Instance；Visible Encounter 可以在运行时动态生成 NPC Instance。

## 总体关系

```text
Character
   │
   ├──────────────→ Relationship
   │                    │
   │                    └────────→ Contract
   │                                  │
   │                                  └────────→ Card
   │
   └──── optional link ──→ NPC Instance
                              │
                              └────────→ NPC Definition
                                            │
                                            └────────→ Visual

Event / Story Content
→ 决定当前场景应投影哪些 NPC Instance

Encounter Definition
→ 运行时生成临时 NPC Instance

Character / Card / Encounter
→ 构造 Battle Request
→ Battle Frame
```

这里没有要求这些对象必须物理存成同一个文件或同一种 Record。图只表达职责和引用关系。

## Character：这个人是谁

Character 是持久人物身份。它承载不会因为地图实例多少而复制的人物级静态事实，例如：

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
└─ card profile reference
```

精确字段名还没有冻结，但以下语义已经确定：

- `id` 是人物身份的稳定 key；
- 性格、职业、经历等作者定义的静态资料属于 Content；
- Character 可以提供一段固定 AI 人物描述文本，用自然语言表达性格、说话习惯、背景、价值观等不需要拆成规则字段的信息；
- 固定 AI 人物描述属于 immutable Content，游戏规则不依赖解析这段文本；
- 所有持久角色都准备好形成角色卡和进入 Battle 所需的静态素材与数据；
- 这只是 **Content 完备性规则**，不表示游戏规则当前允许与这个人物建立契约；
- Character 不保存当前 affinity、hostile、动态关系描述、Contract、Card Integrity 等运行中事实。

Character 可以没有默认 Map 实例，也可以有多个默认 Map 实例。

## Visual：长什么样

Visual 是可复用的视觉素材定义。它与 Character identity、NPC Definition 都分开。

概念上可以包含：

```text
VisualDefinition
├─ id
├─ map sprite
├─ portrait
├─ battle sprite / presentation
└─ card art
```

不是每个 Visual 都必须同时提供所有表现面；实际字段由对应消费者需要决定。

允许：

```text
thug-a ─┐
thug-b ─┼→ visual: male-thug-01
thug-c ─┘
```

同一个 Character 也可以在不同剧情场景使用不同 Visual，例如普通服装、节庆服装、伪装等。改变 Visual 不改变 Character identity。

## NPC Definition：地图表现模板

NPC Definition 表示“以什么地图角色模板出现”。它不是人物身份。

当前 `@loomrealm-game/map` 的窄 Content contract 仍然是：

```text
[struct]NPC/<npcId>
├─ name
└─ sprite
```

PokeMan 可以在 Builder/source Content 层使用更方便的 `visualId` 等引用，然后投影成 Map 当前需要的 `struct.NPC`；具体构建格式后续确定。

重要的是：

```text
npcId != characterId
```

二者可以恰好相同，但系统不能依赖这个假设。

同一个 Character 可以对应多个 NPC Definition：

```text
Character rival
├─ NPC Definition rival-normal
├─ NPC Definition rival-festival
└─ NPC Definition rival-disguise
```

多个不同 NPC Definition 也可以引用同一个 Visual。

## NPC Instance：这次具体出现的地图实例

NPC Instance 是 World / Story Resolver 最终要投影到 Map 的场景实例。

概念结构：

```text
NPC Instance
├─ instanceId
├─ npcId
├─ characterId?   // optional
├─ mapId
├─ x
├─ y
├─ direction
└─ pattern?
```

真正传给当前 Map API 的仍然只有：

```text
NPCPlacement
├─ instanceId
├─ npcId
├─ x
├─ y
├─ direction
└─ pattern?
```

`characterId` 是 PokeMan World 侧的业务关联，不要求加入 `@loomrealm-game/map` public API。

### Persistent Character NPC

当 NPC Instance 有 `characterId` 时，它关联一个持久 Character：

```text
instanceId: rival-lab
npcId: rival-normal
characterId: rival
```

与这个实例交互时，World 可以回到 `characterId = rival`，继续读取对应 Relationship、Contract、Character story 等人物级事实。

### Transient NPC

运行时普通 Encounter、路人、普通挑战者等不要求建立持久 Character，可以没有 `characterId`：

```text
instanceId: encounter:route1:17
npcId: thug-male-01
characterId: none
```

这类实例可以有本次 Dialogue / Battle identity，但不会因此自动进入长期 Relationship / Contract / Card 模型。

## Character 与 NPC Instance 的多重性

Character identity 是唯一的，但 Map 表现实例不要求唯一：

```text
Character rival
├─ rival-lab-a
├─ rival-lab-b
└─ rival-town
```

允许同一个 Character：

- 出现在多个地图；
- 在同一地图拥有多个 NPC Instance；
- 不同 Instance 使用不同 `npcId` / Visual；
- 多个 Instance 继续共享同一个 Character identity、Relationship、Contract 与人物剧情事实。

因此 Builder **不能**因为同一个 `characterId` 或 `npcId` 重复出现就构建失败。

真正需要稳定唯一的是候选 NPC Instance 的 `instanceId`。如果当前剧情解析后出现两个互相冲突的相同 `instanceId`，Story Resolver 应确定性报错/处理，而不能随机保留一个；多个 Event 的顺序与冲突规则仍在 Event 设计中继续讨论。

## Event / Story：定义场景应该是什么样

Event 是 Content。Realm State 只保存这一局当前处于哪个 Event State，以及其他不能从 Content 重建的玩家选择或业务事实。

概念上：

```text
EventDefinition
├─ id
└─ states
   └─ [stateId]
      ├─ static dialogue
      ├─ character / NPC instance definitions
      └─ other story definitions
```

Event State 可以声明一个 Character 当前产生 0..N 个 NPC Instance。

Realm State 只需要类似：

```text
event/professor-intro = "after-contract"
```

World / Story Resolver 再用这个 `stateId` 去读取对应 Content，并算出当前 Map 的场景投影。

当前仍保留已有的三层解析方向：

```text
必要的 Realm State 临时剧情覆盖
→ Event current state 对应的场景定义
→ Character Content 默认场景实例
→ 没有实例
```

“多个 Event 如何排序、最后一条如何确定、冲突如何处理”继续留在 Event 设计中，不在本文提前锁死。

## Story Index：Builder 生成的派生 Content

Runtime 不应扫描全部 Event。Builder 根据作者维护的 Character / Event / Map 等源 Content 生成查询索引：

```text
Story Index
├─ by Map
├─ by Character
└─ by Event
```

它只是 Content projection：

- 可以重新构建；
- 不是真相的第二份 authority；
- 不进入 Realm State；
- 不进入 Save；
- 作者不需要手工维护多份索引。

Map Enter 的概念流程：

```text
Map Enter
→ 读取 by-Map Story Index
→ 找到相关 Event / Character 定义
→ 读取 Event currentStateId
→ Story Resolver 读取对应 Content
→ 得到当前 Map 的 story NPC Instance[]
```

## Encounter：动态生成 NPC Instance

Visible Encounter 是另一条 NPC Instance 来源。

Content 至少需要表达：

```text
Encounter Content
├─ map encounter table
├─ spawn points
└─ encounter templates
   ├─ npc definition reference
   ├─ type / behavior category
   ├─ optional dialogue reference
   └─ optional battle profile reference
```

Map Enter 时：

```text
Encounter Content
→ roll / choose templates
→ choose legal spawn points
→ generate transient NPC Instance[]
```

通常动态新增的是 **NPC Instance**，不是新的 Character，也不是运行时修改 Content。

如果某次随机生成结果需要在离开 / 读档后继续存在，则保存“本次已经生成的 Encounter 实例/结果”这一动态事实；如果产品规则以后决定重新进图直接重 roll，则可以不把对应结果做长期持久化。具体 re-entry 规则仍未冻结。

最终 Map NPC 集合可以由不同来源合成：

```text
Story Resolver NPC Instance[]
+
Encounter generated NPC Instance[]
+
必要的 runtime override NPC Instance[]
↓
validate instanceId / placement
↓
NPCPlacement[]
↓
@loomrealm-game/map
```

## Relationship：变化的“我怎么看你”

Relationship 是 Realm State 中的人与人关系事实，不属于 Character，也不属于 Card。

Relationship 采用有方向语义：

```text
A → B
= A 当前怎么看待 / 对待 B
```

因此 `A → B` 与 `B → A` 是两份不同的 Relationship，不要求对称。

当前确认的最小语义：

```text
Relationship
├─ directed participant identities
├─ affinity
├─ hostile
└─ dynamic relationship text
```

`affinity` 与 `hostile` 独立，不使用 `affinity < 0` 推导 hostile。

动态关系描述文本是一段自然语言，用于表达这一局里 A 对 B 当前形成的关系语境。它属于 Realm State，并随存档恢复。游戏规则仍读取结构化的 affinity / hostile 等事实，不依赖解析这段文本；这段文本主要供 AI 自由对话理解当前关系。

初始 Relationship 可以由 Game Entry `state.records` baseline 安装。最终 Realm State Record 的精确 key / shape 后续再冻结。

## Contract：正式关系已经成立

Contract 表示一段正式主公 / 从者关系已经成立。主公和从者是关系位置，不是 Character 永久类别。

概念关系：

```text
Contract
├─ contractId
├─ holderCharacterId
├─ representedCharacterId
└─ relationship reference
```

精确字段后续冻结，但 Contract 必须能表达同一个 Character 与多个 holder 分别拥有独立 Contract。

当前不设计 Contract ending。

## Card：这段 Contract 的持有与 Battle 运行状态

Card 是 Contract 产生的可持有媒介，不是 Character 副本。

概念上至少需要表达：

```text
Card
├─ cardId
├─ contract reference
├─ representedCharacterId
├─ holderCharacterId
├─ Card Integrity
└─ carried / managed state
```

Card Integrity 是 Battle Manifestation 的持久运行状态。Relationship affinity / hostile / dynamic relationship text 仍属于 Relationship，不应复制到 Card。

训练/成长的精确归属仍未最终冻结，不在这里声明成独立 card level。

## Card 自由对话：组合已有上下文

Card 模式的 AI 自由对话不新增一套独立的人格或关系 authority。

概念上：

```text
Character Content
固定人物资料 + 固定 AI 人物描述

+

Relationship State
说话者 → 对方
affinity + hostile + 动态关系描述

+

必要的当前剧情 / Contract / Card context

↓

LLM 自由对话
```

例如 represented Character 是宿敌、对话对象是玩家时，AI 读取宿敌 Character 的固定人物信息，并读取 `rival → player` 的 Relationship，而不是把人格和关系复制进 Card。

LLM 当次生成内容默认只是一次对话输出，不会因为说出某句话就自动成为 Character Content、Relationship State 或其他 Realm State。是否根据一次对话更新动态关系描述或其他业务事实，由游戏逻辑明确提交。

当前不单独定义 Conversation Memory 数据对象；只有实际玩法证明 Relationship 的动态文本不足时，再增加新的长期数据模型。

## Battle：不要直接把 NPC 当 Battle Actor

NPC 是地图表现；Battle Actor 是 Battle Frame 的战斗输入。二者不能直接等同。

常见来源：

```text
Persistent Character body
→ Character + Battle static profile
→ Battle Actor

Card Battle Manifestation
→ Character + Relationship + Card state + Battle static profile
→ Battle Actor

Transient Encounter NPC
→ Encounter template + Battle static profile
→ Battle Actor
```

因此：

```text
NPC Instance != Character != Card != Battle Actor
```

Battle Simulation 仍然只拥有本场模拟权威；World 在 Battle 完成后解释结果，并把 Card Integrity、剧情或关系等已确认业务后果提交回 Realm State。

## 数据归宿汇总

```text
Content
├─ Character definitions
│  └─ fixed AI character text
├─ Character Battle / Card static profiles
├─ Visual definitions/resources
├─ NPC definitions
├─ Event / Event State
├─ Dialogue definitions
├─ Story Index (generated)
├─ Encounter tables/templates/spawn points
├─ Battle rules / skills / scenarios
└─ Map content

Realm State
├─ current map / player position
├─ Event current state
├─ player choices / story facts that cannot be recomputed
├─ directed Relationship
│  ├─ affinity
│  ├─ hostile
│  └─ dynamic relationship text
├─ Contract
├─ Card / Card Integrity / carried-managed state
├─ Encounter generated results that must persist
└─ other committed mutable business facts

Frame / Runtime local
├─ current Dialogue node
├─ current AI free-dialogue working context
├─ current Battle simulation
├─ current Message/System Menu interaction
├─ Story Resolver working set
├─ movement / animation working state
└─ non-persistent generated/intermediate data
```

## Builder 检查边界

Builder 应当检查可以静态确定的内容错误，例如：

- Character / NPC / Visual / Event / Map 等引用不存在；
- Event/state identity 重复；
- 同一候选实例集合中的 `instanceId` 重复；
- placement 坐标、方向或字段非法；
- Story Index 与源 Content 不一致；
- 生成 Map `struct.NPC` 所需资源缺失。

Builder 不应因为以下情况失败：

```text
多个 NPC Definition 使用同一个 Visual
同一个 Character 使用多个 NPC Definition
同一个 Character 出现多个 NPC Instance
同一个 Character 在同一 Map 出现多个 NPC Instance
同一个 npcId 被多个 NPC Instance 使用
```

这些都是正常的 Content / 场景表达能力。

## 当前不在本文冻结的内容

以下问题继续留给后续设计：

- Character / NPC / Visual 的精确 JSON schema 与 Content namespace/key；
- Event 的精确剧情顺序表示和多个 Event 冲突规则；
- Relationship 的最终 Realm State Record key / shape，以及动态关系文本具体如何由业务更新；
- Contract / Card 的最终 Realm State Record shape；
- Encounter re-entry 是否重 roll、哪些生成实例必须持久化；
- 训练、成长、Guidance 的精确数据模型；
- NPC 独立移动 / patrol / chase 等 Map 能力。
