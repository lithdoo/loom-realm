# 统一操控输入 Web Component

> 状态：**Draft**
> 位置：`game-libs/game-common-controls/game-controls-input.md`
> 所属包：`@loomrealm-game/common-controls`
> 发送路径：[emitCustomEvent 扩展](./emit-custom-event.md)、[Web Presentation API v3](../../doc/15-contracts/web-presentation-api-v3.md)、[Frame-targeted Presentation Event v1](../../doc/15-contracts/frame-targeted-presentation-event-v1.md)
> 相邻实现：[设备输入 Web Components](./device-input-components.md)、[Game Common Controls Input v1](../../doc/15-contracts/game-common-controls-input-v1.md)

本文定义一个新的业务 Web Component：把键盘和手柄收成同一套数字按键，再以一对 Frame-targeted Presentation 频道发给当前 Top Active Frame。现行六个设备频道保持不变。本文还不是正式契约；实现前不改写已冻结的 Game Common Controls Input v1。

## 1. 组件

~~~html
<game-controls-input></game-controls-input>
~~~

它是普通业务 Custom Element，挂载路径与现有设备组件相同：

~~~text
Subsystem RenderDomain
    -> RenderNode
    -> WebProjector
    -> game-controls-input
    -> WebPresentationContext.emitCustomEvent
~~~

游戏自己决定是否把这个节点放进 RenderDomain。框架不默认创建它。Pointer 仍由 `game-pointer-input` 单独采集，不进入这里。

同一 Window 里只允许一个活动的 `game-controls-input`。后挂上的重复实例设置 `data-input-disabled="duplicate"`，不采集、不发送。先挂的实例断开后，后来的实例可以重新挂载并开始采集。

组件内部自己监听键盘、自己轮询手柄。它不挂载 `game-keyboard-input` 或 `game-gamepad-input`，也不把采集结果转发到 `keyboard.*` 或 `gamepad.*`。同一 Window 上如果再挂那两个原始设备组件，同一下物理输入会进入两套频道；这个互斥由游戏的 RenderDomain 保证。

推荐把这些组件理解为两层不同抽象，而不是四个都应默认挂载的输入源：

~~~text
普通数字操控
    -> game-controls-input
    -> controls.state / controls.event

需要原始键盘 code
    -> game-keyboard-input
    -> keyboard.*

需要原始手柄 id / 摇杆 / 压力
    -> game-gamepad-input
    -> gamepad.*

需要坐标或 Pointer identity
    -> game-pointer-input
    -> pointer.*
~~~

`game-controls-input` 可以与 Pointer 同时使用。只有业务明确需要两套语义时，才同时挂载 `game-controls-input` 与原始 Keyboard/Gamepad 组件；否则同一次物理操作会分别进入统一频道和原始频道，消费方若同时监听两边就会得到两份逻辑输入。这属于游戏 composition 责任，Framework 不额外建立互斥 authority。

## 2. 对外只有一套按键

对外词汇是手柄按键。键盘是这套按键的别名，订阅者看不到 `KeyboardCode`、手柄序号、轴值或压力。

v1 只承认这 14 个按键。名字表示它在 standard mapping 上的位置，规范顺序固定为：

~~~text
up down left right
south east west north
leftBumper rightBumper leftTrigger rightTrigger
start select
~~~

~~~ts
type ControlsButtonV1 =
  | "up" | "down" | "left" | "right"
  | "south" | "east" | "west" | "north"
  | "leftBumper" | "rightBumper" | "leftTrigger" | "rightTrigger"
  | "start" | "select";
~~~

右侧四个面键按菱形位置命名，肩键和扳机按上下位置命名。A/B/X/Y、L1/L2 以及各厂商丝印只出现在下表的对照列里，不进入载荷。键盘一键对应一键。

