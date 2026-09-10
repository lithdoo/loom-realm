# M15 / 04 — Desktop Full E2E Vertical

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M15 Desktop Full E2E  
> 落地顺序：04  
> 最近复核：2026-09-10  
> 前置：[M15 / 01](M15_01_DESKTOP_PRODUCT_COMPOSITION.md) → [M15 / 02](M15_02_BROWSERWINDOW_RENDERER_COMPOSITION.md) → [M15 / 03](M15_03_DESKTOP_INPUT_AND_LIFECYCLE.md)  
> 依赖：[M14 / 04](M14_04_REAL_GAME_VERTICAL.md)  
> 目标：用真实 Hostra/Desktop product composition 跑通 M14 concrete game；只证明 physical integration，不复制 M6/M10–M14 owner-local qualification。

> **M15 vertical 的测试主体是 Desktop product composition，不是新的 test-owned host。**

---

## 1. Canonical Trace

```text
checked-in examples/essentials-v21.1 Hostra installation
→ Hostra PREPARE
→ Main
→ real Node Runner child
→ existing Hostra Runtime Control
→ Desktop Data Broker
→ Desktop Content
→ secure Electron BrowserWindow
→ one-shot private Renderer bootstrap
→ Main-World trusted Renderer
→ native BrowserWindow RendererDataBinding + DOM RendererInputSource
→ existing M13 presentation
→ @loomrealm-game/map runtime + business WC
```

测试可以使用 Playwright驱动 Electron，但不得用 Playwright直接注入 Main/Store/game state，也不得临时生成另一份 game/Hostra manifest替代 canonical example。

## 2. Happy-path Evidence

Canonical scenario复用 M14已冻结事实：

```text
map visible
→ trusted real BrowserWindow ArrowRight key event
→ existing M10 path
→ first move succeeds: (10,8) → (11,8)
→ presentation reflects current state
→ second ArrowRight
→ persisted passability blocks move
→ player remains (11,8)
```

M15不重新断言全部 map schema、Canvas source rectangles、Custom Element private structure；这些由 M14 qualification拥有。这里只证明相同 business outcome经真实 Desktop physical path到达。

## 3. Physical Boundary Evidence

同一 product suite必须证明真实 Window使用冻结 physical boundary：

```text
nodeIntegration=false
contextIsolation=true
sandbox=true
webSecurity=true

bootstrap:
    app-owned shell did-finish-load
    → one-shot private handoff
    → trusted Main-World Renderer consumes it
    → business JS/CSS loads later

Renderer Control:
    MessageChannelMain → native DOM MessagePort → existing Renderer Control

Data:
    Broker candidate lifecycle
    → dedicated endpoint settlement port
    → native browser WebSocket
    → existing RendererDataBinding/Data peer
```

必须可观察地证明 business page没有 generic Electron/contextBridge API，Data application messages不通过 Electron handoff port，product source不引用 Renderer internal filesystem path。

## 4. Input Evidence

Keyboard happy path由真实 trusted `KeyboardEvent`关闭。Pointer/Gamepad可以使用 focused producer-level browser evidence，但必须运行同一 production DOM source：

```text
Keyboard
→ event.isTrusted required
→ code filtering + State-before-Event
→ synthetic dispatch ignored

Pointer
→ event.isTrusted required
→ BrowserWindow viewport normalization
→ fresh one-shot canonical pointerId
→ previous buttons vs event.buttons chord transition
→ State-before-Event in frozen button order
→ synthetic dispatch ignored

Gamepad
→ captured navigator.getGamepads() standard mapping
→ rAF current-state polling
→ fresh gamepadId on reconnect/index reuse
→ 500000 threshold crossing State-before-Event
```

focus/visibility loss/return必须证明 unavailable → fresh baseline → available，无 stale Event replay。

## 5. Lifecycle Evidence

同一 product E2E suite至少证明：

```text
startup
physical keyboard input
BrowserWindow reload/replacement
same-generation Data disconnect/reconnect
normal app shutdown through runMain AbortSignal
real Runner child termination before Electron exit
```

Reload后应恢复 current projection，而不是通过重启 game获得初始状态；fresh Window必须取得 fresh bootstrap/Control/Data/Content physical material。

## 6. Failure Evidence

只选择 M15新增 physical composition必须证明的最小 failure cases：

```text
one presentation/bootstrap failure
one Data carrier loss/reconnect
one Renderer close/replacement
one input-source bootstrap/unavailable containment case
```

Unexpected Runner terminal的 Runtime/Main semantics已由 Hostra owner-local qualification拥有；M15不为了“full E2E”重复建立第二份 failure conformance。M15只证明 normal product shutdown最终让真实 Runner child收敛终止。

断言 public/observable effects与 owner boundaries；不要冻结 private helper、无业务意义的 Electron callback ordering或额外 internal state。

## 7. Test Placement

允许：

```text
apps/desktop/test/*        concrete Desktop physical behavior
test/m15-*.test.mjs        repository boundary/full vertical evidence
```

不允许为了测试建立 production `MiniDesktopHost`、fake application authority、test-only Hostra game、second Renderer transport path或第二条 map runtime/presentation path。

## 8. Completion

M15/04完成时，一条真实 Electron trace必须从 checked-in Hostra installation的 PREPARE一直走到 business-visible map result，并在同一 Main Session/product composition上完成 secure one-shot Window bootstrap、trusted physical input、reload、same-generation reconnect与 normal shutdown/Runner termination evidence。
