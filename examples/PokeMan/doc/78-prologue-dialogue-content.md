# PokeMan 序章教学 Dialogue 内容设计

> 状态：**Narrative / Content Design**
> 范围：Map 4 研究所的博士教学、劲敌互换卡片、教学 Battle 结果确认
> 关联：[77-battle-integration-v1.md](./77-battle-integration-v1.md)、[64-dialogue.md](./64-dialogue.md)、[50-mvp-prologue.md](./50-mvp-prologue.md)

本文冻结第一条 Battle vertical slice 的固定 Dialogue 文案与分支语义。它定义“人物说什么、玩家能选什么、终点 Dialogue key 表达什么业务意图”，不扩展 Dialogue schema，也不把 Relationship / Contract / Card / Battle 操作塞进 Dialogue Content。

---

## 1. 叙事目标

序章的三段对话分别承担不同职责：

| 阶段 | 人物 | 玩家应该理解 / 完成什么 | 对话结束后的业务 |
| --- | --- | --- | --- |
| 玩法科普 | 主角 ↔ 博士 | 角色卡、契约、战斗显现、完整度、修复和自主行动 | 玩家选择准备好，或暂时离开 |
| 互换卡片 | 主角 ↔ 劲敌 | 双方自愿建立双向契约，互相持有对方的卡 | 成功原子建立两份 Contract 和两张随身 Card，然后进入 Battle |
| 结果确认 | 主角 ↔ 劲敌 ↔ 博士 | 确认谁赢、卡片完整度发生什么、人物本体没有受伤 | 展示 Battle 数值结果，结束本次教学链 |

叙事基调：

- 博士耐心、清晰、像研究者，但不把对话写成系统说明书。
- 劲敌好胜、直接、带一点挑衅；他尊重主角的选择，不强迫交换。
- 主角保持少台词 / 无配音的主角表现。玩家的 Choice 就是主角当下的回应，不额外伪造一段主角独白。
- 玩法规则通过角色之间的交流自然讲清楚；重要规则只解释一次，战后再用短句确认。
- 不提前承诺尚未实现的技能成长、卡片升级、复杂队伍或 Battle 内手动指令。

## 2. 核心规则必须说清楚

玩家完成这段序章后，至少应该记住：

1. 角色卡代表一份契约，不是把人物本体装进卡片。
2. 持有对方的卡，才能以这份契约调用对方的 Battle Manifestation。
3. 契约有方向；玩家持有宿敌卡与宿敌持有主角卡，是两份独立关系。
4. Battle 中行动的是显现体；人物本体仍留在现实世界。
5. 显现体会依据自身能力和战局自主行动，玩家不是逐帧操纵每个动作。
6. Battle HP 在产品上表现为这份契约的显现完整度；归零后暂时不能再次显现。
7. Integrity 是长期 Contract 状态，不会在下一场 Battle 自动恢复；城镇中心可以修复。
8. 交换卡片必须双方同意；接受挑战后才建立双向契约并开始 Battle。

## 3. 对话流程

~~~text
Map 4 / Professor interaction
  ↓
professor-vertical-slice
  ├─ 我明白了，去找劲敌 → professor-tutorial-ready
  │                          → Map maps terminal id to ready
  │                          → rival Dialogue
  ├─ 再解释一次           → professor-tutorial-repeat
  │                          ├─ 明白了 → professor-tutorial-ready
  │                          └─ 稍后再说 → professor-tutorial-not-yet
  └─ 我先准备一下         → professor-tutorial-not-yet
                             → Map returns to normal interaction loop

rival-lab interaction
  ↓
lab-rival-intro
  ├─ 交换卡片，开始对战 → lab-rival-exchange-accept
  │                        → business Runtime atomically exchanges reciprocal Cards / Contracts
  │                        → success: Battle child Frame
  │                        → failure: no Battle; show recoverable error
  └─ 我还没准备好       → lab-rival-defer
                           → Map returns to normal interaction loop

