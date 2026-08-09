# ADR 0009：Subsystem Control Protocol v1

> 状态：Accepted  
> 日期：2026-08-03；边界修订复核：2026-08-09  
> 影响范围：Main ⇄ Subsystem Control Connection、Runtime Lifecycle、Runtime Supervisor、Desktop/PWA Bootstrap  
> 当前契约：[Main ⇄ Subsystem Control Protocol v1](../15-contracts/subsystem-control-protocol-v1.md)

## 背景

Subsystem Runtime 需要独立于 Frame / Render / Data Plane 的最小 Control 协议，用于：

```text
bootstrap authentication
Runtime identity binding
initializing / ready / failed
Main-owned graceful shutdown
Control-loss lifecycle mapping
```

设计过程中一度尝试把 Desktop Renderer Data endpoint 放入 `subsystem.status({state:"ready"})`。在任何 conformant implementation 出现之前，协议边界复核确认这会把 Runtime readiness 与 Renderer⇄Subsystem Data transport/bootstrap 错误绑定，因此该字段被从 first implementation contract 中直接移除。

协议版本表示真实 interoperability boundary，不表示设计稿迭代次数；因此最终第一版实现契约仍为 v1。

## 决定

冻结/收敛 **Subsystem Control Protocol v1**，只管理 Runtime Container identity 与 lifecycle。

Wire surface：

```text
Subsystem → Main
    subsystem.hello      Request
    subsystem.status     Notification

Main → Subsystem
    subsystem.shutdown   Request
```

### Identity

- `subsystem.hello` 是新 Control carrier 第一条 LoomRealm application message；
- hello 成功后 Connection 永久绑定 `descriptor.key`；
- Bootstrap Token 绑定一次 Launch Attempt，只能成功消费一次；
- PID、端口、launchId、Runtime metadata 都不是协议 identity。

### Runtime lifecycle

Runtime 自报告：

```text
initializing
ready
stopping
failed
```

Main 观察：

```text
declared
starting
connected
identified
ready
stopping
stopped
failed
```

两套状态来源必须分离；`stopped` 只能由 Supervisor / Host 确认 Runtime 实际已退出。

### `ready`

`ready` 的 closed schema：

```json
{"state":"ready"}
```

只表示 Runtime required initialization 完成并能够承担 enclosing Runtime Control Profile 声明的角色。

不得携带或暗示：

```text
Renderer Data endpoint
MessagePort
Data credential / DataAuthority
Frame / Activation / InputTarget
Render State
Content capability
```

### Shutdown ownership

Main 拥有正常 Runtime shutdown intent。

`subsystem.status(state="stopping")` 只有在 Main 已进入 shutdown intent 后才合法。`subsystem.shutdown` Success 只表示 graceful shutdown 被接受，不表示 Runtime 已退出；最终 `stopped` 仍由 Supervisor observation 决定。

### Failure / reconnect

- 无 shutdown intent 的 Control loss 或 Runtime exit → terminal Runtime failure；
- exit code 0 不自动表示 expected stop；
- v1 不支持 same-attempt Control reconnect / resume；
- v1 不自动 restart。

### Error model

LoomRealm semantic error 使用：

```text
JSON-RPC error.code = -32000
error.data.code = stable LoomRealm semantic code
```

v1 codes：

```text
BOOTSTRAP_AUTHENTICATION_FAILED
CONTROL_PROTOCOL_UNSUPPORTED
DUPLICATE_CONTROL_CONNECTION
PROTOCOL_STATE_ERROR
```

### Health / retry

v1 不定义 application heartbeat / health RPC，也不对 state-changing Control operation进行 application retry/replay。

Host MAY 使用 WebSocket ping/pong、MessagePort lifecycle、Process Supervisor 与 Host-defined deadline检测可用性。

## Runtime Control Profile

当前组合：

```text
Runtime Control Application Profile v1
=
Subsystem Control v1
+
Frame / Call v1
```

Control 和 Frame 保持独立状态机/版本空间；Data/User Input/Render 不进入 Runtime Control Profile。

## 结果

- `spawn success != connected != identified != ready`；
- Runtime lifecycle 与 Renderer Data bootstrap 解耦；
- Desktop WebSocket Control 与 PWA MessagePort Control 可以共享同一 application schema；
- Control v1 成为第一版实际实现目标；
- Git history 保存早期 endpoint-in-ready 设计，不为其保留额外协议版本。

## 暂缓

- application heartbeat / health probe；
- Runtime restart / resume / checkpoint；
- same-attempt reconnect；
- Host timeout 默认秒数；
- Bootstrap Token 精确熵与生成算法；
- Renderer Data Connection Host binding / authentication Profile。
