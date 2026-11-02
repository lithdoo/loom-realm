# PokeMan Story / Dialogue / Event 集成设计

> 状态：**Story Runtime / Content Integration Design**
> 范围：固定 Dialogue、Event state、Map 场景解析、业务 Runtime 与 Battle 的协作
> 关联：[62-event.md](./62-event.md)、[64-dialogue.md](./64-dialogue.md)、[73-dialogue-gameplay-vertical-slice.md](./73-dialogue-gameplay-vertical-slice.md)、[78-prologue-dialogue-content.md](./78-prologue-dialogue-content.md)、[50-mvp-prologue.md](./50-mvp-prologue.md)、[67-shared-state-records.md](./67-shared-state-records.md)

本文把序章实际需要的 Story / Dialogue / Event 集成关系固定下来。它不新增通用剧情 DSL，也不改变已经冻结的 Content / Shared State physical schema。

## 1. 核心决策

保持现有数据模型，不增加新的剧情业务 Record：

- Dialogue 负责固定台词、Choice 和 Dialogue graph 跳转。
- Event 负责剧情阶段，以及当前阶段对地图 NPC / Character 的场景与交互定义。
- EventStateMutation 只负责检查并推进 Event current state。
- EventStateList 是当前 Event state 的唯一持久化 authority。
- Relationship / Contract 与 CarriedCards 分别保存关系契约和随身编队事实。
- Battle Runtime 拥有本场 Battle 与结算结果。
- Story Resolver 根据 StoryIndex、EventStateList 和 Character.defaultScenes 解析当前地图场景。
- Map / Story Orchestrator 是 Dialogue、业务操作、Battle 与 Map 场景恢复的调用者。

因此：

**Dialogue graph 不是剧情状态机；Event state 不是通用任务脚本；Map Orchestrator 不解释对白文本。**

所有跨模块推进都通过明确的 terminal Dialogue key、BattleResult 或 EventStateMutation 完成。

## 2. Authority 与职责边界

| 数据 / Runtime | 唯一职责 | 不负责 |
| --- | --- | --- |
| struct.Dialogue | 台词、speaker、Choice、target、可选 Event mutation 引用 | Contract、Card、Battle |
| struct.Event | Event state 与地图 NPC directive | 当前剧情进度 |
| struct.EventStateMutation | Event state 前置条件与赋值 | 任意 Shared State mutation |
| pokeman.EventStateList/current | 当前所有 active Event state | Dialogue 当前行、临时 Battle 状态 |
| Relationship | 有向人物关系与可选 Contract | 随身编队 |
| CarriedCards | holder 当前携带哪些 servant Card | Contract Integrity / Skill 定义 |
| Dialogue Subsystem | 执行 Dialogue graph，并在 terminal completion 时执行可选 mutation | 启动 Battle、创建 Contract |
| PokeMan Business Runtime | 双向契约 / 卡片等 PokeMan 业务事务 | 解释 Dialogue 台词 |
| Battle Subsystem | Battle Simulation、BattleResult、Contract Integrity 结算 | 直接调用战后 Dialogue |
| Story Resolver | 从当前 Story state 解析场景 | 推进 Event state |
| Map / Story Orchestrator | 调用 child Frames、执行业务 adapter、恢复 Map 场景 | 自己维护第二份剧情进度 |

禁止建立平行 authority，例如 Dialogue 自己保存一份剧情进度、Event 再保存一份，或把 Contract / Card 写进 EventStateMutation。

## 3. 序章 canonical Event state

出生地序章继续使用一个 Event：**prologue**。它表达研究所教学、劲敌挑战与教学 Battle 的阶段，不为每个 NPC 或每场 Battle 建立独立 Event。

Map 4 是博士研究所。当前 Map Runtime 中已经使用的场景坐标：

| NPC instance / npcId | Character | Placement |
| --- | --- | --- |
| professor | professor | (10, 6), direction 2 |
| rival-lab | rival | (8, 5), direction 2 |

prologue 的 canonical states：

| Event state | 博士 | 劲敌 | 进入方式 |
| --- | --- | --- | --- |
| lab-tutorial | 可交互，入口 professor-vertical-slice | 出现但不可交互 | 新游戏 baseline |
| rival-ready | 出现但不可交互 | 可交互，入口 lab-rival-intro | 博士教学完成 |
| after-battle | 可交互，入口 professor-first-journey | 仍在研究所，但不可交互 | 教学 Battle 结果确认完成 |

状态推进：

