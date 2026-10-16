# Battle

> 从 `../DESIGN.md` 拆分；原文档保持不变。

## Battle 的产品定位

从者不是被逐步遥控的棋子。主公不直接提交“左移两格 → 使用技能 A → 指定敌人 B”这样的细粒度命令，而是逐渐获得表达高层战术意图的能力，例如：

```text
“先拉开距离，找机会反击。”
“别管防守，尽快解决对方。”
“保护自己，不要冒险。”
“把对方逼到墙边。”
“尽量不要下重手。”
```

Battle 基本结构保持：

```text
Battle Observation / Constraints
          ↓
Decision / LLM
          ↓
PlanSubmission
          ↓
Simulation validation / execution
          ↓
Battle Result
```

未来加入 Player Guidance 后：

```text
主公战术指令 / Guidance
          ↓
角色能力 + 性格 + 战斗经验 + 好感 / 信赖 + 当前战局
          ↓
Decision / LLM
          ↓
PlanSubmission
          ↓
Simulation
          ↓
实际战斗结果
```

**Decision 决定想做什么；Simulation 决定能不能做、什么时候发生以及结果是什么。**

## HP 对契约关系意味着 Contract Integrity

对于通过角色卡形成的 **Battle Manifestation**，Battle 中的 `HP` 不表示角色本体生命值，而表示：

> **这份有向 Relationship 中 Contract 的战斗完整度 / 显现稳定度。**

MVP Contract 是 Relationship 内的长期状态：

```text
Relationship(holder → servant)
└─ contract
   ├─ integrity
   └─ skills[]
```

当前 Card 只表示这份已成立契约是否被编入随身队伍以及所在 slot。

内部 Simulation 可以继续使用连续数值 `hp`，产品上把它解释为契约完整度。例如概念上：

| 卡片状态 | Battle HP / Integrity | 产品语义 |
| --- | ---: | --- |
| 完好 | 较高 | 显现稳定，可以正常继续战斗 |
| 受损 | 中等 | 这份契约的战斗显现已经出现明显损耗 |
| 残破 | 很低但大于 0 | 显现非常不稳定，接近无法继续战斗 |
| 失效 | 0 | 当前无法继续形成战斗化身 |

具体状态名称、视觉效果和百分比阈值以后再调；当前只固定 **Battle HP 映射 `Relationship.contract.integrity`，而不是角色本体生命值**。

例如：

```text
宿敌本体：仍然在研究所正常生活

Relationship(player → rival):
contract:
  integrity: 35
  skills: [firebolt, grab]

Card(player, rival):
slot = 0        // 当前随身
```

这些可以同时成立。

`Integrity = 0` 表示这份契约当前无法继续形成 Battle Manifestation，并不意味着角色本人昏迷、死亡或受到同等物理伤害。

长期 Integrity 在 Battle 结束后写回同一 Contract，因此即使随后把 Card 从随身队伍移除，损耗也不会消失：

```text
Relationship(player → rival).contract.integrity = 100
↓
Card(player, rival, slot=0) 进入 Battle
↓
Battle hp 100 → 48
↓
Battle 结束
↓
Relationship(player → rival).contract.integrity = 48
↓
Card 可以继续随身，也可以从随身队伍移除
↓
Integrity 仍然是 48
↓
到达中心
↓
修复 contract.integrity → 100
```

这样道路上的连续战斗会产生类似传统 Pokémon 的旅行资源压力，但设定上消耗的是契约关系的战斗显现能力，而不是远处角色本人的生命值。

### 本体直接参战时

普通敌对人物、独立从者等可以由世界本体直接进入同一个 Battle Simulation。此时 Simulation 中的 HP 可以表达**本场战斗内的体力 / 战斗状态 / 被击败程度**，不要求把这份数值保存成角色长期生命条。

```text
契约关系调用的 Battle Manifestation HP
→ 从 Relationship.contract.integrity 初始化
→ Battle 结束后写回 Relationship.contract.integrity
→ 可跨 Battle / 随身切换持续，并由中心修复

世界本体直接参战 HP
→ 本场 Battle 的战斗状态
→ 0 表示被击败 / 制服 / 无法继续战斗
```

二者共用 Battle 机制，但产品语义不同。

## Contract 建立时的 Battle 默认值来源

Contract 不是直接从 Character 的某个固定 BattleActor baseline 机械复制出来，而是在**与当前世界中的目标 NPC Instance 建立契约时**，从这个实例已经解析出来的 battle data 初始化。

概念链路：

