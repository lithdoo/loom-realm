# LoomRealm 总体架构

> 状态：**Active Design**  
> 适用范围：LoomRealm 通用运行架构与第一阶段地图纵向切片  
> 最近复核：2026-07-28  
> 主要定义：顶层系统结构、职责边界、启动链路和第一阶段实现关系

相关文档：

- [`main-system-and-subsystems.md`](./main-system-and-subsystems.md)：程序主系统、调用栈和模块子系统的主要定义；
- [`runtime-rpc-and-state-sync.md`](./runtime-rpc-and-state-sync.md)：JSON-RPC 和客户端状态同步；
- [`client-state-tree-protocol.md`](./client-state-tree-protocol.md)：Scope Tree 协议；
- [`../contracts/game-package-v1.md`](../contracts/game-package-v1.md)：游戏包和入口文件；
- [`../runtime/phase-1-pokemon-essentials-map-runtime.md`](../runtime/phase-1-pokemon-essentials-map-runtime.md)：第一阶段地图子系统。

## 1. 系统定位

LoomRealm 是一个通过只读游戏包启动、以独立模块子系统承载业务逻辑、使用 Web 渲染端呈现 Scope Tree 的运行平台。

第一阶段公开启动方式：

```bash
loom-realm start ./game
```

顶层运行模型：

```text
游戏包入口文件
        ↓
程序主系统
├── 子系统调用栈
├── 子系统进程监督
├── call / return
└── 渲染端通道管理
        ↓
模块子系统进程
├── 自身业务状态
├── 用户输入处理
├── 可继续调用其他子系统
└── 自身 Scope 投影
        ⇅
Web 渲染端
├── Input Router
├── Frame / Scope Store
├── Scope Tree Reconciler
└── DOM / CSS
```

第一阶段入口子系统是地图子系统，但“地图”不是平台固定核心。后续菜单、对话、战斗、编辑器或第三方功能都可以作为遵循相同调用协议的模块子系统。

## 2. 核心原则

1. **主系统与子系统分离**：主系统管理调用关系，子系统管理业务。
2. **调用栈是顶层控制结构**：初始系统入栈，子系统通过 `call` 压栈，通过 `return` 出栈。
3. **参数与结果显式传递**：调用携带 JSON 输入，返回携带统一结果。
4. **协议是扩展边界**：子系统是独立进程，使用 JSON-RPC 2.0 通信。
5. **数据面直连**：普通用户输入和 Scope 更新不经过主系统转发。
6. **栈顶默认拥有输入权**：下层系统暂停输入，但其 Scope 可以继续显示。
7. **Scope 归属于调用帧**：客户端使用 `frameId + scopeId` 标识 Scope。
8. **迟到消息必须隔离**：输入和 Scope 消息携带 `activationId`。
9. **子系统内部结构开放**：平台不规定子系统必须使用 Core、ECS、状态机或某种语言。
10. **Client State 与 DOM 分离**：Scope Tree 是目标状态，DOM 是渲染端派生结果。
11. **游戏包运行期间只读**：程序和子系统不得把状态写回游戏包。
12. **资源使用逻辑 Key**：Client State 不暴露本机物理路径。

## 3. 程序主系统

程序主系统是平台核心，负责：

```text
读取 realm.game.json 和 realm.entry.json
→ 解析初始 system
→ 创建初始 Frame
→ 启动子系统
→ 压入调用栈
→ 建立子系统与渲染端通道
→ 管理后续 call / return
```

主系统维护：

```ts
interface SystemFrame {
  readonly frameId: string;
  readonly activationId: string;
  readonly systemId: string;
  readonly callerFrameId: string | null;
  readonly state: "starting" | "active" | "suspended" | "closing";
}
```

主系统不拥有地图、菜单、对话或战斗等业务状态，也不生成这些系统的 Scope。

## 4. 模块子系统

模块子系统是独立进程。一个子系统调用实例对应一个 `SystemFrame`。

子系统可以：

- 接收调用输入；
- 维护自身权威状态；
- 直接接收渲染端输入；
- 直接发布 Scope 和客户端事件；
- 调用另一个子系统；
- 返回完成、取消或失败结果。

系统标识使用开放字符串：

```text
loom.map
loom.menu
loom.dialog
vendor.example.battle
vendor.example.puzzle
```

第一阶段只要求内置 `loom.map` 能完成地图纵向切片。系统安装、分发、签名和第三方发现机制不进入第一阶段完成条件。

## 5. 调用栈流程

### 5.1 启动

```text
realm.entry.json
→ system = loom.map
→ 主系统启动地图子系统
→ [map]
```

### 5.2 调用

```text
map 发送 system.call(menu, input)
→ 主系统暂停 map
→ 启动并初始化 menu
→ menu 入栈
→ [map, menu]
```

### 5.3 嵌套调用

```text
menu 发送 system.call(dialog, input)
→ [map, menu, dialog]
```

### 5.4 返回

