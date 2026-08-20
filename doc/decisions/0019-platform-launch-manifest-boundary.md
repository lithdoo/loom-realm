# ADR 0019：Game Logical Topology 与 Platform Launch Manifest 分离

> 状态：Accepted  
> 日期：2026-08-20  
> 影响范围：Game Package v1、Hostra/PWA Launcher、Runtime Hosting、Main bootstrap、Definition Module、package architecture、cross-platform conformance  
> 直接更新：current Game Package v1 / current Hostra Launcher v1；新增 current PWA Launcher v1，不创建 v2  
> 取代/修正：[ADR 0005](./0005-game-entry-subsystem-launchers.md) current `{key,module}` 表达、[ADR 0007](./0007-subsystem-descriptor-mvp.md) current-shape说明、[ADR 0008](./0008-desktop-nodejs-launcher-profile-v1.md) current-shape说明、[ADR 0018](./0018-preimplementation-v1-closure.md) 原 Game Package/“same Definition Module” 结论  
> 延续：[ADR 0017](./0017-system-level-platform-composition.md) Platform Composition ownership 与 [ADR 0018](./0018-preimplementation-v1-closure.md) preimplementation direct-v1 reset policy

> [!NOTE]
> 本 ADR 决定的是 **Game logical topology 与 Platform executable binding 的分离**。Game Entry 的 Runtime-product consumption ownership、`GameEntryV1 != Main bootstrap model` 与 Main-facing `LogicalGameBootstrap` projection，后续由 [ADR 0020](./0020-game-entry-consumer-boundary.md) 进一步细化。ADR 0019 的 topology/executable split、exact join、zero-side-effect PREPARE、Host-owned Runner 与 cross-platform artifact freedom 均保持不变。

---

## 背景

ADR 0018 把旧 Desktop-specific `launcher.entry/env` 收敛成 Game Package `{key,module}`，并要求 Hostra/PWA 加载同一个 Definition Module。这消除了直接 Node-entry 耦合，但仍混合两种 authority：

```text
Game logical topology
    who exists / initial target

Platform executable binding
    current platform loads what/how
```

Hostra/PWA executable resolution、security、Worker/Process hosting 与未来 build artifact 差异天然不同。若 `module` 继续是 Game Package common identity，新平台会被迫接受同一 executable-location model，或让 common Descriptor不断膨胀。

这与 ADR 0017“Platform owns physical Session realization”不闭合。

---

## 决策 1：Game Package v1 只拥有 logical topology

