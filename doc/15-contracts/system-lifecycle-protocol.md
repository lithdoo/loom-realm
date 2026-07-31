# 模块子系统生命周期与调用协议草案

> 层级：正式契约  
> 状态：Draft  
> 稳定程度：Experimental  
> 主要定义：Runtime Container、Frame 生命周期、子系统调用和返回的待冻结协议边界  
> 依赖：[栈式运行系统](../10-architecture/stack-runtime-system.md)、[运行承载系统](../10-architecture/runtime-hosting-system.md)、[通信系统](../10-architecture/communication-system.md)  
> 最近复核：2026-08-01

本文档收拢 Runtime Container 与 Frame 的生命周期结论。精确 JSON Schema、超时和幂等规则尚未完全冻结。

## 1. 参与方

- 程序主系统；
- 模块子系统 Runtime Container；
- Runtime Container 内的 Frame Runtime；
- Web 渲染端控制连接。

## 2. 核心身份

```text
systemId
    可解析的模块子系统标识

containerId
    当前 System Runtime Container 实例

frameId
    一次调用实例

activationId
    Frame 的一次活动周期

callerFrameId
    调用者 Frame；初始 Frame 为 null
```

进程 ID、Worker 名称和端口号不能代替上述协议身份。

## 3. 承载关系

```text
一个 systemId
→ 一个有效 Runtime Container

一个 Runtime Container
→ 零个、一个或多个 Frame Runtime

一个 Frame Runtime
→ 一次调用的独立业务状态和 Client State
```

`frame.close(A)` 只关闭 A，不得隐式关闭同 Container 内的 B、C Frame。

## 4. Container 生命周期

概念状态：

```text
absent
→ starting
→ ready
↔ serving / idle
→ closing
→ absent

starting / ready / serving / idle
→ failed
```

### 4.1 启动

程序主系统解析 `systemId` 后，如不存在可用 Container，则启动对应进程或 Worker，并完成：

```text
container.hello
→ 协议版本和能力协商
→ container.initialize(runtimeContext)
→ container.ready
```

Container ready 表示可以接收 Frame 初始化，不表示任何 Frame 已 ready。

### 4.2 常驻与空闲

最后一个 Frame 关闭后，Container 可以进入 idle 并继续保留共享不可变缓存，也可以由宿主在空闲期限后关闭。

空闲退出是资源策略，不改变 Frame 调用和返回语义。

### 4.3 关闭

程序主系统关闭 Container 前必须：

- 停止分配新 Frame；
- 关闭或失败其全部剩余 Frame；
- 撤销全部 Frame 数据连接；
- 给予有限清理期限；
- 超时后强制终止桌面进程或 PWA Worker。

## 5. Frame 状态

第一阶段概念状态：

```text
starting
→ ready
→ active
↔ suspended
→ closing
→ closed

starting / ready / active / suspended
→ failed
```

Frame 状态属于调用栈语义，与 Container 状态分离。

## 6. Frame 初始化

程序主系统在目标 Container 中创建 Frame：

```text
frame.initialize(frameId, callerFrameId, input, contentGrant)
```

目标 Frame 必须在成功 ready 前完成：

- 调用参数公共和业务 Schema 校验；
- 当前调用所需内容加载和必要准备；
- 独立 Frame Runtime 创建；
- 独立 Client State Projector 创建；
- 首次有效 Client State 的可生成性检查。

初始化失败：

- Frame 不进入正式活动栈；
- 已创建的局部资源必须释放；
- Container 仍可继续服务其他 Frame，除非失败表明 Container 已损坏。

## 7. Frame ready 与首次 Snapshot

`frame.ready` 必须表示：

- Frame Runtime 已建立；
- 首次完整 Client State Snapshot 已生成并保存在 Projector State 中；
- Frame 数据连接可以建立或已经建立；
- Frame 可以在激活后接收普通输入。

仍需在最终 Schema 中冻结：

1. `frame.ready` 是否携带首次 Snapshot；
2. 首次 Snapshot 是否通过 Frame 数据通道单独发送；
3. 数据通道、ready、入栈和首次 Snapshot 的严格原子顺序。

在冻结前，实现必须保证 Renderer 不会展示未初始化的活动 Frame。

## 8. 激活和暂停

激活时程序主系统签发新的 `activationId`：

```text
frame.activate(frameId, activationId)
```

只有当前 Activation 可以接收普通输入和发布活动状态。

暂停时：

```text
frame.suspend(frameId, activationId)
```

- 旧 Activation 失效；
- Frame Runtime 停止接受普通输入；
- 已发布 Scope 可以继续显示；
- Frame 可以暂停 Tick 或内部调度；
- Container 继续服务其他活跃 Frame；
- Renderer 拒绝旧 Activation 的迟到 State 和 Event。

## 9. 恢复

调用者恢复时，程序主系统签发新的 Activation：

```text
frame.resume(frameId, newActivationId, returnedFrameId, result)
```

恢复流程：

- 验证 Frame 仍然 suspended；
- 交付子调用结果；
- 子系统更新权威状态；
- 必要时重新投影 Client State；
- 建立或更新 Frame 数据连接；
- 恢复普通输入目标。

