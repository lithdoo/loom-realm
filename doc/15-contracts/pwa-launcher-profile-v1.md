# PWA Game Launcher / Worker Subsystem Runner Profile v1

> 层级：正式契约 / PWA Platform Profile  
> 状态：Active / Normative  
> Profile Version：1  
> 稳定程度：Stabilizing  
> 主要定义：PWA Platform Launch Manifest、完整 preflight LaunchPlan、Dedicated Worker Runtime Hosting、Host-owned Worker Runner、Runtime Control MessagePort 与动态 Data Port provisioning  
> 依赖：[Game Package v1](./game-package-v1.md)、[Subsystem Control v1](./subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](./runtime-control-profile-v1.md)、[Renderer Data Profile v1](./renderer-data-profile-v1.md)  
> 最近复核：2026-08-20

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Game Package 声明 logical Subsystem key；PWA Launch Manifest 绑定 key → PWA executable Definition Module；PWA Launcher 在零 Runtime 副作用的 preflight 中生成 immutable LaunchPlan；Host-owned Worker Runner 才是 Dedicated Worker entry。**

---

## 1. Scope

```text
Validated Game Entry {key...}
        +
launch.pwa.json
        ↓
PWA manifest validation
        ↓
exact key-set join
        ↓
resolve all required PWA modules
        ↓
immutable PwaLaunchPlan
────────────────────────────────
Main launch(subsystemKey)
        ↓
PWA RuntimeHosting lookup plan
        ↓
create Host-owned Worker Runner
        ↓
Runner imports selected Definition Module
        ↓
Runtime Control MessagePort
        ↓
subsystem.hello / ready / supervision
```

```text
preflight valid
!= Worker created
!= module imported
!= connected
!= identified
!= ready
!= Data Connection exists
```

---

## 2. PWA Launch Manifest

当前 installation 的 PWA launch document convention：

```text
launch.pwa.json
```

Normative model：

```ts
interface PwaLaunchManifestV1 {
  readonly formatVersion: 1;
  readonly subsystems: readonly PwaSubsystemBindingV1[];
}

interface PwaSubsystemBindingV1 {
  readonly key: string;
  readonly module: string;
}
```

示例：

```json
{
  "formatVersion": 1,
  "subsystems": [
    {
      "key": "loom.map",
      "module": "subsystems/pwa/loom-map/subsystem.mjs"
    },
    {
      "key": "loom.battle",
      "module": "subsystems/pwa/loom-battle/subsystem.mjs"
    }
  ]
}
```

该 manifest 是 PWA executable binding，不是 Game logical topology 或普通业务配置。

---

## 3. Manifest Authority Boundary

PWA Launch Manifest MAY声明：

```text
subsystem key → package-local PWA Definition Module
```

MUST NOT声明或替换 Host-owned browser/Worker policy：

```text
Worker Runner entry
arbitrary Worker constructor URL
external module URL
Worker credentials
bootstrap MessagePort
Runtime Control Port
Data MessagePort
Service Worker authority
same-origin policy
CSP policy
browser feature flags
```

这些属于 PWA Host/Launcher implementation。

---

## 4. Key-set Join

PWA Launch Planner MUST 在任何 Worker 创建前验证：

```text
keys(GameEntry.subsystems)
=
keys(PwaLaunchManifest.subsystems)
```

Missing/extra/duplicate binding MUST在 preflight fail closed。

Runtime identity始终是 Game `key`；Worker id、module URL或path不得成为第二 identity。

---

## 5. PWA `module`

Manifest中的 `module` 是当前 validated installation namespace 内的 executable logical module path，不是任意网络 URL。

它 MUST：

1. 非空；
2. 使用 ASCII；
3. 使用 `/` 分隔；
4. 不以 `/` 开始/结束；
5. 无空、`.`、`..` segment；
6. 无 `\\`、`:`、NUL/control char；
7. UTF-8 长度 ≤ 512 bytes；
8. 以 `.mjs` 结尾；
9. 每 segment匹配 `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`。

