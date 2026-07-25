# LoomRealm 产品定位与第一阶段范围

> 状态：**Active / Normative**  
> 适用范围：LoomRealm 第一阶段  
> 最近复核：2026-07-25

本文档是 LoomRealm 产品定位和第一阶段范围的唯一主要定义位置。其他文档可以说明某个模块的局部非目标，但不得重新定义第一阶段的总体范围。

## 1. 产品定位

LoomRealm 是一个约定只读游戏包结构、通过命令行启动、由权威运行时驱动并使用 Web Client 呈现的 RPG 运行平台。

第一阶段的公开启动方式是：

```bash
loom-realm start ./game
```

其中：

- `./game` 是运行期间只读的 LoomRealm 游戏包目录；
- 游戏包保存静态游戏定义和资源；
- Runtime Core 保存当前会话的权威可变状态；
- Web Client 只接收客户端目标状态和资源，不读取原始 FSDB；
- Hostra 是可选桌面宿主，不参与游戏规则。

LoomRealm 第一阶段不提供游戏内容编辑器、项目创作 API 或任意脚本执行环境。

## 2. 第一阶段目标

第一阶段交付一个可运行的纵向切片，验证以下完整链路：

```text
只读游戏包
→ 轻量 Game Catalog
→ 按需加载当前地图和人物
→ Runtime Execution Loop
→ Runtime Core
→ Runtime / Session Snapshot
→ Client State Projector
→ Scoped Client State Tree
→ Runtime Service
→ Web Client DOM/CSS 渲染
```

验收场景至少包含：

- 两张可往返的测试地图；
- RPG Maker XP / Pokémon Essentials v21.1 语义的三个 Tile 数据层；
- 普通 Tile 和静态第一帧 Autotile；
- Tile 方向通行和 Priority；
- 一个四方向格子行走的玩家人物；
- 静态碰撞；
- 一对双向 Portal；
- 地图切换的异步准备和原子提交；
- 浏览器和 Hostra 桌面运行路径；
- 原创或明确允许再分发的公开测试素材。

## 3. 第一阶段包含

### 3.1 游戏包与内容访问

- 普通目录形式的只读游戏包；
- 根清单 `realm.game.json`；
- `data/[FSDB]project` 静态数据；
- 启动时建立轻量内容索引；
- 地图和人物通过 Repository 按需异步加载；
- 图片资源由 Web Client 按稳定资源 Key 请求；
- `loom-realm validate ./game` 的全包验证语义可以先定义、后补齐实现。

### 3.2 Runtime

- 单 Session、单 Runtime Execution Loop、单 Runtime Core；
- Runtime Core 同步、确定性且无文件或网络 I/O；
- Runtime Execution Loop 是 Core 的唯一写入口；
- 固定 Tick、单调时钟、有限追赶和有界命令队列；
- 一个玩家人物的四方向单格移动；
- 地图边界、方向通行和静态占用碰撞；
- Portal Effect、异步目标场景准备和原子地图提交；
- 统一暂停、Runtime Revision、Session Revision 和明确故障状态。

### 3.3 Client State 与呈现

- Runtime / Session Snapshot 到 Client State 的独立投影；
- Scope、Roots 和 `key/tag/data/children` 通用节点树；
- `state.snapshot` 和 `scope.replace`；
- Runtime Event 与可恢复状态分离；
- Web Client 的独立 Client Store；
- 按稳定 Key 协调 DOM Element；
- 注册 Tag 和对应 Data Schema；
- CSS Transform 等非权威本地表现状态；
- 普通浏览器和 Hostra 使用相同 Runtime RPC 语义。

## 4. 第一阶段不包含

以下内容不属于第一阶段完成条件：

- Save System、`.lrsav` 格式、存档创建、恢复或迁移；
- ZIP、ASAR 或单文件游戏包；
- 游戏内容编辑器和项目创作接口；
- NPC、通用地图事件和 RPG Maker 事件解释器；
- Pokémon、训练师、战斗、背包、任务等完整业务系统；
- 多会话、多人同步、客户端预测和 Server 校正；
- 节点级 Patch 和多 Scope Batch Patch；
- 插件系统和任意脚本执行；
- Autotile 动画、天气、音频和完整 Terrain Tag 行为；
- 大地图流式加载、虚拟化、Canvas 或 WebGL 渲染；
- 后台预取、加载取消和持久化编译缓存；
- 远程游戏包、DLC、补丁包和外部内容依赖。

其中 Save System 仅保留架构边界：存档位于游戏包外部，保存可变会话状态，不修改或复制静态游戏包内容。具体格式和运行闭环进入后续阶段。

## 5. 权威边界

```text
游戏包
    静态定义和资源，运行期间只读

Repository
    异步读取、解析、校验和缓存静态内容

Session Coordinator
    异步内容准备和会话流程

Runtime Execution Loop
    Core 操作顺序、Tick、队列和 Effect Barrier

Runtime Core
    权威游戏状态和规则

Client State Projector
    Runtime / Session Snapshot 到客户端目标树

Runtime Service
    外部命令、状态消息、事件和资源接口

Web Client
    Client Store、DOM 协调和非权威表现状态

Hostra
    桌面窗口、进程和本地宿主生命周期
```

## 6. 范围变更规则

任何新增第一阶段能力必须同时满足：

1. 在本文档中明确加入第一阶段范围；
2. 更新相关契约或设计文档；
3. 若涉及重要取舍，新增 ADR；
4. 更新 `doc/overview/document-status.md`；
5. 删除或标记与新结论冲突的旧内容；
6. 更新路线图和验收标准。

专题文档中的局部描述与本文档冲突时，以本文档为准，并应立即修正文档冲突。