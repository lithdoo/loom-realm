# 数据落点

> 独立技术设计记录。不改写 `../DESIGN.md`，也不把产品规则再扩一版。本文只划分大模块的数据归宿，不定义字段、Record key 或 API。

序章产品规则已经冻结。后续按模块讨论数据结构时，以本文的归宿为准：先确定一份事实住在哪里，再讨论它的形状。

## 三处归宿

| 归宿 | 是什么 | 这一局会不会变 |
| --- | --- | --- |
| Content | 安装包里的只读定义、剧情内容、派生索引与资源 | 不会。玩家的行动不改写 Content |
| Realm State | 这一局里跨 Subsystem 共享、不能只靠 Content 重建的业务事实 | 会。它是存档要能恢复的那一份真相 |
| 临时内存 | 当前 Frame、当前模拟或当前画面才需要的工作数据 | 会，但结束或读档时按 Content 和 Realm State 重建 |

判定可以收成三句：

- 每个新游戏都一样、并且玩的过程中不改的定义与剧情规则，放 Content。
- 这一局里真正发生了什么、剧情走到哪个状态、玩家作出了什么选择等 mutable facts，放 Realm State。
- 能由 **Content + Realm State 的最小状态**重新算出的世界表现，不为了存档方便再复制一份进 Realm State。
- 只服务当前一次调用、当前一场模拟或当前一帧画面的，留在内存里。

另有两份文档不是新的数据主人：

- **Game Entry 的 `state.records`** 是 Session bootstrap 时安装进 Realm State 的 immutable Game baseline。它在 root System Menu 出现以前就已经存在，不是玩家点击 New Game 时才写入。初始好感、初始事件状态等 mutable business baseline 可以写在这里；人物默认场景实例、剧情状态下的人物实例等 immutable definition 放 Content。点击 New Game 之后如何恢复一局新的 current state、是否重建 Session，留到 Session / Save-Load 架构继续设计。
- **存档**是 Realm State 里被选中事实的业务快照。读档时由业务验证、迁移和解释存档，再通过普通 Realm State mutation 恢复 current state；Load 不是第二套 Realm State bootstrap。

中心管理器不是单独的数据模块。它是地图上的一个地点；修复卡片是在改角色卡的完整度。

## 剧情优先留在 Content

PokeMan 的剧情定义尽量保持数据驱动：Event、Event State、静态 Dialogue、剧情状态下的 Map NPC Instance 等都优先写在 Content，而不是硬编码进 `world.mjs`，也不把这些定义展开后的结果逐项复制进存档。

概念上：

```text
Content
├─ Character definitions
├─ Event definitions
│  └─ states
│     ├─ static dialogue
│     └─ NPC instance / placement definitions
├─ Dialogue definitions
├─ Encounter definitions
└─ Builder 生成的 Story Index
   ├─ by Map
   ├─ by Character
   └─ by Event

Realm State
└─ 最小动态事实
   ├─ eventId → currentStateId
   ├─ Relationship
   ├─ Contract / Card
   ├─ player current state
   └─ 不能只靠 Content 重算的随机或玩家选择结果
```

作者维护的是可读的 Character / Event 等源 Content；Builder 可以把这些关系编译成 Runtime 友好的派生索引。派生索引仍然是 Content，不是新的 authority，也不是存档数据。

这样 World 进入地图时不需要扫描所有剧情内容：

```text
Map Enter
→ 读取该 Map 的 Story Index
→ 找到可能影响本地图的 Event / NPC Instance 定义
→ 读取 Realm State 中相应 Event currentStateId
→ Story Resolver 计算当前 Map 的 NPC Instance 集合
→ 转成 @loomrealm-game/map 的 NPCPlacement[]
```

因此新增剧情原则上是“新增 / 修改 Content → Builder 重新生成索引”，而不是同时修改 World 代码和 Save schema。

## Character 与 NPC Instance

Character 表示“这个人是谁”，是稳定人物身份；Map 上的 NPC Instance 表示“当前场景里出现的一个表现实例”。二者不是一回事。

```text
Character rival
├─ NPC Instance rival-lab-a
├─ NPC Instance rival-lab-b
└─ NPC Instance rival-town
```

同一个 Character 可以在不同地图，甚至同一张地图上拥有多个 NPC Instance。这不会自动解释成存在多个角色本体；这些实例仍然关联到同一个 Character，因此人物关系、契约、角色卡等人物级事实不会复制成多份。

真正需要作为 Map 候选集合内稳定实例身份的是 `instanceId`。`characterId` / `npcId` 不因为重复出现就构成错误。

Builder 应检查能够在构建期确定的数据错误，例如：

- 同一个定义中的重复 `instanceId`；
- 不存在的 `characterId` / `npcId` / `mapId` 引用；
- 非法坐标、朝向或不完整 placement；
- 派生索引与源定义不一致。

Builder **不因为同一个 Character 或 `npcId` 出现多次而失败**。如果多个剧情来源在当前运行状态下最终产生相同 `instanceId`，Story Resolver 必须按确定规则处理为冲突，而不是随机保留一个；具体冲突 / 顺序规则继续随 Event 设计讨论。

## 模块归宿

