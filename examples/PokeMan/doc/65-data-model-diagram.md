# 数据模型图

> 当前技术数据模型的可视化总览。只画已经确认到当前阶段的职责边界；带“未冻结”的部分不在图里假装成最终 schema。

## UML 总览

```mermaid
classDiagram
    direction LR

    class CharacterDefinition {
      <<Content>>
      id
      name
      description
      fixedAICharacterText
      tags
      defaultSceneInstances[]
      battleActorRef
    }

    class BattleActorContent {
      <<@loomrealm-game/battle Content>>
      id
      name
      characterGraphicsRef
      max_hp
      skills[]
    }

    class BattleSkill {
      <<@loomrealm-game/battle Content>>
      id
      name
      range
      damage
      windup_ticks
      recovery_ticks
      effect
    }

    class Relationship {
      <<RealmState>>
      fromCharacterId
      toCharacterId
      affinity
      hostile
      dynamicRelationshipText
      contract?
    }

    class Contract {
      <<Relationship nested state>>
      integrity
      skills[]
    }

    class Card {
      <<RealmState current-carried fact>>
      holderCharacterId
      servantCharacterId
      slot
    }

    class NPCDefinition {
      <<Content>>
      npcId
      name
      sprite
    }

    class NPCInstance {
      <<Runtime>>
      instanceId
      npcId
      characterId?
      mapId
      x
      y
      direction
      pattern?
    }

    class DialogueDefinition {
      <<Content>>
      id
      speakerName?
      lines[]
      choices[]?
      mutationRef?
    }

    class EventDefinition {
      <<Content>>
      id
      states[]
    }

    class EventStateMutation {
      <<Content>>
      from: eventId->stateId|null
      to: eventId->stateId|null
    }

    class EventStateList {
      <<RealmState one Record>>
      entries[]
      entry.eventId
      entry.stateId
    }

    class EncounterDefinition {
      <<Content>>
      spawnPoints
      templates
      battleActorRefs
    }

    class BattleRuntimeActor {
      <<@loomrealm-game/battle Runtime>>
      hp
      maxHp
      tile
      direction
      resolvedSkills
      decisionState
    }

    CharacterDefinition --> BattleActorContent : stable battleActorRef
    BattleActorContent --> BattleSkill : skills[] definitions

    CharacterDefinition "1" <-- "0..*" Relationship : from/to
    Relationship *-- Contract : optional

    Contract --> BattleSkill : current contract skills[]
    Relationship --> Card : established contract may be carried
    CharacterDefinition "1" <-- "0..*" Card : holder/servant refs

    NPCInstance --> NPCDefinition : npcId
    NPCInstance --> CharacterDefinition : optional characterId
    CharacterDefinition --> BattleActorContent : persistent NPC base actor

    CharacterDefinition --> DialogueDefinition : optional Line.speaker refs
    DialogueDefinition --> EventStateMutation : optional mutation ref

    EventStateList --> EventDefinition : current non-null entries
    EventStateMutation --> EventStateList : validate / replace list

    EncounterDefinition --> NPCInstance : generates transient instances
    EncounterDefinition --> BattleActorContent : transient base actor source

    BattleActorContent --> Contract : initializes max_hp / skills[]
    Card --> BattleRuntimeActor : selects carried contract
    Contract --> BattleRuntimeActor : integrity / skills[]
    BattleActorContent --> BattleRuntimeActor : stable/base actor definition
```

Card、Relationship / Contract、Character Content 都是平级数据来源。Card 引用 Character / Contract，但不是 Character Content 的子对象。

## NPC Instance → BattleActor → Contract / Battle 链路

```mermaid
flowchart LR
    PC[Persistent NPC Instance] --> CH[Character]
    CH --> BA[stable BattleActor Content]

    TE[Transient Encounter / Story NPC Instance] --> SRC[Encounter / Story static source]
    SRC --> BA2[base BattleActor Content]

    BA --> DIRECT[本体 Battle Runtime Actor]
    BA2 --> DIRECT2[transient Battle Runtime Actor]

    BA --> INIT[建立新 Contract]
    INIT --> CT[Relationship.contract<br/>integrity = max_hp<br/>skills[] = copy skills[]]

    CT --> CARD[Current Card<br/>holder / servant / slot]
    CARD --> BR[Battle Runtime Actor]
    CT --> BR
    BA --> BR

    BR --> OUT[Battle 结束]
    OUT --> CT2[Integrity 写回 contract.integrity]
```

