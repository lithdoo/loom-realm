# Realm State Record 设计

> 独立技术设计记录。不改写 `../DESIGN.md`。本文在 [数据 Authority 清单](./66-data-authority.md) 的基础上，冻结 PokeMan MVP 核心 Realm State 的**物理 Record 粒度、namespace / key 编码、value shape 与数据约束**。本文只讨论数据结构，不讨论谁提交、何时提交、事务、冲突或失败处理。

## 总体结构

MVP 核心 Realm State 固定为四类 Record：

| 业务事实 | namespace | key | value |
| --- | --- | --- | --- |
| 玩家世界位置 | `pokeman.PlayerWorld` | `current` | `{ mapId, x, y, direction }` |
| Event current state | `pokeman.EventStateList` | `current` | `[{ eventId, stateId }]` |
| 有向 Relationship / Contract | `pokeman.Relationship` | `<fromCharacterId>/<toCharacterId>` | `{ affinity, hostile, relationshipText, contract? }` |
| 当前随身 Card 编队 | `pokeman.CarriedCards` | `<holderCharacterId>` | `[{ slot, servantCharacterId }]` |

不建立一个巨大的全局 `GameState` Record，也不为每张 Card 建立独立 Record。

## ID 与 key 编码

PokeMan 参与这些 Realm State key 的业务 id 使用稳定 token：

```text
[a-z0-9][a-z0-9._-]*
```

因此 `/` 不属于合法业务 id 字符，可以安全用于编码 Relationship 的有向复合 identity。

例如：

```text
namespace = pokeman.Relationship
key       = player/rival
```

表示：

```text
Relationship(player → rival)
```

`player/rival` 与 `rival/player` 是两个不同 key。

# PlayerWorld Record

物理 identity：

```text
namespace = pokeman.PlayerWorld
key       = current
```

value：

```json
{
  "mapId": "town-01",
  "x": 12,
  "y": 8,
  "direction": 2
}
```

最终字段：

```text
PlayerWorldValue
├─ mapId: string
├─ x: integer
├─ y: integer
└─ direction: 2 | 4 | 6 | 8
```

数据约束：

- `mapId` 是非空稳定 id；
- `x / y` 是整数；
- `direction` 只能是 `2 / 4 / 6 / 8`。

该 Record 不重复保存：

```text
playerCharacterId
npcId
instanceId
Character name / sprite / static data
```

# EventStateList Record

物理 identity：

```text
namespace = pokeman.EventStateList
key       = current
```

value 直接是稀疏数组，不再包一层没有额外业务语义的对象：

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
- 不保存 `stateId: null`；
- 空状态使用 `[]`。

业务含义保持：

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
key       = <fromCharacterId>/<toCharacterId>
```

例如：

```text
pokeman.Relationship / player/rival
pokeman.Relationship / rival/player
pokeman.Relationship / lord-b/rival
```

分别表示三条独立 Relationship。

因为 `fromCharacterId / toCharacterId` 已经属于 Record key，value 不重复保存它们，避免出现两套 identity source。

## Value

未建立 Contract：

```json
{
  "affinity": 10,
  "hostile": false,
  "relationshipText": "认识不久，但已经开始互相信任。"
}
```

已建立 Contract：

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

`relationshipText` 是此前文档中 dynamic relationship text 的最终字段名。

## Relationship 三种物理状态

```text
Relationship Record 不存在
= 没有持久化这段有向关系

Relationship Record 存在
+ contract 字段缺失
= 有长期关系，但没有正式契约

Relationship Record 存在
+ contract 字段存在
= 正式主公 / 从者契约成立
```

因此不增加：

```text
hasRelationship
hasContract
contracted
```

`contract` 的存在性就是契约成立事实。

## affinity

```text
affinity: integer
```

MVP 数据结构不冻结人为数值范围，例如 `-100..100`。它只要求是有限整数；具体数值区间属于以后独立的玩法数值设计。

## hostile

```text
hostile: boolean
```

它是独立结构化事实，不由 `affinity` 正负推导。

## relationshipText

```text
relationshipText: string
```

字段必需，允许空字符串：

```json
{
  "affinity": 0,
  "hostile": false,
  "relationshipText": ""
}
```

这样所有 Relationship 都拥有稳定的基础 value shape。

# Contract Value

Contract 继续嵌在 Relationship value 内，不建立独立 Record。

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

MVP 的最大值继续来自稳定基础 BattleActor：

```text
Character
→ BattleActor
→ max_hp
```

新 Contract 的初始值语义已经固定为：

```text
integrity = BattleActor.max_hp
```

但这里只记录最终物理字段，不展开创建过程。

## skills

```text
skills: string[]
```

结构约束：

- 每个元素是 BattleSkill id；
- 不允许重复；
- 保留数组顺序；
- 空技能集使用 `[]`。

因此 `skills` 是一个 **ordered unique list**。

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

Card 没有独立 identity，因此不采用“一张 Card 一条 Record”。

当前随身编队按 holder 聚合：

```text
namespace = pokeman.CarriedCards
key       = <holderCharacterId>
```

例如玩家当前编队：

```text
namespace = pokeman.CarriedCards
key       = player
```

value：

```json
[
  {
    "slot": 0,
    "servantCharacterId": "rival"
  }
]
```

多个随身位时：

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

因为 holder 已经属于 Record key，entry 不重复保存 `holderCharacterId`。

逻辑上的一张当前 Card 仍由三部分表达：

```text
holderCharacterId
= Record key

