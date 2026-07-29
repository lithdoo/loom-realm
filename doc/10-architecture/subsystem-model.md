# 模块子系统模型

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：模块子系统的职责、状态所有权和扩展边界  
> 依赖：[系统架构总览](./system-overview.md)  
> 最近复核：2026-07-29

## 1. 设计目标

模块子系统是 LoomRealm 的业务扩展单元。地图、菜单、对话、战斗或第三方功能都可以作为子系统实现，而不要求进入程序主系统核心。

## 2. 子系统职责

每个子系统负责：

- 定义并验证自己的调用输入；
- 维护本次调用对应的权威业务状态；
- 接收自身活动 Frame 的普通输入；
- 处理节点事件；
- 生成和发布自己 Frame 的 Client State；
- 产生一次性客户端事件；
- 根据业务需要调用另一个子系统；
- 完成、取消或失败时返回统一结果；
- 在关闭时释放内部资源。

## 3. 子系统非职责

- 不直接修改程序主系统调用栈；
- 不伪造其他 Frame 或 Activation；
- 不生成其他 Frame 的 Scope；
- 不直接操作渲染端 DOM；
- 不把内部对象、文件句柄或物理路径序列化给客户端；
- 不依赖其他子系统的内部可变状态。

## 4. 扩展边界

正式扩展边界是协议，而不是进程内 Module API。

子系统可以使用不同语言和运行时。第一阶段可以每个 Frame 启动一个独立进程，后续可以在协议不变的前提下复用进程或使用进程池。

## 5. 状态所有权

```text
程序主系统
    Frame、调用关系、Activation、输入目标

模块子系统
    本系统业务状态和规则

子系统 Projector
    本 Frame 的 Client State

渲染端
    Store、DOM 和本地表现状态
```

跨子系统状态通过调用参数和返回结果显式传递。第一阶段不提供共享可变全局状态服务。

## 6. 调用与返回

调用者发送目标系统 ID 和 JSON 输入。程序主系统建立目标调用后，调用者暂停；目标系统完成后返回：

```text
completed(value)
cancelled
failed(error)
```

调用建立成功只表示目标调用已创建，不表示业务操作已经完成。

## 7. Client State Projector

每个需要呈现的子系统拥有自己的 Projector：

```text
已提交的子系统状态
→ Projector
→ Frame Scopes
→ 渲染端
```

Projector 应同步、确定性、无 I/O，并原子生成有效 Client State。程序主系统不合并或解释业务 Scope。

## 8. 内部架构开放

平台不要求所有子系统实现：

- Runtime Core；
- 固定 Tick；
- ECS；
- Session Coordinator；
- Repository；
- 状态机或对话图。

例如菜单子系统可以是低频事件状态机，而地图子系统可以使用固定 Tick 和同步 Core。

## 9. 生命周期适配

子系统实现需要将平台生命周期适配到自身内部结构：

- initialize：验证输入并完成必要准备；
- activate：开始接收普通输入；
- suspend：停止普通输入，可以暂停内部调度；
- resume：使用新 Activation 恢复并处理子调用结果；
- close：停止新工作并在期限内释放资源。

## 10. 第一阶段地图子系统

`loom.map` 是第一个完整实现，用于验证：

- 业务内容按需加载；
- 固定 Tick 与命令串行化；
- 同步确定性 Core；
- 地图切换 Effect Barrier；
- 多 Scope Client State 投影。

这些组件属于 `loom.map`，不构成所有子系统的公共接口。

## 11. 相关下层文档

- [生命周期协议草案](../15-contracts/system-lifecycle-protocol.md)；
- [模块设计目录](../20-modules/README.md)；
- [地图子系统模块设计](../20-modules/loom-map/README.md)；
- [现有详细设计：Client State Projector](../architecture/client-state-projector.md)。