Battle terminal
  ├─ ally_win             → lab-rival-after-ally-win
  ├─ enemy_win            → lab-rival-after-enemy-win
  └─ simultaneous_defeat  → lab-rival-after-draw
                             → Map resumes after result Dialogue
~~~

本流程中，Map 只根据 Dialogue terminal id / BattleResult 选择下一段 child Frame，不读取对白文本，也不猜测玩家意图。

## 4. 博士：玩法科普

### 4.1 professor-vertical-slice

入口 Dialogue。博士把关键概念压缩成一段可读的解释，最后让玩家决定继续、重听或暂缓。

~~~json
{
  "lines": [
    {
      "speaker": "professor",
      "text": "来了。今天先不谈远方的事，我想让你亲手弄明白角色卡究竟是什么。"
    },
    {
      "speaker": "professor",
      "text": "角色卡不是把一个人装进卡片里。它代表你和那个人建立的一份契约。"
    },
    {
      "speaker": "professor",
      "text": "持有对方的卡，你就能在战斗中调用对方的战斗显现。对方本人仍然留在原来的世界里，不会被拉进战场。"
    },
    {
      "speaker": "professor",
      "text": "显现体会根据自己的能力和眼前的战局作出行动。你不是逐帧操纵它的每一步，先观察它如何判断和应对。"
    },
    {
      "speaker": "professor",
      "text": "每份契约都有自己的技能和完整度。战斗中的损耗会降低这份契约的显现完整度，而不是伤害人物本体。"
    },
    {
      "speaker": "professor",
      "text": "完整度归零，这份契约就暂时无法再次形成显现。契约和你们之间的关系仍然存在。"
    },
    {
      "speaker": "professor",
      "text": "这些损耗会保留到下一场战斗，不会自动恢复。到了城镇，可以去中心修复。"
    },
    {
      "speaker": "professor",
      "text": "还有一点：契约是有方向的。你持有劲敌的卡，和劲敌持有你的卡，是两份分别成立的契约。"
    },
    {
      "speaker": "professor",
      "text": "今天你们要互相交换卡片。你调用他的显现体，他调用你的显现体。这样才能真正体验一次双方都参与的 Battle。"
    },
    {
      "speaker": "professor",
      "text": "听明白了吗？"
    }
  ],
  "choices": [
    {
      "text": "我明白了，去找劲敌",
      "target": "professor-tutorial-ready"
    },
    {
      "text": "再解释一次",
      "target": "professor-tutorial-repeat"
    },
    {
      "text": "我想先准备一下",
      "target": "professor-tutorial-not-yet"
    }
  ]
}
~~~

### 4.2 professor-tutorial-repeat

这是一个短复习分支，不重复整段长说明，只重新强调三个最容易误解的规则。

~~~json
{
  "lines": [
    {
      "speaker": "professor",
      "text": "记住三件事就够了。第一，卡片代表契约，不代表人物本体。"
    },
    {
      "speaker": "professor",
      "text": "第二，战斗中受损的是契约显现完整度；归零后暂时不能再次显现。"
    },
    {
      "speaker": "professor",
      "text": "第三，完整度会持续保留，可以在城镇中心修复。你和劲敌交换卡片后，就能亲眼看到这一切。"
    },
    {
      "speaker": "professor",
      "text": "现在，你准备好了吗？"
    }
  ],
  "choices": [
    {
      "text": "明白了，去找劲敌",
      "target": "professor-tutorial-ready"
    },
    {
      "text": "我还是想稍后再说",
      "target": "professor-tutorial-not-yet"
    }
  ]
}
~~~

### 4.3 professor-tutorial-ready

terminal Dialogue。Map 将 terminal id 映射为 professor conclusion = ready。

~~~json
{
  "lines": [
    {
      "speaker": "professor",
      "text": "很好。去找研究所另一边的劲敌吧。他也要亲自决定是否与你交换卡片。"
    },
    {
      "speaker": "professor",
      "text": "等你们双方都点头，再开始测试。记住，真正的契约不能靠任何一方单方面决定。"
    }
  ]
}
~~~

### 4.4 professor-tutorial-not-yet

