# LoomRealm 正式契约目录

> 层级：正式契约  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：current 跨角色协议/Profile、Game document contract、Platform launch profiles、版本绑定、兼容边界与成熟度  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[平台组合系统](../10-architecture/platform-composition-system.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)、[ADR 0022](../decisions/0022-render-update-v1-freeze-closure.md)  
> 最近复核：2026-08-21

契约层只保留跨角色/跨实现必须一致的可观察语义。Platform physical provisioning、Process/Worker、endpoint/ticket/Port creation 默认不形成 application protocol。

```text
Game Entry document != Main bootstrap model
Game topology != Platform executable binding
Runtime != Frame != Renderer Control != Data Connection != User Input != Render != Content
```

---

## 1. Current Contract Map

```text
Game Package v1
    Game Entry document
    Descriptor {key}
    initial target/input
        ↓ consumed by matching launcher

    ├── Hostra Game Launcher / Node Runner Profile v1
    │       Game validation via @loomrealm/game-package
    │       + launch.hostra.json
    │       → exact join / full PREPARE
    │       → HostraLaunchPlan
    │       → LogicalGameBootstrap projection
    │       → plan-bound RuntimeHosting
    │
    └── PWA Game Launcher / Worker Runner Profile v1
            Game validation via @loomrealm/game-package
            + launch.pwa.json
            → exact join / full PREPARE
            → PwaLaunchPlan
            → LogicalGameBootstrap projection
            → plan-bound RuntimeHosting

Subsystem Control v1
    ↓
Runtime Control Application Profile v1
    = Control v1 + Frame / Call v1
    = one reader + one writer + shared strict-monotonic sender IDs

Frame / Call v1                         Active / Normative / Frozen
    + Conformance v1

Main ⇄ Renderer Control v1              Active Design / Draft
    ↓ DataAuthority {S,G,dataProfile}
Renderer Data Application Profile v1    Active Design / Draft
    = Data Connection v1
    + User Input v1
    + Render Update v1

Renderer ⇄ Subsystem Data Connection v1 Active Design / Draft
User Input v1                           Active Design / Core Closure Candidate
Render Update v1                        Active / Normative / Frozen
    + Conformance v1 fixtureSetRevision 1
Readonly Content API v1                 Active / Normative / Evolving
```

---

## 2. Game Package v1

[Game Package v1](./game-package-v1.md)：

```ts
interface GameEntryV1 {
  readonly formatVersion: 1;
  readonly initial: {
    readonly subsystem: string;
    readonly input: JsonValue;
  };
  readonly subsystems: readonly {
    readonly key: string;
  }[];
}
```

Game Package：

```text
logical topology/business initial input only
closed schema
validated detached immutable snapshot
no executable/Platform authority
```

Runtime-product primary consumers 是 matching Platform Launchers。Main 不解析/依赖 Game Entry document model。

Current v1：

```text
no v2
no legacy {key,module} parser
no compatibility alias
```

---

## 3. Platform Launch Profiles

[Hostra Game Launcher / Node Runner Profile v1](./nodejs-launcher-profile-v1.md)：

```text
Game source
→ Game validation
+ launch.hostra.json
→ exact Game↔Hostra key-set join
→ filesystem/install security resolution
→ HostraLaunchPlan
→ LogicalGameBootstrap
→ plan-bound RuntimeHosting
→ Host-owned Node Runner
```

[PWA Game Launcher / Worker Runner Profile v1](./pwa-launcher-profile-v1.md)：

```text
Game source
→ Game validation
+ launch.pwa.json
→ exact Game↔PWA key-set join
→ installation/same-origin resolution
→ PwaLaunchPlan
→ LogicalGameBootstrap
→ plan-bound RuntimeHosting
→ Host-owned Worker Runner
```

两 profile 独立拥有各自 Platform config/schema/validation/security policy；不建立 universal launcher schema/options bag。

共同 hard invariant：

> **Game validation + current Platform manifest validation + exact join + all executable resolution + hosting/security preflight + plan/bootstrap projection MUST complete before the first business Runtime side effect.**

PREPARE failure：

```text
Process/Worker create count = 0
business module import count = 0
Runtime Control establish count = 0
```

---

## 4. Main / Game / Runner Boundary

Main consumes：

