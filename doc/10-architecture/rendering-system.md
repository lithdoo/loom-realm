# 渲染系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem-owned Render、Render Store、声明式视图状态、DOM/Canvas/WebGL 呈现和输入边界  
> 依赖：[系统架构总览](./system-overview.md)、[通信系统](./communication-system.md)、[模块子系统模型](./subsystem-model.md)  
> 最近复核：2026-08-04

## 1. 设计目标

渲染系统将各 Subsystem 发布的声明式 Render State 呈现为 Web UI，同时保持业务状态、Frame/Input、物理 Transport 和本地表现状态之间的边界。

```text
Subsystem business state / Render Manager
→ Render State
→ Render Update Protocol
→ Renderer Render Store
→ Render Scheduler
→ DOM / Canvas / WebGL
```

Renderer Store 是目标状态镜像，实际 DOM/Canvas/WebGL Scene 是派生结果。

## 2. 核心原则

> Render 完全由 Subsystem 控制。Main 不维护 Render Registry，Frame 不拥有 Render，Renderer 不从 Frame Stack 推导 Render 生命周期。

平台级不存在：

```text
frame.activate → show render
frame.suspend  → hide render
frame.resume   → restore render
frame.close    → destroy render
Frame failure unwind → destroy all affected Render
```

Subsystem 可以在内部根据 Frame/Runtime 事件主动改变 Render，但必须通过自身 Render 管理逻辑和未来 Render Protocol 显式表达。

## 3. Renderer 职责

Renderer 负责：

- 按 Subsystem维护 Data Connection；
- 接收/校验 Render Update；
- 按 Subsystem/Render identity维护 Render Store；
- 原子提交 Render State；
- 选择 DOM/Canvas/WebGL呈现；
- 管理动画、缓存、焦点、插值等非权威表现状态；
- 采集输入并根据 Main InputTarget路由普通 User Input。

Renderer 不负责：

- 业务规则；
- 创建/销毁 Subsystem权威 Render；
- 根据 Frame Stack决定 Render可见性/排序/销毁；
- 把 Render自动绑定 Frame；
- 从 DOM/Scene推断 Stack、InputTarget或 Batch E unwind root；
- 将本地表现状态写回为业务 authority。

## 4. Render Identity / Scope

Render Context使用独立 Subsystem-owned identity。架构文档可用 `renderId / scopeId` 作为概念占位，但最终 wire字段由 Render Update/State Contract冻结。

一个 Subsystem可同时拥有 world/hud/menu-overlay/loading/debug 等 Render，与任何 Frame关系均不属于公共 Frame协议。

## 5. Render State / Store

Render被 Subsystem通过未来 Render Protocol显式销毁时，Renderer才清理对应 Store。Frame出栈、暂停、Activation替换、正常 close或 Batch E logical retirement都不能作为隐式 Render destroy信号。

收到 Render State至少验证 Connection identity、Render/Scope identity、Revision、大小/深度、Node key/tag/data等；验证成功后原子提交 Store，失败时保留旧 Store并按 Render Protocol恢复。

Renderer reload后的 Render恢复由各 Subsystem独立完成，不根据 Frame Stack推导恢复集合。

## 6. Render Scheduler / Presentation

```text
Render Update
→ Store atomic commit
→ dirty Scope merge
→ requestAnimationFrame
→ DOM / Canvas / WebGL reconciliation
```

Scheduler只决定何时呈现当前 Store，不改变协议 Revision或业务状态。

Render State适合可恢复目标状态；Render Event适合一次性表现。精确 Revision/Event ordering由未来 Render协议冻结，不继承 Frame Activation sequence。

## 7. 排序与可见性

Render业务排序/可见性由 Subsystem与未来 Composition Contract表达。Main Frame Stack不能自动充当 Render z-order。

不得假设：

```text
Frame Stack order == Render z-order
active Frame == only visible Render
```

## 8. User Input 边界

普通输入只发送到 Main授权的：

```text
Subsystem reference + frameId + activationId
```

Renderer根据目标 Subsystem选择 Data Connection。Render identity不得被假设等于 frameId。

页面失焦、InputTarget改变或 Batch E Failure Unwind Barrier清空 target时，Renderer必须停止相关持续输入意图。

## 9. Batch E Failure Unwind 与 Render

Batch E可能关闭一个 Runtime仍健康、但因 ancestor failure成为 doomed suffix成员的 Frame：

```text
healthy Runtime
    doomed Frame → frame.close
    Render Context → unchanged unless Subsystem explicitly changes it
```

因此：

- whole-suffix Frame unwind不等于 whole-suffix Render cleanup；
- healthy descendant Runtime被清 Frame后 MAY继续拥有/更新 Render；
- failed Runtime对应 Render/Data authority如何失效或恢复属于 Runtime/Data/Render协议，不由 Frame `closed` 推导；
- accepted Frame outcome、`SUBSYSTEM_RUNTIME_FAILED`、unwind root都不是 Render lifecycle命令。

## 10. 本地表现状态

DOM Element、Canvas/WebGL资源、CSS动画、图片缓存、焦点/滚动/Hover、设备瞬时状态、纯视觉插值等可以只留 Renderer，但不得改变业务规则、Frame Stack或 recovery authority。

## 11. 渲染不变量

1. Render完全由 Subsystem创建、更新、排序、显示和销毁；
2. Main不维护 Render Registry；
3. Frame不拥有 Render；
4. Renderer不从 Frame Stack推导 Render生命周期；
5. Render可以 zero Frame存在；
6. normal Frame close不自动删除 Render；
7. Batch E Frame unwind/logical retirement不自动删除 Render；
8. Render恢复不要求 Frame Activation变化；
9. Runtime failure的 Render/Data cleanup与 Frame Stack unwind是独立协议域；
10. `renderId` 等架构名称只是概念占位，最终 wire由正式契约冻结。
