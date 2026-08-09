# Desktop Node.js Launcher Profile v1

> 层级：正式契约  
> 状态：Active / Normative  
> Profile Version：1  
> 稳定程度：Frozen  
> 主要定义：Main 将已验证 Subsystem Descriptor 转换为受监督 Node.js Runtime Process 的确定性启动语义  
> 依赖：[Game Package v2 Bootstrap / Descriptor Contract](./game-package-v2.md)、[Subsystem Control v2](./subsystem-control-protocol-v2.md)、[Runtime Control Application Profile v2](./runtime-control-profile-v2.md)  
> 最近复核：2026-08-09

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

> [!NOTE]
> 本文的 **Launcher Profile v1**、`LoomRealmBootstrapContextV1.version = 1` 与 **Subsystem Control protocol version** 是不同版本空间。当前由本 Launcher 启动的 Runtime 使用 Subsystem Control v2；已废弃的 Control v1 不参与实现或协商。

## 1. 范围与链路边界

本 Profile 定义链路：

```text
Validated Subsystem Descriptor
→ Launcher Target Resolution
→ Launch Attempt
→ Bootstrap Context
→ Node.js Process Spawn
→ Runtime Supervisor Registration
```

链路 1 完成条件固定为：

```text
OS Process creation accepted
+
Main obtained a valid supervision handle
+
Supervisor record installed
```

链路 1 完成时公共 Runtime 状态仍为 `starting`。

以下均属于后续 Main ⇄ Subsystem Control 链路，不由本 Profile 判定成功：

```text
Control Transport connected
subsystem.hello
identified
subsystem.status(ready)
```

因此：

```text
spawn success != connected != identified != ready
```

## 2. 前置条件

调用 Node.js Launcher 前，Main MUST 已经：

```text
Session created
→ Main Control Endpoint ready
→ complete Descriptor set loaded
→ complete Descriptor set validated
→ Descriptor Registry installed
```

调用方 MUST 提供已经通过 Game Package v2 校验的 `SubsystemDescriptor`。

Node.js Launcher MUST NOT 再从业务名称、旧 `systemId` 或平台固定 Registry 推导可执行实现。

## 3. Launcher Target Resolution

Launcher MUST 将 `launcher.entry` 相对于可信 Installation Root 解析为内部 `ResolvedLauncherTarget`。

概念结构：

```ts
interface ResolvedLauncherTarget {
  readonly installationId: string;
  readonly subsystemKey: string;
  readonly logicalEntry: string;

  // Host-private; never serialized to business protocols.
  readonly physicalEntry: string;
}
```

解析 MUST：

```text
validate logical Entry syntax
→ resolve relative to Installation Root
→ inspect every path component
→ reject symlink / junction / reparse redirect
→ verify final target is a regular file
→ canonical containment verification
→ create ResolvedLauncherTarget
```

未验证的 Descriptor string MUST NOT 直接传给 Process Creation API。

`physicalEntry` MUST NOT：

- 进入业务 wire protocol；
- 发送给 Renderer；
- 进入 Render State；
- 成为 Subsystem identity。

## 4. Node.js Runtime Selection

Descriptor 只选择：

```text
launcher.type = nodejs
```

具体 Node executable MUST 由 LoomRealm Desktop Host Profile 选择。

Game Package MUST NOT 指定：

```text
Node executable
Node CLI flags
--require
--loader
--inspect
shell
interpreter
argv
```

Launcher MUST NOT 通过 Descriptor、用户 Shell 或用户 PATH 重新解释应该运行哪个 Node Runtime。

Node Runtime 的安装、版本支持与升级属于 LoomRealm Host Runtime Policy。

## 5. Launch Attempt

每次启动 Subsystem 前 Main MUST 创建新的 Launch Attempt。

概念内部模型：

```ts
interface LaunchAttempt {
  readonly launchId: string;
  readonly subsystemKey: string;
  readonly installationId: string;
  readonly target: ResolvedLauncherTarget;
  readonly bootstrapToken: string;

  state:
    | "prepared"
    | "spawning"
    | "supervised"
    | "exited"
    | "failed";
}
```

`launchId`、PID、Process Handle 都属于 Main 内部监督状态，MUST NOT 成为协议 identity。

同一 Session 中一个 `descriptor.key` 同时最多对应一个 active Runtime Container。

本 Launcher Profile v1 MUST NOT 并发创建两个有效 Runtime 来竞争同一 Subsystem identity。

## 6. Bootstrap Credential

每个 Launch Attempt MUST 生成新的 `bootstrapToken`。

要求：