```text
LogicalGameBootstrap
    subsystemKeys
    initial subsystemKey/input

plan-bound RuntimeHosting port
```

Main does not consume：

```text
GameEntryV1 / ValidatedGameEntryV1
formatVersion
Platform Launch Manifest / PlatformLaunchPlan
module/path/URL
Node/Worker options
```

Runtime launch：

```text
Main launch(subsystemKey)
→ RuntimeHosting lookup frozen plan
→ Host-owned Runner
→ selected Definition Module
```

Definition Module ABI 统一为 `@loomrealm/subsystem` 的 `SubsystemDefinitionFactory`。

跨平台要求：same logical key / author ABI / formal semantics / business-observable result；不要求 same artifact/path/bytes。

---

## 5. Runtime Control

[Subsystem Control v1](./subsystem-control-protocol-v1.md)：

```text
subsystem.hello
subsystem.status
subsystem.shutdown
```

只拥有 Runtime identity/lifecycle protocol semantics；Launch Attempt/token authority仍属于 Main。

[Runtime Control Profile v1](./runtime-control-profile-v1.md)：

```text
Control 1 + Frame 1
one UTF-8 JSON text unit per JSON-RPC object
one connection-wide inbound reader/dispatcher
one serialized outbound writer
same-sender Control+Frame Request IDs strict monotonic
finite deadlines
terminal/pending settlement first-wins
no Batch / retry / replay / reconnect
```

Runtime Control implementation boundary：

```text
Foundation MessageCarrier
        ↓
Wire parse/decode
        ↓
Runtime Control profile limits/state/correlation
        ↓
role-specific Main / Subsystem Host peers
```

Reader MUST remain able to correlate Response while role handler is awaiting；single reader不得退化为 blocking handler loop。

Response causal barrier：

```text
handler reply
→ Response carrier.send accepted
→ dependent afterResponse action
```

This realizes Frozen Frame call/return Response-before-dependent-RPC without moving Main Stack authority into Runtime Control。

Request IDs：

```text
positive safe integer
strict monotonically increasing per sender/connection
Control + Frame shared same-sender namespace
never reuse / never wrap
```

JSON source duplicate members follow frozen Wire / ECMAScript `JSON.parse` observable semantics；Runtime Control MUST NOT add a second duplicate-member parser。Parsed result仍 exact closed schema。

`ready` 不携 Data/Platform executable material；same-attempt Control reconnect不存在。

---

## 6. Frame / Call v1

[Frame / Call v1](./frame-call-protocol-v1.md) Frozen。

Exactly seven Requests：

```text
Main → Subsystem
    initialize / activate / suspend / resume / close

Subsystem → Main
    call / return
```

核心：

```text
Main authority
one-shot Activation
Response send barrier before dependent RPC
ACK-before-publication
post-commit no rollback
Success = known commit
Explicit Error = protocol-defined known no-commit/fatal
timeout/loss ambiguous → Runtime failure
no retry/replay
lowest failed-runtime occurrence → whole-suffix fixed-point unwind
accepted outcome preserved
fresh surviving Caller resume
```

ADR 0021 only closes Runtime Control mechanics/Wire alignment；does not reopen Frame semantic freeze。

---

## 7. Renderer Control v1

[Renderer Control v1](./main-renderer-control-v1.md) 复制 Main committed authority：

```text
Runtime projection
Frame Stack / Activation
InputTarget
DataAuthority {subsystemKey,generation,dataProfile}
```

不携 Data endpoint/ticket/Port、Platform executable binding、Interest Registry、Render State、Content credential。

---

## 8. Renderer Data Application Profile v1

[Renderer Data Profile v1](./renderer-data-profile-v1.md)：

```text
Profile identity = loomrealm.renderer-data/1
Connection v1 + User Input v1 + Render Update v1
```

Profile负责 static child binding / one JSON-text carrier unit / one Data dispatcher / fresh-carrier baselines。

Profile改变必须 fresh Data generation。

---

## 9. Data Connection v1

[Data Connection v1](./renderer-subsystem-data-connection-v1.md)：

```text
identity = Session + current Renderer + subsystemKey + generation
attribute = immutable dataProfile
lifecycle = current → retired
0..1 current per Subsystem
same S/G/profile sequential reconnect allowed
```