terminal Dialogue。Map 将 terminal id 映射为 professor conclusion = not-yet；不调用劲敌 Dialogue，也不开始 Battle。

~~~json
{
  "lines": [
    {
      "speaker": "professor",
      "text": "不急。卡片交换不是必须立刻完成的事，更不是别人替你做的决定。"
    },
    {
      "speaker": "professor",
      "text": "准备好了再来找我。你也可以先在研究所里看看，想清楚以后再去找劲敌。"
    }
  ]
}
~~~

## 5. 劲敌：互换卡片，建立双向契约

### 5.1 lab-rival-intro

沿用现有 Dialogue key。替换当前两个都指向自身的 Choice，改为明确的接受 / 暂缓分支。

~~~json
{
  "lines": [
    {
      "speaker": "rival",
      "text": "总算来了。我还以为你要让博士替你把所有规则都讲完。"
    },
    {
      "speaker": "rival",
      "text": "我不想只听理论。我们来做一次真正的交换：我把自己的卡交给你，你也把自己的卡交给我。"
    },
    {
      "speaker": "rival",
      "text": "你用我的卡调用我的显现体，我用你的卡调用你的显现体。我们各自站在对面，看看谁更会运用这份力量。"
    },
    {
      "speaker": "rival",
      "text": "这不是把谁收进卡里。我们本人都在这里，进入战场的只是各自契约形成的显现。"
    },
    {
      "speaker": "rival",
      "text": "我知道战斗会损耗契约完整度。输了就去修复，别把责任推给卡片，也别拿本体受伤当借口。"
    },
    {
      "speaker": "rival",
      "text": "怎么样？你愿意和我交换卡片，堂堂正正地比一场吗？"
    }
  ],
  "choices": [
    {
      "text": "交换卡片，开始对战",
      "target": "lab-rival-exchange-accept"
    },
    {
      "text": "我还没准备好",
      "target": "lab-rival-defer"
    }
  ]
}
~~~

### 5.2 lab-rival-exchange-accept

terminal Dialogue。Map / PokeMan business Runtime 将这个 terminal id 解释为 accepted-challenge。

~~~json
{
  "lines": [
    {
      "speaker": "rival",
      "text": "好，一言为定。你收下我的卡，我也收下你的卡。"
    },
    {
      "speaker": "rival",
      "text": "从现在起，你可以调用我的显现体，我也可以调用你的显现体。"
    },
    {
      "speaker": "rival",
      "text": "别手下留情。我可不会因为这是第一次就放水。"
    }
  ]
}
~~~

### 5.3 lab-rival-defer

terminal Dialogue。Map 将这个 terminal id 解释为 deferred；不交换卡片，不调用 Battle。

~~~json
{
  "lines": [
    {
      "speaker": "rival",
      "text": "好，我不会逼你。没有你的同意，这份契约就不会成立。"
    },
    {
      "speaker": "rival",
      "text": "等你准备好了再来找我。到时候，我可不会放水。"
    }
  ]
}
~~~

## 6. 卡片交换的业务边界

Dialogue Choice 只跳转到 Dialogue；Dialogue.mutation 只改变 EventStateList。**不能因为台词说了“交换卡片”，就把 createContract / createCard 塞进 Dialogue 或 EventStateMutation。**

当 Dialogue 以 terminal id = lab-rival-exchange-accept 正常完成后，PokeMan business Runtime 才执行双向交换。Battle 只能在这次业务提交成功后启动。

本场交换必须建立以下四个业务事实：

~~~text
Relationship(player → rival).contract
  integrity = BattleActor/rival.max_hp = 18
  skills    = copy(BattleActor/rival.skills)
              = [firebolt, grab]

Relationship(rival → player).contract
  integrity = BattleActor/player.max_hp = 20
  skills    = copy(BattleActor/player.skills)
              = [firebolt]

CarriedCards(player)
  = [{ slot: 0, servantCharacterId: "rival" }]

CarriedCards(rival)
  = [{ slot: 0, servantCharacterId: "player" }]
