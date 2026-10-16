# Realm State Record 设计

> 独立技术设计记录。不改写 `../DESIGN.md`。本文冻结 PokeMan MVP 核心 Realm State 的物理 Record 粒度、namespace/key 编码、value shape 与数据约束。Content FSDB 物理结构见 [Content FSDB 物理模型](./68-content-fsdb.md)。本文只讨论数据结构，不讨论谁提交、何时提交、事务、冲突或失败处理。

# Authority 前提

Realm State 记录的是 session-level shared mutable business facts。

需要特别区分：

```text
live player map / x / y / direction / motion
→ Map Runtime authority

durable resume/checkpoint location
→ Realm State pokeman.PlayerWorld/current
```

`pokeman.PlayerWorld/current` **不是第二份 live player pose authority**。它只表示产品 Save / Load / checkpoint workflow 需要的恢复位置；Runtime 可以在明确的 save/checkpoint 时机把 Map Runtime 当前位置提交为新的 resume point。

# 总体结构

MVP 核心 Realm State 固定为四类 Record：

| 业务事实 | namespace | key | value |
| --- | --- | --- | --- |
| durable world resume/checkpoint | `pokeman.PlayerWorld` | `current` | `{ mapId, x, y, direction }` |
| Event current state | `pokeman.EventStateList` | `current` | `[{ eventId, stateId }]` |
| 有向 Relationship / Contract | `pokeman.Relationship` | `<fromCharacterId>:<toCharacterId>` | `{ affinity, hostile, relationshipText, contract? }` |
| 当前随身 Card 编队 | `pokeman.CarriedCards` | `<holderCharacterId>` | `[{ slot, servantCharacterId }]` |

不建立一个巨大的全局 `GameState` Record，也不为每张 Card 建立独立 Record。

# ID 与 key 编码

Realm State v1 的 Record key 禁止包含 `/`，并限制 UTF-8 编码长度不超过 256 bytes。因此 Relationship 不能使用 `<from>/<to>` 编码。

会直接进入 Relationship / CarriedCards Record key 的 Character business id 固定为 ASCII token：

```text
[a-z0-9][a-z0-9._-]{0,119}
```

也就是 1–120 个 ASCII 字符。`:` 不属于合法 Character id 字符，因此可以作为 Relationship 复合 identity 的无歧义分隔符。

Relationship key 固定编码为：

```text
<fromCharacterId>:<toCharacterId>
```

最大长度：

```text
120 + 1 + 120 = 241 bytes
```

因此稳定落在 Realm State v1 的 256-byte key 上限内。

例如：

```text
namespace = pokeman.Relationship
key       = player:rival
```

表示：

```text
Relationship(player → rival)
```

`player:rival` 与 `rival:player` 是两个不同 key。

`pokeman.CarriedCards/<holderCharacterId>` 直接使用同一 Character business id，因此也天然满足 Realm State key 长度限制。

Content FSDB record key 作为 Character identity 并进入这些 Realm State key 时，必须满足上述 Character business id 约束。Event id 不参与 Relationship / CarriedCards key 编码，继续按其 Content identity 规则处理。

# PlayerWorld Record

## Record identity

```text
namespace = pokeman.PlayerWorld
key       = current
```

## 业务含义

它表示：

> **如果现在从已提交的 durable world checkpoint 恢复游戏，应从哪里重新创建 Map Runtime。**

它不表示 Map Runtime 当前每一帧 / 每一步的 live player pose。

## Value

```json
{
  "mapId": 1,
  "x": 12,
  "y": 8,
  "direction": 2
}
```

最终字段：

```text
PlayerWorldValue
├─ mapId: positive safe integer
├─ x: non-negative safe integer
├─ y: non-negative safe integer
└─ direction: 2 | 4 | 6 | 8
```

`mapId` 与 `@loomrealm-game/map` 使用同一业务 identity：正 safe integer。Content 中 Event / Character defaultScenes / Encounter 等因为 JSON object key 或 FSDB key 必须是字符串，会使用其十进制字符串形式；Realm State value 直接保存整数。

该 Record 不保存：

```text
playerCharacterId
npcId
instanceId
motion
scene epoch
Character name / sprite / static data
```

## Runtime 关系

```text
Load / New Session
→ read pokeman.PlayerWorld/current
→ create / enter Map Runtime at checkpoint

live movement
→ Map Runtime only

explicit save/checkpoint
→ project current Map Runtime location
→ replace pokeman.PlayerWorld/current
```

具体何时 checkpoint、失败怎么处理属于 Runtime / Save workflow，不由本数据 shape 决定。

# EventStateList Record

## Record identity

```text
namespace = pokeman.EventStateList
key       = current
```

## Value

value 直接是稀疏数组：

```json
[
  {
    "eventId": "professor-intro",
    "stateId": "waiting"
  },
  {
    "eventId": "tutorial-battle",
    "stateId": "ready"
  }
]
```

