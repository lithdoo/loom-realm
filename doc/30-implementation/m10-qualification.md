# M10 User Input Qualification

> 状态：**Implemented / Qualified / Closed**
> 日期：2026-09-07
> 规范入口：仓库根目录 `M10_05_QUALIFICATION_CLOSURE.md`
> 协议：`loomrealm.user-input / 1`
> Fixture：`fixtureSetRevision = 2`

M10 已关闭 platform-independent User Input role implementation、Subsystem SDK projection、Renderer source projection与 Hostra/Desktop Data lifecycle 上的 Input vertical。Transport/platform equivalence 仍由 M16 关闭。

## Executable Catalog

正式 runner 直接读取 Frozen [User Input v1 Conformance Profile](../15-contracts/user-input-conformance-v1.md) 第 4–18 节的 Required code blocks，不维护第二份 fixture 名称清单。

```text
required fixture entries = 168
executable groups = 15
qualification role records = 303

subsystem-interest-sender = 63
renderer-input-sender = 131
subsystem-input-receiver = 109
```

第 19 节 transport/platform equivalence 不计入 M10 catalog；它属于 M16。

Coverage audit 强制验证：

```text
fixtureSetRevision = 2
catalog entry count = 168
registered executable groups = normative groups 4..18
unknown group = fail
duplicate group = fail
missing group = fail
```

## Role Evidence

Role adapters直接驱动当前生产实现：

```text
subsystem-interest-sender
    @loomrealm/subsystem InputManager
    @loomrealm/data SubsystemDataPeer

renderer-input-sender
    @loomrealm/renderer RendererInputGate / ControlHolder package tests
    @loomrealm/data RendererDataPeer

subsystem-input-receiver
    @loomrealm/data inbound validation
    @loomrealm/subsystem InputManager / FrameRuntime package tests
```

适配器只观察 wire result、Interest、published Input trace、business delivery和 lifetime transitions，不读取生产 private fields，也不创建 shadow Main/InputTarget/Data authority。

## Qualified Semantics

Executable evidence覆盖：

- closed wire schema、direction、byte/depth/member limits与 channel grammar；
- Interest full Registry、canonical order、hard limits、latest-unsent coalescing与 author atomic rejection；
- Activation/Data/Interest 三重 lifetime和 fresh-carrier empty publication state；
- current Data × InputTarget × active F/A × Interest × Producer Effective；
- ADR 0029 mutation-gate State retain/suppress/reopen/discard；
- State baseline/latest、Event future-only、Reset teardown；
- State-before-Event、Event/Reset barriers、bounded backlog与 stale publisher retirement；
- InputTarget replacement、producer loss/return；
- listener union/baseline/order/async failure isolation；
- Keyboard、Pointer、Gamepad与 custom payload矩阵；
- protocol-invalid Data retirement、stale drop与 business-local containment。

## M10-specific Evidence

Package regression tests additionally qualify：

```text
SubsystemScope.createInputListener exact author surface
channels/setChannels vs on/unsubscribe ownership
dormant registration reactivation and stable callback snapshot
createRendererControlHolder(data?, input?) additive compatibility
current-Control-scoped RendererInputSource start/stop/restart
source bootstrap/stop failure containment and late callback isolation
Control generation/profile transition retires old Data before exposing new Input facts
```

The Desktop vertical uses real Main authority、Renderer Control、M9 Broker、Hostra provisioner、paired Data WebSocket、Data peers、Renderer gate、Subsystem InputManager与 business Definition。它证明 nested Activation 和 same-generation reconnect 后 fresh State/no Event replay。

## Reproduction

```powershell
npm run test:m10:qualification
npm run test:m10
npm run docs:check-links
npm run docs:build
```

`.github/workflows/m10.yml` 在 Node 20/24 上执行完整 `npm run test:m10`，并为每个 Node line 上传包含 protocol/version/revision/role/group/fixture/result 的 TAP qualification artifact。

## Claim Boundary

允许声明：

```text
M10 User Input role implementation = Qualified / Closed
platform-independent fixtureSetRevision 2 qualification = pass
M10 SDK/source projection = pass
Hostra/Desktop Input vertical = pass
```

不声明 BrowserWindow/DOM physical input、PWA、Hostra/PWA transport equivalence、Render 或 Content 已完成。
