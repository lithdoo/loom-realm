# 统一操控输入 Web Component

> 状态：**Draft**
> 位置：`game-libs/game-common-controls/game-controls-input.md`
> 所属包：`@loomrealm-game/common-controls`
> 发送路径：[emitCustomEvent 扩展](./emit-custom-event.md)、[Web Presentation API v2](../../doc/15-contracts/web-presentation-api-v2.md)、[Session Events v1](../../doc/15-contracts/session-events-v1.md)
> 相邻实现：[设备输入 Web Components](./device-input-components.md)、[Game Common Controls Input v1](../../doc/15-contracts/game-common-controls-input-v1.md)

本文定义一个新的业务 Web Component：把键盘和手柄收成同一套数字按键，再以一对 Session Events 频道发出。现行六个设备频道保持不变。本文还不是正式契约；实现前不改写已冻结的 Game Common Controls Input v1。

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

## 4. 键盘别名

键盘只接受第 2 节那 14 个 `code`，并且必须是 `isTrusted` 的 `keydown` / `keyup`。一颗统一按键只对应一个键，表以外的键忽略。对应关系在 v1 写死，组件不读取属性或配置。

键盘自动重复只产生 Event，不重复 State。`repeat: true` 只在下面三件事同时成立时发送：

~~~text
这次 keydown 的 repeat === true
该统一按键的有效状态已经是按下
当前按住它的是键盘，手柄侧这颗键是松开的
~~~

手柄轮询不制造 `repeat`。

## 5. State

现有三个设备组件的 State 都是当前整份快照，不是增量：

~~~text
keyboard.state  { down: KeyboardCode[] }
pointer.state   { pointers: [{ pointerId, kind, x, y, buttons }] }
gamepad.state   { gamepads: [{ gamepadId, axes, buttons }] }
~~~

键盘只回答「哪些键正按着」。指针和手柄还要保留设备身份和位置：指针有坐标，手柄有 `gamepadId`、摇杆轴和按键压力。那些字段是原始设备组件的职责。

`controls.state` 跟随键盘，不跟随手柄的模拟快照。对外只有一份数字集合：

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

发送方式与 `game-keyboard-input`、`game-pointer-input`、`game-gamepad-input` 相同：一个组件只拥有一对精确频道，用 `emitCustomEvent` 广播。同一次变化先发整份 State，再发对应边沿 Event。指针不进入这里，也不转发 `keyboard.*` 或 `gamepad.*`。

~~~text
controls.state
controls.event
~~~

~~~ts
context.emitCustomEvent(
  "input.state",
  { down },
  { broadcast: true, channel: "controls.state" },
);

context.emitCustomEvent(
  "input.event",
  { action, button, repeat },
  { broadcast: true, channel: "controls.event" },
);
~~~

| 频道 | 事件名 | data | 何时发送 |
| --- | --- | --- | --- |
| `controls.state` | `input.state` | `{ down: readonly ControlsButtonV1[] }` | 有效集合变化；窗口失焦或隐藏时发 `{ down: [] }`；重新可用时发当前快照；非空时每 1000ms 再发同一份 |
| `controls.event` | `input.event` | `{ action: "down" \| "up"; button: ControlsButtonV1; repeat: boolean }` | 某一颗键的有效值从无到有，或从有到无 |

`down` 按第 2 节的规范顺序排列，同一按键只出现一次。空 State 是 `{ down: [] }`。`button` 使用同一套位置名。`domainId`、`targetKey` 和 source 仍由 Framework 按当前 live RenderNode 填写。组件必须带上 `options.channel`，避免落到 `x.loomrealm.web-presentation.event`。

到达 Session Events 后：

~~~text
SessionEvent.channel = controls.state | controls.event
SessionEvent.type    = input.state | input.event
SessionEvent.payload = { domainId, targetKey, data }
~~~

订阅者按 `channel` 区分 State 和 Event。`input.state` / `input.event` 只说明这是整份状态还是一次边沿。