~~~

实现约束：

- 两份 Relationship 是两个方向，不能只创建 player → rival。
- 两份 Contract 的初始 Integrity / skills 分别来自被调用角色的基础 BattleActor。
- 两份 CarriedCards 分别记录持有者当前的随身卡；卡片本身不是独立 Shared State Record。
- 保留已有 Relationship 的 affinity、hostile、relationshipText；如果 Record 不存在，使用项目统一的 Relationship 初始化规则，不在 Dialogue Content 中伪造默认值。
- 序章随身上限为 1；若任一方的 slot 0 已被占用，不得静默覆盖。
- 两份 Relationship 与两份 CarriedCards 应通过同一个 Shared State transaction 原子提交；不能只交换一张卡，也不能留下半成立的双向契约。
- transaction 未确认成功时不得启动 Battle；冲突 / 失败应显示可恢复错误，不能把对白播放完成误当成业务提交成功。

Battle 双方的含义：

~~~text
玩家调用自己持有的 rival Card
→ ally = BattleActor/rival Manifestation

劲敌调用自己持有的 player Card
→ enemy = BattleActor/player Manifestation
~~~

所以 Battle 的 ally_win 表示主角一方获胜；enemy_win 表示劲敌一方获胜。

## 7. 战后：确认胜负与契约状态

战后对话不重复教学，也不替代 Battle Result UI。Battle Result / Snapshot 是数值权威；Dialogue 负责确认胜负、解释 Integrity 后果，并让人物对结果作出反应。

对话中不插入动态 HP 占位符。具体剩余数值由 Battle Result Presentation 显示；静态对白只解释规则。

### 7.1 lab-rival-after-ally-win

语义：ally_win，主角一方胜出。主角调用的 rival Manifestation 获胜；劲敌调用的 player Manifestation 失去稳定。

~~~json
{
  "lines": [
    {
      "speaker": "rival",
      "text": "……这次是你赢了。没想到，我的显现体在你的手里，能发挥到这种程度。"
    },
    {
      "speaker": "professor",
      "text": "结果确认：主公一方胜出。"
    },
    {
      "speaker": "professor",
      "text": "劲敌持有的主角卡，本次显现完整度已经归零。你持有的宿敌卡还剩多少完整度，请看结果面板。"
    },
    {
      "speaker": "professor",
      "text": "这些数值已经分别写回各自的契约。完整度归零不会伤害人物本体，只代表那份契约暂时无法再次显现。"
    },
    {
      "speaker": "professor",
      "text": "之后到城镇中心修复完整度，就可以重新调用。"
    },
    {
      "speaker": "rival",
      "text": "别得意太早。等我把自己的契约修复好，我们再来一场。"
    }
  ]
}
~~~

### 7.2 lab-rival-after-enemy-win

语义：enemy_win，劲敌一方胜出。劲敌调用的 player Manifestation 获胜；主角调用的 rival Manifestation 失去稳定。

~~~json
{
  "lines": [
    {
      "speaker": "rival",
      "text": "这次是我赢了。你手里的我的卡，最后还是先撑不住了。"
    },
    {
      "speaker": "professor",
      "text": "结果确认：劲敌一方胜出。主公持有的宿敌卡，本次显现完整度已经归零。"
    },
    {
      "speaker": "professor",
      "text": "劲敌持有的主角卡还剩多少完整度，请看结果面板。两份数值都已写回各自的契约。"
    },
    {
      "speaker": "professor",
      "text": "完整度归零只代表这份契约暂时无法再次显现，不代表宿敌本人受伤。"
    },
    {
      "speaker": "professor",
      "text": "之后到城镇中心修复完整度，就可以再次调用。"
    },
    {
      "speaker": "rival",
      "text": "别灰心。把卡片修复好再来挑战我，我可不会因为赢了一次就满足。"
    }
  ]
}
~~~

### 7.3 lab-rival-after-draw

语义：simultaneous_defeat，双方显现同时失去稳定，结果为平局。

