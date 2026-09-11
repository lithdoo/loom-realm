# M15 / 03 — Desktop Physical Input and Lifecycle

> 状态：**Input semantics retained / lifecycle implemented and Closed**  
> 阶段：M15 Desktop Full E2E  
> 原落地顺序：03  
> 最近复核：2026-09-11  
> 当前 physical SSOT：[M15 Hostra Desktop Recomposition Plan](M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md)  
> 当前决策：[ADR 0034](doc/decisions/0034-hostra-owned-desktop-composition.md)  
> 前置：[M15 / 01](M15_01_DESKTOP_PRODUCT_COMPOSITION.md) → [M15 / 02](M15_02_BROWSERWINDOW_RENDERER_COMPOSITION.md)  
> 依赖：[M10 User Input](M10_05_QUALIFICATION_CLOSURE.md)、[M13 Web Presentation](M13_05_QUALIFICATION_CLOSURE.md)

> **Supersession notice:** Keyboard/Pointer/Gamepad canonical mapping、reload logical semantics、same-generation reconnect 与 single-cancellation ownership继续有效；原 LoomRealm-owned BrowserWindow/Electron exit mechanics 已被 ADR 0034 supersede。

---

## 1. DOM `RendererInputSource`

Renderer Main World内继续使用一个 concrete DOM producer：

```text
trusted KeyboardEvent
trusted PointerEvent
navigator.getGamepads() browser state
        ↓
canonical RendererInputSourceChange
        ↓
existing Renderer Input Gate
        ↓
M10
```

必须复用既有 `availability / state / event` semantics、channel identity、State-before-Event ordering 与 InputTarget gate。不得增加 Hostra/Electron-specific Input protocol、action mapping、device registry或绕过 Renderer Input Gate。

Source lifetime继续遵守 M10：source object固定在 holder construction；每个 current Control peer epoch最多一个 active `start()` subscription；stop后 late DOM callback不得影响新的 epoch。

## 2. Physical Provenance / Availability

Keyboard/Pointer只接受浏览器产生的 physical DOM event：

```text
event.isTrusted === true
```

脚本 `dispatchEvent(...)` 必须忽略，不改变 producer State/availability，也不得成为 business WC → Subsystem mutation shortcut。

Producer只在当前 page 同时满足以下条件时认为 browser input surface usable：

```text
window has focus
AND document.visibilityState == "visible"
```

focus/visibility丢失：停止接受 transition、清 tracked keyboard/pointer facts、停止 Gamepad polling、发 availability=false。

恢复 usable：先重建 fresh canonical State，再 availability=true，之后才接受新 Event；不得 replay 不可用期间事件。

## 3. Keyboard Mapping

只接受 trusted `KeyboardEvent.code` 属于 frozen `KeyboardCodeV1` exact set的事件；`key`、locale text、IME/composition不进入标准 channel。

```text
fresh start/focus return
→ keyboard.state { down: [] }
→ state/event available=true

keydown new known code
→ update held set
→ post-transition state
→ event { down, repeat:false }

keydown already-held code
→ state unchanged
→ event { down, repeat:true }

keyup currently-held code
→ update held set
→ post-transition state
→ event { up, repeat:false }

keyup untracked code
→ ignore
```

`repeat` 由 source held set决定；`down[]` unique + ASCII lexical sorted。blur/hidden 清空 held set；恢复时不猜测此前仍物理按住的键。

## 4. Pointer Mapping

Input surface固定为当前 page content viewport in CSS pixels：

```text
width  = window.innerWidth
height = window.innerHeight
x = round(clientX / width  * 1_000_000)
y = round(clientY / height * 1_000_000)
```

width/height非正时 pointer unavailable。仅消费 `mouse/touch/pen`。

Button mapping：

```text
buttons bit 1  → primary
buttons bit 2  → secondary
buttons bit 4  → auxiliary
buttons bit 8  → back
buttons bit 16 → forward
```

Canonical down/up由 previous buttons set 与 current `event.buttons` 差异产生，不只依赖 `event.button`，从而覆盖 chorded transitions。

每个首次 tracked DOM pointer获得 fresh、单 source lifetime不复用的 canonical pointerId。State若变化先发 post-transition `pointer.state`，再按 frozen button order发对应 Event。`pointercancel` retire pointer并发一个 cancel Event。Untracked move/up/cancel忽略；hover-only pointer不进入标准 state。

## 5. Gamepad Mapping

只消费 trusted Renderer在 business JS加载前捕获的 `navigator.getGamepads()`，且仅接受：

```text
connected == true
mapping == "standard"
```

Browser `Gamepad.index` 只是 discovery key。每次新连接分配 fresh monotonic `gamepadId`；disconnect后该 id永久退休。

Standard mapping：

