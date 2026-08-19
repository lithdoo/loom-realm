# Desktop Node.js Launcher / Subsystem Runner Profile v1

> 层级：正式契约 / Desktop Platform Profile  
> 状态：Active / Normative  
> Profile Version：1  
> 稳定程度：Stabilizing  
> 主要定义：Hostra Desktop 将 platform-neutral Subsystem Descriptor 实现为受监督 Node.js Runner Process，并为 Runner 提供 Runtime Control 与动态 Data provisioning 的确定性平台边界  
> 依赖：[Game Package v1](./game-package-v1.md)、[Subsystem Control v1](./subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](./runtime-control-profile-v1.md)、[Renderer Data Profile v1](./renderer-data-profile-v1.md)  
> 最近复核：2026-08-19

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Game Package 选择业务 Definition Module；Desktop Platform 选择 Node Runtime、Host-owned Runner 与物理 provisioning。业务 module 不是 process entry；Platform provisioning 不是 LoomRealm application protocol。**

---

## 1. Scope

```text
Validated SubsystemDescriptorV1 {key,module}
→ module resolution
→ Launch Attempt
→ bootstrap credential registration
→ spawn Host-owned Node Subsystem Runner
→ establish Runner Platform Provisioning Channel
→ Runner imports declared Definition Module
→ construct Subsystem-facing Platform Ports
→ Runtime Control bootstrap
→ Runtime supervision
```

```text
module valid
!= process spawned
!= connected
!= identified
!= ready
!= Data Connection exists
```

---

## 2. Ownership

Game Package owns only：

```text
descriptor.key
descriptor.module
```

Desktop Platform owns：

```text
Node executable
Runner entry
Installation Root resolution
process creation/supervision
Control endpoint realization
Platform Provisioning Channel
Data endpoint/ticket provisioning
```

Main仍拥有 Runtime/Frame/DataAuthority application authority；Platform不得从物理资源反推 authority。

---

## 3. Definition Module Resolution

`descriptor.module` 是 package-relative platform-neutral `.mjs` executable module path。

Desktop resolver MUST：

```text
validate logical syntax
→ resolve under trusted Installation Root
→ reject symlink/junction/reparse redirect in path chain
→ require regular file
→ require .mjs
→ canonical containment verification
→ create host-private ResolvedSubsystemModule
```

```ts
interface ResolvedSubsystemModuleV1 {
  readonly installationId: string;
  readonly subsystemKey: string;
  readonly logicalModule: string;
  readonly physicalModule: string; // Host-private
}
```

`physicalModule` 不进入业务 protocol/Renderer/Frame/Render/Data identity。

---

## 4. Host-owned Runner

Desktop Host MUST选择可信 Runner entry，Game Package不能替换。

```text
Host-owned Runner
    platform bootstrap/integration
    loads @loomrealm/subsystem/host
    imports exactly descriptor.module
    validates Definition Module ABI
    constructs RuntimeControlBinding
    constructs SubsystemDataBinding
    constructs ContentClient
    calls runSubsystem(...)

Game-owned Definition Module
    business definition only
```

Runner MUST NOT fallback 到 package main、directory index、CommonJS、另一个 module 或业务 argv。

---

## 5. Node Runtime Selection

Node executable由 Desktop Host选择。

Game Package/Definition Module MUST NOT指定：

```text
Node executable / flags
--require / --loader / --inspect
shell/interpreter
process argv
NODE_OPTIONS / NODE_PATH
```

Host Runtime version/support policy不属于 Game Package。

---

## 6. Launch Attempt / Token

每次 Runtime创建 fresh Launch Attempt：

```ts
interface LaunchAttemptV1 {
  readonly launchId: string; // Main-private
  readonly subsystemKey: string;
  readonly installationId: string;
  readonly module: ResolvedSubsystemModuleV1;
  readonly bootstrapToken: string;
}
```

`bootstrapToken`：

```text
high entropy
opaque
bound to Launch Attempt + descriptor.key
registered before Runner executes
one successful subsystem.hello consumption
revoked when launch/bootstrap abandoned
not logged
```

顺序：

```text
create Launch Attempt
→ generate/register token
→ construct Runner bootstrap material
→ establish provisioning capability
→ spawn Runner
```

---

## 7. Runner Bootstrap Context

保留环境变量：

```text
LOOMREALM_BOOTSTRAP_CONTEXT
```

值：

```text
Base64URL(no padding)(UTF-8 JSON)
```

```ts
interface LoomRealmNodeRunnerBootstrapContextV1 {
  readonly version: 1;
  readonly subsystemKey: string;
  readonly subsystemModule: string;
  readonly controlEndpoint: string;
  readonly bootstrapToken: string;
}
```

Context MUST NOT包含：