Platform Broker只实现 physical carrier；不 mint generation/profile。

```text
Data loss/provisioning failure
    != Runtime failure
    != Frame unwind
    != DataAuthority mutation
```

---

## 10. User Input v1

[User Input v1](./user-input-v1.md)：

```text
Subsystem → Renderer
    full Frame Interest Registry

Renderer → Subsystem
    State / Event / Reset
```

Effective input = current Data × Main InputTarget/current Activation × Interest[F] × Producer。

fresh Activation可复用 Interest config但不复用 old State/Event；fresh Data registry/state empty。

---

## 11. Render Update v1

[Render Update v1](./render-update-v1.md) Frozen：

```text
render.domains
render.snapshot
render.patch
render.event
```

核心 identity / recovery：

```text
wire Domain identity
= Session + subsystemKey + DataAuthority generation + domainId

same-generation reconnect
= same wire Domain lifetime + fresh publication baseline

fresh generation
= fresh Render wire universe
```

fresh carrier：

```text
first Render message = Registry
→ each Domain independently unbaselined
→ fresh Snapshot
→ carrier-local strict R→R+1 Patch/Snapshot commits
→ Event
```

Event 是 transient/no-replay，同时是 retained sender-side coalescing barrier；well-formed stale Event drop-only。Registry/Snapshot/Patch authoritative continuity error或任何 schema/hard-limit invalid message retire current Data carrier。

logical Domain stacking：higher `zIndex` above；tie 用 `domainId` UTF-8 lexical order。

Render failure不等于 Runtime failure/Frame unwind；Data loss后旧 Render Store最多是 stale presentation cache，不是 fresh Patch base。

---

## 12. Content API v1

[Content API v1](./content-api-v1.md) 提供 readonly logical content access。

必须区分：

```text
Runtime bootstrap token
Platform executable resolution/Runner capability
Data ticket/Port authority
Content credential
```

Content API 不得成为 arbitrary executable path/capability。

---

## 13. Platform Boundary

以下默认不是 application protocol：

```text
Game Entry physical location/acquisition
Hostra/PWA Launch Manifest physical location
Node child IPC provisioning payload
Worker bootstrap/provisioning Port transfer object
WebSocket endpoint discovery
Data bearer ticket format
Content credential injection
Hostra Shell RPC
```

只有出现独立第三方 interoperability/security boundary 时才升级 formal Contract/Profile。

---

## 14. Unified Carrier Policy

Current message-oriented profiles统一：

```text
one carrier unit = one UTF-8 JSON text string
```

WebSocket / MessagePort / MemoryCarrier 共享 application value model；Structured Clone不扩大协议 payload。

Foundation treats string opaque；Wire owns generic JSON representation；profile package owns domain limits/state mechanics。

---

## 15. Authority Summary

```text
Game Package
    Game Entry document validation capability

Platform Launcher
    primary Runtime-product Game consumer
    Game + Platform PREPARE
    PlatformLaunchPlan
    LogicalGameBootstrap projection
    plan-bound RuntimeHosting / Runner integration

Runtime Control
    Control/Frame protocol mechanics
    connection-local protocol state/correlation/deadlines
    no Main/Subsystem business authority

Main
    Runtime/Frame/Activation/InputTarget/DataAuthority
    Launch Attempt/bootstrap credential authority
    no Game document dependency

Subsystem
    business/local Frame/Input state / Interest[F] / Render Domains

Renderer
    read-only Main mirror / Producers / Render replica

Platform Composition
    complete physical topology/bootstrap/provisioning
```

---

## 16. Current Closure Priorities

Implemented Baseline：

```text
@loomrealm/foundation
@loomrealm/wire
@loomrealm/game-package
```

Current next implementation gate：

```text
M3 @loomrealm/runtime-control
    DESIGN / current contracts implementation-ready
```

Then：

```text
M4 Subsystem author/host = first real role consumer
M5 Main = second real role consumer + authority vertical slice
M6 Hostra Launcher = first real Game Package runtime-product consumer
...
M15 PWA Launcher = second Game Package consumer
```

Implementation priority：

```text
established carrier
→ bounded Runtime Control mechanics
→ role-specific peers
→ Subsystem Host/Main real consumer qualification
→ RuntimeHosting/Runner integration
```