~~~text
prologue: lab-tutorial
        |
        | professor-tutorial-ready
        v
prologue: rival-ready
        |
        | Battle 正常结束 + result Dialogue 完成
        v
prologue: after-battle
        |
        | professor-first-journey-accept
        v
prologue: null
first-route: active
~~~

教学 Battle 运行期间不增加 battle-started Event state。Battle 当前是否运行、双方实时 HP 与本场临时数据属于 Battle Runtime；只有正常结束后已经确认的剧情结果才推进 Event。

## 4. Event 场景定义

Event state 对被接管的 Character 必须给出完整场景 directive。不要假设不同 state 会自动继承前一个 state 的 placement 或 interaction。

Map 4 的 prologue Content 目标形状：

~~~json
{
  "states": {
    "lab-tutorial": {
      "maps": {
        "4": {
          "npcs": {
            "professor": {
              "character": "professor",
              "placement": {
                "x": 10,
                "y": 6,
                "direction": 2
              },
              "interaction": {
                "dialogue": "professor-vertical-slice"
              }
            },
            "rival-lab": {
              "character": "rival",
              "placement": {
                "x": 8,
                "y": 5,
                "direction": 2
              }
            }
          }
        }
      }
    },
    "rival-ready": {
      "maps": {
        "4": {
          "npcs": {
            "professor": {
              "character": "professor",
              "placement": {
                "x": 10,
                "y": 6,
                "direction": 2
              }
            },
            "rival-lab": {
              "character": "rival",
              "placement": {
                "x": 8,
                "y": 5,
                "direction": 2
              },
              "interaction": {
                "dialogue": "lab-rival-intro"
              }
            }
          }
        }
      }
    },
    "after-battle": {
      "maps": {
        "4": {
          "npcs": {
            "professor": {
              "character": "professor",
              "placement": {
                "x": 10,
                "y": 6,
                "direction": 2
              },
              "interaction": {
                "dialogue": "professor-first-journey"
              }
            },
            "rival-lab": {
              "character": "rival",
              "placement": {
                "x": 8,
                "y": 5,
                "direction": 2
              }
            }
          }
        }
      }
    }
  }
}
~~~

这里的无 interaction directive 是有意设计：人物仍然可见，但当前剧情阶段不能从该 NPC 启动新的 Dialogue。

prologue active 时，Event 对 professor / rival 的 directive 接管对应 Character 的 defaultScenes。prologue 被移除后，Character.defaultScenes 才重新成为 fallback。rival 的默认场景应与 Map 8 宿敌家对齐，而不是继续使用旧 Map 1 配置。

## 5. Dialogue graph 与 terminal 语义

### 5.1 博士教学

~~~text
professor-vertical-slice
  ├─ 我明白了
  │    → professor-tutorial-ready
  │    → mutation: prologue-tutorial-ready
  │    → prologue = rival-ready
  │
  ├─ 再解释一次
  │    → professor-tutorial-repeat
  │         ├─ 明白了 → professor-tutorial-ready
  │         └─ 稍后再说 → professor-tutorial-not-yet
  │
  └─ 我先准备一下
       → professor-tutorial-not-yet
       → no mutation
~~~

只有 professor-tutorial-ready 推进 Event。重听和暂缓都是普通 terminal Dialogue，不改变 EventStateList。

### 5.2 劲敌交换

~~~text
lab-rival-intro
  ├─ 交换卡片，开始对战
  │    → lab-rival-exchange-accept
  │    → no mutation
  │    → Map Business Runtime 执行双向交换
  │    → 事务成功后调用 Battle
  │
  └─ 我还没准备好
       → lab-rival-defer
       → no mutation
       → 返回 Map
~~~

接受交换的 Dialogue terminal key 是业务 adapter 的输入，不是 Event state。Dialogue 不直接创建 Contract / Card，也不直接启动 Battle。

### 5.3 Battle 结果

| BattleResult | 战后 Dialogue | Dialogue mutation |
| --- | --- | --- |
| ally_win | lab-rival-after-ally-win | prologue-battle-resolved |
| enemy_win | lab-rival-after-enemy-win | prologue-battle-resolved |
| simultaneous_defeat | lab-rival-after-draw | prologue-battle-resolved |

三种对白解释不同的胜负结果，但在当前序章都进入同一个 after-battle state。暂时不为了保存胜负差异而拆成三个 Event state；未来只有当胜负会影响后续场景或任务时才增加分支状态。