当前规则：

```text
Persistent NPC Instance
→ Character.battleActorRef
→ stable BattleActor

Transient NPC Instance
→ Encounter / Story battleActorRef
→ base BattleActor

NPC Instance
≠ BattleActor variant owner
```

MVP 不允许同一个持久 Character 因为不同 NPC Instance 而切换成不同 BattleActor identity。

建立 Contract：

```text
contract.integrity = BattleActor.max_hp
contract.skills[] = copy(BattleActor.skills[])
Contract Integrity max = BattleActor.max_hp
```

Contract 不保存额外 `maxIntegrity`；基础 BattleActor 继续是稳定 max / actor definition 来源。

Relationship / Contract：

```text
Relationship
= 有向长期关系
= 可以存在而 contract 为空

Relationship.contract
= 正式契约成立
= MVP: integrity + skills[]
```

Card：

```text
Card
= 当前是否随身 + slot
= MVP 没有独立 cardId / Card identity
```

MVP 不设计：

```text
NPC Instance resolvedBattleData
BattleActor variant per NPC Instance
progression
training state
learnedSkillIds
baseSkills + learnedSkills merge
experience / skill points / skill tree
```

未来真的加入技能学习时，再扩展 Contract 的业务规则。

## EventStateList：一个 Realm State Record

```mermaid
flowchart LR
    I[Game Entry initial Realm State] --> L[EventStateList Record]
    L --> A[event A = state-2]
    L --> C[event C = state-1]
    B[event B] -. no entry = null .-> L
    D[event D] -. no entry = null .-> L
```

```text
有 entry
→ current state = entry.stateId

无 entry
→ current state = null

null → stateId
→ 新增 entry

stateId → stateId
→ 修改 entry

stateId → null
→ 删除 entry
```

EventStateList 的最终 Realm State namespace / key 名字仍未冻结，但“一张列表 Record”已经冻结。

## Event State / Dialogue / Mutation

```mermaid
flowchart LR
    ES[Active Event State] --> NPC[scene directive]
    NPC --> D[entry Dialogue]
    D --> DS[PokeMan Dialogue Subsystem]
    DS --> CH{choices?}
    CH -->|有| NEXT[target Dialogue]
    NEXT --> DS
    CH -->|无| M{mutation?}
    M -->|无| DONE[complete]
    M -->|有| MUT[EventStateMutation]
    MUT --> READ[read EventStateList + version]
    READ --> CHECK[validate all from]
    CHECK --> BUILD[build new list]
    BUILD --> COMMIT[one record replacement]
    COMMIT --> DONE
```

`choices` 与 `mutation` 互斥。EventStateMutation 只改变 Event current state，不修改 Relationship / Contract / Card / Battle 等其他 State。

如果同一次 Dialogue 业务还建立 Contract：

```mermaid
flowchart LR
    D[terminal Dialogue] --> M[Dialogue.mutation]
    M --> ES[update EventStateList only]
    D --> B[PokeMan business Runtime]
    B --> C[create Relationship.contract]
    C --> BA[resolve target NPC base BattleActor]
```

这两条路径属于同一个业务流程，但不是同一个数据 mutation DSL。

## Dialogue speaker 解析

```mermaid
flowchart TB
    L[Dialogue Line] --> S{Line.speaker?}
    S -->|有| C[按 Character identity 解析]
    S -->|无| D{Dialogue.speakerName?}
    D -->|有| N[使用默认显示名]
    D -->|无| R[旁白]
```

```text
Line.speaker
= 持久 Character identity

Dialogue.speakerName
= transient / non-Character speaker 的默认显示名
= presentation fallback
= 不是 Character identity
```

## 非 Dialogue 业务的 Mutation 路径

```mermaid
flowchart LR
    B[Battle / World / Encounter Runtime] --> SE[session-event<br/>发生了什么]
    SE --> G[PokeMan session-level<br/>业务运行时]
    G --> Q{是否推进剧情?}
    Q -->|否| END[不执行 Mutation]
    Q -->|是| M[选择 EventStateMutation]
    M --> C[更新 EventStateList]
```

