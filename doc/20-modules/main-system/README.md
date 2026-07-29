# 程序主系统模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：程序主系统的内部模块边界  
> 依赖：[栈式运行系统](../../10-architecture/stack-runtime-system.md)、[生命周期协议草案](../../15-contracts/system-lifecycle-protocol.md)  
> 最近复核：2026-07-29

## 1. 建议模块

```text
Main System
├── Game Package Bootstrap
├── System Registry
├── Frame Stack Controller
├── Lifecycle Coordinator
├── Process Supervisor
├── Renderer Control Publisher
└── Frame Channel Manager
```

## 2. Game Package Bootstrap

- 打开和校验游戏包公共结构；
- 读取入口；
- 建立只读游戏包上下文；
- 将 `system` 和 `params` 交给栈控制流程；
- 不解释目标子系统业务参数。

## 3. System Registry

- 根据 `systemId` 解析 Provider；
- 校验协议版本和能力；
- 区分系统不存在、版本不兼容和启动失败；
- 第一阶段明确游戏包不携带可执行子系统。

待冻结：命名规则、Provider 配置和内置系统注册方式。

## 4. Frame Stack Controller

- 持有唯一调用栈；
- 校验只有栈顶可以 call/return；
- 维护 Frame 状态和 Stack Revision；
- 决定输入目标；
- 不持有子系统业务状态。

所有栈变化应通过单一串行写入口提交，避免并发 call、return 和进程退出产生不一致。

## 5. Lifecycle Coordinator

负责把一次调用建立或返回组织为多步骤事务：

```text
准备目标
→ 初始化
→ ready
→ 暂停旧 Frame
→ 入栈
→ 建立通道
→ 激活
→ 发布控制状态
```

任一步失败都需要明确回滚或会话失败策略。

## 6. Process Supervisor

- 启动和关闭子系统进程；
- 监听退出和错误；
- 执行关闭期限；
- 将进程异常转换为 Frame 或会话故障；
- 不使用进程 ID 作为调用身份。

## 7. Renderer Control Publisher

- 发布完整调用栈 Snapshot；
- 发布 Frame 入栈、暂停、恢复和出栈；
- 发布输入目标；
- 不解释 Scope Tree 或转发普通数据面消息。

## 8. Frame Channel Manager

- 为有效 Frame 创建渲染端与子系统的数据通道；
- 将端口安全地交给两端；
- 在暂停、恢复、出栈和重连时更新连接；
- 限制消息大小、速率和 Frame 身份。

## 9. 核心不变量

- 栈变化与输入目标变化一致；
- 一个 Frame 同时最多有一个有效 Activation；
- 未 ready 的 Frame 不接收普通输入；
- Frame 出栈后其端口和 Scope 必须清理；
- 普通输入和 Scope 不通过 Main 转发；
- Main 不依赖 `loom.map` 内部类型。

## 10. 测试入口

- 初始 Frame 成功和失败；
- 三层嵌套调用；
- completed、cancelled 和 failed；
- 并发 call/return 拒绝；
- 栈顶崩溃恢复；
- 非栈顶崩溃会话失败；
- Renderer 重载恢复；
- 旧 Activation 消息拒绝。

现有详细资料：[程序主系统与模块子系统](../../architecture/main-system-and-subsystems.md)。
