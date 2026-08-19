# LoomRealm 正式契约目录

> 层级：正式契约  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：当前跨角色/跨实现契约入口、版本、兼容边界与成熟度  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[平台组合系统](../10-architecture/platform-composition-system.md)  
> 最近复核：2026-08-19

契约层只保留跨角色/跨实现必须一致的 observable semantics。Process/Worker、endpoint/ticket/Port creation、Hostra/browser API等默认属于 Platform realization。

```text
Game Package != Runtime Control != Frame != Renderer Control
!= Data Connection != User Input != Render != Content
```

共享 Transport/Package不代表共享 authority/lifecycle/version。

---

## 1. Current Contract Map

```text
Game Package v1
    platform-neutral Descriptor {key,module}
    Definition Module = package-local .mjs
    ↓
Platform Runtime realization
    ├── Desktop Node.js Launcher / Subsystem Runner Profile v1
    └── PWA Worker Runner realization (Platform composition)
    ↓
Subsystem Control v1
    ↓
Runtime Control Application Profile v1
    = Subsystem Control v1 + Frame / Call v1

Frame / Call v1                         Active / Normative / Frozen
    + Conformance v1

Main ⇄ Renderer Control v1              Active Design / Draft
    ↓ DataAuthority / InputTarget
Renderer ⇄ Subsystem Data Connection v1 Active Design / Draft
    ├── User Input v1                   Active Design / Core Closure Candidate
    └── Render Update v1                Active Design / Closure Candidate

Readonly Content API v1                 Active / Normative / Evolving
```

Platform Composition负责 actual physical topology，但不是新的 application protocol。

---

## 2. Game Package v1

[Game Package v1](./game-package-v1.md) 当前直接冻结 platform-neutral Subsystem Descriptor：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
  readonly module: string;
}
```

`module` 是 package-local `.mjs` Subsystem Definition Module，不是 Node process entry / Worker URL / Content resource。

Game Package不声明：

```text
launcher.type
env
Node/Worker options
Control/Data endpoint
```

同一 Descriptor/module必须可由 Hostra Desktop 与 PWA Platform realization加载。

---

## 3. Desktop Node.js Launcher / Subsystem Runner Profile v1

[Desktop Node.js Launcher / Runner Profile v1](./nodejs-launcher-profile-v1.md) 冻结 Desktop interoperability boundary：

```text
validated descriptor.module
→ Host-owned Node Subsystem Runner process
→ Runner imports declared module
→ Runtime Control bootstrap
```

业务 module不是 process argv entry；Node executable/Runner由 Host选择。

```text
module valid != spawned != connected != identified != ready
```

PWA不复制 Node process profile；它在 Platform Composition中用 Worker Runner实现相同 Definition Module ABI。

---

## 4. Subsystem Control v1

[Subsystem Control v1](./subsystem-control-protocol-v1.md)：

```text
Subsystem → Main
    subsystem.hello
    subsystem.status

Main → Subsystem
    subsystem.shutdown
```

只管理 Runtime identity/lifecycle。

`ready`不携带/暗示 Data endpoint、credential/Port、Frame、Render或InputTarget。

---

## 5. Runtime Control Application Profile v1

[Runtime Control Profile v1](./runtime-control-profile-v1.md)：

```text
Subsystem Control v1
+
Frame / Call v1
```

冻结：hello-before-frame、shared sender request-id namespace、one message per transport unit、no JSON-RPC Batch、Frame v1 static binding。

Data/User Input/Render不进入 Runtime Control Profile。

---

## 6. Frame / Call v1

[Frame / Call v1](./frame-call-protocol-v1.md) 是 Active / Normative / Frozen。

Exactly seven Requests；Main拥有 Frame/Stack/Activation/InputTarget authority；state-changing timeout/loss ambiguous → Runtime failure；no retry/replay；response-before-dependent-RPC；ACK-before-publication。

Conformance：[Frame / Call v1 Conformance](./frame-call-conformance-v1.md)。

---

## 7. Renderer Control v1

[Main ⇄ Renderer Control v1](./main-renderer-control-v1.md) 复制 Main committed authority full snapshot：

```text
Runtime projection
Frame Stack / Activation
InputTarget
DataAuthority
```

不携 Input Interest、Render State或 Data endpoint/ticket/Port。

---

## 8. Data Connection v1

[Renderer ⇄ Subsystem Data Connection v1](./renderer-subsystem-data-connection-v1.md) 只定义 current carrier identity/lifecycle：

```text
Session + current Renderer + subsystemKey + generation
```

per Subsystem最多一条 current Data Connection；same-generation顺序 reconnect合法；Data loss不等于 Runtime failure/Frame unwind。

---

## 9. User Input v1

[User Input v1](./user-input-v1.md)：

```text
Main InputTarget authority
∩ Subsystem Frame Interest[F]
∩ Renderer Producer availability
```

Interest以 Frame为语义作用域、以 current Data Connection为 publication/recovery作用域；fresh Data carrier remote registry从 empty开始；fresh Activation可复用 Interest config但不能复用旧 Input State/Event。

---

## 10. Render Update v1

[Render Update v1](./render-update-v1.md)：Subsystem→Renderer only。

```text
Domain Registry
Snapshot
Patch
Event
```

Render Domain lifecycle独立于 Frame/Data carrier；fresh carrier通过 Registry + fresh Snapshots重建 baseline。

---

## 11. Content API v1

[Readonly Content API v1](./content-api-v1.md) 定义跨 Desktop/PWA 的 logical readonly Content semantics。

Executable Subsystem Definition Module与 ordinary Content capability分离；Content API不能用于任意执行 Game Package module。

---

## 12. Platform Boundary

正式 contracts描述 application interoperability；Platform Composition实现：

```text
Runtime Hosting / Runner
Runtime / Renderer Control bindings
Renderer Hosting
Data Connection Broker
Content binding
physical lifecycle
```

除非未来出现真实第三方互操作需求，不为 Hostra/PWA bootstrap mechanics单独创建 application protocol。

---

## 13. Versioning Rule

```text
protocol/profile/contract version
!= npm package semver
!= Platform implementation version
```

当前 Game Package v1在产品实现前完成 breaking reset 后，以 `{key,module}` 作为 v1现行 normative shape；旧 Desktop-only `launcher/env` shape不再是 v1的一部分。
