# M15 / 03 — Desktop Physical Input and Lifecycle

> 状态：**Implementation Planned / Boundary Frozen**  
> 阶段：M15 Desktop Full E2E  
> 落地顺序：03  
> 最近复核：2026-09-10  
> 前置：[M15 / 01](M15_01_DESKTOP_PRODUCT_COMPOSITION.md) → [M15 / 02](M15_02_BROWSERWINDOW_RENDERER_COMPOSITION.md)  
> 依赖：[M10 User Input](M10_05_QUALIFICATION_CLOSURE.md)、[M13 Web Presentation](M13_05_QUALIFICATION_CLOSURE.md)  
> 目标：补齐真实 DOM input producer 与 Desktop reload/reconnect/shutdown behavior；不修改 M10 input protocol，不建立第二套 lifecycle authority。

> **M15 只把 Keyboard/Pointer/Gamepad 的 browser facts 接到既有 `RendererInputSource`，并验证真实 product lifetime。**

---

## 1. DOM `RendererInputSource`

在 BrowserWindow Renderer 内实现一个 concrete DOM producer：

```text
KeyboardEvent
PointerEvent
Gamepad browser state/events
        ↓
RendererInputSourceChange
        ↓
existing Renderer Input Gate
        ↓
M10
```

必须复用既有 `availability / state / event` semantics、channel identity、normalization 与 InputTarget gate。不得增加 Electron-specific Input protocol 或绕过 Renderer Input Gate。

DOM listener lifetime 与当前 Renderer lifetime 绑定；Renderer retirement/Window teardown 后不得继续发送输入。

## 2. Reload / Replacement

Reload 不等于重新启动 game：

```text
Main / Runner / Subsystem remain live
old Renderer retires
→ new BrowserWindow Renderer candidate
→ current Control truth
→ current Data binding
→ current Store/projection
→ presentation resumes
```

除非既有 Main/Runtime semantics 本身要求终止，否则 reload 不得重建 Session 或伪造新的 business state。

## 3. Data Reconnect

必须覆盖 same-generation Data carrier loss：

```text
carrier lost
→ affected projection freezes/unavailable as already defined
→ Main DataAuthority remains current
→ fresh physical carrier reconnects
→ current state resumes
```

健康 subsystem 不因另一 subsystem carrier loss 被停止。

不得增加 retry/backoff framework；qualification 只需驱动一次确定性的 disconnect/reconnect。

## 4. Shutdown

Product shutdown 使用现有 owner 的 close/abort/termination mechanics，按依赖反向收敛：

```text
stop accepting Renderer activity
→ retire Window/Renderer bindings
→ close Data/Content physical services
→ close Main Session / Runtime hosting
→ terminate Runner child
→ Electron exit
```

最终不得残留 child process、listener、WebSocket/HTTP listener 或可继续使用的 Content/Data credential。

## 5. Failure Containment

至少保持以下边界：

```text
presentation/bootstrap failure → Window-local; no Store/Main rollback
Data carrier failure           → no DataAuthority removal
Renderer failure               → no implicit Runtime/Frame failure
Runner terminal                → existing RuntimeHosting/Main semantics
```

Desktop 不创建 RecoveryManager、ConnectionManager、WindowLifecycleManager 或额外 recovery state machine。

## 6. Completion

M15/03 完成时，真实 BrowserWindow input 能驱动现有 M10 path；reload、same-generation reconnect 与 shutdown 都只通过已有 authority/lifecycle seams 收敛。