~~~json
{
  "lines": [
    {
      "speaker": "rival",
      "text": "等等……两边怎么一起消散了？"
    },
    {
      "speaker": "professor",
      "text": "结果确认：双方显现同时失去稳定，本场判定为平局。"
    },
    {
      "speaker": "professor",
      "text": "两份契约的本次显现完整度都已归零。具体记录请看结果面板。"
    },
    {
      "speaker": "professor",
      "text": "契约和人物关系仍然存在，只是暂时无法再次显现。到城镇中心修复后，你们就能继续调用。"
    },
    {
      "speaker": "rival",
      "text": "谁也没赢，谁也别笑谁。修复好再来，这次我可不会让步。"
    }
  ]
}
~~~

## 8. Result 与 Dialogue key 映射

| BattleResult | 产品胜负 | Dialogue key | 必须确认的结果 |
| --- | --- | --- | --- |
| ally_win | 主角胜出 | lab-rival-after-ally-win | rival Card 的 Manifestation 获胜；劲敌持有的 player Card 显现 Integrity 归零 |
| enemy_win | 劲敌胜出 | lab-rival-after-enemy-win | player Card 的 Manifestation 获胜；主角持有的 rival Card 显现 Integrity 归零 |
| simultaneous_defeat | 平局 | lab-rival-after-draw | 两份 Manifestation Integrity 同时归零 |

只有 Battle 正常 terminal 且双方 Contract Integrity 已成功结算，Map 才能调用以上三段战后 Dialogue。Battle cancelled / failure 不属于胜负分支，不得播放这些结果确认对白。

## 9. Dialogue Content 与 Runtime 的责任边界

| 内容 / 业务 | Owner |
| --- | --- |
| 台词、speaker、Choice、target Dialogue | struct.Dialogue |
| 玩家选择“准备好 / 暂缓” | Dialogue Choice 与 terminal Dialogue id |
| terminal id → ready / not-yet / accepted-challenge / deferred | PokeMan Dialogue / Map orchestration adapter |
| 双向 Relationship Contract 创建 | PokeMan business Runtime |
| 双向 CarriedCards 写入 | PokeMan business Runtime |
| 两份 Contract Integrity 结算 | Battle Subsystem |
| BattleResult / final HP | Battle Simulation |
| Result-specific Dialogue 选择 | Map orchestration |
| Event current state 推进 | EventStateMutation / Dialogue Runtime |

明确禁止：

- 给 Choice 增加 action / result / mutation 字段。
- 用 EventStateMutation 创建 Contract、Card 或启动 Battle。
- 在对白里硬编码胜负数值或假装知道实时剩余 HP。
- 由 Dialogue 直接调用 Battle Subsystem。
- 由 Battle Subsystem 直接调用战后 Dialogue。
- 把 Battle Manifestation 的失稳写成人物本体死亡、昏迷或受伤。

当前 Dialogue Content 先不附加 EventStateMutation。若战后确实需要让 rival 离开 Map 4，应另行更新 prologue Event 的 Map 绑定和场景状态，再通过单独 Mutation 推进；不能把场景离开逻辑混入 Contract / Battle 结算。

## 10. 验收标准

- 博士对白能讲清楚卡片、契约方向、显现体、Integrity 持续和中心修复。
- 玩家可以选择重听或暂缓；暂缓时不触发劲敌交换和 Battle。
- 劲敌对白明确表达双方自愿互换卡片；拒绝时不建立任何一边的 Contract。
- 接受后，双向 Relationship / Contract 与双向 CarriedCards 一次原子提交。
- 两张卡的 owner / servant 方向正确：player 持有 rival，rival 持有 player。
- 只有交换事务成功后才进入 Battle。
- 三种 BattleResult 各自进入正确的战后 Dialogue。
- 战后对白明确说明本体没有受伤、Integrity 已持久结算、归零后需要修复。
- 对话不显示虚构 HP 数字，不把动态 Battle state 写入固定 Dialogue Content。
- 每条 Dialogue 都只使用当前冻结的 lines / speaker / choices / target shape，不扩展通用 Dialogue DSL。
