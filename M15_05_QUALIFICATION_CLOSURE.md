# M15 / 05 — Qualification and Closure

> 状态：**Implementation Planned / Boundary Frozen**  
> 阶段：M15 Desktop Full E2E  
> 落地顺序：05  
> 最近复核：2026-09-10  
> 前置：[M15 / 01](M15_01_DESKTOP_PRODUCT_COMPOSITION.md) → [M15 / 02](M15_02_BROWSERWINDOW_RENDERER_COMPOSITION.md) → [M15 / 03](M15_03_DESKTOP_INPUT_AND_LIFECYCLE.md) → [M15 / 04](M15_04_DESKTOP_FULL_E2E_VERTICAL.md)  
> 依赖：[Testing Strategy](doc/30-implementation/testing-strategy.md)  
> 目标：定义唯一 M15 closure scope；实施只补真实 Desktop physical evidence，不以 E2E 名义扩张架构。

> **M15 closure = 同一 M14 logical game 通过真实 Hostra PREPARE、Node child、Desktop Data/Content、Electron BrowserWindow、真实 DOM input 与 M13 presentation 完成可重复的 startup → input → reload/reconnect → shutdown trace。**

---

## 1. Closure Scope

必须实现并证明：

```text
real Electron product entry
real BrowserWindow Renderer candidate/currentness
real Node Runner child
existing Runtime Control
existing Desktop Data Broker
existing Desktop Content service
real DOM Keyboard/Pointer/Gamepad RendererInputSource
existing M13 presentation
same M14 game library/example
reload/replacement
same-generation Data reconnect
shutdown/child termination
failure containment
```

M10–M14 已关闭的 protocol/business semantics 继续由原 qualification 拥有；M15 不复制第二套 conformance suite。

## 2. Abstraction Budget

M15 可以增加 concrete physical adapters/functions，只要存在直接 production consumer。

不得新增：

```text
DesktopRuntimeHost / MiniDesktopHost
WindowRegistry / ConnectionRegistry
GameManager / ServiceLocator
UniversalRendererHost
RecoveryManager / retry framework
second Renderer currentness/projection model
Electron-specific Input/Render/Content protocol
platform-owned game/component registry
```

若实施暴露出 frozen contract 的真实缺陷，先修 nearest owner；不要在 Desktop 层补 shadow state。

## 3. Required Evidence

Closure 至少包含：

```text
startup:
    PREPARE → child → Main → BrowserWindow → visible M14 map

input:
    real DOM ArrowRight → existing M10 → passable then blocked M14 outcome

reload:
    Renderer replacement without game/session restart → current presentation restored

reconnect:
    same-generation Data carrier loss → authority retained → current projection resumes

shutdown:
    Window/services/session close → Runner child terminated → no live listeners/servers

failure containment:
    Window/presentation failure does not mutate Main/Subsystem authority
```

Pointer/Gamepad physical producer coverage may be focused producer-level evidence; M14 business vertical need not invent pointer/gamepad gameplay solely for M15.

## 4. Canonical Gate

M15 adds one new historical milestone gate：

```text
npm run test:m15
```

It MUST include the existing closure first：

```text
npm run test:m14
→ build/qualify Desktop product composition
→ M15 boundary + Electron E2E/lifecycle evidence
```

Do not change the meaning of `test:m14`。CI adds a dedicated M15 workflow that runs the same `test:m15` entry.

Formal closure evidence should be recorded in：

```text
doc/30-implementation/m15-qualification.md
```

That record, not this planning file, owns the final PASS/Closed claim.

## 5. Boundary Checks

Qualification must mechanically reject at least：

```text
apps/desktop owning map/business source
business WC importing Desktop/Renderer private authority
presentation config entering Hostra/Main bootstrap
Data/Content/Control merged into one universal channel
Desktop direct Store/Main mutation
new generic host/manager/registry introduced only for E2E
```

## 6. Closure Condition

M15 can be marked Closed only when `npm run test:m15` is repeatable in the supported CI environment and all required lifecycle/failure evidence passes with the production physical path.

No new ADR is required unless implementation changes an already-frozen architecture/contract boundary.