Battle / Map / Encounter Content 不保存剧情 `mutationRef`；`session-event` 也不需要携带 Mutation identity。

## Character default fallback / Event takeover

```mermaid
flowchart TB
    E[所有 active Event State] --> Q{是否有 scene directive<br/>characterId = X?}
    Q -->|否| DEF[使用 Character X defaults]
    Q -->|是| TAKE[default 全部退出]
    TAKE --> P[合并 Event placements]
    TAKE --> A[absent 不贡献 placement]
    P --> FINAL[最终 scene]
    A --> FINAL
```

```text
没有 active Event 提到 Character X
→ 才使用 Character default

任一 active Event 提到 Character X
→ default 完全不参与
→ 只看 Event scene directives

absent
= 本 Event 提到 Character，但本 Event 不提供 placement
= 不压制 peer Event placement
```

## NPC / Event / Map 唯一性

```mermaid
flowchart LR
    L[EventStateList] --> R[Story Resolver]
    CC[Character defaults<br/>unmentioned only] --> R
    EN[Encounter Runtime sources] --> R
    R --> V{validate final Map}
    V -->|mapId 内 npcId 唯一| OK[NPCPlacement[]]
    V -->|重复| ERR[deterministic conflict]
```

不同 Event 可以引用同一个 NPC / Character；最终每张 Map 内要求 `(mapId,npcId)` 唯一。

## Encounter persistence 边界

```text
重新进图是否重新 roll
已击败对象是否继续消失
生成结果何时清理
是否跨 Session 保留
```

这些属于 Runtime / gameplay behavior policy，不属于当前数据物理结构缺口。

当前不预设：

```text
EncounterGeneratedState
generatedInstances[]
defeatedIds[]
spawn snapshot
seed Record
```

只有未来 Runtime policy 确实要求某些事实跨边界持续时，才根据最小需求增加 Realm State。

## 当前最重要的边界

```text
Character
= 持久 identity
= stable BattleActor source

NPC Instance
= 这次世界中的具体出现
= 不拥有 BattleActor variant

Relationship
= 有向长期关系

Relationship.contract
= 可选长期契约状态
= MVP: integrity + skills[]

BattleActor.max_hp / skills[]
= 新 Contract 初始化来源

Card
= 当前随身与 slot
= 无独立 cardId / identity

EventStateList
= 一个 Realm State Record
= 只保存非空 Event state

Dialogue.speakerName
= 默认显示名
= 不是 Character identity

固定 Dialogue Mutation
= Dialogue Content.mutation
→ Dialogue Subsystem 执行
→ 只修改 EventStateList

非 Event-state 业务效果
= 对应 PokeMan business Runtime 处理

非 Dialogue 剧情推进
= session-event
→ session-level 业务运行时选择 Mutation

Encounter re-entry / persistence
= Runtime/gameplay policy
= 当前不预设 State shape
```

## 图中故意没有解决的数据问题

以下仍然留白：

- Relationship / Contract 的最终 Realm State key / JSON shape；
- Card 的最终 Realm State 物理布局与必要唯一约束；不设计独立 `cardId`；
- Character → BattleActor Content 的最终引用编码；
- Encounter / Story transient source → BattleActor Content 的最终引用编码；
- Event / EventStateMutation 的最终 Content namespace / key；
- EventStateList Realm State Record 的最终 namespace / key；
- Event placement / `instanceId` / `absent` 的最终 JSON shape。

以下不再作为 MVP 数据模型缺口：

```text
NPC Instance resolved battle data / BattleActor variant
Contract 默认值来源
Contract Integrity 初始值 / 最大值来源
Card identity / cardId
Encounter re-entry / persistence
progression / training shape
技能成长 / base+learned merge
transient Encounter speaker identity
非 Dialogue Content mutationRef
```

Encounter re-entry / persistence 属于 Runtime/gameplay policy，不应在当前阶段反推一个猜测性的 Encounter State shape。

BattleSkill 本身的静态字段和执行语义直接跟随 `@loomrealm-game/battle` 当前规范。