```text
PID / launchId
Data generation/profile
Renderer Data endpoint/ticket
Platform provisioning message
frameId / activationId
Render identity
Content bearer
business params
```

`controlEndpoint` 是 Desktop Runner adapter建立 Runtime Control binding所需的 platform bootstrap material；身份仍只由 `subsystem.hello` 绑定。

---

## 8. Platform Provisioning Channel

Desktop Runner Process MUST拥有一条 Host-owned、与 stdout/stderr/Runtime Control/Data carrier独立的 **Platform Provisioning Channel**。

典型实现：

```text
Node child_process IPC
or equivalent Host-private process channel
```

它的架构职责只有：

> **让 Platform 在 Runtime 已运行后，向 trusted Runner adapter 动态提供/撤销物理基础设施材料。**

Phase 1 的首个真实消费者是 Renderer Data Connection provisioning。

它不是：

```text
Subsystem Control
Frame / Call
Renderer Control
Renderer Data application carrier
business RPC
```

因此本 Profile不冻结一套 LoomRealm application JSON-RPC method namespace。

Hostra app与 Host-owned Runner属于同一 Platform implementation，可自由选择内部 IPC encoding，只要满足本文可观察语义与安全约束。

---

## 9. Data Provisioning Semantics

当 Main current authority为：

```text
DataAuthority(S,G,P)
```

Desktop DataConnectionBroker可以向目标 Runner provisioning source提供一次新的 Data connection offer。

概念内部 value：

```ts
interface DesktopDataProvision {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
  readonly endpoint: string;
  readonly ticket: string;
}
```

该 TypeScript shape只是 platform-internal semantic model，不是新的公开 application wire contract。

Broker/Platform MUST在 offer 前保证：

```text
Session current
Renderer participant current
subsystemKey = target Runtime
G/P = Main current DataAuthority
endpoint/ticket bound to this offer
```

Runner adapter MUST：

```text
validate offer belongs to own subsystemKey
→ use one-time material to establish physical Data carrier
→ wrap as MessageCarrier<string>
→ yield {generation:G,dataProfile:P,carrier} through SubsystemDataBinding
```

SDK/Data Connection current gate仍会再次验证 generation/profile/current installation事实。

---

## 10. Provision Replacement / Revocation

同 generation/profile reconnect：

```text
old carrier retired/lost
→ Broker MAY issue fresh one-time offer for same G/P
→ Runner establishes fresh carrier
→ SubsystemDataBinding yields next connection
```

Authority replacement/revocation：

```text
old pending offer/ticket MUST become unusable
old current carrier MUST retire according to Data Connection semantics
fresh generation/profile uses fresh material
```

Platform MAY通过 provisioning channel主动通知 revoke，或通过关闭对应 carrier/credential使其失效；无论机制如何，都必须及时满足 Data Connection current/retired semantics。

stale/duplicate/consumed offer MUST NOT重新建立 current carrier。

---

## 11. Provisioning Failure Boundary

Provisioning Channel或一次 Data establishment失败：

```text
MUST NOT by itself fail Runtime
MUST NOT unwind Frame
MUST NOT mutate DataAuthority
```

它只意味着当前/future Data carrier不可用，直到仍被授权的 authority获得 fresh successful provisioning。

Runtime Control loss则仍按 Runtime Control Profile进入 Runtime failure；两者 failure domain明确分离。

Provisioning Channel自身 loss后，Runner SHOULD终止 future `SubsystemDataBinding.connections()` availability并清理 pending material；已有 Data carrier是否继续到自然 retire由 Platform binding policy决定，但不得凭空创建新 authority。

---

## 12. Child Environment / Process Creation

Environment：

```text
Host-defined Safe Baseline
+ LoomRealm Reserved Environment
```

Game Package v1 不提供 `descriptor.env`；Host不得无条件继承完整 `process.env`。

Process creation语义：

```text
executable   Host-selected Node
argv         [Host-owned Runner Entry]
cwd          Installation Root
shell        false
detached     false
stdin        closed/ignored
stdout       bounded diagnostics
stderr       bounded diagnostics
provisioning dedicated Host-owned IPC capability
```

业务 `descriptor.module` MUST NOT作为 process argv entry。

---

## 13. Runner Module Load / Host Integration

Runner：

```text
parse/validate bootstrap context
→ verify subsystemKey/module consistency
→ resolve/import exact declared .mjs
→ validate default export SubsystemDefinitionFactory
→ build RuntimeControlBinding from Desktop Control adapter
→ build SubsystemDataBinding from provisioning source + Data transport adapter
→ build ContentClient
→ runSubsystem({definition,platform,launch})
```

Module load/ABI failure：

```text
no Runtime ready
bounded diagnostic error
bootstrap failure
Runtime terminates
```