边沿与现有键盘、手柄组件对齐：

~~~text
键盘第一次按下
    controls.state
    controls.event  action=down  repeat=false

键盘按住后的自动重复
    只发 controls.event  action=down  repeat=true
    仅当这颗键由键盘按住、手柄侧为松开

键盘或手柄使有效值从有到无
    controls.state
    controls.event  action=up  repeat=false

手柄越过 500_000
    与键盘边沿相同，先 State 后 Event

手柄刚接入时已经按住的键
    只进入 controls.state，不补 down

同一颗键的第二边再按下，或其中一边先松开
    有效集合不变，State 和 Event 都不发

摇杆轴变化、扳机压力留在阈值同一侧
    不发
~~~

非空 State 的 1000ms 刷新重复当前 `down`，不重复 Event。变为空 State 时立即发送并停止刷新。订阅侧 2500ms 没有新的 `controls.state`，本地退回 `{ down: [] }`。实现时把 `controls.state` 纳入 `createFreshDeviceStateTracker` 能识别的 State 频道。Event 不刷新、不重放。

失焦、页面隐藏和组件卸下时的收尾见第 7 节。窗口仍可用而手柄断开，使某颗键的有效值从有到无时，按本节先发 State，再按规范顺序发 `up`。

本组件不发送：

~~~text
keyboard.*  gamepad.*  pointer.*
cancel、指针移动、摇杆轴、按键压力、gamepadId
input.reset、input.availability
~~~

## 7. 可用性与断开

窗口可用性仍是 `visible && document.hasFocus()`，键盘和手柄共用这一结果。

~~~text
变为不可用
    清空键盘 held 和手柄本地表
    发送 controls.state { down: [] }
    不为每颗键补 up

重新可用
    键盘 held 从空开始，不把失焦前的按键补回来
    重扫 standard 手柄，已按下的支持键只进入 State
    发送当前 controls.state
    继续轮询

disconnectedCallback / stop
    先停止监听、轮询和刷新
    释放本 Window 的 controls 占用
    不补空 State，也不补 up
~~~

手柄从系统里断开，属于一次采样变化：受影响的有效键若从按下变为松开，先发新 State，再按规范顺序发 `up`。

## 8. 订阅

~~~ts
const subscription = await scope.events.subscribe(
  ["controls.state", "controls.event"],
  (event) => {
    const data = event.payload.data;
    if (event.channel === "controls.state" && event.type === "input.state") {
      // data.down
    }
    if (event.channel === "controls.event" && event.type === "input.event") {
      // data.action, data.button, data.repeat
    }
  },
);
~~~

只关心边沿的调用方可以只订阅 `controls.event`。需要在迟到订阅或刷新中断后回到空档的调用方，同时订阅 `controls.state`，并把 State 交给 fresh-state tracker。

## 9. 实现时落在哪里

仍放在 `@loomrealm-game/common-controls`，并打进现有的 `device-input.browser.js`，这样加载这一份浏览器脚本就会注册第四个元素。运行时根导出增加 `ControlsButtonV1`、两个频道名，以及 `controls.state` 的空 State。

采集可以复用包内的键盘源和手柄源作为本地采样器。复用时，它们的 `keyboard.*` / `gamepad.*` 只留在组件内部，外发前换成第 6 节的载荷。摇杆轴在合并前丢掉。

本组件不进入 Main，不读取 Frame、Activation、InputTarget 或 Input Interest，也不发送 `input.reset`。

## 10. v1 不做的事

- 不读取左右摇杆，也不提供摇杆死区、八向量化或摇杆按下。
- 不输出模拟量、手柄 id、原始 `code` 或设备来源。
- 不合并 Pointer。
- 不按游戏改键盘表，也不在载荷里提供厂商丝印别名。
- 不把多名玩家拆成多套频道。
- 不替换现有 `game-keyboard-input`、`game-pointer-input`、`game-gamepad-input`。