| 统一按键 | 位置 | 常见丝印 | 键盘 | standard 下标 |
| --- | --- | --- | --- | --- |
| `up` | 十字键上 | — | `↑` `ArrowUp` | 12 |
| `down` | 十字键下 | — | `↓` `ArrowDown` | 13 |
| `left` | 十字键左 | — | `←` `ArrowLeft` | 14 |
| `right` | 十字键右 | — | `→` `ArrowRight` | 15 |
| `south` | 右侧菱形下 | Xbox A、任天堂 B、PS × | `Z` `KeyZ` | 0 |
| `east` | 右侧菱形右 | Xbox B、任天堂 A、PS ○ | `X` `KeyX` | 1 |
| `west` | 右侧菱形左 | Xbox X、任天堂 Y、PS □ | `C` `KeyC` | 2 |
| `north` | 右侧菱形上 | Xbox Y、任天堂 X、PS △ | `V` `KeyV` | 3 |
| `leftBumper` | 左上方肩键 | LB、L、L1 | `Q` `KeyQ` | 4 |
| `rightBumper` | 右上方肩键 | RB、R、R1 | `E` `KeyE` | 5 |
| `leftTrigger` | 左下方扳机 | LT、ZL、L2 | 左 `Shift` `ShiftLeft` | 6 |
| `rightTrigger` | 右下方扳机 | RT、ZR、R2 | 左 `Ctrl` `ControlLeft` | 7 |
| `start` | 开始 | Start、Menu、+ | `Enter` | 9 |
| `select` | 选择 | Back、Select、− | `Tab` | 8 |

左右摇杆、摇杆按下和 Home 不在这套词汇里。摇杆推到尽头也不产生 `up` / `down` / `left` / `right`。方向只来自十字键，以及上表的键盘列。

## 3. 手柄采集

只读取 `mapping === "standard"` 的手柄，沿用现有手柄源的轮询方式：`requestAnimationFrame` 加上 `navigator.getGamepads()`。按下阈值是 `500_000`，和现有 `gamepad.event` 的越阈一致。`leftTrigger` / `rightTrigger` 在硬件上常常是模拟扳机，这里越过阈值之后只当作数字键，载荷里不保留压力。

面键和肩键的名字与现有 `GamepadButtonNameV1` 相同，下标见第 2 节。下标 10、11、16（左右摇杆按下、Home）以及四根轴只在本地丢掉。非 standard mapping 的手柄整只忽略。

v1 是一名本地玩家。所有已连接的 standard 手柄先按按键做 OR，再进入第 5 节的合并。订阅者看不到 `gamepadId`。某一只手柄中途接入时，已经按住的支持键进入 State，不为它们补 `down` Event；这与现有手柄源的 baseline 相同。

## 4. 键盘捕获

键盘只接受第 2 节那 14 个 `code`，并且必须是 `isTrusted` 的 `keydown` / `keyup`。一颗统一按键只对应一个键，表以外的键忽略。对应关系在 v1 写死，组件不读取属性或配置。

键盘侧维护一个本地的 capture availability；它不是 Framework authority，也不进入线协议：

~~~text
windowUsable
    = document.visibilityState === "visible"
      && document.hasFocus()

keyboardCaptureAvailable
    = windowUsable
      && 当前焦点不属于浏览器交互区域
~~~

浏览器交互区域至少包括 `input`、`textarea`、`select`、`button`、可导航链接和 `contenteditable`。实现必须按实际焦点所在的 composed tree 判断，不能只看某次 keyboard event 的 target；否则“游戏区按下 -> 点击输入框 -> 在输入框里松开”会漏掉释放，留下卡住的 held。

capture 状态转换定义为：

~~~text
available -> unavailable
    清空全部 keyboard held
    重新计算 effective controls
    effective 若变化，只发送新的 controls.state
    不为被清掉的按键补 controls.event up

unavailable -> available
    keyboard held 从 empty 开始
    不根据物理上仍按住的键补 down
    等后续 trusted keyboard event 建立新状态
~~~

capture unavailable 时，映射键完全交给浏览器：组件不改变 keyboard held、不发送 controls、不调用 `preventDefault()`。这只屏蔽 Keyboard；Gamepad 仍按第 3 节采集。

