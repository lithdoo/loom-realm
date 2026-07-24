# 第一阶段人物行走与碰撞运行时

## 1. 文档目的

本文档专门定义 LoomRealm 第一阶段人物行走、方向输入、碰撞判定、连续步进、状态提交和 Portal 衔接规则。

Pokémon Essentials v21.1 地图兼容、Tile ID、Autotile、Tile Priority 和资源导入由 [`phase-1-pokemon-essentials-map-runtime.md`](./phase-1-pokemon-essentials-map-runtime.md) 定义；本文档聚焦运行时收到方向意图后，如何产生权威人物状态。

核心原则是：

> 后端决定人物是否能够移动以及最终位于哪个格子；前端只根据权威移动状态使用 DOM 和 CSS 表现移动过程。

## 2. 第一阶段范围

第一阶段行走与碰撞只支持：

- 一个玩家人物；
- 上、下、左、右四方向；
- 整数格子坐标；
- 一次移动一个格子；
- Pokémon 风格连续步进行走；
- 地图边界碰撞；
- 基于 Pokémon Essentials/RPG Maker XP Tile 通行属性编译出的方向碰撞；
- 碰撞失败时转向但不改变位置；
- 完成一步后检测 LoomRealm Portal；
- 前端使用 CSS Transform 表现格子间移动。

第一阶段不支持：

- 八方向或斜向移动；
- 自由像素移动；
- 加速度、惯性和物理模拟；
- 像素级碰撞盒；
- 多角色实体碰撞；
- 推动物体；
- 跳跃、滑冰、冲浪、骑行和攀瀑；
- Terrain Tag 对移动方式的特殊修改；
- 客户端预测和服务器校正。

## 3. 坐标模型

地图和人物逻辑统一使用整数格子坐标：

```text
原点：地图左上角
x：向右递增
y：向下递增
```

方向与坐标增量：

| 方向 | dx | dy |
|---|---:|---:|
| `up` | 0 | -1 |
| `down` | 0 | 1 |
| `left` | -1 | 0 |
| `right` | 1 | 0 |

人物的权威位置表示人物稳定站立的格子，不表示当前 DOM 元素的像素位置。

```text
权威格子位置
    = 后端状态

格子之间的当前像素位置
    = 前端表现状态
```

人物视觉图片可以高于或宽于一个 Tile，但第一阶段逻辑占用范围固定为一个地图格。透明区域、图片高度和 DOM 元素尺寸不参与碰撞。

## 4. 输入模型

前端监听键盘或其他输入设备，但不把原始 DOM 事件发送给后端。

前端维护按键集合，并归一化为单个方向意图：

```text
up | down | left | right | none
```

规则：

1. 同时按下多个方向时，选择最近按下且仍保持按下的方向；
2. 当前方向意图变化时，前端向后端发送新的归一化意图；
3. 松开所有方向键时发送 `none`；
4. 不依赖浏览器的按键自动重复频率；
5. 后端保存最新方向意图，用于决定下一步是否开始。

前端方向意图表达“用户现在希望向哪里走”，不直接表示一次移动已经成功。

## 5. 权威人物状态

第一阶段后端人物状态概念上包括：

```text
Player Runtime State
├── mapId
├── settledPosition
│   ├── x
│   └── y
├── direction
├── directionIntent
├── phase
│   ├── idle
│   ├── stepping
│   └── mapTransition
└── movement
    ├── stepId
    ├── from
    ├── to
    ├── direction
    ├── startedAt
    └── durationMs
```

字段边界：

- `settledPosition` 是最后已经完成并提交的格子位置；
- `direction` 是人物当前朝向；
- `directionIntent` 是前端最后同步的方向意图；
- `phase` 表示人物当前是否空闲、正在走一步或正在切换地图；
- `movement` 只在 `stepping` 阶段存在；
- `stepId` 用于区分连续移动中的每一步；
- `startedAt` 使用后端单调时间基准；
- `durationMs` 来自人物移动定义或运行时规则。

前端可以镜像这些状态，但不能通过修改镜像改变游戏结果。

## 6. 一步移动事务

一次移动尝试按照以下顺序执行：