- MUST 绑定单一 Launch Attempt 与 `descriptor.key`；
- MUST 是高熵、opaque credential；
- MUST 只允许成功消费一次；
- MUST NOT 由 PID、端口、路径或时间戳推导；
- SHOULD NOT 出现在普通日志或用户可见错误中。

Token 的字节数、编码与随机算法由安全实现 Profile 决定，不在本 Launcher Profile 版本冻结。

### 6.1 顺序保证

启动顺序 MUST 为：

```text
Create Launch Attempt
→ Generate Bootstrap Token
→ Register token + key in Main Control authentication state
→ Construct child environment
→ Spawn Process
```

MUST NOT：

```text
Spawn Process
→ register Bootstrap Token later
```

在 Process 可观察地开始执行前，相应 Control authentication state MUST 已经存在。

### 6.2 Revoke

以下情况 MUST revoke 未 consumed Token：

- spawn 失败；
- Process 在 `subsystem.hello` 成功前退出；
- Launch Attempt 被取消；
- Game Bootstrap 被取消；
- Session termination。

Token 成功消费后的身份绑定与重放规则由 **Subsystem Control v2** 管理。

## 7. Bootstrap Context

Desktop Node.js Profile v1 冻结单一保留环境变量：

```text
LOOMREALM_BOOTSTRAP_CONTEXT
```

其值 MUST 为：

```text
Base64URL(no padding)(UTF-8 JSON)
```

解码后：

```ts
interface LoomRealmBootstrapContextV1 {
  readonly version: 1;
  readonly subsystemKey: string;
  readonly controlEndpoint: string;
  readonly bootstrapToken: string;
}
```

这里的 `version: 1` 只表示 **Desktop Launcher Bootstrap Context v1**，不表示 Subsystem Control v1。Runtime随后通过 `subsystem.hello.protocolVersions` 协商当前 Control v2。

Bootstrap Context MUST NOT 包含：

```text
PID
launchId
physicalEntry
Renderer Data Endpoint
DataAuthority generation
Data ticket / bearer credential
MessagePort
frameId
activationId
Render identity
```

Bootstrap Context 只提供发起 Control Bootstrap 所必需的信息；它本身不完成 Subsystem identity binding，也不建立 Renderer⇄Subsystem Data Connection。

唯一的 Control identity binding 仍由 `subsystem.hello` 完成。

## 8. Child Environment

Child environment MUST 按以下模型显式构造：

```text
Host-defined Safe Baseline
+
validated descriptor.env
+
LoomRealm Reserved Environment
```

Launcher MUST NOT 无条件继承 Main 的完整 `process.env`。

Safe Baseline MAY 包含 Node/OS 正常运行所需的最小平台字段，但 SHOULD 避免向 Subsystem 泄露 Main 的云凭证、开发者 Token、代理 Secret 或其他无关敏感环境。

Game Package v2 已保留：

```text
LOOMREALM_*
NODE_OPTIONS
NODE_PATH
```

Launcher MUST 在 spawn 前再次拒绝任何未经过 Descriptor Validator 的保留字段冲突，而不能假设上层永远正确。

## 9. Process Creation

Node.js Launcher Profile v1 Process Creation 语义等价于：

```text
executable:
    Host-selected Node.js Runtime

argv:
    [ResolvedLauncherTarget.physicalEntry]

cwd:
    Installation Root

shell:
    false

detached:
    false

stdin:
    closed / ignored

stdout:
    captured diagnostic stream

stderr:
    captured diagnostic stream

extra process IPC:
    none required by this Launcher Profile
```

Game Package MUST NOT 追加 argv。

### 9.1 Shell 禁止

Entry MUST NOT：

- 经过 Shell 解释；
- 通过命令字符串拼接；
- 使用 `exec("node ...")` 或平台等价 Shell API 启动。

Launcher MUST 使用参数化 Process Creation API。

### 9.2 Working Directory

Launcher Profile v1 固定：

```text
cwd = Installation Root
```

`cwd` 是 Runtime compatibility 行为，不是业务 Content API。

Subsystem 的普通游戏内容读取仍 SHOULD 使用 Readonly Content API。

## 10. stdout / stderr

stdout 与 stderr 只属于 diagnostic plane。

MUST NOT 作为：

```text
Control Protocol
ready signal
Frame / Call Protocol
Render Update Protocol
User Input Protocol
```

Main MUST 使用有界日志策略；Subsystem 日志洪泛 MUST NOT 导致 Main 无限内存增长。

Credential、完整敏感环境和其他 Secret SHOULD NOT 被记录。

## 11. Spawn Success 与公共状态

`spawn success` 仅表示：

```text
OS process creation accepted
+
Main owns the supervision handle
```

它不表示：

```text
entry successfully initialized
Control Connection exists
Subsystem identified
Subsystem ready
```