以下 MUST reject：

```text
../subsystem.mjs
/subsystem.mjs
https://example/subsystem.mjs
blob:https://...
file:///...
foo\\subsystem.mjs
foo/subsystem.js
```

---

## 6. PWA Resolution

PWA resolver MUST：

```text
validate logical path
→ resolve through current validated installation registry
→ require module belongs to selected installation
→ require same-origin / trusted installation execution policy
→ reject arbitrary external URL substitution
→ create host-private ResolvedPwaSubsystemModule
```

概念：

```ts
interface ResolvedPwaSubsystemModuleV1 {
  readonly installationId: string;
  readonly subsystemKey: string;
  readonly logicalModule: string;
  readonly moduleUrl: string; // host-private resolved target
}
```

`moduleUrl` 不进入 Game/Main/Renderer/Frame/Render/Data/business payload。

---

## 7. Immutable PwaLaunchPlan

只有以下全部完成才能冻结：

```text
Game Entry valid
PWA manifest valid
exact key-set join valid
all logical modules valid
all modules resolve to current installation
Host-owned Worker Runner entry available
required browser Worker/MessageChannel capability available
current security policy permits execution
```

冻结前：

```text
MUST NOT create any business Runtime Worker
MUST NOT import business Definition Module
MUST NOT establish Runtime Control
```

普通 launch path冻结后只按 `subsystemKey`查 plan，不重新解释 manifest。

---

## 8. RuntimeHosting Boundary

Main-facing logical request：

```text
launch(subsystemKey, Launch Attempt material)
```

PWA RuntimeHosting：

```text
lookup subsystemKey in PwaLaunchPlan
→ create Worker supervision record
→ establish bootstrap/provisioning capability
→ create Dedicated Worker at Host-owned Worker Runner entry
```

Main不传 module URL、Worker options、MessagePort。

---

## 9. Host-owned Worker Runner

Dedicated Worker constructor target MUST是 Host-owned trusted Worker Runner，而不是 game-selected Definition Module。

Runner：

```text
receive/validate Platform bootstrap
→ verify subsystemKey / selected module binding
→ import exact resolved Definition Module
→ validate default export SubsystemDefinitionFactory
→ construct RuntimeControlBinding
→ construct SubsystemDataBinding
→ construct ContentClient
→ runSubsystem(...)
```

Definition Module 不自己寻找 Worker bootstrap Port，也不创建第二 Runtime。

---

## 10. Definition Module ABI

PWA selected module MUST是 `.mjs` ESM，default export由 `@loomrealm/subsystem/host` 接受为 `SubsystemDefinitionFactory`。

Game business source SHOULD保持 platform-neutral；Platform MAY选择不同 build artifact，只要 author-facing behavior、formal protocol outcome与 cross-platform conformance等价。

---

## 11. Runtime Control Bootstrap

PWA Host创建/提供 Runtime Control MessagePort binding。

进入 application carrier后：

```text
postMessage(string)
= one UTF-8 JSON text string
= one JSON-RPC message
```

Structured Clone只用于 Platform bootstrap/Port transfer；不得扩大 Runtime Control application value model。

```text
Worker created != connected != identified != ready
ready != Data Port exists
```

Control loss / Worker unexpected termination按 Runtime failure处理；same-attempt Control reconnect不存在。

---

## 12. Worker Provisioning Path

Worker Runner MUST拥有与 Runtime Control/Data carrier独立的 Host-owned provisioning path，典型为 dedicated bootstrap/provisioning MessagePort。

它 MAY承载：

```text
fresh Data endpoint Port for current S/G/P
revoke/supersede physical material
```

它不是：

```text
Subsystem Control
Frame / Call
Renderer Control
Renderer Data application carrier
business RPC
```

其具体 message/transfer shape属于 PWA composition内部实现。

---

## 13. Data Provisioning

当 Main current authority为 `DataAuthority(S,G,P)`：

