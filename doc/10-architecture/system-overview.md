# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：顶层系统划分、状态所有权和系统关系  
> 依赖：[产品设计总览](../00-overview/product-vision.md)  
> 最近复核：2026-07-29

本文档只描述 LoomRealm 由哪些系统组成、各系统为什么存在以及它们如何协作。精确消息字段、模块拆分和分包方案分别由下层文档定义。

## 1. 顶层结构

```text
游戏包与静态内容
        ↓
程序主系统
├── 栈式运行系统
├── 子系统生命周期
└── 通道管理
        ↓
模块子系统
├── 自身权威状态
├── 自身业务规则
└── Client State 投影
        ⇅
通信系统
        ⇅
Web 渲染系统
├── 调用栈镜像
├── Frame / Scope Store
└── DOM / CSS 呈现
```

桌面模式由 Hostra 承载程序主系统和 Web 渲染端，但 Hostra 不是游戏业务状态的拥有者。

## 2. 系统划分

### 栈式运行系统

负责入口 Frame、子系统调用栈、激活周期、输入目标和调用返回关系。

详见：[栈式运行系统](./stack-runtime-system.md)。

### 通信系统

负责主系统、子系统和渲染端之间的控制面与数据面语义，包括顺序、重连、背压和错误边界。

详见：[通信系统](./communication-system.md)。

### 渲染系统

负责维护调用栈和 Client State 的本地镜像，将 Scope Tree 协调为 DOM，并管理不影响业务规则的本地表现状态。

详见：[渲染系统](./rendering-system.md)。

### 存储与内容系统

负责只读游戏包、清单、内容索引、Repository、资源 Key 和路径安全。

详见：[存储与内容系统](./storage-system.md)。

### 模块子系统模型

规定子系统作为业务扩展单元的职责、状态所有权、调用关系和呈现边界。

详见：[模块子系统模型](./subsystem-model.md)。

## 3. 核心边界

```text
程序主系统
    拥有调用栈、Frame 生命周期和输入目标

模块子系统
    拥有本系统业务状态、规则和 Scope 投影

渲染系统
    拥有 Store、DOM 和非权威表现状态

存储与内容系统
    拥有只读内容定位、校验和资源交付
```

任何状态都必须能够回答：

- 谁是权威拥有者；
- 谁可以修改；
- 谁只能读取或投影；
- 断线后从哪里恢复。

## 4. 启动链路

```text
loom-realm start ./game
→ 打开并校验游戏包公共结构
→ 读取 realm.entry.json
→ 解析初始 system 和 params
→ 创建初始 Frame
→ 启动并初始化目标子系统
→ 建立渲染数据通道
→ 激活 Frame
→ 子系统发布首次 Client State
→ 渲染端呈现
```

主系统不根据入口参数猜测地图、人物或其他业务内容。目标子系统负责验证和加载自己的调用输入。

## 5. 调用链路

```text
活动子系统 A 发起 call(B, input)
→ 主系统准备 B
→ A 暂停
→ B 入栈并获得输入权
→ B 运行并返回 result
→ B 出栈
→ A 获得新的激活周期并恢复
```

调用栈只表达系统调用关系，不保存子系统内部业务状态。

## 6. Client State 链路

```text
子系统权威状态
→ 子系统 Client State Projector
→ Frame Scope Tree
→ 渲染端 Frame/Scope Store
→ DOM Reconciler
→ DOM/CSS
```

程序主系统不解释 Scope 内容。渲染端不从 DOM 推断业务状态或调用栈。

## 7. 控制面与数据面

```text
控制面
    主系统 ⇄ 子系统
    主系统 ⇄ 渲染端

数据面
    子系统 ⇄ 渲染端
```

控制面负责低频、严格的生命周期和调用关系；数据面负责高频输入、状态和事件。普通数据面消息不经过主系统业务转发。

## 8. 第一阶段实例

第一阶段的初始子系统是 `loom.map`：

```text
游戏包内容
→ Map Repository
→ Session Coordinator
→ Execution Loop
→ Runtime Core
→ Client State Projector
→ Web 渲染端
```

以上组件只属于地图子系统，不是平台要求所有子系统实现的固定结构。

## 9. 架构不变量

1. 程序主系统不成为全局游戏业务状态容器；
2. 每个 Frame 和 Scope 有明确所有权；
3. 默认只有活动栈顶接收普通输入；
4. 暂停 Frame 的 Scope 可以继续显示；
5. 跨系统状态通过调用输入、返回结果或正式协议显式传递；
6. 游戏包在运行期间只读；
7. Client State 不暴露物理路径或可执行代码；
8. DOM 不是权威状态；
9. 具体模块和分包不得扩大系统职责；
10. 第一阶段地图实现不得被推广为所有子系统的公共架构。

## 10. 下层文档

- [正式契约目录](../15-contracts/README.md)：跨系统可互操作语义；
- [模块设计目录](../20-modules/README.md)：系统内部模块拆分；
- [实施计划目录](../30-implementation/README.md)：当前仓库落地方案。
