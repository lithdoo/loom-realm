# Realm State Record 设计

> 独立技术设计记录。不改写 `../DESIGN.md`。本文在 [数据 Authority 清单](./66-data-authority.md) 的基础上，冻结 PokeMan MVP 核心 Realm State 的 **Record 粒度、逻辑 identity 与最小 value 字段**。本文不冻结最终 namespace / key 字符串编码。

## 目标

当前不设计一个巨大的全局 `GameState` Record，也不为每个细小事实都创建独立 Record。

Record 粒度按业务更新边界划分：

```text
PlayerWorld
= 一个玩家世界位置整体更新

EventStateList
= 多个 Event current state 经常需要一次原子推进

Relationship
= 每段有向关系独立变化，Battle 也通常只写回一份 Contract

CarriedCards
= 同一个 holder 的编队 slot 应作为一个整体调整
```

MVP 当前核心 Realm State 冻结为四类 Record：

| 业务事实 | Record 粒度 | 逻辑 identity |
| --- | --- | --- |
| 玩家世界位置 | 1 个 Record | `PlayerWorld / current` |
| Event current state | 1 个 Record | `EventStateList / current` |
| 有向 Relationship / Contract | 每个 `from → to` 1 个 Record | `Relationship / (fromCharacterId,toCharacterId)` |
| 当前随身 Card 编队 | 每个 holder 1 个 Record | `CarriedCards / holderCharacterId` |

这里的 `PlayerWorld / current`、`Relationship / (...)` 等只是**逻辑 identity 表达**，不是最终 Realm State namespace / key 字符串格式。

# PlayerWorld Record

玩家当前世界位置使用一条 Record：

```text
PlayerWorld / current
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

最小字段：

```text
mapId       string
x           integer
y           integer
direction   2 | 4 | 6 | 8
```

该 Record 只保存“这一局玩家现在在哪”。

不重复保存：

```text
playerCharacterId
Character name / sprite
Character static data
```

玩家 Character identity 本身属于 Content / 游戏配置，不是位置 Record 的 mutable value。

# EventStateList Record

Event current state 已确认使用**一条 Realm State Record**：

```text
EventStateList / current
```

value 直接是稀疏列表：

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

不再额外包一层没有业务语义的对象。

规则：

```text
存在 eventId entry
→ current state = entry.stateId

不存在 eventId entry
→ current state = null
```

物理约束：

```text
eventId 在列表内唯一
stateId 永远非 null
```

因此：

```text
null → stateId
= 新增 entry

stateA → stateB
= 替换 entry.stateId

stateId → null
= 删除 entry
```

EventStateMutation 仍读取这一条 Record 的 value + version，并以一次 Record replacement 更新整个列表。

# Relationship Record

## 粒度

**每条有向 Relationship 使用一条独立 Realm State Record。**

逻辑 identity：

```text
Relationship / (fromCharacterId, toCharacterId)
```

例如：

```text
Relationship / (player, rival)
Relationship / (rival, player)
```

是两条完全不同的 Record。

不把所有 Relationship 聚合成一个全局列表，因为最常见的更新通常只影响一段关系：

```text
Dialogue / Event
→ A 对 B 的 affinity / hostile / relationshipText 变化

Battle 结束
→ 只写回 A → B 的 contract.integrity
```

将每段有向 Relationship 分成独立 Record，可以让这些写入只竞争对应关系本身的 version。

## Value

因为 `fromCharacterId / toCharacterId` 已经属于 Record identity，value 不重复保存它们。

未建立 Contract：

```json
{
  "affinity": 10,
  "hostile": false,
  "relationshipText": "认识不久，但已经开始互相信任。"
}
```

已经建立 Contract：

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

MVP 最小 value：

```text
RelationshipValue
├─ affinity
├─ hostile
├─ relationshipText
└─ contract?
   ├─ integrity
   └─ skills[]
