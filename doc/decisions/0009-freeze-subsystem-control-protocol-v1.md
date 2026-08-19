# ADR 0009：Subsystem Control Protocol v1

> 状态：Accepted  
> 日期：2026-08-03  
> 最近复核：2026-08-19  
> 影响范围：Main ⇄ Subsystem Control、Runtime lifecycle、Supervisor、Platform Runtime bootstrap  
> 当前契约：[Main ⇄ Subsystem Control Protocol v1](../15-contracts/subsystem-control-protocol-v1.md)  
> 当前组合：[Runtime Control Application Profile v1](../15-contracts/runtime-control-profile-v1.md)

## 背景

Subsystem Runtime 需要独立于 Frame / Renderer Data / Render / Content 的最小 Control protocol：

```text
bootstrap authentication
Runtime identity binding
initializing / ready / failed
Main-owned graceful shutdown
Control-loss lifecycle mapping
```

早期草案曾把 Renderer Data endpoint放入 `subsystem.status({state:"ready"})`。首次 conformant implementation前的边界复核确认这会错误绑定 Runtime readiness与 Data physical provisioning，因此直接从 current v1删除，不保留历史兼容字段。

## 决策

Subsystem Control v1只管理 Runtime Container identity/lifecycle。

Wire surface固定：

```text
Subsystem → Main
    subsystem.hello      Request
    subsystem.status     Notification

Main → Subsystem
    subsystem.shutdown   Request
```

---

## Identity

- `subsystem.hello` 是新 Control carrier第一条 LoomRealm application message；
- hello成功后 Connection永久绑定 `descriptor.key`；
- bootstrapToken绑定一次 Launch Attempt，只能成功消费一次；
- PID、Port、launchId、Runner/process identity都不是 Runtime protocol identity。

---

## Runtime Lifecycle

Runtime自报告：

```text
initializing
ready
stopping
failed
```

Main观察：

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

两套状态来源分离；`stopped`只能来自 Platform/Supervisor观察 actual Runtime termination。

---

## `ready`

Closed schema：

```json
{"state":"ready"}
```

只表示 Runtime required initialization完成并能够承担 enclosing Runtime Control Profile声明的角色。

不得携带或暗示：

```text
Renderer Data endpoint
MessagePort
Data ticket/credential
Data generation/dataProfile
Platform provisioning offer
Frame / Activation / InputTarget
Render State
Content capability
```

因此：

```text
ready != DataAuthority exists
ready != Data Connection exists
ready != Platform provisioning occurred
```

---

## Shutdown Ownership

Main拥有正常 Runtime shutdown intent。

`subsystem.status({state:"stopping"})` 只有 Main已进入 shutdown intent后合法。

`subsystem.shutdown` Success只表示 graceful shutdown accepted；最终 `stopped`仍由 Supervisor actual termination observation决定。

---

## Failure / Reconnect

```text
unexpected Control loss without shutdown intent
→ Runtime failed

unexpected Runtime exit without shutdown intent
→ Runtime failed
```

exit code 0不自动成为 expected stop。

v1：

```text
no same-attempt Control reconnect
no Runtime resume
no automatic restart
```

新 Runtime必须 fresh Launch Attempt / token / Runner / Control lifetime。

---

## Error Model

LoomRealm semantic error：

```text
JSON-RPC error.code = -32000
error.data.code = stable code
```

当前：

```text
BOOTSTRAP_AUTHENTICATION_FAILED
CONTROL_PROTOCOL_UNSUPPORTED
DUPLICATE_CONTROL_CONNECTION
PROTOCOL_STATE_ERROR
```

---

## Health / Retry

v1不定义 application heartbeat/health RPC，也不对 state-changing Control operation进行 application retry/replay。

Platform MAY使用 WebSocket ping/pong、MessagePort lifecycle、Process/Worker Supervisor与 deployment deadline观察物理可用性；这些不形成新的 Control method。

---

## Runtime Control Profile

当前：

```text
Runtime Control Application Profile v1
= Subsystem Control v1
+ Frame / Call v1
```

Control与 Frame保持独立 state machine/version/error semantics。

Profile统一当前 carrier application mapping：

```text
one carrier unit
= one UTF-8 JSON text string
= one JSON-RPC message object
```

Desktop WebSocket / PWA MessagePort物理不同，但 application semantics相同。

---

## Data / Platform Provisioning Boundary

Data/User Input/Render不进入 Runtime Control Profile。

当前完整 Data路径已经由系统级 Platform Composition闭合：

```text
Main DataAuthority(S,G,dataProfile)
→ Platform DataConnectionBroker
→ RendererDataBinding / SubsystemDataBinding
```

Hostra可通过 Runner provisioning IPC交付 Data endpoint/ticket；PWA可通过 Worker provisioning path转移 MessagePort。

这些是 Platform implementation material，不需要再设计一个“Renderer Data Connection Host binding / authentication application Profile”。

只有未来第三方独立 Host/Runner之间确实需要公开 provisioning wire互操作时，才重新评估是否标准化该边界。

---

## 结果

- `launch != connected != identified != ready`；
- Runtime lifecycle与 Renderer Data provisioning彻底解耦；
- `ready`不携任何 Data material；
- Control loss与 Data loss属于不同 failure domain；
- WebSocket/MessagePort共享同一 JSON-text Control application model；
- Platform provisioning不污染 Control wire；
- current v1只有一个 first implementation model。

---

## Deferred

仍暂缓：

```text
application heartbeat / health probe
Runtime restart / checkpoint
same-attempt reconnect
Host deployment timeout defaults
bootstrapToken exact entropy/random algorithm
third-party public Platform provisioning wire
```

其中最后一项只有出现真实跨实现 interoperability requirement时才进入正式协议设计。