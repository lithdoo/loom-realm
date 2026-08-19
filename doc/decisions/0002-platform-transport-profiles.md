# ADR 0002：平台 Transport Binding

> 状态：Accepted；由 [ADR 0017](./0017-system-level-platform-composition.md) 扩展为 system Platform Composition，并由 [ADR 0018](./0018-preimplementation-v1-closure.md) 收口 Runner/Data Profile/JSON-text mapping  
> 日期：2026-08-01  
> 最近复核：2026-08-19  
> 影响范围：通信系统、Desktop/PWA Platform、Control/Data Connection、Content API

## 背景

Desktop 与 PWA 物理能力不同：

```text
Hostra Desktop
    independent Process / WebSocket / HTTP / IPC

PWA
    Window / DedicatedWorker / MessagePort / Fetch
```

LoomRealm需要 application semantics跨平台一致，但不要求物理 carrier相同，也不把 endpoint/ticket/Port creation默认升级成 application protocol。

## 决策

> **Application semantics统一；物理 carrier/bootstrap/provisioning由 Platform realization建立。**

当前典型映射：

| 逻辑链路 | Hostra Desktop | PWA |
|---|---|---|
| Runtime Hosting | Node Subsystem Runner Process | Worker Subsystem Runner |
| Main ⇄ Subsystem Control | localhost WebSocket | Control MessagePort |
| Main ⇄ Renderer Control | localhost WebSocket | controlled MessagePort |
| Renderer ⇄ Subsystem Data | authenticated Data WebSocket | transferred Data MessagePort |
| late Subsystem Data provisioning | Runner IPC/equivalent | Worker provisioning path/Port transfer |
| Content | localhost HTTP | same-origin Fetch + Service Worker |

Transport只是 Platform Composition的一部分。

---

## Application Profiles

正式 application contracts独立：

```text
Subsystem Control v1
Runtime Control Application Profile v1
Frame / Call v1
Renderer Control v1
Renderer Data Application Profile v1
Data Connection v1
User Input v1
Render Update v1
Content API v1
```

当前 message-oriented profiles统一：

```text
one carrier unit = one UTF-8 JSON text string
```

因此：

```text
WebSocket   text message
MessagePort postMessage(string)
```

Structured Clone只用于 Platform bootstrap/Port transfer，不扩大 application payload model。

---

## Data Authority / Cardinality

对 current Renderer：

```text
(Session, current Renderer, subsystemKey)
    → 0..1 current Data Connection
```

一条 current Data Connection可承载：

```text
0..N Frame/Input contexts
0..N Render Domains
```

Main发布：

```text
DataAuthority {
  subsystemKey,
  generation,
  dataProfile
}
```

当前：

```text
dataProfile = loomrealm.renderer-data/1
```

Data connection physical URL/Port/ticket不是 authority identity。

---

## Platform Binding Obligation

Platform DataConnectionBroker在 carrier安装为 current前 MUST建立以下绑定事实：

```text
current Session
current Renderer participant
target subsystemKey
current DataAuthority generation
current DataAuthority dataProfile
```

Broker不得 mint generation/profile。

### Renderer side

Renderer同时持有 Main Renderer Control mirror，因此可以把 `RendererDataBinding`给出的 S/G/P 与 current DataAuthority独立匹配。

### Subsystem side

Subsystem **不复制 Main Renderer Control authority**，也不增加第二条 Main→Subsystem DataAuthority协议。

因此 Subsystem通过 trusted Platform projection：

```text
SubsystemDataBinding
```

取得 already-authority-bound `{generation,dataProfile,carrier}`。Subsystem SDK可以验证 shape、own Runtime binding、connection replacement/lifecycle与 stale local state，但 **Main current authority correspondence由 Platform Broker/Binding负责证明**。

这不是降低安全要求，而是避免创建第二份 DataAuthority authority source。

---

## Late Provisioning

Runtime `ready`与 Data provisioning独立。

```text
Hostra
    Broker → Runner provisioning IPC → endpoint/ticket → Data WS

PWA
    Broker → Worker provisioning path → transferred Data Port
```

Provisioning material不得：

```text
进入 subsystem.status(ready)
进入 Renderer Authority Snapshot
进入 Frame/Render/business payload
成为 DataAuthority identity
```

Provisioning失败本身不失败 Runtime、不 unwind Frame、不修改 Main DataAuthority。

---

## Frame / Data / Render Independence

```text
Frame create   != Data carrier create
Frame suspend  != Data carrier close
Frame resume   != Data carrier replace
Frame close    != Data carrier retire
Frame unwind   != Render Domain destroy
Data loss      != Runtime failure
Data reconnect != Frame recovery
```

User Input与 Render Update共享 Data carrier，但保持独立 state/recovery semantics。

---

## Carrier Minimum Guarantees

适配器至少提供：

```text
ordered delivery per direction
preserved message boundaries
observable close/loss
bounded buffering
no adapter-created retry
no adapter-created duplicate
```

Foundation `MessageCarrier<string>` 不解释 JSON；具体 JSON-text mapping由 application Profile定义。

---

## Content

Desktop HTTP 与 PWA Fetch共享 Content API logical semantics；credential delivery/storage realization属于 Platform implementation。

---

## Result

- Desktop/PWA共享 application contracts，不要求同一 physical transport；
- Platform负责完整 physical establishment/provisioning；
- DataAuthority包含 S/G/dataProfile，物理 endpoint不产生 authority；
- RendererDataBinding与 SubsystemDataBinding是同一 Broker两端 projection；
- Subsystem不需要第二条 Main DataAuthority mirror；
- Frame/Input/Render/Data lifecycle相互独立；
- current message-oriented profiles统一 JSON text string；
- Platform bootstrap/provisioning默认不形成新的 application protocol。

## Re-evaluation

只有出现真实独立实现 interoperability requirement时才考虑标准化 Platform provisioning wire，例如 third-party remote Runner/Host必须共享公开 schema。仅仅物理实现不同不足以增加 application protocol。