Process 创建成功后，公共 Runtime Container 状态 MUST 保持：

```text
starting
```

Launcher Profile v1 MUST NOT 因 Launcher 内部状态增加新的跨实现公共状态：

```text
spawned
running
```

之后只有 Control carrier 被 Main 接受时才进入 `connected`。

## 12. Runtime Supervisor

每个 Subsystem Runtime MUST 对应一个 Supervisor Record。

Supervisor 至少 MUST 观察：

```text
process creation error
process exit
exit code
termination signal / platform exit reason
Main-requested termination
```

Supervisor MUST 将 OS Process observation 与 Runtime self-reported status 分离。

因此：

```text
subsystem.status(stopping) != stopped
```

`stopped` 只能由 Supervisor 观察实际 Runtime 已退出后产生。

PID 仅用于 OS Process 管理，MUST NOT 用于 Control Authentication 或任何业务 identity。

## 13. Exit Classification

Process exit MUST 被 Main 分类为：

```text
expected
unexpected
```

分类由 Main 当前生命周期上下文决定，MUST NOT 仅依据 exit code。

### 13.1 Bootstrap 期间退出

以下阶段 Process 退出均属于 `unexpected bootstrap termination`：

```text
spawn 后、Control connect 前
connected 后、hello 成功前
identified 后、ready 前
```

结果：

```text
PROCESS_EXITED_DURING_BOOTSTRAP
→ Runtime Bootstrap failure
→ Game Bootstrap failure (all-required MVP)
```

### 13.2 Ready 后退出

Subsystem 已 `ready` 后，如果 Main 没有开始 Runtime/Session termination，则任意 Process exit 都属于 `unexpected runtime termination`，包括：

```text
exit code = 0
```

结果：

```text
PROCESS_EXITED_UNEXPECTEDLY
→ Runtime failure
→ revoke affected current authority/connections
→ upper Main lifecycle handles affected Frames
```

### 13.3 Expected Exit

只有 Main 已明确进入 Runtime termination 流程时，Process exit 才 MAY 被分类为 expected。

## 14. Automatic Restart

Desktop Node.js Launcher Profile v1：

```text
MUST NOT automatically restart a failed Subsystem.
```

Unexpected exit 必须暴露为 Runtime failure。

如果未来引入 restart，每个新 Runtime MUST 是新的显式 Launch Attempt，并使用新的 Bootstrap Credential；Runtime/Data authority、Frame recovery、Render recovery 与 Data Connection replacement 必须由新契约同时定义。

## 15. Termination

Launcher/Supervisor MUST 提供最终可收敛的 Process termination capability。

上层 Main 开始 termination 后：

```text
request graceful termination
→ wait finite Host-defined grace period
→ force terminate if still alive
```

graceful shutdown 的 Main → Subsystem wire method 由 Subsystem Control v2 定义，不属于本 Launcher Profile。

本 Profile 只冻结：

> Runtime / Session termination 最终 MUST 在有限时间内收敛到受管理 Runtime Process 不再运行。

Host SHOULD 使用平台提供的 process group / job object / 等价监督能力，避免只终止根 PID 而遗留由 Runtime 创建的受管理子进程树。

具体 OS 实现属于 Host Adapter，不是跨平台 wire contract。

## 16. Timeout Policy

以下等待 MUST 有有限期限：

```text
process creation
Control connect
hello
ready
shutdown
```

具体默认秒数由 Desktop Runtime Policy 决定，不进入 Game Package 或业务 wire schema。

Game Package MUST NOT 覆盖这些 timeout。

## 17. Error Model

Launcher Profile v1 冻结以下机器可识别错误类别：

```text
LAUNCHER_TYPE_UNSUPPORTED

LAUNCH_ENTRY_INVALID
LAUNCH_ENTRY_NOT_FOUND
LAUNCH_ENTRY_TYPE_UNSUPPORTED
LAUNCH_ENTRY_REDIRECTED
LAUNCH_ENTRY_OUTSIDE_INSTALLATION

LAUNCH_ENV_INVALID
LAUNCH_ENV_RESERVED

LAUNCH_RUNTIME_UNAVAILABLE
PROCESS_SPAWN_FAILED
PROCESS_EXITED_DURING_BOOTSTRAP
PROCESS_EXITED_UNEXPECTEDLY
PROCESS_TERMINATION_FAILED
```

概念错误结构：

```ts
interface LauncherError {
  readonly code: LauncherErrorCode;
  readonly message?: string;
}
```

普通用户可见错误 MUST NOT 包含：

- `bootstrapToken`；
- 完整敏感环境；
- 不必要的用户 Home 路径；
- 不必要的宿主内部绝对路径。

