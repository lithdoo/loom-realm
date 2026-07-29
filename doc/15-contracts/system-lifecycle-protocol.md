# 模块子系统生命周期与调用协议草案

> 层级：正式契约  
> 状态：Draft  
> 稳定程度：Experimental  
> 主要定义：Frame 生命周期、子系统调用和返回的待冻结协议边界  
> 依赖：[栈式运行系统](../10-architecture/stack-runtime-system.md)、[通信系统](../10-architecture/communication-system.md)  
> 最近复核：2026-07-29

本文档先收拢当前散落在架构文档中的生命周期结论。精确 JSON Schema、超时和幂等规则尚未冻结。

## 1. 参与方

- 程序主系统；
- 调用者模块子系统；
- 被调用模块子系统；
- Web 渲染端控制连接。

## 2. 核心身份

```text
systemId
    可解析的模块子系统标识

frameId
    一次调用实例

activationId
    Frame 的一次活动周期

callerFrameId
    调用者 Frame；初始 Frame 为 null
```

进程 ID 不能代替 Frame ID。

## 3. Frame 状态

第一阶段概念状态：

```text
starting
→ active
↔ suspended
→ closing
```

失败状态应当作为显式结果或会话故障处理。是否在 `SystemFrame.state` 中加入 `failed` 仍需冻结。

## 4. 初始化

程序主系统创建 Frame 后调用目标子系统初始化，并传递：

- `frameId`；
- `systemId`；
- 调用输入；
- 受限运行上下文。

目标子系统必须在成功响应前完成：

- 公共和业务参数校验；
- 当前调用所需的必要准备；
- 首次有效 Client State 的可生成性检查。

初始化失败的 Frame 不进入正式活动栈。

## 5. 激活和暂停

激活时程序主系统签发新的 `activationId`。只有当前 Activation 可以接收普通输入和发布新的活动状态。

暂停时：

- 旧 Activation 失效；
- 子系统停止接受普通输入；
- 已发布 Scope 可以继续显示；
- 子系统可以暂停内部 Tick 或调度。

## 6. 调用

只有当前栈顶 Frame 可以发起普通调用：

```text
system.call(systemId, input)
```

调用建立流程应满足：

```text
验证调用者是栈顶
→ 解析目标系统
→ 创建并初始化目标 Frame
→ 目标 ready
→ 暂停调用者
→ 目标 Frame 入栈并激活
→ 更新渲染端栈与输入目标
```

调用请求的成功响应只表示子调用已建立，不包含最终业务结果。

## 7. 返回

被调用子系统返回统一结果：

```text
completed(value)
cancelled
failed(error)
```

只有栈顶 Frame 可以返回。程序主系统应：

```text
标记当前 Frame closing
→ 通知渲染端移除该 Frame
→ 撤销数据连接
→ 关闭调用实例
→ 弹栈
→ 为调用者签发新 Activation
→ 恢复调用者并交付结果
→ 更新输入目标
```

## 8. 待冻结问题

### 返回结果交付方法

现有文档同时存在两种表达：

```text
system.returned(result)
```

和：

```text
system.resume(newActivationId, returnedFrameId, result)
```

实现前必须选择并冻结以下一种方向：

1. `system.resume` 同时承载恢复与结果；
2. `system.resume` 只恢复，结果由独立 `system.returned` 交付；
3. 明确定义两个消息的严格顺序和幂等关系。

在问题关闭前，示例不能被视为最终 Schema。

### 其他开放问题

- 初始化、调用和关闭超时；
- 调用取消；
- 重复请求的幂等性；
- ready 与首次 Snapshot 的原子关系；
- 数据通道建立失败后的回滚；
- 心跳和失联判定；
- 关闭期间新的调用请求；
- Frame 状态是否包含 `failed`。

## 9. 故障原则

- 目标初始化失败：调用不建立；
- 栈顶子系统崩溃：生成失败结果并恢复调用者；
- 初始子系统崩溃：会话失败；
- 非栈顶子系统崩溃：第一阶段会话失败；
- 渲染端重连：调用栈和子系统状态继续存在；
- 主系统崩溃：第一阶段不提供透明恢复。

## 10. 冻结条件

本协议转为 Normative 前必须完成：

- JSON Schema；
- 状态转换表；
- 超时和错误码；
- 三层嵌套调用测试；
- 完成、取消、失败和崩溃测试；
- 旧 Activation 和重复消息测试；
- 不同语言测试子系统互操作。

当前详细资料：

- [程序主系统与模块子系统](../architecture/main-system-and-subsystems.md)；
- [JSON-RPC 通信与状态同步](../architecture/runtime-rpc-and-state-sync.md)。
