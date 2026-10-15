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
      battleProfileRef
    }

    class BattleProfile {
      <<Content>>
      baseStats
      skills[]
      presentationResources
    }

    class SkillDefinition {
      <<Content>>
      shape_not_frozen
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
      <<Runtime / Projection>>
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
      <<Realm State>>
      fromCharacterId
      toCharacterId
      affinity
      hostile
      dynamicRelationshipText
      contract?
    }

    class Card {
      <<Realm State: current carried only>>
      holderCharacterId
      servantCharacterId
      slot
      integrity
    }

    class BattleActor {
      <<Battle Runtime>>
      currentHp
      maxHp
      currentStats
      resolvedSkills
      cooldownStatus
      buffDebuff
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
      <<Realm State>>
      eventId
      currentStateId
    }

    class EncounterDefinition {
      <<Content>>
      spawnPoints
      templates
      battleProfileRefs
    }

    class EncounterGeneratedState {
      <<Realm State when persistence is needed>>
      generatedInstances
    }

    class StoryIndex {
      <<Generated Content>>
      byMap
      byCharacter
      byEvent
    }

    CharacterDefinition --> BattleProfile : has / references
    BattleProfile --> SkillDefinition : uses

    NPCDefinition --> VisualDefinition : presentation
    NPCInstance --> NPCDefinition : npcId
    NPCInstance --> CharacterDefinition : characterId (optional)

    CharacterDefinition "1" <-- "0..*" Relationship : from
    CharacterDefinition "1" <-- "0..*" Relationship : to

    Relationship "contract=true" --> Card : may enter carried loadout
    CharacterDefinition "1" <-- "0..*" Card : holder
    CharacterDefinition "1" <-- "0..*" Card : servant

    CharacterDefinition --> DialogueDefinition : speaker refs
    DialogueDefinition "1" *-- "0..*" DialogueChoice : terminal choices
    DialogueChoice --> DialogueDefinition : target

    EventDefinition "1" *-- "1..*" EventState : states
    EventCurrentState --> EventDefinition : eventId
    EventState --> DialogueDefinition : references
    EventState --> NPCInstance : defines projection

    EncounterDefinition --> NPCInstance : generates
    EncounterDefinition --> BattleProfile : temporary opponent profile
    EncounterGeneratedState --> NPCInstance : persists generated result

    StoryIndex --> EventDefinition : indexes
    StoryIndex --> CharacterDefinition : indexes

    Card --> BattleActor : contributes carried card state
    BattleProfile --> BattleActor : contributes static battle data
    EncounterDefinition --> BattleActor : can construct temporary actor
```

## Relationship / Card / Battle 的关键链路

```mermaid
flowchart LR
    A[Character A] --> R[Relationship A → B]
    B[Character B] --> R

    R -->|contract = false| N[没有正式契约]
    R -->|contract = true| C{B 当前是否随 A 携带?}

    C -->|否| NC[没有当前 Card 对象]
    C -->|是| CARD[Card\nholder=A\nservant=B\nslot\nintegrity]

    B --> BP[Character B Battle Profile\nbase stats + skills]
    CARD --> BA[Battle Actor]
    BP --> BA

    BA --> BR[Battle Runtime\ncurrentHp / cooldown\nbuff / debuff / Decision]

    S[Story / Encounter Battle Definition] --> TBA[Temporary Battle Actor]
    BP --> TBA
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

Battle Actor
= 本场临时战斗实体
= HP / cooldown / Buff / Debuff / Decision
```

因此：

```text
contract exists
≠ Card 一定存在

Card exists
=> 对应 contract 已成立，并且当前进入随身编队

Battle Actor exists
≠ 必须来自 Card
```

剧情 / Encounter 可以直接构造临时 Battle Actor，不需要伪造 Relationship 或 Card。

## 图中故意没有解决的问题

以下仍然留白：

- Card 是否需要独立 `cardId`；
- 从者有 contract 但不随身时，Integrity / Progression 长期状态最终由谁拥有；
- Skill 的最终字段、执行模型、学习 / 成长方式；
- Event 的完整 flow / trigger；
- Encounter re-entry 与生成结果持久化细节。

这些问题继续设计后再补图。