Current v1 Descriptor：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
}
```

Game Entry还拥有：

```text
formatVersion
initial.subsystem
initial.input
complete required subsystem key set
```

移除 common Descriptor `module`。

```text
no deprecated alias
no dual parser
no Game Package v2
```

---

## 决策 2：每个平台独立拥有 Launch Manifest

Hostra：

```text
launch.hostra.json
→ @loomrealm/game-launcher-hostra
```

PWA：

```text
launch.pwa.json
→ @loomrealm/game-launcher-pwa
```

Current 两个平台都 MAY 使用 `{key,module}` binding，但只是两个独立 Profile当前局部 shape，不形成 universal launcher schema。

禁止 common：

```text
launcher.type
PlatformLaunchOptions
options:any
platform-specific bag in game.json
```

---

## 决策 3：Subsystem key 是唯一 join identity

Phase 1：

```text
keys(Game Entry)
=
keys(Current Platform Launch Manifest)
```

Missing/extra/duplicate binding 在任何 Runtime side effect前 fail closed。

module/path/URL/PID/Worker id不能成为第二 Runtime identity。

---

## 决策 4：完整 PREPARE LaunchPlan 先于 Runtime side effect

Fixed transaction：

```text
read/validate Game Entry
→ read/validate current Platform Launch Manifest
→ exact key-set join
→ resolve every required executable binding
→ validate platform hosting/security capability
→ freeze immutable PlatformLaunchPlan
────────────────────────────────────────────
first business Runtime side effect
```

Any config/join/resolution/capability failure：

```text
process/Worker creation = 0
business Definition import = 0
Runtime Control establishment = 0
```

ADR 0020 后续把“谁消费 Game Entry并向 Main投影 logical facts”进一步收口到 matching Launcher；不改变本 PREPARE 原则。

---

## 决策 5：Main 只发 logical launch intent

Main拥有 Subsystem key registry与 Launch Attempt authority，不拥有 executable binding。

Main-facing RuntimeHosting：

```text
launch(subsystemKey, LaunchAttemptMaterial)
```

RuntimeHosting internally looks up frozen PlatformLaunchPlan。

Main不得传 module/path/URL/Node/Worker options。

ADR 0020进一步规定 Main不直接消费 GameEntryV1 document model。

---

## 决策 6：Host-owned Runner 是 physical entry

Hostra：Host-selected Node + Host-owned Node Runner。  
PWA：Host-owned Worker Runner constructor entry。

Runner按 plan加载 selected business Definition Module，并构造 role-local bindings 后进入 `@loomrealm/subsystem/host`。

Game/Platform manifest不能替换 trusted Runner、credential 或 Host security policy。

---

## 决策 7：Definition Module ABI统一，artifact不要求跨平台相同

Shared requirement：

```text
.mjs ESM
SubsystemDefinitionFactory default export
same author-facing capability semantics
same formal protocol outcomes/failure mapping
same business-observable behavior for same logical scenario
```

Not required：

```text
same module path
same file bytes
same platform build artifact
```

Business source SHOULD remain platform-neutral；build/launcher binding absorbs platform artifact difference。

---

## 决策 8：两个 Launcher 是窄 capability packages

建立：

```text
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
```

它们拥有 manifest/join/resolver/LaunchPlan/RuntimeHosting/Runner launch integration。

不拥有 Renderer Hosting、Main DataAuthority、full DataConnectionBroker、Content product、Platform Shell。

`apps/desktop` / `apps/pwa` remain full composition roots。

ADR 0020 后续增加“matching Launcher owns Runtime-product Game Entry consumption orchestration”，但不扩大其 application authority。

---

## 决策 9：现有协议/authority不变

本 ADR不改变：

```text
Subsystem Control
Runtime Control Profile
Frame / Call v1 Frozen semantics
Renderer Control/DataAuthority
Renderer Data/Input/Render contracts
Content API logical semantics
late Data provisioning failure domain
```

只改变 Game logical declaration → Platform executable realization boundary。

---

## 结果（按 ADR 0020 的 current projection 细化）

ADR 0019 当时建立的核心闭环为 Game topology + current Platform manifest → exact join/full PREPARE → frozen plan → Main logical launch。

Current docs 由 ADR 0020进一步表达为：

```text
Game Entry document
        ↓ matching Platform Launcher PREPARE
Validated logical topology
        +
Current Platform Launch Manifest
        ↓
exact join + full executable preflight
        ↓
immutable PlatformLaunchPlan
+
Main-facing LogicalGameBootstrap
        ↓
Main launch(key)
        ↓
plan-bound RuntimeHosting
        ↓
Host-owned Runner
        ↓
platform-selected Definition Module
```

新增第三平台只需新增自己的 Launch Manifest/Profile/RuntimeHosting realization；Game document shape、Main authority、Subsystem author contract不因平台启动差异演化。

---

## Compatibility / Versioning

当时且当前仍无 deployed conformant Game Package `{key,module}` compatibility obligation。

因此 current v1直接 reset：

```text
no v2
no legacy parser
no deprecated module field
no fallback migration mode
```

历史 `{key,module}` 只保留在 Git/明确 Superseded ADR上下文中。

---

## 重新评估条件

- lazy/optional Subsystem需要非 exact key-set关系；
- remote/third-party Runtime引入公开 implementation negotiation；
- third-party Platform Launcher需要共享新的 interoperable bootstrap wire；
- executable package/signing/sandbox形成独立 trust contract；
- one key multiple Runtime实现需要新的 application identity model。

仅增加新平台或更换 Process/Worker API不应重新污染 Game common manifest。
