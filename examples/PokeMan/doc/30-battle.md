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

## HP 对契约关系意味着 Card Integrity

对于通过角色卡形成的 **Battle Manifestation**，Battle 中的 `HP` 不表示角色本体生命值，而表示：

> **这份有向 Relationship / Contract 的战斗完整度 / 显现稳定度（Card Integrity）。**

Integrity 是这份契约关系的长期状态，不属于“当前是否随身”的 Card State。当前 Card 只表示这份已成立契约是否被编入随身队伍以及所在 slot。

内部 Simulation 可以继续使用连续数值 `hp`，产品上把它解释为角色卡完整度。例如概念上：

| 卡片状态 | Battle HP / Integrity | 产品语义 |
| --- | ---: | --- |
| 完好 | 较高 | 显现稳定，可以正常继续战斗 |
| 受损 | 中等 | 这份契约的战斗显现已经出现明显损耗 |
| 残破 | 很低但大于 0 | 显现非常不稳定，接近无法继续战斗 |
| 失效 | 0 | 当前无法继续形成战斗化身 |

具体状态名称、视觉效果和百分比阈值以后再调；当前只固定 **Battle HP 映射 Relationship 上这份契约的 Integrity，而不是角色本体生命值**。

因此：

```text
宿敌本体：仍然在研究所正常生活

Relationship(player → rival):
contract = true
integrity = 35%

Card(player, rival):
slot = 0        // 当前随身
```

这些可以同时成立。

`Integrity = 0` 表示这份契约当前无法继续形成 Battle Manifestation，并不意味着角色本人昏迷、死亡或受到同等物理伤害。

长期 Integrity 在 Battle 结束后写回 Relationship，因此即使随后把 Card 从随身队伍移除，损耗也不会消失：

```text
Relationship(player → rival).integrity = 100
↓
Card(player, rival, slot=0) 进入 Battle
↓
Battle hp 100 → 48
↓
Battle 结束
↓
Relationship(player → rival).integrity = 48
↓
Card 可以继续随身，也可以从随身队伍移除
↓
Integrity 仍然是 48
↓
到达中心
↓
修复 Relationship.integrity → 100
```

这样道路上的连续战斗会产生类似传统 Pokémon 的旅行资源压力，但设定上消耗的是契约关系的战斗显现能力，而不是远处角色本人的生命值。

### 本体直接参战时

普通敌对人物、独立从者等可以由世界本体直接进入同一个 Battle Simulation。此时 Simulation 中的 HP 可以表达**本场战斗内的体力 / 战斗状态 / 被击败程度**，不要求把这份数值保存成角色长期生命条。

也就是说：

```text
契约关系调用的 Battle Manifestation HP
→ 从 Relationship.integrity 初始化
→ Battle 结束后写回 Relationship.integrity
→ 可跨 Battle / 随身切换持续，并由中心修复

世界本体直接参战 HP
→ 本场 Battle 的战斗状态
→ 0 表示被击败 / 制服 / 无法继续战斗
```

二者共用 Battle 机制，但产品语义不同。

## 多随身卡后的默认 Battle 使用方式

当剧情以后解锁多个随身角色卡位时，**默认仍保持单场 1v1 Battle**。主公在进入 Battle 时从当前随身角色卡中选择一张作为本场出战卡：

```text
多个随身 Card
↓
Battle 开始前选择 1 张
↓
通过 holder / servant 找到对应 Relationship
↓
读取 Relationship.integrity / progression
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

同一句 Guidance，不同人物应产生不同理解和执行方式。角色性格、能力、经验、关系和当前战局共同影响 Decision，避免所有从者最终表现为同一种通用 AI。

同一个 Character 被不同主公契约时，各自的有向 Relationship 可以拥有独立的 affinity、Integrity、训练 / 成长与未来 Guidance 相关状态，因此同一人物的不同契约 Battle Manifestation 也可以形成不同表现。

## 长期养成方向

序章不实现完整养成系统，但长期方向已确认：

- **训练**：提高这份契约关系能够发挥的战斗能力；长期训练 / progression 状态属于 Relationship，而不是当前 Card；
- **好感度 / 信赖**：提高从者理解、信任和采纳主公战术意图的程度，也属于有向 Relationship；
- **关系成长**：来自 Dialogue、Event、选择和共同经历；
- **随行成长**：来自一起旅行、Pocket Dialogue 和角色事件，并沉淀到对应 Relationship 的长期状态；
- **主公成长**：提升组织、携带、调用和表达复杂 Guidance 的能力。

核心语义是：

```text
训练 = “这份契约能做到什么”
好感 / 信赖 = “从者愿意多大程度采纳这个主公的意图”
```

具体 Level、属性、技能成长、训练方式、契约阶段和 Guidance UX 均不在序章阶段设计。