```text
PWA DataConnectionBroker
→ create MessageChannel
→ bind endpoints to current Session/Renderer/S/G/P
→ transfer one endpoint to Renderer
→ transfer one endpoint through Worker provisioning path
→ Runner validates own S/G/P
→ MessageCarrier<string>
→ SubsystemDataBinding yields {G,P,carrier}
```

Broker/Launcher不拥有 G/P。

same S/G/P sequential reconnect使用 fresh MessageChannel；stale/duplicate transferred Port不得重新 current。

Transfer/install failure：

```text
!= Runtime failure
!= Frame unwind
!= DataAuthority mutation
```

---

## 14. Worker Supervision / Termination

Supervisor观察：

```text
Worker creation failure
Worker error/termination
Main-requested termination
bounded force termination result
```

`stopped` 只来自 actual Worker termination observation。

unexpected Worker termination → Runtime failure。

v1 MUST NOT automatic restart；新 Runtime必须 fresh Launch Attempt + Worker + Control lifetime。

---

## 15. Browser/Host Policy

以下属于 Host-owned PWA deployment policy，不得由 `launch.pwa.json` 任意覆盖：

```text
Worker constructor options
Host-owned Runner URL
CSP/same-origin policy
Service Worker registration
bootstrap/provisioning channel encoding
resource/capacity/timeouts
credential material
```

Platform config只选择 installation 内声明的 business implementation artifact。

---

## 16. Failure Categories

至少：

```text
PLATFORM_LAUNCH_MANIFEST_INVALID
PLATFORM_BINDING_MISSING
PLATFORM_BINDING_UNDECLARED
SUBSYSTEM_MODULE_INVALID
SUBSYSTEM_MODULE_NOT_FOUND
SUBSYSTEM_MODULE_OUTSIDE_INSTALLATION
SUBSYSTEM_MODULE_LOAD_FAILED
SUBSYSTEM_MODULE_ABI_INVALID
PLATFORM_RUNTIME_UNSUPPORTED
WORKER_CREATE_FAILED
WORKER_EXITED_DURING_BOOTSTRAP
WORKER_EXITED_UNEXPECTEDLY
PLATFORM_PROVISIONING_UNAVAILABLE
DATA_PROVISION_INVALID
DATA_ESTABLISHMENT_FAILED
```

用户错误不得泄露 credential、internal Port object、无必要 resolved URL/internal stack。

---

## 17. Conformance

至少覆盖：

```text
valid PWA manifest
closed PWA schema
missing/duplicate/extra key
exact Game↔PWA key-set equality
absolute/traversal/external-url/module-type rejection
same-origin/installation resolution
all bindings resolved before first Worker creation
no business module import during preflight
Main launch request contains no module
Host-owned Worker Runner is constructor entry
business Definition Module is imported by Runner
Runtime Control postMessage(string)
Worker provisioning path distinct from Control/Data
Data Port binds own S/G/P
stale/duplicate Port rejected
same S/G/P fresh MessageChannel reconnect
provision failure does not fail Runtime/Frame
unexpected Worker termination fails Runtime
no automatic restart
```

---

## 18. Final Invariants

1. Game Package只声明 logical key；PWA manifest独立声明 key→PWA Definition Module；
2. Game/PWA key set在 Phase 1严格相等；
3. PwaLaunchPlan在任何 Runtime Worker side effect前完整冻结；
4. Main只发出 subsystemKey/Launch Attempt logical intent；
5. resolved module URL与 Worker options只存在于 PWA boundary；
6. Host-owned Worker Runner是唯一 Dedicated Worker entry；
7. Game common manifest不能选择 Worker/Port/credential；
8. Definition Module ABI统一，但 Hostra/PWA artifact不要求 byte/path identity；
9. Runtime Control与 provisioning path独立；
10. Data provisioning failure不等于 Runtime/Frame failure；
11. current Control/Data application unit仍是 JSON text string；
12. stopped只来自 actual Worker termination；
13. no automatic restart；
14. 本 Profile是 current v1直接定义，不存在旧 `{key,module}` Game Descriptor兼容路径。