```text
dialog 发送 system.return(result)
→ dialog 出栈
→ menu 恢复并收到 result
→ [map, menu]
```

只有当前栈顶可以普通压栈或出栈。主系统通过 `frameId` 验证调用者，通过 `activationId` 隔离暂停和恢复前的旧消息。

## 6. 通信结构

### 6.1 控制面

```text
程序主系统 ⇄ 子系统
```

使用 JSON-RPC 承载：

- `system.initialize`；
- `system.suspend`；
- `system.resume`；
- `system.call`；
- `system.return`；
- `system.returned`；
- `system.close`；
- ready、heartbeat 和 failure。

```text
程序主系统 ⇄ 渲染端
```

承载：

- 栈快照；
- Frame 入栈和出栈；
- 当前输入目标；
- 子系统数据端口的建立和撤销。

### 6.2 数据面

```text
渲染端 ⇄ 当前活动子系统
```

承载：

- `input.dispatch`；
- `node.event`；
- `state.snapshot`；
- `scope.replace`；
- `event.emit`；
- Resync。

主系统不理解 Scope 内容，也不参与高频输入和状态更新。

## 7. Client State

每个子系统自行把内部状态投影为 Scope Tree：

```text
子系统内部状态
→ 子系统 Client State Projector
→ Scope Tree
→ 渲染端 Store
→ DOM
```

Scope 消息必须包含：

```text
frameId
activationId
scopeId
scopeRevision
```

客户端使用 `frameId + scopeId` 作为完整 Scope 身份。Frame 出栈时，客户端删除该 Frame 拥有的全部 Scope。

## 8. 第一阶段地图子系统

第一阶段地图纵向切片由 `loom.map` 子系统实现。该子系统内部可以继续使用现有设计：

```text
Game Catalog / Repositories
→ Session Coordinator
→ Runtime Execution Loop
→ Runtime Core
→ Client State Projector
```

这些组件只属于地图子系统内部：

- Runtime Core 维护地图、人物、移动和 Portal 状态；
- Execution Loop 驱动固定 Tick 和串行命令；
- Session Coordinator 准备异步地图内容；
- 地图 Projector 发布 `world`、`hud`、`loading` 等 Scope。

其他子系统不要求复用这些组件。例如菜单子系统可以只使用事件驱动状态机，对话子系统可以使用对话图解释器。

## 9. 游戏包与入口

游戏包根目录至少包含：

```text
game/
├── realm.game.json
├── realm.entry.json
└── data/[FSDB]project/
```

`realm.game.json` 定义游戏身份、入口文件路径、内容路径和能力要求。

`realm.entry.json` 定义：

```json
{
  "format": "loom-realm-entry",
  "formatVersion": 1,
  "system": "loom.map",
  "params": {}
}
```

主系统不解释 `params` 的业务字段；目标子系统负责验证。

## 10. Hostra 桌面运行

在桌面模式中，Hostra 承载程序主系统和渲染窗口：

```text
Hostra / Main
├── 程序主系统
├── 子系统进程监督
├── 调用栈
└── MessagePort 建立

Renderer
⇄ 活动子系统进程
```

Hostra 参与控制面，但不代理普通数据面消息。

## 11. 第一阶段范围

第一阶段验证：

- 只读目录游戏包；
- `realm.game.json` 与 `realm.entry.json`；
- 程序主系统启动初始子系统；
- 一个通用子系统调用栈；
- JSON-RPC 控制面；
- 渲染端与活动子系统直接通信；
- `frameId`、`activationId` 和 Scope 所有权；
- `loom.map` 初始子系统；
- 两张地图、格子移动、碰撞和双向 Portal；
- Scope Tree 与 DOM 协调；
- 浏览器开发模式和 Hostra 桌面模式。

第一阶段不要求：

- 第三方子系统商店或包管理器；
- 子系统签名、在线下载和远程执行；
- 多个并行主栈；
- 后台、Sidecar 或非栈式系统图；
- 跨子系统共享可变状态服务；
- Save System；
- 完整菜单、对话、战斗和任务实现。

## 12. 文档关系

```text
总体架构
├── 程序主系统与模块子系统架构
├── 游戏包契约
├── JSON-RPC 与状态同步
├── Client State Tree 协议
├── Client State Projector
├── Web Client 协调
├── Hostra 桌面宿主
└── 地图子系统内部设计
    ├── 游戏加载与 Repository
    ├── Session Coordinator
    ├── Execution Loop
    ├── Runtime Core
    └── Pokémon Essentials 地图运行时
```

## 13. 当前结论

```text
入口文件
→ 程序主系统
→ 初始子系统入栈
→ 子系统直接接收输入并发布 Scope
→ 子系统通过主系统嵌套调用其他子系统
→ 被调用子系统出栈并返回结果
→ 调用者恢复
```

程序主系统是调用关系和进程生命周期的权威；各模块子系统是自身业务状态的权威；渲染端只维护 Scope Tree 的客户端镜像和 DOM 呈现。