Definition Module本身不读取 endpoint/token或 provisioning channel。

---

## 14. Runtime Control Bootstrap

```text
Runner/SDK obtains Control carrier
→ subsystem.hello
→ identified
→ initialize
→ ready
```

`ready` 只表示 Runtime Control Profile角色可用。

```text
ready != Data offer exists
ready != Data carrier current
ready != provisioning traffic occurred
```

---

## 15. stdout / stderr

只属于 diagnostic plane，不作为：

```text
Control
ready
Frame
Data
User Input
Render Update
Platform provisioning
```

必须 bounded；secret脱敏。

---

## 16. Runtime Supervisor / Exit

每个 Runner Process有 Supervisor Record，至少观察：

```text
process creation error
exit code/signal
Main-requested termination
force termination result
```

`stopped` 只来自 actual process termination observation。

无 Main termination intent 的任何 bootstrap/ready后 unexpected exit（包括 code 0）→ Runtime failure。

PID只用于监督，不是协议 identity。

---

## 17. Automatic Restart / Termination

v1 MUST NOT automatic restart failed Runtime。

新 Runtime必须 fresh Launch Attempt + fresh token + fresh process/Control lifetime。

正常 termination：

```text
Main shutdown intent / subsystem.shutdown
→ finite grace
→ force terminate if needed
→ observe actual termination
```

Platform MAY使用 job object/process group收敛受管理 process tree。

---

## 18. Timeout Policy

以下等待 bounded：

```text
module resolution/load
process creation
Control connect/hello/ready
shutdown/termination
individual Data establishment attempt
```

具体时间属于 Desktop deployment policy；Game Package不得覆盖。

Data establishment timeout只失败该 attempt，不自动失败 Runtime。

---

## 19. Error Categories

至少：

```text
SUBSYSTEM_MODULE_INVALID
SUBSYSTEM_MODULE_NOT_FOUND
SUBSYSTEM_MODULE_TYPE_UNSUPPORTED
SUBSYSTEM_MODULE_OUTSIDE_INSTALLATION
SUBSYSTEM_MODULE_LOAD_FAILED
SUBSYSTEM_MODULE_ABI_INVALID
LAUNCH_RUNTIME_UNAVAILABLE
PROCESS_SPAWN_FAILED
PROCESS_EXITED_DURING_BOOTSTRAP
PROCESS_EXITED_UNEXPECTEDLY
PROCESS_TERMINATION_FAILED
PLATFORM_PROVISIONING_UNAVAILABLE
DATA_PROVISION_INVALID
DATA_ESTABLISHMENT_FAILED
```

Data provisioning errors不得伪装成 Runtime Control semantic error。

用户错误不得泄露 token/ticket、敏感 env、不必要 absolute path/internal stack。

---

## 20. Trust Boundary

Desktop Runner加载的 Definition Module是 trusted executable JavaScript；Profile只保证从 validated installation通过 Host-owned Runner加载指定 module，不提供完整 OS sandbox。

Platform Provisioning Channel只连接 trusted Host与 trusted Runner，仍必须验证 stale/mismatched/duplicate material，不能因同机而跳过 identity binding。

---

## 21. Conformance

至少覆盖：

```text
valid module resolution
absolute/traversal/url/backslash/symlink rejection
.mjs only
Host-owned runner is argv entry
business module is not argv entry
runner imports exact module/default-export ABI
no descriptor.env

spawn != connected != identified != ready
ready-does-not-require-data-offer
stopped-only-from-supervisor
unexpected-code0-exit-fails-runtime
no-auto-restart

provisioning-channel-distinct-from-control/stdout/data
data-offer-binds-own-subsystem-generation-profile
stale/duplicate/consumed-offer-rejected
same-generation-fresh-offer-after-retire
authority-replacement-invalidates-old-material
data-provision-failure-does-not-fail-runtime-or-unwind-frame
runner-yields-subsystem-data-binding
```

---

## 22. Final Invariants

1. Game Package选择 business module；Desktop Host选择 Node/Runner；
2. business module不是 process entry；
3. Host-owned Runner是唯一 process entry；
4. Runtime identity仍是 descriptor.key；
5. Runtime Control identity只由 subsystem.hello绑定；
6. Runner拥有独立 Platform Provisioning Channel；
7. provisioning不是 Runtime Control/Data application/business protocol；
8. Data offer只实现 current Main DataAuthority，不拥有 generation/profile；
9. same-generation reconnect使用 fresh one-time physical material；
10. Data provisioning failure不等于 Runtime/Frame failure；
11. ready不携/暗示 Data endpoint或 offer；
12. stopped只来自 actual process termination；
13. no automatic restart；
14. Desktop Runner realization不得改变 shared business/application semantics。