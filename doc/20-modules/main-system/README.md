# 程序主系统模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Main 内部 authority/transaction/recovery 模块，以及 plan-bound Main-facing Platform ports  
> 依赖：[系统架构总览](../../10-architecture/system-overview.md)、[运行时启动系统](../../10-architecture/runtime-bootstrap-system.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Frame / Call v1](../../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-20

Main 是 Session / Runtime / Frame / Activation / InputTarget / DataAuthority application authority，但不拥有 executable binding。

---

## 1. Internal Modules

```text
Main System
├── Game Logical Topology Registry {key}
├── Initial Target/Input
├── Launch Attempt Registry
├── Runtime Registry / Supervisor Coordinator
├── Runtime Control Registry
├── Frame / Activation Registry
├── Stack Mutation Coordinator
├── Frame Deadline / Failure Classifier
├── Runtime Failure Unwind Coordinator
├── Renderer Control Publisher
├── DataAuthority Registry
└── Platform Port Coordination
```

Core不 import Hostra/PWA/child_process/Worker/module resolver。

---

## 2. Main-facing RuntimeHosting

概念：

```text
RuntimeHosting.launch(subsystemKey, launchAttemptMaterial)
RuntimeHosting.terminate(...)
Supervisor physical facts
```

Platform已经在 Main启动 Runtime前完成 PlatformLaunchPlan preflight。

Main MUST NOT传：

```text
module
physical path/URL
Node executable/flags
Worker options/Port
```

---

## 3. Game Bootstrap

```text
Validated Game Entry {keys + initial}
        ↓
Main installs logical registry
        ↓
for each required key
    create Launch Attempt/token
    → RuntimeHosting.launch(key)
    → Control carrier
    → hello/identified/ready
```

PlatformLaunchPlan不存在/不完整时，Session physical bootstrap不得开始。

---

## 4. Runtime Control / Frame

`Control v1 + Frame v1 = Runtime Control Profile v1`。

Main-side保持 one dispatcher、shared sender ID namespace、JSON text unit、no Batch。

Frame/Stack transaction仍满足 Response-before-dependent-RPC、ACK-before-publication、post-commit no rollback。

---

## 5. Failure / Unwind

Success = known commit；Explicit Error按协议分类；timeout/loss ambiguous → Runtime failed/no retry。

Unwind仍：lowest live failed-runtime occurrence → whole suffix → Top→Bottom cleanup → fixed-point expansion → preserve accepted outcome → fresh healthy Caller resume/empty Stack。

Platform/Supervisor不能选择 unwind root。

---

## 6. Renderer / Data Authority

Main发布：

```text
Runtime projection
Frame Stack / Activation
InputTarget
DataAuthority {subsystemKey,generation,dataProfile}
```

DataConnectionBroker只实现 physical carrier，不拥有 G/P。

---

## 7. Platform Realizations

```text
Hostra RuntimeHosting
    internally bound to HostraLaunchPlan

PWA RuntimeHosting
    internally bound to PwaLaunchPlan
```

Main-facing logical port保持相同；不同平台 module/artifact完全不进入 Main state。

---

## 8. Tests

```text
logical Registry {key}
initial target/input
fake plan-bound RuntimeHosting
launch request has no module
undeclared key cannot launch
Control/Frame fixtures
failure unwind golden traces
DataAuthority/Broker authority boundary
Hostra/PWA abstract-trace equivalence
```

---

## 9. Final Invariants

1. Main core platform-neutral；
2. Main只拥有 logical key topology，不拥有 executable binding；
3. Platform ports不获得 Main authority；
4. RuntimeHosting由 PlatformLaunchPlan封闭配置；
5. Main launch intent不携 module；
6. Runtime Control/Frame/failure unwind语义不变；
7. DataAuthority仍由 Main拥有；
8. Broker/provisioning只实现 physical carrier。