```text
axes[0..3] → leftX,leftY,rightX,rightY
buttons[0..16]
→ south,east,west,north,
   leftBumper,rightBumper,leftTrigger,rightTrigger,
   select,start,leftStick,rightStick,
   dpadUp,dpadDown,dpadLeft,dpadRight,home
```

归一化：

```text
axis    = round(clamp(value,-1,1) * 1_000_000)
button  = round(clamp(value, 0,1) * 1_000_000)
pressed = button >= 500_000
```

在 usable期间使用 captured `requestAnimationFrame`采样；不建立 timer/polling service。State changed时先发 state，再按 deterministic gamepadId + frozen button order发 threshold crossing Event。连接/断开只影响 state membership，不伪造 button Event。

## 6. Reload / Replacement

Reload 不等于重新启动 game，也不等于创建新的 Hostra Window：

```text
same Hostra windowId remains
Main / Runner / Subsystem remain live
old document / old Renderer retire
→ old DOM source stops
→ fresh document bootstrap
→ fresh Renderer holder + fresh DOM source
→ current Control/Data/Store truth
→ presentation resumes
```

旧 document 的 pointer/gamepad local ids不跨 Renderer lifetime继承。fresh Renderer从 fresh local identity space开始。

## 7. Data Reconnect

same-generation Data carrier loss继续是：

```text
carrier lost
→ affected projection freezes/unavailable
→ same Renderer Control participant remains current
→ Main DataAuthority remains current
→ existing Broker prepares fresh physical Data pair
→ fresh RendererDataBinding.acquire() resolves
→ current baseline/state converges
→ presentation resumes
```

Data-only reconnect MUST NOT retire or replace the Renderer logical participant and MUST NOT mint a fresh Renderer identity。它只替换 Data physical pair；这与 reload 的 fresh Renderer semantics 严格分离。

健康 subsystem 不因另一 subsystem carrier loss被停止。不得增加 retry/backoff/recovery framework。

## 8. Shutdown Ownership

Hostra owns physical Window/Electron/direct-subprocess lifetime；LoomRealm owns its own Main cancellation and LoomRealm service cleanup。Terminal trigger ordering由 ADR 0034 + current recomposition SSOT拥有，不得假设 `window.closed` 一定先于 Hostra signal。

以下 trigger 全部进入同一个 idempotent termination owner path：

```text
window.closed(windowId)
SIGTERM / SIGINT
host.shuttingDown
Hostra RPC terminal
programmatic product close
Main / Runner fatal
startup partial failure
        ↓
beginTermination(reason)
        ↓
stop accepting fresh LoomRealm document activity
→ retire DOM/document physical lifetime
→ abort AbortSignal passed to runMain(...)
→ await/preserve Main settlement
→ existing Main/RuntimeHosting converges Runner
→ ALWAYS close LoomRealm Renderer Control / Data Broker / Content/listeners
→ close Hostra RPC adapter
→ LoomRealm Node process exits
```

Programmatic product close may first perform best-effort Hostra `closeWindow(windowId)`，but local cleanup MUST NOT depend on a later `window.closed` callback。

Frozen Hostra baseline may send `SIGTERM` to `HOSTRA_SUBCMD` during final-window shutdown；signal handling therefore participates in this same path。Main rejection / Runner fatal MUST preserve the original logical failure but still execute finally-like physical cleanup。No Hostra reconnect/recovery authority is added。

## 9. Failure Containment

At minimum：

```text
synthetic DOM input            → ignored
input source bootstrap failure → producer unavailable; Control/Data remain logically independent
presentation/bootstrap failure → Renderer/document-local; no Store/Main rollback
Data carrier failure           → no DataAuthority removal / no Renderer replacement
Renderer failure               → no implicit Runtime/Frame failure
Runner terminal                → existing RuntimeHosting/Main semantics
Hostra RPC terminal            → product shutdown, not state recovery/recreation
```

Do not introduce：

```text
InputDeviceManager
RecoveryManager
ConnectionManager
WindowLifecycleManager
DocumentManager
HostraSession
extra recovery state machine
```

## 10. Completion

M15/03 is frozen and implementation-ready when the implementation proves：

```text
trusted real KeyboardEvent → exact M10 path
synthetic Keyboard/Pointer ignored
Pointer viewport/id/chord semantics hold
standard Gamepad mapping/threshold/fresh identity hold
focus/visibility loss cannot leak stale physical input
reload = same Hostra Window + fresh Renderer/source + same game
same-generation Data-only reconnect = same Renderer identity + fresh Data physical pair
window/signal/RPC/fatal/startup terminal triggers converge through one termination path
all LoomRealm DOM/rAF/network physical lifetime is closed
```

No further M15 input/lifecycle design pass is required before implementation。
