# Desktop Node.js Launcher / Subsystem Runner Profile v1

> 层级：正式契约 / Desktop Platform Profile  
> 状态：Active / Normative  
> Profile Version：1  
> 稳定程度：Stabilizing  
> 主要定义：Hostra Desktop 将已验证 platform-neutral Subsystem Descriptor 实现为受监督 Node.js Runtime Process，并通过 Host-owned Subsystem Runner 加载业务 Definition Module 的确定性语义  
> 依赖：[Game Package v1](./game-package-v1.md)、[Subsystem Control v1](./subsystem-control-protocol-v1.md)、[Runtime Control Application Profile v1](./runtime-control-profile-v1.md)  
> 最近复核：2026-08-19

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

> [!IMPORTANT]
> 本次 v1 breaking reset supersede 旧模型：Node Launcher 不再直接执行 Game Package `launcher.entry`，Game Package 也不再声明 `launcher.type/env`。Desktop Host 始终执行 Host-owned Subsystem Runner，Runner 再加载 `descriptor.module`。

核心原则：

> **Game Package 选择业务 Definition Module；Desktop Platform 选择 Node Runtime 与 Runner。业务 module 不是 process entry，process entry 不是业务 identity。**

---

## 1. Scope

本 Profile 定义：

```text
Validated SubsystemDescriptorV1 {key,module}
→ Desktop executable-module resolution
→ Launch Attempt
→ bootstrap credential registration
→ Host-owned Node Subsystem Runner process spawn
→ Runner loads declared Definition Module
→ Runtime Supervisor registration
→ Runtime Control bootstrap
```

Process spawn成功时公共 Runtime state仍为：

```text
starting
```

以下属于后续 Control：

```text
Control connected
subsystem.hello
identified
subsystem.status(ready)
```

因此：

```text
module valid != process spawned != connected != identified != ready
```

---

## 2. Inputs / Ownership

调用 Desktop Launcher 前，Main/Platform MUST 已有：

```text
current Session
validated installation
validated complete Descriptor set
Descriptor Registry
Launch Attempt intent
Main Control endpoint
```

Descriptor：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
  readonly module: string;
}
```

Launcher MUST NOT 从 business name、PID、旧 Registry、filesystem scanning 或 platform-specific fallback 推导另一个业务 module。

---

## 3. Definition Module Resolution

`descriptor.module` 是 package-relative logical executable module path。

Desktop resolver MUST：

```text
validate logical module syntax
→ resolve relative to trusted Installation Root
→ inspect every path component
→ reject symlink / junction / reparse redirect
→ verify final target is regular file
→ verify .mjs
→ canonical containment verification
→ create host-private ResolvedSubsystemModule
```

概念：

```ts
interface ResolvedSubsystemModuleV1 {
  readonly installationId: string;
  readonly subsystemKey: string;
  readonly logicalModule: string;
  readonly physicalModule: string; // host-private
}
```

`physicalModule` MUST NOT：

```text
become Subsystem identity
enter Game/Frame/Render/Data payload
be published to Renderer
replace descriptor.module in application state
```

Resolver failure MUST happen before the target Runtime can load business code.

---

## 4. Host-owned Subsystem Runner

Desktop Host MUST select a trusted LoomRealm Node Subsystem Runner entry independently of Game Package content.

```text
Host-owned runner
    owns Desktop runtime bootstrap glue
    imports @loomrealm/subsystem host integration
    obtains Desktop Subsystem-facing Platform Ports
    loads exactly the declared business Definition Module

Game-owned Definition Module
    owns business definition only
