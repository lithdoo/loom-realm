# Game Common Controls Input v1

> 状态：Active / Normative / Frozen / Implemented
> Owner：`@loomrealm-game/common-controls`
> Transport：[Web Presentation API v2](./web-presentation-api-v2.md) + [Session Events v1](./session-events-v1.md)
> 最近复核：2026-10-21

本契约把 Keyboard、Pointer、Gamepad 设备采集与 payload ownership 放在 game-lib，而不是 LoomRealm Framework。

## 1. Components and channels

```html
<game-keyboard-input></game-keyboard-input>
<game-pointer-input></game-pointer-input>
<game-gamepad-input></game-gamepad-input>
```

每个组件只拥有对应的一对 exact channels：

```text
keyboard.state   keyboard.event
pointer.state    pointer.event
gamepad.state    gamepad.event
```

组件统一调用：

```ts
context.emitCustomEvent(
  change.kind === "state" ? "input.state" : "input.event",
  change.payload,
  { broadcast: true, channel: change.channel },
);
```

Session Event payload 是 `{ domainId, targetKey, data }`；`data` 直接是设备 payload，不嵌入 channel。

## 2. Device behavior

- Keyboard 使用冻结 code 集，held 排序；重复 keydown 产生 `repeat:true` Event，不重复 State。
- Pointer 使用规范化递增 ID、固定 button 顺序、最多 32 个 pointer 和百万分比坐标；cancel 先发布完整 State，再发布 Event。
- Gamepad 只接受 standard mapping，最多 16 个，使用规范化递增 ID、固定 button 顺序、百万分比 axes/button 值与 `500000` crossing threshold。
- 同设备边缘必须 State-before-Event；Event 不合并、不重放。
- focus/visibility/surface/device loss 发布该设备 neutral State，不影响其他设备。
- 非 neutral State 每 1000ms 有界刷新；订阅侧 2500ms 无刷新则回退该 channel neutral State。
- 同一 Window 同类型只允许一个 active component；duplicate 标记 `data-input-disabled="duplicate"`。
- disconnect 停止 listener/poll/timer 并释放 duplicate claim；后续重新挂载可恢复。

## 3. Exclusions

本契约不包含 InputTarget、Input Interest、Frame/Activation 输入租约、`input.reset` 或 Renderer availability。Framework 不验证六个设备 payload，也不创建默认输入组件。游戏可以独立挂载任意设备组合。

历史 User Input v1 仅作为旧 Framework 协议记录保留，不是当前 Runtime surface。
