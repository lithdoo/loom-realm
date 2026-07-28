# LoomRealm 产品定位与第一阶段范围

> 状态：**Active / Normative**  
> 适用范围：LoomRealm 第一阶段  
> 最近复核：2026-07-28  
> 主要定义：产品定位、第一阶段目标、包含项和非目标

本文档是 LoomRealm 产品定位和第一阶段范围的唯一主要定义位置。

## 1. 产品定位

LoomRealm 是一个通过只读游戏包启动、由程序主系统管理模块子系统调用栈、使用 Web 渲染端呈现 Scope Tree 的运行平台。

公开启动方式：

```bash
loom-realm start ./game
```

其中：

- `./game` 是运行期间只读的游戏包目录；
- `realm.entry.json` 指定初始模块子系统和调用参数；
- 程序主系统启动初始子系统并将其压入调用栈；
- 子系统可以通过 JSON-RPC 调用其他子系统入栈；
- 子系统出栈时向调用者返回完成、取消或失败结果；
- 活动子系统直接接收渲染端输入，并直接更新自己拥有的 Scope；
- 渲染端维护 Scope Tree，并将其协调为 DOM；
- Hostra 是可选桌面宿主和程序主系统载体。

子系统是独立进程，正式扩展边界是协议，而不是固定编程语言或进程内 Module 接口。

## 2. 第一阶段目标

第一阶段交付一个通用运行架构和一个地图子系统纵向切片：

```text
只读游戏包
→ realm.entry.json
→ 程序主系统
→ 初始地图子系统入栈
→ 地图子系统处理输入与固定 Tick
→ 地图子系统发布 Scope Tree
→ Web 渲染端 DOM/CSS 呈现
```

同时验证一次通用嵌套调用闭环：

```text
子系统 A
→ system.call(B, input)
→ B 入栈并接管输入
→ B system.return(result)
→ B 出栈
→ A 恢复并收到 result
```

验收地图场景至少包含：

- 两张可往返的测试地图；
- RPG Maker XP / Pokémon Essentials v21.1 三个 Tile 数据层；
- 普通 Tile 和静态第一帧 Autotile；
- Tile 方向通行和 Priority；
- 一个四方向格子行走的玩家人物；
- 静态碰撞；
- 一对双向 Portal；
- 地图切换的异步准备和原子提交；
- 浏览器开发路径和 Hostra 桌面路径；
- 原创或明确允许再分发的测试素材。

## 3. 第一阶段包含

### 3.1 程序主系统

- 单一程序主系统；
- 单一子系统调用栈；
- 入口文件定义初始系统和参数；
- 子系统进程启动、监督和关闭；
- `system.call`、`system.return` 和 `system.returned`；
- `frameId` 和 `activationId`；
- 栈顶输入权；
- 子系统异常退出后的失败结果和栈恢复；
- 主系统与子系统之间的 JSON-RPC 控制面。

### 3.2 模块子系统

- 子系统作为独立进程运行；
- 子系统接收调用参数并维护自身状态；
- 子系统可以继续调用其他子系统；
- 子系统可以返回完成、取消或失败结果；
- 活动子系统与渲染端建立直接双向通道；
- 子系统直接接收输入、节点事件和 Resync 请求；
- 子系统直接发布 Scope 状态与一次性事件。

第一阶段只要求内置地图子系统完整实现。菜单、对话和其他系统可以用测试子系统验证调用协议，不属于完整业务验收范围。

### 3.3 地图子系统

- 轻量 Game Catalog；
- 地图和人物按需异步加载；
- 单 Runtime Execution Loop 和 Runtime Core；
- Core 同步、确定性且无文件或网络 I/O；
- 固定 Tick、单调时钟、有限追赶和有界命令队列；
- 四方向单格移动、碰撞和 Portal；
- 异步目标场景准备和原子地图提交；
- 地图子系统内部 Runtime、Session 和 Scope Revision。

这些组件属于地图子系统内部，不是所有模块子系统必须实现的公共平台接口。

### 3.4 Client State 与呈现

- Scope、Roots 和 `key/tag/data/children` 通用节点树；
- Scope 归属于 `frameId`；
- `state.snapshot`、`scope.replace` 和 Scope 删除；
- 一次性 Event 与可恢复状态分离；
- 渲染端独立 Frame/Scope Store；
- 按稳定 Key 协调 DOM Element；
- Tag 和 Data Schema 注册；
- CSS Transform 等非权威本地表现状态；
- 暂停帧 Scope 可以继续显示；
- Frame 出栈时自动删除其全部 Scope。

### 3.5 游戏包与内容

- 普通目录形式的只读游戏包；
- `realm.game.json`；
- `realm.entry.json`；
- `data/[FSDB]project` 静态数据；
- 启动时建立轻量内容索引；
- 图片资源通过稳定资源 Key 按需读取；
- `loom-realm validate ./game` 的全包验证语义。

## 4. 第一阶段不包含

- Save System、存档恢复和迁移；
- ZIP、ASAR 或单文件游戏包；
- 游戏内容编辑器和项目创作接口；
- 子系统商店、在线下载、签名和自动更新；
- 游戏包内任意本机可执行文件或脚本；
- 多个并行主调用栈；
- 后台系统、Sidecar 系统或通用 Frame Graph；
- 跨子系统共享可变状态服务；
- 完整菜单、对话、战斗、背包和任务系统；
- NPC 和通用 RPG Maker 事件解释器；
- 多会话、多人同步和客户端预测；
- 节点级 Patch 和多 Scope Batch Patch；
- Autotile 动画、天气、音频和完整 Terrain Tag；
- 大地图流式加载、Canvas 或 WebGL 渲染；
- 远程游戏包、DLC 和外部内容依赖。

## 5. 权威边界

```text
程序主系统
    调用栈、Frame 生命周期、输入目标和子系统进程

模块子系统
    本系统业务状态、规则和 Scope 投影

地图子系统 Runtime Core
    地图子系统内部的地图、移动、碰撞和 Portal 状态

Web 渲染端
    Frame/Scope Store、DOM 协调和非权威表现状态

游戏包
    只读静态定义、入口和资源
```

程序主系统不是全局游戏业务状态容器；每个子系统是自身状态的权威。跨系统状态通过调用参数和返回结果显式传递。

## 6. 范围变更规则

任何新增第一阶段能力必须同时：

1. 更新本文档；
2. 更新对应契约或设计；
3. 更新文档状态表；
4. 删除或修正冲突内容；
5. 更新路线图和验收标准；
6. 增加相应协议或端到端测试。

专题文档与本文档冲突时，以本文档为准。