```

Game Package MUST NOT choose/replace Runner entry.

Runner MUST NOT infer a different business module from argv/cwd/package metadata.

---

## 5. Node Runtime Selection

具体 Node executable MUST 由 Desktop Host选择。

Game Package/Definition Module MUST NOT指定：

```text
Node executable
Node CLI flags
--require
--loader
--inspect
shell/interpreter
process argv
NODE_OPTIONS / NODE_PATH
```

Node Runtime version/support policy属于 Host Runtime Policy。

---

## 6. Launch Attempt

每次启动 Subsystem 前 Main MUST 创建 fresh Launch Attempt：

```ts
interface LaunchAttemptV1 {
  readonly launchId: string;          // Main-private
  readonly subsystemKey: string;
  readonly installationId: string;
  readonly module: ResolvedSubsystemModuleV1;
  readonly bootstrapToken: string;
}
```

要求：

```text
one active Runtime Container per descriptor.key
fresh Launch Attempt on every new Runtime
PID/launchId/process handle never become protocol identity
```

---

## 7. Bootstrap Credential

每个 Launch Attempt MUST产生 fresh `bootstrapToken`：

```text
high entropy
opaque
bound to Launch Attempt + descriptor.key
registered before process can execute
one successful subsystem.hello consumption
revoked if launch/bootstrap is abandoned
not logged
```

顺序：

```text
create Launch Attempt
→ generate token
→ register token/key in Main Control auth state
→ construct Runner bootstrap context
→ spawn Runner process
```

禁止 spawn 后再注册 token。

---

## 8. Desktop Runner Bootstrap Context

保留环境变量：

```text
LOOMREALM_BOOTSTRAP_CONTEXT
```

值：

```text
Base64URL(no padding)(UTF-8 JSON)
```

解码：

```ts
interface LoomRealmNodeRunnerBootstrapContextV1 {
  readonly version: 1;
  readonly subsystemKey: string;
  readonly subsystemModule: string;
  readonly controlEndpoint: string;
  readonly bootstrapToken: string;
}
```

其中：

```text
subsystemModule
    = validated descriptor.module logical path
```

`version` 只表示本 Desktop Runner Bootstrap Context v1，不等于 Subsystem Control version。

Context MUST NOT包含：

```text
PID / launchId
DataAuthority generation
Renderer Data endpoint/ticket
frameId / activationId
Render identity
Content bearer
business params
```

Context 是 Host→Host-owned Runner 的 platform bootstrap material，不是 Game Package business configuration，也不是新的 application authority。

---

## 9. Child Environment

Runner process environment：

```text
Host-defined Safe Baseline
+
LoomRealm Reserved Environment
```

Game Package v1 不再提供 `descriptor.env`。

Host MUST NOT无条件继承 Main完整 `process.env`。Safe Baseline SHOULD避免泄露 cloud credential、developer token、proxy secret等无关敏感状态。

Definition Module MUST NOT依赖任意 inherited process env形成 portable business semantics。

---

## 10. Process Creation

语义等价：

```text
executable:
    Host-selected Node.js Runtime

argv:
    [Host-owned Subsystem Runner Entry]

cwd:
    Installation Root

shell:
    false

detached:
    false

stdin:
    closed / ignored

stdout/stderr:
    bounded diagnostic streams
```

**业务 `descriptor.module` MUST NOT作为 process argv entry。**

Game Package不能追加 argv或 shell command。

---

## 11. Runner Module Load

Runner开始后 MUST：

```text
parse/validate bootstrap context
→ verify subsystemKey/module consistency
→ resolve declared logical module against current trusted installation
→ import exactly that .mjs module as ESM
→ validate default export against Subsystem Definition Module ABI
→ construct Desktop Subsystem-facing Platform Ports
→ enter @loomrealm/subsystem host runtime
```

Module load / ABI failure MUST：

```text
prevent Runtime ready
produce bounded diagnostic classification
cause bootstrap failure
terminate Runtime
```

不得 fallback 到另一个 module、CommonJS、package main或 directory index。

---

## 12. Runtime Control Bootstrap

Definition Module本身不得读取 token/endpoint或打开 Control WebSocket。

这些由 Runner/`@loomrealm/subsystem` host integration处理：

```text
Runner obtains established/control binding
→ Subsystem role sends subsystem.hello
→ Main binds descriptor.key
→ identified
→ initialization
→ ready
```

`ready` 不表示 Renderer Data Connection存在，也不携 Data material。

---

## 13. stdout / stderr

stdout/stderr只属于 diagnostic plane。

MUST NOT作为：

```text
Control Protocol
ready signal
Frame/Call
User Input
Render Update
Platform sideband
```

日志策略必须 bounded；credential应脱敏。

---

## 14. Runtime Supervisor

每个 Runner process MUST对应 Supervisor Record，并至少观察：

```text
process creation error
process exit
exit code / signal
Main-requested termination
force termination result
```

`stopped` 只来自实际 Runtime process termination observation。

PID只用于物理监督。

---

## 15. Exit Classification

无 Main termination intent：

```text
spawn后、Control connect前 exit
connected后、hello前 exit
identified后、ready前 exit
ready后任何 unexpected exit including code 0
    → Runtime failure
