# 渲染系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem-owned Render、Render Store、声明式视图状态、DOM/Canvas/WebGL 呈现和输入边界  
> 依赖：[系统架构总览](./system-overview.md)、[通信系统](./communication-system.md)、[模块子系统模型](./subsystem-model.md)  
> 最近复核：2026-08-02

## 1. 设计目标

渲染系统将各 Subsystem 发布的声明式 Render State 呈现为 Web UI，同时保持业务状态、Frame/Input、物理 Transport 和本地表现状态之间的边界。

核心链路：

```text
Subsystem business state / Render Manager
→ Render State
→ Render Update Protocol
→ Renderer Render Store
→ Render Scheduler
→ DOM / Canvas / WebGL
```

Renderer Store 是目标状态镜像，实际 DOM / Canvas Scene / WebGL Scene 是 Store 的派生结果。

## 2. 核心原则

> Render 完全由 Subsystem 控制。Main 不维护 Render Registry，Frame 不拥有 Render，Renderer 不从 Frame Stack 推导 Render 生命周期。

以下平台级行为均不存在：

```text
frame.activate → show render
frame.suspend  → hide render
frame.resume   → restore render
frame.close    → destroy render
```

Subsystem 可以在内部根据 Frame 事件主动执行类似业务行为，但必须通过自身 Render 管理逻辑和 Render Update Protocol 显式完成。

## 3. Renderer 职责

Renderer 负责：

- 按 Subsystem/System 维护 System Data Connection；
- 接收和校验 Render Update Protocol 消息；
- 按 System / Render identity 维护 Render Store；
- 校验和应用完整或增量 Render State；
- 使用稳定 Node Key 将声明式状态协调为可信视图组件；
- 选择 DOM、Canvas 或 WebGL 呈现后端；
- 管理动画、缓存、焦点、插值等非权威表现状态；
- 采集并归一化用户输入；
- 根据 Main 发布的 Input Target 把普通输入交给 User Input Protocol。

Renderer 不负责：

- 决定地图移动、碰撞、菜单选择或对话推进；
- 创建或销毁 Subsystem 的权威 Render；
- 根据 Frame Stack 决定 Render 显示、隐藏或顺序；
- 把某个 Render 自动绑定到某个 Frame；
- 从 DOM / Canvas / WebGL 推断调用栈、业务状态或 Input Target；
- 接收任意 HTML、脚本或远程 DOM 命令；
- 将本地插值结果写回为权威业务状态。

## 4. Render Context 与 Identity

`Render Context` 是架构层用于描述 Subsystem 发布到 Renderer 的一个独立呈现上下文的概念术语。

架构文档可能使用：

```text
renderId
```

作为“连接内 Render identity”的**概念占位名**，例如：

```text
System / Subsystem identity + renderId
```

这里的 `renderId` 不是已经冻结的 wire 字段名，也不意味着未来协议必须采用该名称。最终身份字段、字符规则和生命周期消息由 Render Update Protocol 冻结。

一个 Subsystem 可以同时拥有：

```text
world
hud
menu-overlay
loading
debug
```

这些 Render 是否与任何 Frame 有关系，不属于公共渲染协议。

## 5. Render State 与 Scope

Render Context 可以包含一个或多个 Scope，以便按更新频率和事务原子性拆分声明式目标状态。

架构层可以概念性描述：

```text
Render identity + Scope identity
Render identity + Scope identity + Node key
```

但 `renderId`、`scopeId` 等精确 wire 字段名由正式 Render State / Update Contract 冻结。

Render 被 Subsystem 显式销毁时，Renderer 才按 Render Protocol 清理对应 Store 和派生呈现对象。Frame 出栈、暂停或 Activation 变化不能触发隐式清理。

## 6. 声明式 Node 模型

Render Node 概念上包含：

- `key`：Scope 内稳定身份；
- `tag`：可信 Renderer 类型；
- `data`：声明式 JSON 目标状态；
- `children`：直接子节点及顺序。

Renderer 只允许已注册 Tag，并为每个 Tag 绑定 Data Schema、Renderer、允许的交互 Schema 和呈现后端。

Node 是视图组件节点，不要求每个 Tile、角色、粒子或场景对象对应一个 DOM Element。

## 7. Render Update 下行链路

```text
Subsystem business state / Render Manager
→ Render Projector / state builder
→ Render Update Protocol
→ System Data Connection
→ 根据 Render identity 路由
→ Render Message Validator
→ Render Store 原子提交
→ 标记 dirty Scope
→ requestAnimationFrame
→ Scope Reconciler / Scene Renderer
```

消息回调不得直接分散操作 DOM 或 Scene。必须先校验并提交 Store，再进入呈现阶段。