```

`relationshipText` 对应此前文档中的 dynamic relationship text；具体最终字段命名可在 schema 命名收口时统一，但其业务职责已冻结。

## Record 不存在的语义

当前区分三个状态：

```text
Relationship Record 不存在
= 当前没有持久化这段有向关系

Relationship Record 存在
+ contract 缺失
= 已有长期关系状态，但没有正式契约

Relationship Record 存在
+ contract 存在
= 正式主公 / 从者契约已经成立
```

因此不需要额外：

```text
hasRelationship
contracted boolean
```

`contract` 对象是否存在就是契约成立事实。

## Contract

Contract 继续作为 Relationship value 内的嵌套长期状态，不建立独立 Record：

```text
contract
├─ integrity
└─ skills[]
```

创建时：

```text
目标 NPC Instance
→ resolve base BattleActor

contract.integrity = BattleActor.max_hp
contract.skills[] = copy(BattleActor.skills[])
```

Contract Integrity 上限继续来自稳定基础 `BattleActor.max_hp`，所以不重复保存：

```text
maxIntegrity
```

MVP 也不保存：

```text
BattleActorRef
progression
training
learnedSkillIds
```

Battle 结束后需要长期保留的显现 HP 结果只更新对应 Relationship Record 的：

```text
contract.integrity
```

# CarriedCards Record

## 粒度

Card 没有独立 identity，因此**不采用“一张 Card 一条 Record”**。

当前随身编队按 holder 聚合：

```text
CarriedCards / holderCharacterId
```

每个 holder 一条 Record。

例如玩家的当前编队：

```json
[
  {
    "slot": 0,
    "servantCharacterId": "rival"
  }
]
```

宿敌的当前编队可以是另一条：

```json
[
  {
    "slot": 0,
    "servantCharacterId": "player"
  }
]
```

因为 holder 已经属于 Record identity，entry 不重复保存 `holderCharacterId`。

逻辑上一张当前 Card 仍然由三部分表达：

```text
holderCharacterId
= CarriedCards Record identity

servantCharacterId
= entry

slot
= entry
```

## Value

```text
CarriedCardsValue
= [{ slot, servantCharacterId }]
```

Card 不保存：

```text
integrity
skills[]
BattleActor / BattleSkill
Character name / personality
cardId
```

长期状态始终从对应：

```text
Relationship(holder → servant).contract
```

读取。

## 编队约束

一条 `CarriedCards / holder` Record 内，当前冻结两个基本唯一约束：

```text
同一个 slot 最多出现一次
同一个 servantCharacterId 最多出现一次
```

业务一致性还要求：

```text
CarriedCards(A) 中存在 servant B
→ Relationship(A → B).contract 必须存在
```

这条是 PokeMan 业务 invariant，不要求 Realm State 基础设施理解 Character / Contract 语义。

当前随身位上限属于产品 / Runtime 规则；序章上限为 1。Record schema 本身不为未来多 slot 重新设计。

## 为什么按 holder 聚合

编队调整天然是同一个 holder 的整体操作：

```text
slot 0 = B
slot 1 = C

交换
↓