## 10. 调用

只有当前栈顶 active Frame 可以发起普通调用：

```text
system.call(systemId, input)
```

调用建立流程：

```text
验证调用者是栈顶和当前 Activation
→ 解析目标 systemId
→ 取得或启动目标 Runtime Container
→ 在 Container 内 frame.initialize(newFrameId, input)
→ 目标 Frame ready
→ 暂停调用者
→ 目标 Frame 入栈并激活
→ 建立目标 Frame 数据连接
→ 更新 Renderer Stack 和 Input Target
```

调用请求的成功响应只表示子调用已建立，不包含最终业务结果。

同一 Container 可以因为递归或重复调用而同时承载多个 Frame。

## 11. 返回

被调用 Frame 返回统一结果：

```text
completed(value)
cancelled
failed(error)
```

只有栈顶 active Frame 可以普通返回。

程序主系统应：

```text
标记当前 Frame closing
→ 停止输入并撤销 Frame 数据连接
→ 通知 Renderer frame.popped
→ frame.close(currentFrameId)
→ 弹栈
→ 为调用者签发新 Activation
→ frame.resume(callerFrameId, result)
→ 更新 Renderer Stack 和 Input Target
```

关闭当前 Frame 不关闭其 Runtime Container，除非宿主随后执行空闲退出策略。

## 12. Frame 关闭

`frame.close` 必须：

- 停止新的输入、Tick 和异步业务提交；
- 取消或隔离该 Frame 的未完成异步工作；
- 关闭该 Frame 的数据连接；
- 释放该 Frame 的 Runtime、Projector、队列和表现事件资源；
- 不清理 Container 共享不可变缓存；
- 不影响同 Container 内其他 Frame。

关闭完成后，该 `frameId` 不得重新使用。

## 13. Container 故障

Container 进程退出或 Worker 发生不可恢复错误时：

```text
container.failed
→ 其全部 Frame 失去权威运行环境
→ Main 撤销全部相关 Frame 数据连接
→ 停止相关输入
→ 按调用栈规则生成失败结果或会话故障
```

第一阶段原则：

- 只影响栈顶且可安全展开时，可以生成 failed 结果并恢复调用者；
- 如果失败 Container 同时承载非栈顶 Frame，Main 必须显式计算受影响调用链；
- 无法保持栈一致时，会话失败；
- 初始 Frame 所在 Container 失败通常导致会话失败；
- 不从 Renderer Store 或 DOM 恢复权威状态。

具体多 Frame 故障展开算法仍需冻结。

## 14. Renderer 重连

Renderer 重载不关闭 Main、Container 或 Frame Runtime。

恢复流程：

```text
Renderer 连接 Main
→ 获取 stack.snapshot
→ 为每个有效 Frame 重新签发数据连接
→ Renderer 向各 Frame 请求 state.resync
→ 原子重建 Frame/Scope Store
→ 恢复画面和 Input Target
```

Renderer 重连后使用新的连接 Sequence。Frame State Revision 可以保持。

## 15. 待冻结问题

### 15.1 返回结果交付方法

当前推荐：

```text
frame.resume(newActivationId, returnedFrameId, result)
```

即恢复与返回结果由同一请求原子交付。

仍需冻结：

- 请求和响应 Schema；
- 重复 resume 的幂等结果；
- 调用者恢复失败时的会话处理；
- result 大小上限。

### 15.2 其他开放问题

- Container 启动、Frame 初始化和关闭超时；
- 调用取消和外部会话取消；
- 重复请求幂等性；
- ready、数据连接和首次 Snapshot 的原子关系；
- heartbeat 和 Container 失联判定；
- Container 内多个 Frame 的故障展开；
- 关闭期间新的调用请求；
- PWA 页面冻结后的检查点和恢复 Profile；
- Container 协议版本和能力协商 Schema。

## 16. 故障原则

- 目标 Container 启动失败：调用不建立；
- 目标 Frame 初始化失败：调用不建立，Container 可继续服务；
- Frame Runtime 业务失败：生成 failed 结果；
- Container 崩溃：影响其承载的全部 Frame；
- Renderer 重连：调用栈和 Frame Runtime 继续存在；
- Main 崩溃：第一阶段不提供透明恢复；
- Service Worker 重启：不影响 Frame Runtime，仅重新建立内容请求处理状态。

## 17. 冻结条件

本协议转为 Normative 前必须完成：

- Container 和 Frame JSON Schema；
- 两层状态转换表；
- 超时、取消、幂等和错误码；
- 同一 System 多 Frame 测试；
- 三层嵌套调用测试；
- 完成、取消、失败和 Container 崩溃测试；
- 旧 Activation 和重复消息测试；
- Renderer 重载恢复；
- 桌面进程与 PWA Worker 的互操作一致性测试；
- 不同语言桌面测试子系统互操作。

## 18. 相关文档

- [运行承载系统](../10-architecture/runtime-hosting-system.md)；
- [Frame 数据通道 v1](./frame-data-channel-v1.md)；
- [程序主系统与模块子系统](../architecture/main-system-and-subsystems.md)；
- [JSON-RPC 通信与状态同步](../architecture/runtime-rpc-and-state-sync.md)。