capture available 时，命中第 2 节映射的 trusted keyboard event 属于游戏 controls。若事件可取消，组件调用 `preventDefault()`，再更新 held / Event；因此方向键和 `Tab` 等不会同时触发浏览器滚动或焦点移动。未映射按键仍完全交给浏览器。

`Tab -> select` 只在 capture available 时成立。blocked-focus / composed-tree 判定集中在本组件实现和 Qualification 中，Map、Dialogue、Battle 不各自复制。

键盘自动重复只产生 Event，不重复 State。`repeat: true` 只在下面三件事同时成立时发送：

~~~text
这次 keydown 的 repeat === true
该统一按键的有效状态已经是按下
当前按住它的是键盘，手柄侧这颗键是松开的
~~~

手柄轮询不制造 `repeat`。

## 5. 有效状态机

原始 Keyboard/Gamepad 组件暴露设备事实；本组件只暴露统一的数字 controls。Pointer 保持独立。

`controls.state` 对外只有一份数字集合：

~~~ts
{ down: readonly ControlsButtonV1[] }
~~~

`down` 里的名字仍然是第 2 节的位置名，用来区分 14 颗键。快照里不放来源设备、`gamepadId`、摇杆轴、压力或指针坐标。组件内部可以记两份布尔值，它们不进入载荷。

每一颗键的有效值是两边的或：

~~~text
effective = keyboardDown || gamepadDown
~~~

一边按下、另一边没按，这颗键就在 `down` 里。只有两边都松开，它才离开 `down`。手柄没按并不否决键盘；键盘没按也不否决手柄。不同的键各自计算，所以手柄按住 `up`、键盘按住 `south` 时，State 是 `["up", "south"]`。上下或左右同时按下都保留，不做对向抵消。

| 键盘 | 手柄 | 这颗键在 `down` 中 |
| --- | --- | --- |
| 松开 | 松开 | 否 |
| 按下 | 松开 | 是 |
| 松开 | 按下 | 是 |
| 按下 | 按下 | 是，只出现一次 |

State 只在这颗键的有效值发生变化时重发整份 `down`，顺序始终是第 2 节。有效值没变就不发 State：第二台设备再按下同一颗键、其中一台先松开、摇杆轴在动、扳机压力在变，都不产生新的 State。非空 State 的 1000ms 刷新重复的是这份有效集合，不是两台设备各自的快照。

Event 只描述有效值的边沿。从「不在 `down`」变成「在 `down`」时发一次 `down`；反过来发一次 `up`。两台设备先后按住同一颗键，只有第一次进入集合时有 `down`。后松开的那一边才产生 `up`。

~~~text
KeyZ down
    state [south]
    event down south repeat=false

手柄 south down
    有效值仍是按下，不发 State，也不发 Event

KeyZ up
    手柄仍按住 south，不发

手柄 south up
    state []
    event up south repeat=false
~~~

已经按住的手柄键在 baseline 里只进入 State，不为它们补 `down` Event。此后的越阈才产生 Event。键盘自动重复仍只发 `repeat: true` 的 Event，不改 State；而且只有键盘按着、手柄没按这颗键时才发。

## 6. 发送

组件拥有一对精确频道，用 `emitCustomEvent(..., { broadcast: "top-frame" })` 投递给接受时的 Top Active Frame。同一次变化先发整份 State，再发对应边沿 Event。指针不进入这里，也不转发 `keyboard.*` 或 `gamepad.*`。

~~~text
controls.state
controls.event
~~~

~~~ts
context.emitCustomEvent(
  "input.state",
  { down },
  { broadcast: "top-frame", channel: "controls.state" },
);

context.emitCustomEvent(
  "input.event",
  { action, button, repeat },
  { broadcast: "top-frame", channel: "controls.event" },
);
~~~

| 频道 | 事件名 | data | 何时发送 |
| --- | --- | --- | --- |
| `controls.state` | `input.state` | `{ down: readonly ControlsButtonV1[] }` | 有效集合变化；窗口失焦或隐藏时发 `{ down: [] }`；重新可用时发当前快照；非空时每 1000ms 再发同一份 |
| `controls.event` | `input.event` | `{ action: "down" \| "up"; button: ControlsButtonV1; repeat: boolean }` | 某一颗键的有效值从无到有，或从有到无 |