```

有明确 termination intent 时，Supervisor再按当前 shutdown context分类 expected/failed。

Runtime self-reported failed之后的 process exit不能恢复为 stopped-success语义。

---

## 16. Automatic Restart

v1：

```text
MUST NOT automatically restart failed Runtime
```

未来 restart必须是 fresh Launch Attempt + fresh token + fresh Runtime/Control identity lifetime。

---

## 17. Termination

Desktop Platform必须提供最终有界的 process termination：

```text
request graceful Runtime shutdown
→ finite grace policy
→ force terminate if still alive
→ observe actual termination
```

Platform MAY使用 process group/job object等机制收敛受管理 process tree。

具体 OS API不进入 application protocol。

---

## 18. Timeout Policy

以下等待 MUST bounded：

```text
module resolution
process creation
Control connect
hello
ready
shutdown/termination
```

具体时间值属于 Desktop deployment policy；Game Package不得覆盖。

---

## 19. Error Categories

至少保留：

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
```

用户可见错误不得泄露 token、完整敏感 env、不必要的 absolute path或内部 stack。

---

## 20. Game Bootstrap Failure

Phase 1 eager/all-required：任意 required Subsystem出现以下事实：

```text
Descriptor/module invalid
module cannot resolve/load
ABI invalid
Node Runtime unavailable
Runner spawn failure
Control bootstrap failure
cannot become ready
```

整个 Game Bootstrap MUST失败，并对已创建的其他 required Runtime进入统一 cleanup。

---

## 21. Trust Boundary

Desktop Node Runner加载的业务 Definition Module是 trusted executable JavaScript。

本 Profile保证：

```text
Host only loads validated installation module
through Host-owned Runner
without shell/argv/module fallback
```

不提供完整 OS sandbox。

---

## 22. Conformance

至少覆盖：

```text
valid descriptor.module → resolved module
absolute/traversal/url/backslash rejection
.mjs only
symlink/junction/reparse ancestor rejection
installation containment
Host-owned runner is process argv entry
business module is not process argv entry
bootstrap context contains logical module
runner imports declared module exactly
missing/invalid default export fails bootstrap
no descriptor.env
spawn != connected != identified != ready
stopped only from supervisor
unexpected code-0 exit fails Runtime
no automatic restart
zero shell
bounded diagnostics
```

---

## 23. Core Invariants

1. Game Package选择 `descriptor.module`，Desktop Host选择 Node/Runner；
2. business Definition Module不是 process entry；
3. Host-owned Runner是唯一 Node process entry；
4. module固定 platform-neutral `.mjs` ESM ABI；
5. Game Package不能注入 process env/argv/flags；
6. Runtime identity仍是 `descriptor.key`，不是 module/path/PID；
7. module resolve/load发生在 ready前；
8. Runtime Control identity只由 `subsystem.hello`绑定；
9. `ready`不携/暗示 Data endpoint；
10. stopped只来自 actual process termination；
11. no automatic restart；
12. Desktop Runner realization不得改变 shared Subsystem business semantics。