同一 System Data Connection 可以交错承载多个 Render Context。各 Render 的 Revision / Sequence / Scope 独立于 Frame Activation。

## 8. Store 与恢复

收到 Render State 时至少验证：

- 消息来自正确 System Data Connection；
- Render identity 在当前连接上合法；
- Render / Scope Revision 是否可接受；
- Scope 数量、树深和消息大小；
- Key 是否在 Scope 内唯一；
- Tag 是否已注册；
- Data 是否满足 Tag Schema。

验证成功后原子提交新的 Render / Scope Store。验证失败时保留旧 Store 和旧画面，并按 Render Update Protocol 请求对应 Render 的恢复状态。

较旧 Revision 不得覆盖较新状态。

Renderer 重载后的 Render 恢复由各 Subsystem 通过 Render Protocol 独立完成，不根据 Frame Stack 推导恢复集合。

## 9. Render Scheduler

```text
任意时刻接收 Render State
→ Store 原子更新
→ dirty Scope 合并
→ 每个 requestAnimationFrame 最多提交一次呈现
```

同一显示帧内同一 Render/Scope 的多个未呈现 State 可以只呈现最新 Store。Event 不采用相同 latest-wins 规则。

Render Scheduler 不改变协议 Revision；它只决定何时将当前 Store 呈现到画面。

## 10. DOM / Scene 协调原则

- 相同 Key 且相同 Tag 时复用 Element / Scene Object；
- Data 变化时更新节点自身；
- Children 顺序变化时移动已有对象；
- Tag 变化时销毁旧对象并重新创建；
- 未变化节点不重建；
- Snapshot 校验失败时保留旧状态并请求 Render Resync；
- Renderer 不因 Frame 生命周期自行销毁 Render 对象。

第一阶段可以使用完整 Scope Replace 作为增量单位；精确消息和事务边界由新 Render Contract 冻结。

## 11. 混合呈现后端

```text
DOM
    菜单、对话、HUD、表单、文本输入和无障碍控件

Canvas / WebGL
    地图、角色、粒子、战斗场景、摄像机和高频动画
```

一个可信 Scene Tag 可以对应单个 Canvas Element，其 Renderer 内部维护地图层、角色和粒子的本地表现对象。

## 12. Render 排序与可见性

Render 的业务排序与可见性由发布它的 Subsystem 决定，并通过 Render Update / Composition Contract 的正式状态表达。

当多个 Subsystem 同时存在 Render 时，跨 Subsystem 的最终合成规则仍需冻结。Main Frame Stack 不能自动充当 Render z-order。

不得假设：

```text
Frame Stack order == Render z-order
active Frame == only visible Render
```

## 13. 输入路由边界

普通 User Input 只发送给 Main 声明的 Input Target，概念上包含：

```text
Subsystem/System reference
frameId
activationId
```

Renderer 根据目标 Subsystem 选择 System Data Connection，再通过 User Input Protocol 发送 Frame 输入。

Render UI Interaction 如何映射到具体 Frame/Input Context 是后续 User Input + Render State Contract 的问题。Renderer 不能自行假设 Render identity 等于 `frameId`。

页面失焦或 Input Target 改变时必须释放持续输入意图。

## 14. 本地表现状态

以下状态可以只保留在 Renderer：

- DOM Element、Canvas Scene 和 GPU 资源引用；
- CSS 动画和过渡进度；
- 图片解码和浏览器缓存；
- 焦点、滚动和 Hover；
- 输入设备瞬时状态；
- 不影响业务规则的视觉插值；
- 粒子、屏幕震动和其他一次性表现对象。

这些本地状态不得改变碰撞、伤害、调用结果或 Subsystem 权威业务状态。

## 15. State 与 Event

Render State 表示当前应该呈现什么：

- 可由完整 Render Snapshot 恢复；
- 可以在未发送或未呈现前合并为最新目标；
- 适合角色位置、菜单内容、HP 和当前对话。

Render Event 表示一次性表现行为：

- 需要按 Render / Protocol Domain 有序、有界处理；
- 不应替代可恢复 State；
- 适合音效、伤害数字、屏幕震动和短暂粒子。

精确顺序作用域由 Render Update Protocol 冻结，不继承 Frame Activation Sequence。

## 16. 渲染不变量

1. Render 完全由 Subsystem 创建、更新、排序、显示和销毁；
2. Main 不维护 Render Registry；
3. Frame 不拥有 Render；
4. Renderer 不从 Frame Stack 推导 Render 生命周期；
5. Render 可以在没有 Frame 时存在；
6. Frame close 不自动删除 Render；
7. Render 恢复不要求 Frame Activation 变化；
8. `renderId` 等名称在架构层只是概念占位，最终 wire identity 必须由正式契约冻结。