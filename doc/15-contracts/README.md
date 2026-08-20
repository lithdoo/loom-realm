# LoomRealm 正式契约目录

> 层级：正式契约  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：当前跨角色协议/Profile、Game logical topology、Platform launch profiles、版本绑定与兼容边界  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[平台组合系统](../10-architecture/platform-composition-system.md)  
> 最近复核：2026-08-20

契约层只保留跨角色/跨实现必须一致的可观察语义。Platform-local Process/Worker/endpoint/ticket/Port wire默认不形成 application protocol。

---

## 1. Current Contract Map

```text
Game Package v1
    logical Game Entry
    Descriptor {key}
    initial target/input

    ├── Hostra Game Launcher / Node Runner Profile v1
    │       launch.hostra.json
    │       → exact key join
    │       → HostraLaunchPlan
    │       → Node Runner
    │
    └── PWA Game Launcher / Worker Runner Profile v1
            launch.pwa.json
            → exact key join
            → PwaLaunchPlan
            → Worker Runner

Subsystem Control v1
    ↓
Runtime Control Application Profile v1
    = Control v1 + Frame / Call v1

Frame / Call v1                         Active / Normative / Frozen
    + Conformance v1

Main ⇄ Renderer Control v1              Active Design / Draft
    ↓ DataAuthority {S,G,dataProfile}
Renderer Data Application Profile v1    Active Design / Draft
    = Data Connection v1 + User Input v1 + Render Update v1

Readonly Content API v1                 Active / Normative / Evolving
```

---

## 2. Game Package v1

[Game Package v1](./game-package-v1.md) 当前 shape：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
}
```

Game Entry还包含 `formatVersion` 与 `initial {subsystem,input}`。

Game Package只拥有 logical topology/business initial input，不声明 executable module、Node/Worker、Transport、env。

---

## 3. Platform Launch Profiles

[Hostra Launcher Profile v1](./nodejs-launcher-profile-v1.md)：

```text
launch.hostra.json
→ key→Hostra module binding
→ exact Game key join
→ safe full module resolution
→ HostraLaunchPlan
→ Host-owned Node Runner
```

[PWA Launcher Profile v1](./pwa-launcher-profile-v1.md)：

```text
launch.pwa.json
→ key→PWA module binding
→ exact Game key join
→ installation/same-origin resolution
→ PwaLaunchPlan
→ Host-owned Worker Runner
```

两 profile独立拥有 platform config schema；不建立 universal launcher options。

共同 hard invariant：**完整 plan在 first business Runtime side effect前冻结。**

---

## 4. Main / Runner Boundary

Main只消费 logical subsystemKey；普通 Runtime launch request不携 module/path/URL/Node/Worker options。

Host-owned Runner是 Process/Worker entry，并按 frozen plan加载 selected Definition Module。

Definition Module ABI统一为 `@loomrealm/subsystem` 的 `SubsystemDefinitionFactory`；Hostra/PWA artifact/path不要求相同。

---

## 5. Runtime Control

[Subsystem Control v1](./subsystem-control-protocol-v1.md)拥有 Runtime identity/lifecycle。  
[Runtime Control Profile v1](./runtime-control-profile-v1.md)静态组合 Control1 + Frame1：one dispatcher、shared sender Request ID、one UTF-8 JSON text per message、no Batch。

`ready`不携 Data endpoint/profile/ticket/Port或 executable binding。

---

## 6. Frame / Call v1

[Frame / Call v1](./frame-call-protocol-v1.md) Frozen，exact seven Requests。

核心不变：Main authority、one-shot Activation、Response-before-dependent-RPC、ACK-before-publication、post-commit no rollback、timeout/loss ambiguous → Runtime failure、fixed-point unwind。

本次 Game/Launcher reset不改变 Frame wire/transaction/failure语义。

---

## 7. Renderer Control / Data Profile

Renderer Control复制 committed Runtime/Stack/Activation/InputTarget/DataAuthority `{S,G,dataProfile}`。

Renderer Data Profile v1 = Connection1 + Input1 + Render1；Profile改变必须 fresh generation。

Data Connection/Core、Input、Render contracts保持各自 lifecycle/authority。

---

## 8. Content API

Content API只提供 readonly logical access。Executable module capability现在由 Platform Launch Profile + trusted Runner拥有，更不能通过 Content API获得 arbitrary executable access。

Runtime bootstrap token、Platform executable capability、Content credential与 Data ticket相互独立。

---

## 9. Platform-local Non-protocol Material

默认不是 application protocol：

```text
Hostra launch manifest filesystem location
PWA launch manifest installation location
Node child IPC provisioning payload
Worker bootstrap/Port transfer object
WebSocket endpoint discovery
Data bearer ticket
Content credential injection
Hostra Shell RPC
```

只有未来出现独立第三方 interoperability boundary时才考虑正式化对应 wire。

---

## 10. Unified Carrier Policy

当前 message-oriented profiles统一：

```text
one carrier unit = one UTF-8 JSON text string
```

WebSocket/MessagePort共享 application value model；Structured Clone只用于 Platform bootstrap/Port transfer。

---

## 11. Authority Summary

```text
Game Package
    logical topology + initial input

Main
    Runtime/Frame/Activation/InputTarget/DataAuthority

Subsystem
    business state / Interest[F] / Render Domains

Renderer
    read-only Main mirror / Producers / Render replica

Platform Launcher
    executable binding/preflight/RuntimeHosting/Runner integration

Platform Composition
    complete physical topology/bootstrap/provisioning
```

---

## 12. Current Closure Priorities

Frozen：Frame / Call v1。

Implementation closure优先验证：

```text
Game Entry → Platform manifest → exact join → zero-side-effect LaunchPlan
Main launch(key) → plan-bound RuntimeHosting → Runner → Subsystem host
Frame protocol → SDK FrameOutcome/control-flow
DataAuthority → Broker → role-local carriers
Hostra/PWA same abstract trace across platform-specific bindings
```