```text
人物处于 idle
    ↓
读取当前 directionIntent
    ↓
意图为 none → 保持 idle
    ↓
更新人物 direction
    ↓
根据方向计算目标格
    ↓
执行碰撞与通行判定
    ├── 不可通行 → 保留方向、保持位置、结束本次尝试
    └── 可通行 → 创建 movement、进入 stepping
                         ↓
                    移动时序完成
                         ↓
              提交新的 settledPosition
                         ↓
                   清除 movement
                         ↓
                    检查 Portal
                         ↓
               idle 或 mapTransition
```

一次步进具有事务边界：

- 碰撞检查通过前，不进入 `stepping`；
- 一旦进入 `stepping`，该步的起点、终点和方向保持不变；
- `stepping` 期间收到的新方向只更新 `directionIntent`，不修改当前步终点；
- 当前步完成后，运行时再根据最新方向意图决定下一步；
- Portal 只在人物完成一步并稳定站立后检查。

## 7. 碰撞数据来源

第一阶段不在 `map.tile` 的每个位置保存单一 `blocked`。

运行时地图加载阶段根据以下内容编译方向通行网格：

```text
三个地图 Tile 层
        +
当前地图使用的 tile.set
        +
tile.property 中的方向通行属性
        ↓
有效方向通行网格
```

运行时人物移动代码只读取已经编译好的通行结果，不在每次移动时重新遍历 FSDB、解释原始 Tile ID 或解析 passage flags。

概念结构：

```text
Passability Cell
├── canExit.up
├── canExit.down
├── canExit.left
├── canExit.right
├── canEnter.up
├── canEnter.down
├── canEnter.left
└── canEnter.right
```

实际实现可以采用更紧凑的位标记或预计算函数，但移动系统看到的语义必须是标准四方向通行结果。

Pokémon Essentials/RPG Maker XP 原始 passage flags 的位语义、三个图层的合并方式和特殊 Tile 规则集中在兼容编译器中，不进入前端和通用移动状态机。

## 8. 方向通行判定

人物从当前格 `A` 沿方向 `D` 尝试进入目标格 `B` 时，至少执行：

```text
1. 计算 B = A + direction delta
2. 检查 B 是否位于地图范围内
3. 检查 A 是否允许沿 D 离开
4. 检查 B 是否允许从 D 的反方向进入
5. 检查运行时是否处于允许开始移动的阶段
6. 返回 passable 或 blocked
```

反方向映射：

| 移动方向 | 目标格进入边 |
|---|---|
| `up` | `down` |
| `down` | `up` |
| `left` | `right` |
| `right` | `left` |

地图边界始终不可通行。即使来源格的 Tile 属性允许离开，只要目标坐标越界，移动仍然失败。

第一阶段不根据人物图片、DOM 尺寸、Sprite Sheet 透明区域或 CSS Transform 位置判断碰撞。

## 9. 三层 Tile 的通行合并

Pokémon Essentials 地图包含三个 Tile 数据层。兼容编译器需要把同一格子三个图层上的有效 Tile 属性合并为一个标准通行结果。

本文档确定以下边界：

- 合并发生在地图加载或内容编译阶段；
- 人物移动阶段只读取合并后的结果；
- 空 Tile 不单独产生阻挡；
- 不可通行的有效 Tile 可以阻止对应方向；
- Priority 主要影响渲染排序，不能由前端反向决定碰撞；
- Terrain Tag、Bush、Counter 等第一阶段未执行的语义不能隐式改变通行结果；
- 精确 passage flags 位解释与多层覆盖算法仍需通过 Pokémon Essentials v21.1 测试夹具验证。

在验证完成前，兼容编译器必须保留原始 Tile ID 和原始 passage flags，确保错误可以追踪回来源数据。

## 10. 碰撞失败语义

当移动尝试被阻挡时：

1. 人物朝向更新为本次尝试方向；
2. `settledPosition` 保持不变；
3. 不创建有效的 `movement`；
4. `phase` 保持或恢复为 `idle`；
5. 不检查目标格 Portal；
6. 不允许前端播放成功跨格的位移动画；
7. 前端可以根据方向变化更新人物 Sprite 行；
8. 第一阶段不要求独立的后退、弹性或碰撞抖动动画。