servantCharacterId
= entry field

slot
= entry field
```

## Value

```text
CarriedCardsValue
= CarriedCardEntry[]

CarriedCardEntry
├─ slot: integer
└─ servantCharacterId: string
```

数据约束：

- `slot` 是 `integer >= 0`；
- 同一 Record 内 `slot` 唯一；
- 同一 Record 内 `servantCharacterId` 唯一；
- 数组按 `slot` 升序保存，形成稳定 canonical JSON 表示；
- 空编队使用 `[]`；
- `null` 不作为空编队的第二种编码。

数据一致性要求：

```text
CarriedCards(A) 中存在 servant B
→ Relationship(A → B).contract 必须存在
```

这是 PokeMan 数据模型 invariant；本文只记录约束本身，不讨论由谁、何时验证。

Card 不保存：

```text
cardId
integrity
skills[]
BattleActor / BattleSkill
Character name / personality
```

# `null` 与 absence 规则

这四类 MVP Realm State 的业务 value 不使用 `null` 作为内部状态编码。

统一规则：

```text
optional object
→ field absence

empty collection
→ []

普通业务字段
→ 实际值
```

具体表现：

```text
没有 Contract
→ 缺少 contract 字段

Event current state = null
→ EventStateList 中缺少该 eventId entry

空 EventStateList
→ []

空 CarriedCards
→ []
```

不使用：

```json
{ "contract": null }
```

也不使用：

```json
{ "stateId": null }
```

Realm State 基础 contract 本身允许 Record value 为 `null`，但 PokeMan 这四类 canonical Record shape 不把 `null` 作为业务 value 的内部编码。

# 完整示例

下面展示一组序章状态的物理表示。

## PlayerWorld

```text
pokeman.PlayerWorld / current
```

```json
{
  "mapId": "lab",
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
pokeman.Relationship / player/rival
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
pokeman.Relationship / rival/player
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

## 玩家当前随身

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

## 宿敌当前随身

```text
pokeman.CarriedCards / rival
```

```json
[
  {
    "slot": 0,
    "servantCharacterId": "player"
  }
]
```

# 当前冻结结论

MVP 核心 Realm State 物理结构已经冻结为：

```text
pokeman.PlayerWorld / current
→ {
    mapId,
    x,
    y,
    direction
  }

pokeman.EventStateList / current
→ [{
    eventId,
    stateId
  }]

pokeman.Relationship / <from>/<to>
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
业务 id token = [a-z0-9][a-z0-9._-]*
Relationship key = <from>/<to>
空列表 = []
optional Contract = field absence
内部业务 shape 不使用 null
Relationship value 不重复 from/to
CarriedCards value 不重复 holder
skills[] ordered + unique
CarriedCards 按 slot 升序且 slot / servant 均唯一
```

# 当前仍未解决的数据结构问题

Realm State 核心四类 Record 的粒度、namespace/key 与 value shape 已不再是未决项。

当前剩余的数据结构工作主要转向 Content：

```text
Character / NPC / Visual 的精确 Content schema / namespace
Character → BattleActor Content reference 编码
Encounter / Story → BattleActor Content reference 编码
Event / EventStateMutation Content namespace / key
Event placement / instanceId / absent 的最终 JSON shape
Dialogue Content 的最终 namespace / key 与 schema 命名收口
```

当前不建立通用：

```text
StoryFacts
ChoiceFacts
flags: Record<string, unknown>
generic key/value bag
```

只有未来出现无法由现有 domain data 表达、且确实需要持久化的新业务事实时，再单独设计对应数据结构。