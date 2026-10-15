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

    class VisualDefinition {
      <<Content>>
      id
      mapSprite
      portrait
      battlePresentation
      cardArt
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

    class Relationship {
      <<RealmState>>
      fromCharacterId
      toCharacterId
      affinity
      hostile
      dynamicRelationshipText
      contract?
    }

    class Card {
      <<RealmState>>
      currentCarriedOnly
      holderCharacterId
      servantCharacterId
      slot
      integrity
    }

    class BattleRuntimeActor {
      <<@loomrealm-game/battle Runtime>>
      actorId
      team
      hp
      maxHp
      tile
      direction
      action
      protectedUntilTickExclusive
      resolvedSkills
      decisionState
    }

    class DialogueDefinition {
      <<Content>>
      id
      lines[]
      terminalChoices[]
    }

    class DialogueChoice {
      <<Content>>
      text
      targetDialogueId
    }

    class EventDefinition {
      <<Content>>
      id
      states[]
    }

    class EventState {
      <<Content>>
      stateId
      dialogueRefs[]
      npcInstanceDefs[]
    }

    class EventCurrentState {
      <<RealmState>>
      eventId
      currentStateId
    }

    class EncounterDefinition {
      <<Content>>
      spawnPoints
      templates
      battleActorRefs
    }

    class EncounterGeneratedState {
      <<RealmState>>
      persistenceOnlyWhenNeeded
      generatedInstances
    }

    class StoryIndex {
      <<GeneratedContent>>
      byMap
      byCharacter
      byEvent
    }

    CharacterDefinition --> BattleActorContent : battle actor ref
    BattleActorContent --> BattleSkill : skills[]

    NPCDefinition --> VisualDefinition : presentation
    NPCInstance --> NPCDefinition : npcId
    NPCInstance --> CharacterDefinition : optional characterId

    CharacterDefinition "1" <-- "0..*" Relationship : from
    CharacterDefinition "1" <-- "0..*" Relationship : to

    Relationship --> Card : contract + currently carried
    CharacterDefinition "1" <-- "0..*" Card : holder
    CharacterDefinition "1" <-- "0..*" Card : servant

    CharacterDefinition --> DialogueDefinition : speaker refs
    DialogueDefinition "1" *-- "0..*" DialogueChoice : terminal choices
    DialogueChoice --> DialogueDefinition : target

    EventDefinition "1" *-- "1..*" EventState : states
    EventCurrentState --> EventDefinition : eventId
    EventState --> DialogueDefinition : references
    EventState --> NPCInstance : defines source projection

    EncounterDefinition --> NPCInstance : generates
    EncounterDefinition --> BattleActorContent : temporary opponent actor
    EncounterGeneratedState --> NPCInstance : persists generated result

    StoryIndex --> EventDefinition : indexes
    StoryIndex --> CharacterDefinition : indexes

    Card --> BattleRuntimeActor : carried card state
    BattleActorContent --> BattleRuntimeActor : static battle definition
    EncounterDefinition --> BattleRuntimeActor : temporary actor source
```

## NPC / Event / Map 唯一性

```mermaid
flowchart LR
    EA[Event A current state] --> R[Story Resolver]
    EB[Event B current state] --> R
    CC[Character defaults] --> R
    EN[Encounter generated NPCs] --> R

    R --> V{validate final Map}
    V -->|每个 mapId 内 npcId 唯一| OK[NPCPlacement[]]
    V -->|同一 mapId 重复 npcId| ERR[deterministic conflict]
```

当前规则：

```text
Source Content
- 不同 Event 可以引用同一个 npcId
- 同一个 Event state 可以让同一个 npcId 出现在多个不同 Map

Final resolved Map
- (mapId, npcId) 必须唯一
```

`instanceId` 继续满足 `@loomrealm-game/map` 的实例 contract，但不能用不同 `instanceId` 绕过 PokeMan 的同图 `npcId` 唯一约束。

## Character / BattleSkill 链路

```mermaid
flowchart LR
    C[Character Content] --> BA[BattleActor Content<br/>@loomrealm-game/battle]
    BA --> S1[BattleSkill firebolt]
    BA --> S2[BattleSkill grab]

    S1 --> F1[id / name]
    S1 --> F2[range / damage]
    S1 --> F3[windup_ticks / recovery_ticks]
    S1 --> F4[effect]
```

PokeMan 不再增加一层 `PokeManSkill`。BattleSkill 的 shape 和战斗语义由 `@loomrealm-game/battle` 维护；Character 只负责稳定关联 BattleActor Content。

## Relationship / Card / Battle 的关键链路

```mermaid
flowchart LR
    A[Character A] --> R[Relationship A → B]
    B[Character B] --> R

    R -->|contract = false| N[没有正式契约]
    R -->|contract = true| C{B 当前是否随 A 携带?}

    C -->|否| NC[没有当前 Card 对象]
    C -->|是| CARD[Card<br/>holder=A<br/>servant=B<br/>slot<br/>integrity]

    B --> BAC[BattleActor Content<br/>max_hp + skills[]]
    BAC --> SK[BattleSkill Content]
    CARD --> BRA[Battle Runtime Actor]
    BAC --> BRA

    BRA --> BR[Battle Simulation<br/>hp / tile / direction<br/>action / protection / Decision]

    S[Story / Encounter Battle Source] --> TBA[Temporary Battle Runtime Actor]
    BAC --> TBA
    TBA --> BR
```

## 当前最重要的边界

```text
Relationship
= 长期人与人关系
= affinity / hostile / dynamic text / contract

Card
= 当前随身 Card
= holder / servant / slot / 当前 Card battle-facing state

BattleActor / BattleSkill Content
= @loomrealm-game/battle 的静态战斗定义

Battle Runtime Actor
= @loomrealm-game/battle 本场 Simulation actor
```

因此：

```text
contract exists
≠ Card 一定存在

Card exists
=> 对应 contract 已成立，并且当前进入随身编队

Battle Runtime Actor exists
≠ 必须来自 Card

PokeMan Skill
= 不单独存在
= 直接使用 BattleSkill
```

剧情 / Encounter 可以直接构造临时 Battle Runtime Actor，不需要伪造 Relationship 或 Card。

## 图中故意没有解决的问题

以下仍然留白：

- Card 是否需要独立 `cardId`；
- 从者有 contract 但不随身时，Integrity / Progression 长期状态最终由谁拥有；
- Character → BattleActor Content 的最终引用编码；
- 技能学习 / 成长如何改变某个角色长期可用的 `skills[]`；
- Event currentState 的推进触发；
- 跨 Event 的同一 `(mapId, npcId)` 冲突未来是否需要显式 override；
- `absent` 与其他 Event 出现定义同时命中时的解析；
- Encounter re-entry 与生成结果持久化细节。

BattleSkill 本身的静态字段和执行语义不再作为 PokeMan 自己的未决 schema；它直接跟随 `@loomrealm-game/battle` 当前规范。