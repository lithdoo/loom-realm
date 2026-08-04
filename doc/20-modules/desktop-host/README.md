# Hostra 桌面宿主模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Hostra 窗口宿主、Desktop Runtime 拓扑、WebSocket/HTTP 适配和安全边界  
> 依赖：[运行时启动与连接建立系统](../../10-architecture/runtime-bootstrap-system.md)、[Desktop Node.js Launcher Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md)、[Subsystem Control Protocol v1](../../15-contracts/subsystem-control-lifecycle-protocol.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[运行承载系统](../../10-architecture/runtime-hosting-system.md)  
> 最近复核：2026-08-04

## 1. Hostra 边界

Hostra 是独立 Electron Shell，只负责 BrowserWindow / desktop lifecycle。它不承载 LoomRealm Main，不启动 Subsystem，不解释业务协议 Payload，也不代理 Renderer⇄Subsystem 数据。

Desktop LoomRealm：Control/System Data 使用 localhost WebSocket；Content 使用 localhost HTTP。

## 2. Desktop Topology

```text
LoomRealm Main Process
├── Runtime Supervisor
├── Control Connection Registry
├── Frame Stack / Transaction Coordinator
├── Frame RPC Deadline / Failure Classifier
├── Activation / InputTarget
└── Data Connection Authority

FSDB Content Service
Hostra Electron Main
Hostra Renderer / Web Renderer
per-Subsystem Process
    ├── Main Control WebSocket
    ├── Renderer Data WebSocket
    ├── 0..N Frame/Input Context
    └── 0..N Render Context
```

进程隔离粒度 = Subsystem，不是 Frame。

## 3. Control WebSocket

同一已认证 WebSocket 逻辑复用：

```text
Subsystem Control Protocol v1        Frozen
Frame / Call Batch A/B/C/D           Frozen
Frame / Call Batch E/F               Draft
```

Batch B exact methods必须原样映射；WebSocket envelope、connection ID、ping/pong 不进入应用 RPC Schema。

## 4. Transaction Ordering

Desktop adapter MUST preserve：call Request→acceptance commit→call Response→dependent Child initialize/activate；return Request→acceptance commit→return Response→dependent close/resume。

ordinary call 不发送 reverse `frame.suspend`。WebSocket adapter 不得要求 nested reverse-request handler reentrancy。

## 5. Renderer Publication

`frame.activate` / `frame.resume` ACK happens-before 对应 InputTarget publication。transaction gap `InputTarget=null` 合法；revoked Activation 不得重新发布；Renderer不参与 Frame RPC。

## 6. Batch D Deadline / Retry Boundary

每个 Frame Request 必须有 finite deadline。Desktop Host/Profile 选择实际 timeout 数值，但不得修改协议结果分类：

```text
Success        → known commit
Explicit Error → known no-commit
Timeout/loss   → ambiguous → Runtime failure
```

WebSocket/TCP 自身可靠传输/重传机制不等于 application-level Frame Request replay。Desktop adapter MUST NOT 在 Frame RPC timeout 后重新发送同一 operation，不实现 operationId/idempotency journal。

迟到 Response 不恢复已 commit 的 Runtime failure。

## 7. Subsystem Mutation Gate

Desktop Subsystem SDK 在 outbound `frame.call / frame.return` pending 时停止对应 Frame 的新 ordinary input并阻止第二个 call/return。

recoverable Explicit Error 可释放 gate；Success commit suspended/closing；timeout/Response-loss 不得释放 gate后继续旧 Activation，而是进入 Runtime failure path。

## 8. Error Mapping

Recoverable Frame semantic error保持 `FRAME_CALL_TARGET_NOT_FOUND / FRAME_CALL_TARGET_UNAVAILABLE / FRAME_INITIALIZE_REJECTED`。

Frame identity/state/Activation/Stack/ownership divergence、Frozen method/schema JSON-RPC error 与 ambiguous timeout 都是 Runtime-fatal。Desktop diagnostics保留 `FRAME_CONTROL_TIMEOUT / FRAME_CONTROL_DIVERGENCE / FRAME_CONTROL_PROTOCOL_ERROR`。

## 9. Launcher / Supervisor

Desktop v1 `launcher.type=nodejs`：validated target only、Host-selected Node、no Game flags/argv、`shell=false`、固定 cwd、Token-before-spawn、explicit child env、no automatic restart。

normal shutdown：shutdown intent→subsystem.shutdown→finite deadline→force terminate if required→actual exit observation→stopped。无 shutdown intent 的 Process exit 是 failure。

## 10. Renderer ⇄ Subsystem Data WebSocket

每 Runtime 与 Renderer 最多一条长期 Data WebSocket：Connection Layer / Render Update / User Input。连接与 Frame 数量无关。

Data Connection reconnect 不得用于修复 Frame Control timeout/divergence。

## 11. Cancellation / User Input

v1 无 caller-driven `frame.cancel`。`cancelled` outcome 由 active Frame 自行 return。Session termination 走 shutdown。

只有 Main-declared active/current frameId+activationId 合法；transaction gap/Runtime failure 时 Input Router停止普通输入，不能沿用旧 target。

## 12. Renderer Reload

reload 后只恢复 Main current committed Runtime/Stack/Activation/InputTarget，重建 Data Connection/Render；不得 revive old Activation，也不得用 reload 撤销 Frame Control failure。

## 13. Security / Core Invariants

Hostra 不承载 Main；每 Subsystem 一个 Process；Control protocol domains共享 WebSocket但语义独立；Frame A/B/C/D 不因 Desktop Transport改变；finite deadline/no retry/ambiguous failure必须保持；Frame lifecycle不控制 Data WebSocket或 Render。