Battle cancelled、failed 或 Integrity settlement 尚未确认时，不调用上述战后 Dialogue，也不执行 prologue-battle-resolved。

### 5.4 博士发布外出任务

after-battle state 中，博士的交互入口变为 professor-first-journey：

~~~text
professor-first-journey
  ├─ 我这就出发
  │    → professor-first-journey-accept
  │    → mutation: prologue-to-route
  │    → prologue = null
  │    → first-route = active
  │
  └─ 我还想准备一下
       → professor-first-journey-not-yet
       → no mutation
       → 保持 after-battle
~~~

接受任务的 terminal Dialogue 负责提交 Event mutation；不由路霸 Dialogue 或 Battle Runtime 推进 first-route。

## 6. EventStateMutation 定义

当前序章只需要三条 Mutation：

### prologue-tutorial-ready

~~~json
{
  "from": {
    "prologue": "lab-tutorial"
  },
  "to": {
    "prologue": "rival-ready"
  }
}
~~~

### prologue-battle-resolved

~~~json
{
  "from": {
    "prologue": "rival-ready"
  },
  "to": {
    "prologue": "after-battle"
  }
}
~~~

### prologue-to-route

~~~json
{
  "from": {
    "prologue": "after-battle",
    "first-route": null
  },
  "to": {
    "prologue": null,
    "first-route": "active"
  }
}
~~~

prologue-to-route 要求 first-route Event Content 已经存在，且包含 active state。该 Mutation 是一次 EventStateList 原子替换：结束 prologue 并激活 first-route，不拆成两个 commit。

开局 baseline：

~~~json
[
  {
    "eventId": "prologue",
    "stateId": "lab-tutorial"
  }
]
~~~

first-route 在开局时没有 entry；不要保存 stateId 为 null 的 entry。

## 7. Frame 调用与 Orchestration

Map / Story Orchestrator 是所有 child Frame 的调用者。Dialogue 与 Battle 都不互相调用。

~~~text
Map Frame
  |
  | NPC interaction + resolved dialogueKey
  v
Dialogue child Frame
  |
  | completed({ terminalDialogueId })
  v
Map / Story Orchestrator
  |
  +-- terminal = professor-tutorial-ready
  |      Dialogue mutation 已提交
  |      → refresh current Map scene
  |
  +-- terminal = lab-rival-exchange-accept
  |      → atomic business transaction
  |      → transaction success
  |      → Battle child Frame
  |      → confirmed BattleResult + Integrity settlement
  |      → select result Dialogue
  |      → Dialogue child Frame
  |      → result mutation commits after-battle
  |      → refresh current Map scene
  |
  +-- terminal = professor-first-journey-accept
  |      Dialogue mutation 已提交
  |      → refresh current Map scene
  |
  +-- no-mutation terminal / user defer
         → resume Map without changing Event state
~~~

Dialogue Frame 的生产输入至少需要包含入口 Dialogue key 和交互来源。Map 当前已能提供的 source identity 是 mapId、NPC instanceId 与 npcId；Dialogue graph 不需要把这些 Runtime identity 写回 Content。

Dialogue Frame 的生产 completion result 使用 terminalDialogueId。73 的 professor-only vertical slice 使用的 dialogueKey / conclusion 结果是验证切片的专用结果，不是正式 Dialogue graph 的最终业务结果 contract。

执行顺序：

1. Map 解析当前 NPC interaction，取得 Dialogue key。
2. Map 以 child Frame 调用 Dialogue。
3. Dialogue Subsystem 读取并执行 Dialogue graph。
4. 到达 terminal Dialogue 时，如存在 mutation，先读取 Mutation Content 和 EventStateList。
5. 校验全部 from 条件，以 EventStateList version 为 OCC condition 原子 commit 新列表。
6. 只有 mutation commit 成功后，Dialogue Frame 才以 completed 返回 terminalDialogueId。
7. Map 根据 terminalDialogueId 执行必要的业务 adapter；不重复执行 Dialogue mutation。
8. Map 根据当前 EventStateList 重新解析当前 Map 场景，再恢复普通 Map Controls。

Mutation mismatch、OCC conflict、commit outcome unknown 或 Content 读取失败，都不能伪装成成功 terminal。Frame 必须返回可识别的失败结果，由 Map 按可恢复错误策略处理。

RPGDialogue 用户取消与外层 child Frame 被取消是不同结果。用户取消不得执行 Dialogue mutation 或业务 adapter；外层 FrameOutcome.cancelled 仍按 73 的 child-frame lifecycle 规则处理。

