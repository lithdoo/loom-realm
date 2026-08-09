# ADR 0009：冻结 Subsystem Control Protocol v1

> 状态：Superseded  
> 日期：2026-08-03  
> 影响范围：Main ⇄ Subsystem Control Connection、Runtime Lifecycle、Runtime Supervisor、Desktop Bootstrap  
> 原契约：[Main ⇄ Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md)  
> **被替代：** [ADR 0017：实现前废弃 Subsystem Control v1，确立 v2 为唯一当前版本](./0017-abandon-subsystem-control-v1.md)

> [!IMPORTANT]
> 本 ADR 保存 2026-08-03 当时冻结 v1 的历史决定。v1 后来确认从未形成 conformant implementation / deployment / third-party compatibility dependency，并在 ADR 0017 中于实现前正式废弃。当前实现不得据此实现或协商 Control v1。

## 背景

此前 Control v1 已经收敛 `subsystem.hello`、connection-bound `descriptor.key` identity、`subsystem.status` 与 `connected ≠ identified ≠ ready`，但协议仍保持 Draft / Stabilizing，因为 graceful shutdown、应用错误 Envelope、heartbeat、retry、connection loss 与 timeout 边界尚未全部关闭。

与此同时 Frame 已经被明确收缩为独立的 call / User Input Context。Frame lifecycle / call 不应继续阻塞 Runtime Container 级 Control Protocol 的冻结。

## 决定（历史）

当时冻结 **Subsystem Control Protocol v1**，只管理 Runtime Container 级控制语义。

v1 wire surface 固定为：

```text
Subsystem → Main
    subsystem.hello      Request
    subsystem.status     Notification

Main → Subsystem
    subsystem.shutdown   Request
```

Frame / Call 使用独立协议域，但 MAY 复用同一条已认证 Control Connection。

### Identity

- `subsystem.hello` 是新连接第一条 LoomRealm application message；
- hello 成功后 Control Connection 永久绑定到 `descriptor.key`；
- Bootstrap Token 绑定一次 Launch Attempt，只能成功消费一次；
- PID、端口、launchId、runtime metadata 都不是协议身份。

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

两套状态来源必须分离；`stopped` 只能由 Supervisor 确认实际 Runtime 已退出。

### Shutdown ownership

Main 拥有正常 Runtime shutdown intent。

`subsystem.status(state="stopping")` 只有在 Main 已经进入该 Runtime 的 shutdown intent 后才合法。Runtime 在没有 Main shutdown intent 时无法继续正常服务，应报告 `failed`，而不是自行进入 `stopping`。

`subsystem.shutdown` Response 只表示关闭请求已接受，不表示 Process 已退出。最终退出仍由 Supervisor 确认；超过 Host-defined grace deadline 时 Supervisor 强制终止。

### Connection failure

- 没有 shutdown intent 时 Control Connection 非预期丢失为 Runtime failure；
- shutdown intent 已存在时，连接关闭后由 Supervisor 决定最终 `stopped` / `failed`；
- v1 不支持同一 Launch Attempt reconnect / resume / old-token reuse。

### Error model

标准 JSON-RPC parse/request/method/params error 使用标准整数 code。

LoomRealm semantic error 使用：

```text
JSON-RPC error.code = -32000
error.data.code = stable LoomRealm semantic code
```

v1 冻结：

```text
BOOTSTRAP_AUTHENTICATION_FAILED
CONTROL_PROTOCOL_UNSUPPORTED
DUPLICATE_CONTROL_CONNECTION
PROTOCOL_STATE_ERROR
```

### Health / retry

v1 不定义 application-level heartbeat / health RPC。

Host MAY 使用 WebSocket ping/pong、TCP connection state、Process Supervisor 和 Host-defined timeout 检测可用性。

v1 不进行 application-level state-changing RPC retry；shutdown timeout 进入 Supervisor termination escalation，而不是重新发送 shutdown。

## 结果（历史）

当时将 Subsystem Control Protocol v1 转为 `Active / Normative / Frozen`。

该实现目标现已被 ADR 0017 废弃。当前 Runtime Control 使用：

```text
Subsystem Control v2
+
Runtime Control Application Profile v2
```

Frame / Call v1 仍保持 Frozen。

## 暂缓（历史）

- Frame / Call Protocol；
- application heartbeat / health probe；
- Runtime restart / resume / checkpoint；
- same-attempt reconnect；
- PWA Bootstrap Credential Transport / Control Transport Profile；
- Host timeout 默认秒数；
- Bootstrap Token 精确熵与生成算法；
- Renderer Data Connection authentication / Grant。

## 当前解释

本 ADR 不再构成当前 wire compatibility requirement。当前 Subsystem Control 规范见 [Subsystem Control v2](../15-contracts/subsystem-control-protocol-v2.md)。