最终结构：

```text
EventStateListValue
= EventStateEntry[]

EventStateEntry
├─ eventId: string
└─ stateId: string
```

数据约束：

- `eventId` 非空且在列表内唯一；
- `stateId` 非空；
- `eventId` 必须对应存在的 `struct.Event` key；
- `stateId` 必须存在于对应 Event Content；
- 不保存 `stateId:null`；
- 空状态使用 `[]`。

业务读取：

```text
存在 eventId entry
→ current state = entry.stateId

不存在 eventId entry
→ current state = null
```

因此 `null` 只是 Event current state 的逻辑语义，不进入物理 entry。

# Relationship Record

## Record identity

每条有向 Relationship 使用一条独立 Realm State Record：

```text
namespace = pokeman.Relationship
key       = <fromCharacterId>:<toCharacterId>
```

例如：

```text
pokeman.Relationship / player:rival
pokeman.Relationship / rival:player
pokeman.Relationship / lord-b:rival
```

因为 from / to 已经属于 Record key，value 不重复保存它们。

## Value

没有 Contract：

```json
{
  "affinity": 10,
  "hostile": false,
  "relationshipText": "认识不久，但已经开始互相信任。"
}
```

有 Contract：

```json
{
  "affinity": 20,
  "hostile": false,
  "relationshipText": "一起经历了研究所的第一次战斗。",
  "contract": {
    "integrity": 10,
    "skills": [
      "firebolt",
      "grab"
    ]
  }
}
```

最终结构：

```text
RelationshipValue
├─ affinity: integer
├─ hostile: boolean
├─ relationshipText: string
└─ contract?: ContractValue

ContractValue
├─ integrity: integer
└─ skills: string[]
```

`relationshipText` 是 dynamic relationship text 的最终字段名。

## 三种物理状态

```text
Relationship Record 不存在
= 没有持久化这段有向关系

Relationship Record 存在
+ contract field absent
= 有长期关系，没有正式契约

Relationship Record 存在
+ contract field present
= 正式主公 / 从者契约成立
```

不增加：

```text
hasRelationship
hasContract
contracted
```

## affinity

```text
affinity: finite integer
```

MVP 不冻结人为数值范围，例如 `-100..100`。

## hostile

```text
hostile: boolean
```

它与 affinity 独立，不由 affinity 正负推导。

## relationshipText

```text
relationshipText: string
```

字段必需，允许空字符串。

# Contract Value

Contract 嵌在 Relationship value 内，不建立独立 Record。

```text
contract
├─ integrity
└─ skills[]
```

## integrity

```text
integrity: integer >= 0
```

不保存 `maxIntegrity`。

最大值与新 Contract 初始值来自稳定基础 BattleActor：

```text
Character
→ Character.battleActor
→ BattleActor.max_hp
```

固定：

```text
new contract.integrity = BattleActor.max_hp
max contract.integrity = BattleActor.max_hp
```

## skills

```text
skills: string[]
```

这里的字符串直接使用现有 `@loomrealm-game/battle` 的 BattleSkill identity：BattleActor authored shape 使用 `skills: string[]`，Simulation / Decision contract 使用 `skillId: string`。因此 PokeMan 不再设计额外的 `BattleSkillRef` 或另一套 skill reference encoding。

结构约束：

- 每个元素是 BattleSkill id；
- 不允许重复；
- 保留数组顺序；
- 空技能集使用 `[]`。

所以 `skills` 是 ordered unique list。

新 Contract 初始化：

```text
contract.skills = copy(BattleActor.skills[])
```

Contract 不保存：

```text
BattleActorRef
maxIntegrity
progression
training
learnedSkillIds
```

# CarriedCards Record

## Record identity

Card 没有独立 identity，不采用“一张 Card 一条 Record”。

当前随身编队按 holder 聚合：

```text
namespace = pokeman.CarriedCards
key       = <holderCharacterId>
```

例如：

```text
pokeman.CarriedCards / player
```

## Value

```json
[
  {
    "slot": 0,
    "servantCharacterId": "rival"
  }
]
```

多个随身位：

```json
[
  {
    "slot": 0,
    "servantCharacterId": "rival"
  },
  {
    "slot": 1,
    "servantCharacterId": "mage"
  }
]
```

最终结构：

```text
CarriedCardsValue
= CarriedCardEntry[]

CarriedCardEntry
├─ slot: integer
└─ servantCharacterId: string
```

holder 已属于 Record key，所以 entry 不重复保存 `holderCharacterId`。

逻辑上一张当前 Card：

```text
holderCharacterId
= Record key

servantCharacterId
= entry field

slot
= entry field
```

数据约束：

- `slot` 是 `integer >= 0`；
- 同一 Record 内 `slot` 唯一；
- 同一 Record 内 `servantCharacterId` 唯一；
- 数组按 `slot` 升序保存；
- 空编队使用 `[]`；
- `null` 不作为空编队第二种编码。