## 8. 双向交换与 Battle 的业务边界

当 lab-rival-exchange-accept 正常完成后，PokeMan Business Runtime 解析当前目标 NPC Instance 的 Character / base BattleActor，并在一个 Shared State transaction 中提交：

- Relationship(player → rival).contract；
- Relationship(rival → player).contract；
- CarriedCards(player)；
- CarriedCards(rival)。

Contract Integrity 与 skills 分别来自被调用角色的基础 BattleActor；CarriedCards 只保存 slot 与 servantCharacterId。保留现有 Relationship 的 affinity、hostile 和 relationshipText。

必须满足：

- 两个方向分别建立，不能只创建 player → rival。
- 两份 Contract 和两份 CarriedCards 原子提交，不留下半交换。
- 序章随身上限为 1；任一方 slot 0 已占用时不能静默覆盖。
- transaction 未确认成功前不得启动 Battle。
- commit outcome unknown 时先按 Shared State authority reconcile，再决定是否重试。
- 已完整存在且内容一致的交换可作为幂等恢复；部分存在或内容冲突必须报告，不得 last-wins。

Battle 正常结束后，Battle Subsystem 负责把最终 Integrity 写回对应 Contract。只有 BattleResult 与 Integrity settlement 都已确认，Map 才能选择结果 Dialogue。

Battle child Frame cancelled / failed 时：

- 不播放胜负结果 Dialogue；
- 不执行 prologue-battle-resolved；
- prologue 保持 rival-ready；
- 已经成功提交的双向 Contract / Card 不回滚；
- 再次交互时，Business Runtime 必须识别已有交换并支持安全重试，不得重复创建或覆盖。

## 9. Story Resolver 与 Map 场景刷新

Story Resolver 的场景输入：

~~~text
struct.StoryIndex/current
+ pokeman.EventStateList/current
+ Character.defaultScenes
+ 当前 Map 的 transient Story / Encounter sources
~~~

解析规则继续遵守 62：

- active Event state 提到某 Character 时，该 Character 的 defaultScenes 退出 fallback。
- 没有 active Event directive 提到该 Character 时，使用 Character.defaultScenes。
- 合并所有 source 后，同一 Map 的最终 npcId 必须唯一；冲突 deterministic reject，不做 last-wins。
- StoryIndex 是 Builder 派生 Content，不是 Shared State authority。

Resolver 需要在两个时机执行：

1. Map Enter：解析该 Map 的当前完整 NPC 场景。
2. Dialogue child 正常完成且可能改变 EventStateList 后：重新读取 EventStateList，并重新解析当前 Map 的 NPC 场景。

第二种情况不能只恢复 Controls。否则 EventStateList 已经变为 rival-ready，但 Map 仍保留 lab-tutorial 的旧 interaction，导致剧情状态与可交互场景分离。

场景刷新必须保留当前 Map Frame、RenderDomain 和场景生命周期；不能为了刷新剧情而重启整张 Map 或创建第二个 Map Frame。具体 live NPC replacement API 应使用 Map package 已支持的接口；如果当前 API 不支持在 Map Enter 之后替换 NPC 集合，需要先补齐该运行时能力，再接入 Story Resolver。

Story Resolver 成为 authority 后，map.mjs 中 Map 4 的 professor / rival-lab 硬编码 placement 必须退出生产场景来源，避免与 Event directive 重复生成 NPC。Map-only placement 仅能保留给明确不受 Story Content 管理的临时 fixture。

## 10. 当前仓库与目标设计的差异

以下是本设计编写时对分支 docs/pokeman-battle-integration-v1 的检查结果。它们是后续 Content / Runtime 落地任务，不表示本文已经修改了 FSDB JSON 或 Subsystem 代码。