碰撞失败的长期可恢复结果是“方向可能变化、位置不变”，因此应体现在权威状态中。

第一阶段不要求为每次碰撞失败发送独立业务 RPC。调试日志或一次性碰撞提示可以走通用事件通道，但不能替代权威人物状态。

## 11. 成功步进语义

碰撞判定通过后，后端创建一次权威移动：

```text
movement.from = 当前 settledPosition
movement.to = 目标格
movement.direction = 当前方向
movement.startedAt = 后端单调时间
movement.durationMs = 本次步进时长
phase = stepping
```

在 `stepping` 阶段：

- `settledPosition` 仍表示起点，直到该步完成；
- 当前步终点不可被新的输入修改；
- 前端根据 `from`、`to`、`startedAt` 和 `durationMs` 计算表现进度；
- 后端不发送逐帧像素位置；
- 浏览器暂停或降频后，前端应根据最新权威时间直接对齐，而不是继续播放过期动画。

当后端确认步进时间完成时：

```text
settledPosition = movement.to
movement = null
phase = idle
```

随后在同一运行时处理周期中检查 Portal，并决定最终保持 `idle` 还是进入 `mapTransition`。

## 12. 连续行走

连续按住方向时：

1. 前端保持同一个方向意图；
2. 后端完成当前步；
3. 如果人物未进入 Portal 且最新方向意图仍不为 `none`，可以开始下一步；
4. 下一步必须重新执行边界和碰撞检查；
5. 不因为上一格可通行而预先假设下一格可通行。

移动中改变方向时：

- 当前步保持原方向和原终点；
- `directionIntent` 更新为新方向；
- 当前步完成后，下一次移动尝试使用新方向；
- 是否在步进完成瞬间同时更新人物朝向，由状态提交策略决定，但不能修改已经开始的当前步。

输入变为 `none` 时：

- 当前步仍正常完成；
- 完成后不自动开始下一步；
- 不在半格位置停止人物。

## 13. 状态同步与前端表现

后端同步的移动状态用于让前端重建当前人物表现。

前端 DOM 渲染流程：

```text
接收权威人物状态
    ↓
更新前端状态镜像
    ↓
根据格子坐标计算像素起点和终点
    ↓
根据 startedAt 和 durationMs 计算当前进度
    ↓
更新人物 DOM 的 CSS Transform
```

前端不得：

- 读取 `offsetLeft` 或 Transform 结果作为权威位置；
- 根据 `transitionend` 决定人物是否已经到达；
- 因动画卡顿而延迟后端状态应用；
- 修改 DOM 后反向写入人物逻辑坐标；
- 在后端判定碰撞失败时继续移动到目标格。

地图切换、重新连接或状态版本不连续时，前端必须以最新完整状态重新建立人物位置，不继续依赖旧动画。

## 14. Portal 衔接

Portal 不参与移动前的普通方向碰撞判定。人物必须先合法完成一步，稳定进入触发区域，才检测 Portal。

流程：

```text
完成 stepping
    ↓
提交目标格为 settledPosition
    ↓
检查目标格是否位于 Portal 触发区域
    ├── 否 → 保持 idle，可继续下一步
    └── 是 → 校验目标地图与目标位置
                  ↓
             进入 mapTransition
                  ↓
             清空方向意图
                  ↓
       切换地图并提交目标稳定位置
                  ↓
        同步完整客户端地图状态
```

Portal 目标位置必须：

- 位于目标地图范围内；
- 允许人物稳定站立；
- 通过运行时地图的通行校验；
- 不依赖前端 DOM 判断是否合法。

第一阶段切换后清空方向意图，避免人物在新地图中立即继续移动或反向触发 Portal。

## 15. 状态版本与提交边界

必须保持以下状态组合的一致性：

- 朝向和对应的移动方向；
- `phase` 和 `movement` 是否存在；
- `movement.from` 与当前稳定位置；
- 步进完成后的新稳定位置；
- Portal 切换后的地图 ID 和目标坐标。

具体一次移动产生几次增量状态更新仍由协议实现阶段决定，但不得向前端暴露互相矛盾的中间组合，例如：