数据一致性 invariant：

```text
CarriedCards(A) 中存在 servant B
→ Relationship(A → B).contract 必须存在
```

Card 不保存：

```text
cardId
integrity
skills[]
BattleActor / BattleSkill
Character name / personality
```

# null 与 absence

这四类 MVP Realm State canonical business value 不使用 `null` 作为内部状态编码。

统一：

```text
optional object
→ field absence

empty collection
→ []

ordinary field
→ actual value
```

具体：

```text
no Contract
→ contract field absent

Event current state = null
→ no EventStateList entry

empty EventStateList
→ []

empty CarriedCards
→ []
```

Realm State 底层 contract 可以允许 record value `null`，但 PokeMan 这四类 canonical value 不使用它。

Record 本身从未 materialize 时的 PokeMan 业务语义固定如下：

```text
pokeman.PlayerWorld / current
→ baseline MUST materialize
→ absent / never-materialized = invalid PokeMan State

pokeman.EventStateList / current
→ baseline MUST materialize
→ absent / never-materialized = invalid PokeMan State
→ 没有 active Event 使用 []

pokeman.Relationship / A:B
→ absent / never-materialized = 没有持久化这段有向 Relationship

pokeman.CarriedCards / A
→ absent / never-materialized = 业务值 []
→ materialized [] = 业务值 []
```

因此 singleton 基础 Record 使用“必须存在”的编码；按 holder / relationship 按需产生的 Record 可以让 absence 具有领域语义。

`CarriedCards/A` 的 absent 与 materialized `[]` 在 Realm State 物理历史上仍然不同，但在 PokeMan 当前编队业务读取上等价，都表示“当前没有随身 Card”。不要求为每个 Character 预先 materialize 一个空 `CarriedCards` Record。

# 完整示例

## durable PlayerWorld checkpoint

```text
pokeman.PlayerWorld / current
```

```json
{
  "mapId": 1,
  "x": 8,
  "y": 12,
  "direction": 2
}
```

## EventStateList

```text
pokeman.EventStateList / current
```

```json
[
  {
    "eventId": "prologue",
    "stateId": "after-tutorial-battle"
  }
]
```

## player → rival

```text
pokeman.Relationship / player:rival
```

```json
{
  "affinity": 20,
  "hostile": false,
  "relationshipText": "与宿敌建立了正式契约。",
  "contract": {
    "integrity": 8,
    "skills": [
      "firebolt",
      "grab"
    ]
  }
}
```

## rival → player

```text
pokeman.Relationship / rival:player
```

```json
{
  "affinity": 15,
  "hostile": false,
  "relationshipText": "认可对方作为自己的对手与伙伴。",
  "contract": {
    "integrity": 10,
    "skills": [
      "strike"
    ]
  }
}
```

## player carried cards

```text
pokeman.CarriedCards / player
```

```json
[
  {
    "slot": 0,
    "servantCharacterId": "rival"
  }
]
```

# 当前冻结结论

```text
pokeman.PlayerWorld / current
→ durable resume/checkpoint {
    mapId: positive safe integer,
    x: non-negative safe integer,
    y: non-negative safe integer,
    direction
  }

pokeman.EventStateList / current
→ [{
    eventId,
    stateId
  }]

pokeman.Relationship / <from>:<to>
→ {
    affinity,
    hostile,
    relationshipText,
    contract?: {
      integrity,
      skills[]
    }
  }

pokeman.CarriedCards / <holder>
→ [{
    slot,
    servantCharacterId
  }]
```

同时冻结：

```text
Character business id = [a-z0-9][a-z0-9._-]{0,119}
Relationship key = <from>:<to>
Relationship key max length = 241 bytes
empty list = []
optional Contract = field absence
business value shape does not use null
Relationship value does not repeat from/to
CarriedCards value does not repeat holder
skills[] = BattleSkill id string[]
skills[] ordered + unique
CarriedCards sorted by slot
slot unique
servantCharacterId unique per holder
Carried Card requires corresponding Contract
PlayerWorld is durable checkpoint, not live Map authority
PlayerWorld.mapId is positive safe integer
PlayerWorld/current baseline must exist
EventStateList/current baseline must exist
Relationship absence = no persisted relationship
CarriedCards absence = business []
```

# 当前仍未解决的数据结构问题

Realm State 核心四类 Record 的粒度、namespace/key、value shape 与 Record-level absence 业务语义已经冻结。

当前 Realm State 侧没有剩余的 MVP 核心 physical-schema gap。Content / Encounter 的 authored 数据结构见 [68-content-fsdb.md](./68-content-fsdb.md)。

当前不建立通用：

```text
StoryFacts
ChoiceFacts
flags: Record<string, unknown>
generic key/value bag
```

只有未来出现无法由现有 domain data 表达、且确实需要长期共享的新业务事实时，再单独设计对应数据结构。