| 当前文件 / 实现 | 当前问题 | 目标修正 |
| --- | --- | --- |
| struct.Event/prologue | 只有 lab / after-lab，使用 Map 1，只有 rival directive | 改为 Map 4 的 lab-tutorial / rival-ready / after-battle，并包含 professor 与 rival |
| struct.EventStateMutation/prologue-to-route | from 使用 prologue.lab-complete | 改为 prologue.after-battle + first-route absent |
| struct.Event/first-route | 当前缺少该 Event | 在启用 prologue-to-route 前创建 active state 与实际道路场景 |
| struct.StoryIndex/current | 仍索引 Map 1 | 从更新后的 Character / Event source 重新生成 |
| struct.Character/rival.defaultScenes | 当前使用 Map 1 | 与 Map 8 宿敌家场景对齐；不要把 Map 4 Event placement 写入 Character default |
| struct.Dialogue/lab-rival-intro | 两个 Choice 都指向自身 | 分别指向 lab-rival-exchange-accept 与 lab-rival-defer |
| struct.Dialogue/route-bandit-threat | 当前引用 prologue-to-route | 移除该 mutation；first-route 应由 professor-first-journey-accept 推进 |
| struct.Dialogue | 当前 FSDB 文件还缺少博士教学 / 战后等目标 Dialogue | 按 78 完成对应 Content records |
| subsystems/map.mjs | Map 4 NPC placement 仍为硬编码 | Story Resolver 接入后改由 Event 场景解析提供 |
| Dialogue / Event / Mutation .info.meta | 嵌套结构 schema 较宽 | Builder 必须完成 62 / 64 规定的深层引用和结构校验 |

注意：Map 4 的目标坐标来自当前 map.mjs placement；Map 8 的目标场景应与现有 map-only rival-casual placement 核对后再写入 Character.defaultScenes。不要把旧 Map 1 示例当成当前 MVP 地图绑定。

## 11. Builder 与 Runtime 验收

### Builder / Content 验证

- prologue 必须包含 lab-tutorial、rival-ready、after-battle 三个 state。
- 三个 state 的 Map 4 directive 都包含 professor 与 rival-lab，placement 与当前地图坐标一致。
- interaction 中的 Dialogue key 必须存在。
- professor-tutorial-ready、prologue-battle-resolved、prologue-to-route 的 Mutation key 必须存在。
- Mutation 的非空 stateId 必须属于对应 Event；null 必须按 62 解释。
- first-route Event 在 prologue-to-route 被引用时必须存在，并有 active state。
- Dialogue Choice target 必须存在；choices 与 mutation 互斥。
- lab-rival-intro 不得有指向自身的无意义 Choice，除非内容明确设计为循环复习。
- StoryIndex 必须与 Character / Event source 一致。
- 最终 Map NPC 合并结果不得存在重复 npcId。

### Runtime / E2E 验收

1. 新游戏 baseline 为 prologue:lab-tutorial。
2. 进入 Map 4，博士在 (10,6)，劲敌在 (8,5)；只有博士可交互。
3. 博士选择重听可循环；选择暂缓不改变 EventStateList。
4. 博士选择准备好后，Dialogue mutation 将 prologue 推进到 rival-ready。
5. 不离开 Map 4，Story Resolver 刷新后劲敌可交互，博士不再提供初始教学入口。
6. 劲敌暂缓不创建 Relationship / Contract / Card，也不调用 Battle。
7. 劲敌接受后，双向 Relationship / Contract 与双向 CarriedCards 原子提交；提交失败不调用 Battle。
8. Battle cancelled / failed 不播放胜负对白、不推进 after-battle；已提交的 Contract / Card 保留。
9. Battle 正常结束且 Integrity 已提交后，三种 BattleResult 进入各自战后 Dialogue。
10. 任一战后 Dialogue 完成后，prologue-battle-resolved 将 Event 推进到 after-battle。
11. Map 4 刷新后博士可交互并启动 professor-first-journey；劲敌仍在场但不可交互。
12. 玩家暂缓外出任务，Event 保持 after-battle；再次与博士交互仍可接受。
13. 玩家接受任务后，prologue-to-route 原子结束 prologue 并激活 first-route。
14. 离开研究所后，Map 5 / Map 7 场景由 first-route 与 Story Resolver 提供；prologue 移除后 Character fallback 按规则恢复。
15. 重新载入游戏后，EventStateList 能恢复正确剧情阶段，地图交互与剧情进度一致。

## 12. 明确不做

当前不增加：

- 通用 Quest / Objective / Trigger / Action / Command / Workflow engine；
- Choice 条件表达式、任意 action 或 Choice mutation；
- EventStateMutation 对 Relationship、Contract、Card、Battle 或 PlayerWorld 的写操作；
- battle-started / battle-running 等临时 Event state；
- 为三种 BattleResult 无条件拆分三个剧情状态；
- Dialogue 当前行、Choice pending、terminalDialogueId 的 Shared State 持久化；
- 由 Dialogue 直接调用 Battle，或由 Battle 直接调用 Dialogue；
- 为 Map scene refresh 重启 Map Frame。

先完成这一条 prologue vertical slice，再由真实内容需求决定是否需要扩展 Story Runtime。