- `phase = stepping` 但没有 `movement`；
- `movement.to` 已改变但 `stepId` 未改变；
- 地图 ID 已切换但人物仍在旧地图坐标；
- 碰撞失败却同步了目标位置；
- 步进完成后仍保留旧 `movement`。

首次连接、重新连接、地图切换或增量版本断裂时，发送完整状态。

## 16. 运行时职责分层

建议职责链路：

```text
Direction Intent Store
        ↓
Walking Controller
        ↓
Passability Query
        ↓
Player State Transaction
        ↓
Portal Query
        ↓
State Projection
```

职责：

- **Direction Intent Store**：保存最新归一化方向意图；
- **Walking Controller**：决定何时开始和完成一步；
- **Passability Query**：查询运行时地图的方向通行结果；
- **Player State Transaction**：原子更新朝向、阶段、移动和稳定位置；
- **Portal Query**：在步进完成后检查地图跳转；
- **State Projection**：生成面向前端的客户端可见状态。

这些职责不直接读取 DOM，也不在移动过程中直接遍历 FSDB 文件。

## 17. 校验与不变量

运行时必须维持：

- `idle` 时 `movement` 为空；
- `stepping` 时 `movement` 存在；
- `mapTransition` 时不开始新步进；
- `movement.from` 位于地图范围内；
- `movement.to` 与 `from` 的曼哈顿距离恰好为 `1`；
- `movement.direction` 与 `from → to` 一致；
- `settledPosition` 始终位于当前地图范围内；
- 人物只能稳定站在允许站立的位置；
- `stepId` 在每次成功开始新一步时变化；
- 碰撞失败不改变 `settledPosition`；
- Portal 切换后的地图和坐标必须同时提交。

检测到不变量破坏时，不应继续应用后续增量状态；运行时应报告错误，并重新建立有效状态或终止当前原型运行。

## 18. 测试场景

第一阶段至少建立以下自动或集成测试：

1. 向四个方向分别移动一个可通行格；
2. 尝试越过地图四条边界；
3. 面向墙体移动，确认转向但位置不变；
4. 当前格允许离开、目标格禁止进入；
5. 当前格禁止离开、目标格允许进入；
6. 三个 Tile 层共同决定阻挡；
7. 按住一个方向连续行走多个格；
8. 步进中切换方向，确认当前步不变、下一步采用新方向；
9. 步进中释放方向，确认当前步完成后停止；
10. 碰撞失败时不触发目标格 Portal；
11. 完成一步进入 Portal 后切换地图；
12. 地图切换后方向意图被清空；
13. 前端动画落后时能够对齐最新权威状态；
14. 状态版本断裂后通过完整状态恢复人物位置；
15. 不同人物图片尺寸不改变逻辑碰撞结果。

## 19. 尚待实现阶段确认

以下细节尚未冻结，但不得改变本文档的职责边界：

- 后端固定 Tick 的频率或具体调度方式；
- `startedAt` 的具体序列化格式；
- 朝向变化、步进开始和步进完成分别发送几次增量更新；
- 碰撞失败是否发送可选的一次性调试事件；
- Pokémon Essentials passage flags 的精确位解释；
- 三个 Tile 层的最终通行合并算法；
- Priority 与特殊 Tile 对通行规则的兼容细节；
- 前端收到延迟移动状态时的动画对齐实现。

这些事项完成后，需要同步更新本文件和第一阶段设计待办。

## 20. 当前结论

第一阶段人物行走与碰撞采用以下原则：

- 后端保存权威地图、人物格子位置、朝向和移动时序；
- 前端只发送归一化方向意图；
- 人物采用四方向单格步进；
- 一次步进开始前必须完成方向通行判定；
- 地图边界始终阻挡；
- 碰撞失败时人物转向但位置不变；
- 成功步进期间不允许改变当前步终点；
- 持续输入通过最新方向意图驱动下一步；
- 三层 Tile 和 passage flags 在兼容编译阶段生成标准通行网格；
- 移动代码不直接解释 Pokémon Essentials 原始数据；
- 前端根据权威移动状态使用 DOM/CSS 插值；
- DOM 动画不决定碰撞和移动结果；
- Portal 只在一步完成并稳定进入触发区域后检测；
- 地图切换后同步完整状态并清空方向意图。