`down` 按第 2 节的规范顺序排列，同一按键只出现一次。空 State 是 `{ down: [] }`。`button` 使用同一套位置名。`domainId`、`targetKey` 和 source 仍由 Framework 按当前 live RenderNode 填写。组件必须带上 `options.channel`，避免落到 `x.loomrealm.web-presentation.event`。

到达目标 Frame listener 后：

~~~text
PresentationFrameEvent.channel = controls.state | controls.event
PresentationFrameEvent.name    = input.state | input.event
PresentationFrameEvent.data    = business data
PresentationFrameEvent.source  = { subsystemKey, domainId, targetKey }
~~~

订阅者按 `channel` 区分 State 和 Event。`input.state` / `input.event` 只说明这是整份状态还是一次边沿。

非空 State 的 1000ms 刷新重复当前 `down`，不重复 Event。变为空 State 时立即发送并停止刷新。订阅侧 2500ms 没有新的 `controls.state`，本地退回 `{ down: [] }`。实现时把 `controls.state` 纳入 `createFreshDeviceStateTracker` 能识别的 State 频道。Event 不刷新、不重放。

### 6.1 Activation 边界

State 和 Event 在 Frame 切换时承担不同职责：

~~~text
controls.state
    = “现在仍然按着什么”
    可以在后续刷新中被新的 Top Active Frame 重新观察到

controls.event
    = “刚刚发生了一次按下 / 松开”
    只属于接受该 Event 时绑定的 exact Frame + Activation
    不跨 Activation 继承、不重定向、不重放
~~~

新的 Activation 在业务本地必须先从 neutral `{ down: [] }` 开始，不能把旧 Activation 缓存的 held 状态直接带进来。如果玩家在 Frame 切换后仍然真实按着某颗键，后续 `controls.state` 刷新可以让新 Activation 再次观察到这份“当前事实”；这不是旧 State replay，而是一条在新 Top Frame lease 下重新接受的新 State publication。

因此持续行为应以 State 为依据，例如移动或 held modifier；一次性行为应以 Event 为依据，例如 confirm、cancel、menu。业务不能把旧 Activation 记录的 `down` Event 当成新 Activation 的首个输入。

### 6.2 Interest 建立窗口

`broadcast: "top-frame"` 完全服从 Frame-targeted Presentation Event v1：exact Interest 尚未建立时 Event fail closed；不缓存、不补投、不重放；State 可以通过后续 publication 恢复当前 held fact。

本组件不定义 presentation readiness，也不引入 Interest-ready ACK。业务应在 Frame activation 开始时尽早创建 listener；如果未来某类 UI 要求切换瞬间的首个 tap 也保证必达，应另行设计 readiness，而不是给 controls 增加 replay。

失焦、页面隐藏和组件卸下时的收尾见第 7 节。窗口仍可用而手柄断开，使某颗键的有效值从有到无时，按本节先发 State，再按规范顺序发 `up`。

本组件不发送：

~~~text
keyboard.*  gamepad.*  pointer.*
cancel、指针移动、摇杆轴、按键压力、gamepadId
input.reset、input.availability
~~~

## 7. 可用性与断开

Window 可用性是 `document.visibilityState === "visible" && document.hasFocus()`。它控制 Keyboard 和 Gamepad 的共同采集生命周期；第 4 节的 keyboard capture availability 在此基础上只进一步约束 Keyboard。

~~~text
Window 变为不可用
    清空 keyboard held 和 gamepad 本地表
    重新计算 effective controls
    发送当前 controls.state；通常为 { down: [] }
    不为被清掉的按键补 up Event

Window 重新可用
    keyboard held 从 empty 开始
    重扫 standard gamepad
    已经按下的支持键只进入 State，不补 down Event
    发送当前 controls.state
    继续轮询

Keyboard capture available -> unavailable
    只清 keyboard held
    gamepad 本地表保持
    重新计算 effective controls
    effective 若变化只发 State，不补 up Event

Keyboard capture unavailable -> available
    keyboard held 保持 empty
    不补 down Event

