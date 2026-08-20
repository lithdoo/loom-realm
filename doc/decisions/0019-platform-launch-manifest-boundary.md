# ADR 0019：Game Logical Topology 与 Platform Launch Manifest 分离

> 状态：Accepted  
> 日期：2026-08-20  
> 影响范围：Game Package v1、Hostra/PWA Launcher、Runtime Hosting、Main bootstrap、Definition Module、package architecture、cross-platform conformance  
> 直接更新：current Game Package v1 / current Hostra Launcher v1；新增 current PWA Launcher v1，不创建 v2  
> 取代/修正：[ADR 0005](./0005-game-entry-subsystem-launchers.md) 当前 `{key,module}` 表达、[ADR 0007](./0007-subsystem-descriptor-mvp.md) 的 current-shape说明、[ADR 0008](./0008-desktop-nodejs-launcher-profile-v1.md) 的 current-shape说明、[ADR 0018](./0018-preimplementation-v1-closure.md) 原 Game Package/“same Definition Module” 结论  
> 延续：[ADR 0017](./0017-system-level-platform-composition.md) Platform Composition ownership 与 [ADR 0018](./0018-preimplementation-v1-closure.md) preimplementation direct-v1 reset policy

## 背景

ADR 0018把旧 Desktop-specific `launcher.entry/env` 收敛成 Game Package `{key,module}`，并要求 Hostra/PWA加载同一个 Definition Module。这消除了直接 Node-entry耦合，但仍留下一个更深的 authority混合：

```text
Game logical topology
    who exists / initial target

与

Platform executable binding
    current platform loads what/how
```

仍同时存在于一个 common Descriptor中。

Hostra与 PWA 的 executable resolution、security、Worker/Process hosting、未来 build artifact差异天然不同。若继续把 `module`定义成 Game Package common identity，则新增平台会被迫接受同一 executable-location model，或者不断向 common Descriptor加入 platform option/negotiation。

这与 ADR 0017“Platform owns physical Session realization”不完全闭合。

---

## 决策 1：Game Package v1 只拥有 logical topology

直接把 current v1 Descriptor改为：

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

移除 current common Descriptor的 `module`。

不保留 deprecated alias/dual parser，也不创建 Game Package v2。

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

每个平台自己的 schema可以独立演化。当前都可使用 `{key,module}` binding，但这只是两个独立 profile目前的局部形状，不形成 universal launcher schema。

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

Missing/extra/duplicate binding在任何 Runtime side effect前 fail closed。

module/path/URL/PID/Worker id不能成为第二 Runtime identity。

---

## 决策 4：完整 Preflight LaunchPlan 先于 Runtime side effect

固定 transaction：

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

任何 config/join/resolution/capability failure：

```text
process/Worker creation = 0
business Definition import = 0
Runtime Control establishment = 0
```

这把原先“Descriptor set先校验”的 invariant提升为完整 game+platform bootstrap preflight。

---

## 决策 5：Main 只发 logical launch intent

Main拥有 Subsystem key registry与 Launch Attempt authority，但不拥有 executable binding。

Main-facing RuntimeHosting概念 API：

```text
launch(subsystemKey, LaunchAttemptMaterial)
```

RuntimeHosting内部lookup frozen PlatformLaunchPlan。

Main不得传 module/path/URL/Node/Worker options。

---

## 决策 6：Host-owned Runner 仍是 physical entry

Hostra：Host-selected Node + Host-owned Node Runner。  
PWA：Host-owned Worker Runner constructor entry。

Runner按 plan加载 selected business Definition Module，并构造 `RuntimeControlBinding` / `SubsystemDataBinding` / `ContentClient` 后进入 `@loomrealm/subsystem/host`。

Game/platform launch manifest不能替换 trusted Runner、credential或 Host security policy。

---

## 决策 7：Definition Module ABI统一，artifact不要求跨平台相同

共享 requirement：

```text
.mjs ESM
SubsystemDefinitionFactory default export
same author-facing capability semantics
same formal protocol outcomes/failure mapping
same business-observable behavior for same logical scenario
```

不再要求：

```text
same module path
same file bytes
same platform build artifact
```

业务 source SHOULD保持 platform-neutral；如果不同平台构建产物不同，应由 build/launcher binding吸收差异，不在 business semantics中探测平台。

---

## 决策 8：两个 Launcher 是窄能力 package

建立：

```text
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
```

它们拥有 manifest/join/resolver/LaunchPlan/RuntimeHosting/Runner launch integration。

不拥有：Renderer Hosting、Main DataAuthority、完整 DataConnectionBroker、Content product、Platform Shell。`apps/desktop` / `apps/pwa`仍是完整 composition roots。

---

## 决策 9：现有协议/authority不变

本 ADR不改变：

```text
Subsystem Control
Runtime Control Profile
Frame / Call v1 frozen semantics
Renderer Control/DataAuthority
Renderer Data/Input/Render contracts
Content API logical semantics
late Data provisioning failure domain
```

只改变 Game logical declaration → Platform executable realization 的边界。

---

## 结果

新的 closed loop：

```text
Game logical topology
        ↓
Validated Game Entry
        +
Current Platform Launch Manifest
        ↓
exact join + full preflight
        ↓
immutable PlatformLaunchPlan
        ↓
Main launch(key)
        ↓
plan-bound RuntimeHosting
        ↓
Host-owned Runner
        ↓
platform-selected Definition Module
        ↓
shared Subsystem role contract
```

新增第三平台只需新增自己的 launch manifest/profile/RuntimeHosting realization；Game Package/Main/Subsystem logical contract不因平台启动差异而演化。

---

## Compatibility / Versioning

当前尚无需要维护的 conformant deployed Game Package `{key,module}` compatibility boundary。本次依照 ADR 0018的 preimplementation reset policy直接修改 current v1。

因此：

```text
no v2
no legacy parser
no deprecated module field
no fallback migration mode
```

历史 `{key,module}` 只保留在 Git/明确标注 Superseded 的 ADR上下文中。

---

## 重新评估条件

- lazy/optional Subsystem需要非 exact key-set关系；
- remote/third-party Runtime引入公开 implementation negotiation；
- third-party Platform Launcher需要共享新的 interoperable bootstrap wire；
- executable package/signing/sandbox形成独立 trust contract；
- one key multiple Runtime实现需要新的 application identity model。

仅增加新平台或更换 Process/Worker API不应重新污染 Game common manifest。
