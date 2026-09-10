# M15 / 03 — Desktop Physical Input and Lifecycle

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M15 Desktop Full E2E  
> 落地顺序：03  
> 最近复核：2026-09-10  
> 前置：[M15 / 01](M15_01_DESKTOP_PRODUCT_COMPOSITION.md) → [M15 / 02](M15_02_BROWSERWINDOW_RENDERER_COMPOSITION.md)  
> 依赖：[M10 User Input](M10_05_QUALIFICATION_CLOSURE.md)、[M13 Web Presentation](M13_05_QUALIFICATION_CLOSURE.md)  
> 目标：补齐真实 DOM input producer 与 Desktop reload/reconnect/shutdown behavior；不修改 M10 input protocol，不建立第二套 lifecycle authority。

> **M15 只把 BrowserWindow 的 Keyboard/Pointer/Gamepad physical facts 映射到既有 `RendererInputSource`，并验证真实 product lifetime。**

---

## 1. DOM `RendererInputSource`

Renderer Main World内实现一个 concrete DOM producer：

```text
KeyboardEvent
PointerEvent
Gamepad browser state
        ↓
canonical RendererInputSourceChange
        ↓
existing Renderer Input Gate
        ↓
M10
```

必须复用既有 `availability / state / event` semantics、channel identity、State-before-Event ordering 与 InputTarget gate。不得增加 Electron-specific Input protocol、action mapping、device registry或绕过 Renderer Input Gate。

Source lifetime继续遵守 M10：source object固定在 holder construction；每个 current Control peer epoch最多一个 active `start()` subscription；stop后 late DOM callback不得影响新的 epoch。

## 2. Shared Availability / Focus Rule

Physical producer只在当前 Window同时满足以下条件时认为 browser input surface usable：

```text
window has focus
AND document.visibilityState == "visible"
```

focus/visibility丢失：

```text
stop accepting new physical transitions
→ clear tracked keyboard/pointer facts
→ stop Gamepad polling
→ emit availability=false for affected standard channels
```

恢复 usable：

```text
rebuild fresh canonical current State
→ emit state first
→ emit availability=true
→ resume future Event only after availability
```

不得 replay blur/hidden期间的 Keyboard/Pointer/Gamepad Event。

## 3. Keyboard Mapping

只接受 `KeyboardEvent.code` 属于 frozen `KeyboardCodeV1` exact set的事件；`key`、locale text、IME/composition不进入标准 channel。

Canonical mechanics：

```text
start / focus return
→ fresh held set = []
→ keyboard.state { down: [] }
→ keyboard.state/event available=true

keydown known code
→ if first held: add code, emit post-transition keyboard.state
→ emit keyboard.event { action:"down", code, repeat:event.repeat }

keydown repeat=true
→ held set unchanged
→ no synthetic State required
→ emit future keyboard.event only

keyup known code
→ remove code
→ emit post-transition keyboard.state
→ emit keyboard.event { action:"up", code, repeat:false }
```

`down[]` 必须 unique + ASCII lexical sorted。Window blur/hidden清空 held set；恢复时不得猜测 blur前仍被物理按住的键。

## 4. Pointer Mapping

Renderer input surface固定为当前 BrowserWindow **content viewport in CSS pixels**：

```text
width  = window.innerWidth
height = window.innerHeight
```

DOM `clientX/clientY` 映射为：

```text
x = round(clientX / width  * 1_000_000)
y = round(clientY / height * 1_000_000)
```

保留 off-surface 值并限制到 User Input v1 signed-int32范围。width/height非正时 pointer channels unavailable；恢复有效 viewport后 fresh empty State再 available。

只用标准 Pointer Events：

```text
pointerType "mouse" → mouse
pointerType "touch" → touch
pointerType "pen"   → pen
other                → ignore
```

Button mapping固定：

```text
button 0 → primary
button 1 → auxiliary
button 2 → secondary
button 3 → back
button 4 → forward

buttons bit 1  → primary
buttons bit 2  → secondary
buttons bit 4  → auxiliary
buttons bit 8  → back
buttons bit 16 → forward
```

Canonical pointer lifetime：

```text
pointerdown for an untracked DOM pointerId
→ allocate fresh monotonically increasing canonical pointerId
→ never reuse that canonical id in this source lifetime
→ track until pointerup / pointercancel / focus loss

pointermove for tracked pointer
→ update current sample
→ emit pointer.state only

pointerdown
→ update tracked sample
→ emit post-transition pointer.state
→ emit pointer.event down

pointerup
→ capture post-transition event sample
→ retire pointer from current set
→ emit post-transition pointer.state without ended pointer
→ emit pointer.event up with captured sample

pointercancel
→ capture final sample
→ retire pointer
→ emit post-transition pointer.state
→ emit pointer.event cancel, button=null
```

Hover-only DOM pointers不进入 `pointer.state`；wheel、gesture、pressure、tilt、raw motion与 pointer-capture policy保持在 User Input v1 scope之外。

## 5. Gamepad Mapping

只消费 `navigator.getGamepads()` 中：