disconnectedCallback / stop
    先停止监听、轮询和刷新
    释放本 Window 的 controls 占用
    不补空 State，也不补 up Event
~~~

手柄从系统里断开，属于一次采样变化：受影响的有效键若从按下变为松开，先发新 State，再按规范顺序发 `up`。

## 8. 订阅

~~~ts
// 在本次 Frame activation 开始时尽早建立 listener。
const listener = scope.presentationEvents.createListener({
  frame,
  channels: ["controls.state", "controls.event"],
});

const unsubscribeState = listener.on("controls.state", (event) => {
    const data = event.data;
    if (event.name === "input.state") {
      // data.down
    }
});

const unsubscribeEvent = listener.on("controls.event", (event) => {
    const data = event.data;
    if (event.name === "input.event") {
      // data.action, data.button, data.repeat
    }
});

// Frame teardown also closes its listeners automatically.
unsubscribeState();
unsubscribeEvent();
listener.close();
~~~

只关心边沿的调用方可以只订阅 `controls.event`。需要在迟到订阅或刷新中断后回到空档的调用方，同时订阅 `controls.state`，并把 State 交给 fresh-state tracker。

每次新的 Frame Activation 都必须重新建立自己的 listener 和本地消费状态；旧 Activation 的 listener 随 Frame teardown 关闭。消费方的 held/down 缓存从 neutral 开始，随后只接受该 Activation 实际收到的 `controls.state`。

## 9. 实现时落在哪里

仍放在 `@loomrealm-game/common-controls`，并打进现有的 `device-input.browser.js`，这样加载这一份浏览器脚本就会注册第四个元素。运行时根导出增加 `ControlsButtonV1`、两个频道名，以及 `controls.state` 的空 State。

采集可以复用包内的键盘源和手柄源作为本地采样器。复用时，它们的 `keyboard.*` / `gamepad.*` 只留在组件内部，外发前换成第 6 节的载荷。摇杆轴在合并前丢掉。

本组件不进入 Main，不读取或指定 Frame/Activation，也不发送 `input.reset`。Renderer 从 current Control v2 stack 派生 Top Frame lease；Subsystem listener 才显式绑定业务持有的真实 `Frame` object。

## 10. Qualification 重点

实现前至少固定下面这些边界用例：

- Keyboard 和 Gamepad 同时按住同一统一按键，只产生一个 effective `down`；任一侧先松开不产生 `up`，最后一侧松开才产生 `up`。
- Frame 切换时旧 Activation 的 Event 不进入新 Activation；玩家持续按住的键可以通过后续 State publication 被新 Activation 重新观察到。
- 新 Frame 的 Interest 尚未被 Renderer 观察到时，瞬时 Event fail closed 丢弃，不缓存、不重放、不改投后来的 Frame。
- 游戏区按住映射键后把焦点移入 `input` / `textarea` / `select` / `button` / 可导航链接 / `contenteditable`：capture loss 必须立即清 keyboard held，只按 effective 变化发 State，不补 up Event；随后在交互控件里的 keyup 不得造成卡键。
- capture unavailable 时映射键保持浏览器原生行为；capture available 时命中的 trusted 映射事件由 controls 接管并在可取消时 `preventDefault()`，包括方向键和 `Tab`。
- `game-controls-input` 与原始 Keyboard/Gamepad 组件同时挂载时，两套频道彼此独立；Framework 不去重，测试明确把它视为游戏 composition 选择。
- 非空 State 刷新、2500ms freshness fallback、失焦清空、重新可用 baseline 和 disconnect 不补 Event 的规则继续成立。

## 11. v1 不做的事

- 不读取左右摇杆，也不提供摇杆死区、八向量化或摇杆按下。
- 不输出模拟量、手柄 id、原始 `code` 或设备来源。
- 不合并 Pointer。
- 不按游戏改键盘表，也不在载荷里提供厂商丝印别名。
- 不把多名玩家拆成多套频道。
- 不替换现有 `game-keyboard-input`、`game-pointer-input`、`game-gamepad-input`。