| 模块 | Content | Realm State | 临时内存 |
| --- | --- | --- | --- |
| 会话 / Frame | — | — | Frame 栈、Activation、InputTarget、正在调用谁 |
| 系统菜单 | 菜单条目可写在子系统里 | 本局不存放。音量、文字速度是本地偏好 | root / 游戏中菜单实例、光标、未确认操作 |
| 消息 | — | — | 当前这一条模态，确认后消失 |
| 地图与玩家 | 地图、碰撞、传送；剧情定义的 NPC Instance / placement 与 Story Index | 当前地图、玩家格与朝向、必要的临时剧情覆盖、事件当前状态 id | Resolver 工作集、镜头、走步动画、输入缓冲、寻路 |
| 人物本体 | 身份、描述（职业、性格、经历）、功能标签、默认场景实例，以及角色卡 / Battle 表现所需的静态数据与素材 | — | 当前地图上解析出来的 NPC Instance |
| 契约与角色卡 | 所有持久角色都提供形成角色卡 / Battle 表现所需的静态数据与素材；这只是 Content 能力，不代表游戏规则允许当前建立契约 | 契约、持有者、完整度、在中心还是随身；能否建立契约由剧情、关系和系统规则决定 | 中心里尚未提交的编队草稿 |
| 口袋陪伴 | 同行台词、地点评论 | 已经触发过的口袋事件 | 正在说的一句 |
| 关系 | — | 好感整数与 hostile 是独立事实；具体 Relationship Record 形状后续单独定义 | 战斗结束前尚未写回的变化 |
| 剧情 | Event、states、静态 Dialogue、剧情状态下的 NPC Instance / placement，以及 Builder 生成的 Story Index | 事件当前状态 id，以及真正不能只靠 Content 重建的玩家选择结果 | 正在解析 / 执行、尚未提交的事件步骤 |
| 遭遇 | 每张地图的遭遇表、出生点、类型 | 本次进图已经生成且需要持续存在的可见实例 | 视野、拦路、追逐、这一步的接触 |
| 对话 | 对话图、选项、条件 | 选择结果写入剧情或关系，对话不另存一份真相 | 当前节点、未提交的选择 |
| 战斗 | 规则、技能、教学战、角色 Battle 静态资料 | 结束后写回的卡片完整度与已提交后果 | 战场、Decision、模拟、本场本体 HP、动画 |
| 表现 | 图块、角色图、界面皮肤 | — | Renderer 当前副本与动画 |
| 存档 | — | 快照来自 Realm State，不是另一份真相 | 读档过程中的临时缓冲 |

这里的“所有持久角色都提供角色卡 / Battle 所需数据与素材”只说明 Content 是完备的：以后某个角色一旦按游戏规则建立契约或进入 Battle，不需要再临时发明另一套角色定义。它**不等于**“所有角色在任意时刻都能被收服 / 建立契约”；是否允许建立契约仍是游戏规则。

训练、Guidance、多卡编队已经有归宿：定义在 Content，长期结果在角色卡、关系或剧情 State，进行中的操作在对应 Frame 的临时内存。序章不产生这些事实。

## 谁可以提交

```text
Main
  只持有 Frame 栈

System Menu
  触发新游戏、读档、设置、退出
  不直接改世界事实

Message
  不持有事实

Dialogue / Battle
  Frame 内只有工作集
  结束时把结果交回 World

World
  解析 Content + Realm State
  提交真正的地图进度、角色卡、关系、剧情、遭遇等 mutable facts
  把 Dialogue / Battle 的结果写回 Realm State
```

System Menu 可以发起 New Game / Load 意图，但 Realm State 中世界事实的 reset / restore 仍由产品业务流程解释和提交；菜单本身不是第二个 State authority。

## 存档带走什么

存档只带走稳定、不能仅通过安装 Content 重建的 mutable facts：

- Realm State 中已提交的事件当前状态 id、关系状态和玩家选择结果；
- 当前地图；
- 玩家位置与朝向；
- 契约 / 角色卡当前状态；
- 当前地图已经生成且需要持续存在的可见 Encounter；
- 其他已经提交、需要跨读档恢复的剧情和 Pocket 事实。

存档不重复保存 Character 默认实例、Event state 中声明的 NPC placement、Story Index 等 immutable Content definition。

存档不带走：

- Frame 栈；
- 打开中的系统菜单和消息；
- 进行中的对话光标；
- 进行中的战斗模拟；
- Story Resolver 的派生结果；
- Renderer 副本。

因此存档点落在 World 的稳定状态上。对话中途、战斗中途不把当前 Frame 工作集写成存档。

## 序章实际会进入 State 的面

序章真正落进 Realm State 的范围很小：

- 当前地图和玩家位置；
- 事件当前状态 id，以及确实需要保存的临时剧情事实；
- Relationship 当前事实，包括好感与独立 hostile 状态；
- 双向契约的两张卡；
- 宿敌卡的完整度和随身；
- 序章进行到哪一拍；
- 第一道路上已经生成且需要持续存在的 Encounter；
- 少量玩家选择 / 剧情标记；
- 已经播过的口袋触发。

Character 默认场景实例、Event state 下声明的 NPC Instance / placement 与 Story Index 留在 Content，不作为存档事实重复保存。人物这条见 [人物](./61-character.md)，事件见 [事件](./62-event.md)。其余模块的字段形状留到逐模块讨论时再定。