详细路径 MAY 进入受保护的开发者诊断日志，但不是稳定协议数据。

## 18. Game Bootstrap Failure

当前 MVP 为 eager / all-required。

因此任意 Subsystem 出现：

```text
Descriptor invalid
Launcher unsupported
Entry invalid
Runtime unavailable
spawn failure
Control Bootstrap failure
early process exit
cannot become ready
```

整个 Game Bootstrap MUST 失败。

Main MUST 对已经启动的其他 required Runtime 进入统一 termination/cleanup 流程，Session MUST NOT 进入正常运行阶段。

## 19. Trust Model

Desktop `nodejs` Profile 中，被执行的 Subsystem JavaScript 是 **trusted executable code**。

本 Profile 保证的是：

```text
Main only executes a Descriptor-declared, validated Entry inside the Installation.
```

本 Profile不保证：

```text
Node Process is OS-sandboxed
no filesystem access
no network access
no child_process access
```

因此：

```text
safe launcher.entry != sandboxed Node.js process
```

Renderer/Content API 的能力限制与 Node Process 的 OS 权限是不同安全边界，不得混写。

第三方不可信可执行代码 Sandbox 属于暂缓项。

## 20. State Model

Launcher 内部：

```text
prepared
   │
   ▼
spawning
   ├── spawn failure ─────▶ failed
   │
   ▼
supervised
   ├── unexpected exit ───▶ exited / failure observation
   │
   ▼
chain 1 complete
```

公共 Runtime Container：

```text
declared
   │
   ▼
starting      ← chain 1 completes inside this state
   │
   ▼
connected
   │
   ▼
identified
   │
   ▼
ready
   │
   ▼
stopping
   │
   ▼
stopped

legal stages ─────────────▶ failed
```

Launcher MUST NOT 创建第二套公共 Runtime lifecycle。

## 21. Conformance Tests

符合 Launcher Profile v1 的实现至少 MUST 验证：

```text
valid package-relative Entry launches
absolute path rejected
parent traversal rejected
backslash path rejected
URL-like Entry rejected
unsupported extension rejected
missing Entry rejected
directory-as-Entry rejected
symlink Entry rejected
symlink ancestor rejected
Installation escape rejected
case-collision installation rejected

reserved LOOMREALM_* env rejected
NODE_OPTIONS rejected
NODE_PATH rejected
invalid env key/value rejected

Bootstrap Token registered before spawn
new Launch Attempt gets new Token
spawn failure revokes Token
early exit revokes unconsumed Token
bootstrap-context-version-independent-from-control-version

shell interpretation impossible
Game Package cannot supply Node flags
cwd equals Installation Root
stdout/stderr are diagnostic only

spawn success leaves public state at starting
Control v2 hello selects version 2
exit before connect fails bootstrap
exit after connect before hello fails bootstrap
exit after identified before ready fails bootstrap
exit code 0 after ready without termination request is failure
no automatic restart occurs
non-responsive Runtime is eventually force-terminated
```

## 22. 暂缓项

以下项目明确不属于 Launcher Profile v1，MUST NOT 阻塞本 Profile，也不得由实现自行发明隐式行为：

```text
PWA Descriptor → Worker Script Profile
second Launcher Type
untrusted executable sandbox
OS permission/capability sandbox
Game Package signing / Publisher Trust
automatic Runtime restart
checkpoint / crash recovery
idle recycle
lazy Subsystem startup
one key → multiple Runtime instances
remote Subsystem
Game-supplied Node executable
Game-supplied Node flags / argv
Node version negotiation in Game Entry
default timeout numeric values
OS-specific process-group/job-object API
Bootstrap Token final byte length/encoding
executable integrity/signature verification
```

Data endpoint/ticket/MessagePort establishment不属于本 Launcher Profile，也不通过 Control `ready`补回。

## 23. 核心不变量

```text
Main is the only privileged Subsystem Launcher.
One descriptor.key has at most one active Runtime Container.
Desktop Launcher Profile v1 launches nodejs only.
Entry is Installation-relative and validated before spawn.
Launcher never invokes a shell.
Node executable is selected by LoomRealm Host.
Game Package cannot inject Node CLI semantics.
Bootstrap authentication state exists before process execution.
Bootstrap Context v1 version != Subsystem Control version.
Child environment is explicitly constructed.
PID / launchId / Process Handle are not protocol identity.
Spawn success does not mean connected / identified / ready.
Current Control protocol is v2; Control v1 is abandoned.
Runtime ready does not carry Data endpoint.
Supervisor is authoritative for actual Process exit.
Unexpected exit is failure even when exit code is zero.
Launcher Profile v1 never performs implicit automatic restart.
Node.js executable code is trusted code, not sandboxed code.
```