```text
Character / Encounter / Story battle sources
↓
当前目标 NPC Instance
↓
resolved battle data
├─ resolved BattleActor / max values
└─ resolved skills[]
↓ contract creation snapshot
Relationship.contract
├─ integrity
└─ skills[]
```

因此一个 Character 在不同剧情阶段、不同 NPC 表现或不同业务来源下，即使解析到不同 battle defaults，Contract 也可以准确反映**建立契约当时那个具体 NPC Instance** 的状态。

这里有两个重要边界：

```text
NPC Instance resolved battle data
= Contract 创建时的初始化来源

Relationship.contract
= Contract 创建后的长期 authority
```

Contract 创建完成以后，NPC Instance 后续 battle data 的变化不会自动同步到已有 Contract；后续 Contract 技能变化直接修改 `contract.skills[]`。

`contract.integrity` 也来自 NPC Instance 的 resolved battle defaults，而不是目标 NPC 刚结束某场本体 Battle 后剩余的当前 HP。本体 Battle HP 与 Contract Integrity 仍是不同语义。

NPC Instance 最终怎样引用 / 解析 BattleActor，以及 resolved battle data 的精确字段，属于后续 schema 收口；这里先固定**初始化来源是 NPC Instance，而不是直接 Character baseline**。

## MVP 技能来源

PokeMan 不定义平行 Skill schema，技能定义仍然来自 `@loomrealm-game/battle` 的 BattleSkill Content。

对于没有 Contract 的本体 / transient actor，Battle 使用该 NPC Instance 当前 resolved battle data 中的技能；如果没有额外覆盖，这些技能通常来自其 BattleActor Content 的 `skills[]`。

对于 Contract：

```text
建立新 Contract
→ snapshot 当前目标 NPC Instance resolved skills[]
→ Relationship.contract.skills[]

Contract 对应的 Card Battle
→ 当前可用技能来自 Relationship.contract.skills[]
```

也就是说，`BattleActor.skills[]` 仍然是重要静态定义来源，但 **Contract 的直接初始化来源是目标 NPC Instance 的 resolved battle data**。

MVP 不增加：

```text
experience
skill points
unlock tree
learnedSkillIds
baseSkills + learnedSkills merge
forget skill
skill slot progression
```

以后真的做技能学习时，可以直接修改 / 扩展 `contract.skills[]` 的业务规则，不要求现在先设计完整成长系统。

## 多随身卡后的默认 Battle 使用方式

当剧情以后解锁多个随身角色卡位时，**默认仍保持单场 1v1 Battle**。主公在进入 Battle 时从当前随身角色卡中选择一张作为本场出战卡：

```text
多个随身 Card
↓
Battle 开始前选择 1 张
↓
通过 holder / servant 找到对应 Relationship.contract
↓
读取 contract.integrity / skills[]
↓
形成 Battle Manifestation
↓
默认 1v1 Battle
```

这样“携带多张卡”首先扩大旅行队伍和出战选择，而不会因为第二个随身位解锁就立即要求基础 Battle 改造成多人战。

长期可以在真实玩法需要时继续扩展：

```text
Battle 中换卡
→ 特殊规则 2v2
→ 多人协同 Battle
```

这些扩展不在序章阶段实现，也不改变当前默认 1v1 的基础规则。

## 角色性格真实影响战斗

同一句 Guidance，不同人物应产生不同理解和执行方式。角色性格、能力、关系和当前战局共同影响 Decision，避免所有从者最终表现为同一种通用 AI。

同一个 Character 被不同主公契约时，各自有向 Relationship 的 affinity、Contract Integrity、技能集以及未来 Guidance / 成长状态可以不同，因此同一人物的不同契约 Battle Manifestation 也可以形成不同表现。

## 长期养成方向

序章 / MVP **不实现也不冻结完整 progression / training State schema**。

长期仍可以有：

- **训练**：提高这份契约关系能够发挥的战斗能力；
- **技能学习**：改变该 Contract 当前拥有的 `skills[]`；
- **好感度 / 信赖**：影响从者理解、信任和采纳主公战术意图的程度；
- **关系成长**：来自 Dialogue、Event、选择和共同经历；
- **随行成长**：来自一起旅行、Pocket Dialogue 和角色事件；
- **主公成长**：提升组织、携带、调用和表达复杂 Guidance 的能力。

这些是未来产品方向，不要求 MVP 先引入 `progression` 字段、等级系统或通用训练模型。当前 Contract 只需要：

```text
contract
├─ integrity
└─ skills[]
```

等真实玩法出现以后，再扩展 Contract 的长期状态。