```text
connected == true
mapping == "standard"
```

Browser `Gamepad.index` 只是 physical discovery key，不作为 protocol identity。每个新出现的 connected standard gamepad分配 fresh monotonically increasing `gamepadId`；disconnect后该 canonical id永久退休，未来 index复用必须得到新 id。

Standard mapping固定使用：

```text
axes[0] → leftX
axes[1] → leftY
axes[2] → rightX
axes[3] → rightY

buttons[0..16]
→ south,east,west,north,
   leftBumper,rightBumper,leftTrigger,rightTrigger,
   select,start,leftStick,rightStick,
   dpadUp,dpadDown,dpadLeft,dpadRight,home
```

归一化：

```text
axis   = round(clamp(value,-1,1) * 1_000_000)
button = round(clamp(value, 0,1) * 1_000_000)
pressed = button >= 500_000
```

在 Window usable期间用 `requestAnimationFrame` 驱动 `navigator.getGamepads()` current-state采样；不建立独立 timer/polling service。

每个 sample turn：

```text
read all current standard gamepads
→ reconcile connection membership
→ build one canonical gamepad.state sorted by gamepadId
→ detect button pressed-threshold crossings
→ if State changed, emit post-transition gamepad.state first
→ emit crossing gamepad.event in deterministic gamepadId + GamepadButtonsV1 field order
```

连接/断开只改变 `gamepad.state.gamepads[]` membership，不制造 button Event。focus/visibility恢复时重新读取 `navigator.getGamepads()`，先发 fresh State再恢复 availability；不 replay旧 button crossing。

若 `navigator.getGamepads` 不可用，则 `gamepad.state/event`保持 unavailable，不影响 Keyboard/Pointer。

## 6. Reload / Replacement

Reload 不等于重新启动 game：

```text
Main / Runner / Subsystem remain live
old Renderer retires
→ old DOM source subscription stops
→ fresh BrowserWindow bootstrap
→ new Renderer holder + fresh DOM source
→ current Control truth
→ current Data binding
→ current Store/projection
→ presentation resumes
```

除非既有 Main/Runtime semantics 本身要求终止，否则 reload不得重建 Session或伪造新的 business state。旧 Window 的 canonical pointer/gamepad ids没有跨 Window identity语义；fresh Window producer从 fresh local identity space开始。

## 7. Data Reconnect

必须覆盖 same-generation Data carrier loss：

```text
carrier lost
→ affected projection freezes/unavailable as already defined
→ Main DataAuthority remains current
→ existing Broker prepares fresh physical pair
→ fresh RendererDataBinding.acquire resolves current carrier
→ current State/Interest baseline按既有 M10/M11 semantics重建
→ current presentation resumes
```

健康 subsystem 不因另一 subsystem carrier loss被停止。

不得增加 retry/backoff framework；qualification只需驱动一次确定性的 disconnect/reconnect，并证明既有 Broker/Renderer acquisition mechanics自动收敛。

## 8. Shutdown

Desktop只拥有 product-level cancellation和physical resource lifetime；Main/RuntimeHosting继续拥有 Session/Runner convergence。

Canonical shutdown：

```text
stop accepting new Window/Renderer activity
→ retire/close current BrowserWindow
→ DOM source stop removes listeners / cancels Gamepad rAF
→ abort the AbortSignal passed to runMain(...)
→ await runMain(...) settlement
→ existing Main/RuntimeHosting converges Runtime + Runner termination
→ close Desktop Data Broker / Content service and remaining physical bindings
→ Electron exit
```

Desktop不得直接实现第二条 Runner shutdown/kill authority。必要的 process termination、grace/timeout与fatal convergence继续由 existing Main + Hostra RuntimeHosting semantics拥有。

Main settlement前不得通过过早销毁 Broker/Content physical owner破坏已有 Session terminal convergence；最终必须无 child process、DOM/input listener、Gamepad animation frame、WebSocket/HTTP listener或可继续使用的 Content/Data credential。

## 9. Failure Containment

至少保持：

```text
input source bootstrap failure     → Producer unavailable; Control/Data remain healthy
presentation/bootstrap failure     → Window-local; no Store/Main rollback
Data carrier failure               → no DataAuthority removal
Renderer failure                   → no implicit Runtime/Frame failure
Runner terminal                    → existing RuntimeHosting/Main semantics; M15 does not redefine it
```

Desktop不创建 InputDeviceManager、RecoveryManager、ConnectionManager、WindowLifecycleManager或额外 recovery state machine。

## 10. Completion

M15/03完成时必须证明：

```text
real KeyboardEvent → exact M10 path
Pointer mapping obeys viewport normalization + one-shot id + State-before-Event
standard Gamepad mapping obeys fixed layout + threshold crossing + fresh baseline
focus/visibility loss cannot leak stale physical input
reload gives a fresh Renderer/source without restarting game
same-generation reconnect converges through existing Broker/acquire path
normal shutdown through one runMain cancellation path terminates Runner child
all DOM/rAF/network physical lifetime is closed
```