slot 0 = C
slot 1 = B
```

如果每张 Card 都是一条独立 Record，会人为增加交换 slot 时的多 Record 协调。

使用一条 `CarriedCards / holder`：

```text
read current list
→ compute replacement list
→ one Record replacement
```

即可原子完成该 holder 的整个编队调整。

# 跨 Record 原子业务

Realm State transaction 可以跨 Record，因此 Record 拆分不意味着业务操作必须出现中间状态。

例如“建立 Contract 并立即加入随身位”：

```text
transaction
├─ condition/write Relationship(player → rival)
└─ condition/write CarriedCards(player)
```

可以一次 commit。

序章双向契约可以一次业务 transaction 涉及：

```text
Relationship(player → rival)
Relationship(rival → player)
CarriedCards(player)
CarriedCards(rival)
```

具体 Runtime 如何处理 OCC conflict / failure 属于 Runtime execution policy，不在本文冻结。

# 常见操作与 Record 边界

## 创建普通 Relationship

```text
write
Relationship(A → B)
```

只创建长期关系，不要求同时创建 Contract。

## 建立 Contract

```text
read / resolve target base BattleActor
↓
replace Relationship(A → B)
with contract {
  integrity = BattleActor.max_hp
  skills = BattleActor.skills[]
}
```

## 建立 Contract 并随身

```text
one transaction
├─ replace Relationship(A → B)
└─ replace CarriedCards(A)
```

## 中心调整队伍

```text
replace CarriedCards(holder)
```

不修改 Relationship / Contract。

## Battle 结束

```text
replace Relationship(holder → servant)
with updated contract.integrity
```

是否随后把 Card 移出随身队伍与 Integrity writeback 无关。

## Event 剧情推进

```text
replace EventStateList / current
```

如果同一个业务时刻还创建 Contract / 修改 Card，可以在业务 Runtime 中使用跨 Record transaction；EventStateMutation 本身仍只描述 EventStateList 怎么变。

# Game Entry / New Session Baseline

Game Entry baseline 可以直接安装这些 Record 的初始 value。

例如序章开局可能至少有：

```text
PlayerWorld / current
EventStateList / current
```

如果某些 Relationship 在开局已经存在，也可以安装对应 Relationship Record。

尚未发生的关系不需要为了“完整表格”预创建空 Record。

同样，某个 holder 当前没有随身 Card 时，可以没有对应 `CarriedCards / holder` Record；是否选择安装空数组 Record 还是让缺 Record 等价于空编队，属于最终 key/baseline 编码收口问题，本文暂不冻结。

# 当前不建立通用 StoryFacts Record

虽然未来可能出现需要长期保存的 Pocket / Story / Choice / Random facts，但当前不提前建立：

```text
StoryFacts
ChoiceFacts
flags: Record<string, unknown>
generic key/value bag
```

原因是这些结构很容易演化成第二套没有明确 owner 的 Event / script system。

以后出现一个无法由：

```text
PlayerWorld
EventStateList
Relationship / Contract
CarriedCards
```

表达、并且确实必须长期持久化的业务事实时，再按那个 domain 的真实更新边界增加新 Record。

# 当前冻结与仍未冻结

## 已冻结

```text
PlayerWorld
= 一个 Record
= value: mapId / x / y / direction

EventStateList
= 一个 Record
= value: [{ eventId, stateId }]

Relationship
= 每个 from → to 一个 Record
= identity 包含双方 Character id
= value 不重复 from/to
= affinity / hostile / relationshipText / contract?

Contract
= Relationship value 内嵌
= integrity / skills[]

CarriedCards
= 每个 holder 一个 Record
= value: [{ slot, servantCharacterId }]
= 同 slot 唯一
= 同 servant 唯一
= entry 必须对应已成立 Contract
```

## 仍未冻结

以下属于下一层 schema / key 编码工作：

```text
各 Record 的最终 namespace
各 Record 的最终 key 字符串编码
Relationship(from,to) 如何编码成 Realm State key
CarriedCards(holder) 如何编码成 Realm State key
PlayerWorld / EventStateList 的最终固定 key 名
relationshipText 的最终字段命名
CarriedCards 缺 Record 是否等价于 []，还是 baseline 总是安装空数组
字段级 JSON Schema 细节，例如整数范围 / 字符串格式约束
```

Content 的 Character / NPC / Visual / Event 等 namespace / key 继续由各自 Content schema 设计处理，不在本文混入 Realm State Record 设计。

# 与早期文档的关系

本文冻结以后，早期技术文档中类似下面的表述视为已经解决：

```text
“Relationship / Contract 的 Record 粒度仍未决定”
“Card 最终采用列表 Record 还是多个 Record 仍未决定”
“Card 的必要唯一约束仍未决定”
```

当前 canonical 结论是：

```text
Relationship = 每个有向关系一个 Record
CarriedCards = 每个 holder 一个列表 Record
```

仍未解决的是最终 Realm State namespace / key **编码**，不是 Record 粒度。