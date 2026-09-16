# Viewport State v1 Conformance

> 层级：正式契约 / Conformance  
> 状态：Draft / Candidate  
> 对应协议：[Viewport State v1](./viewport-state-v1.md)  
> 最近复核：2026-09-16

本文定义 Viewport State v1 Freeze 前必须具备的最小可执行证据。测试名可不同，但 observable assertions 必须覆盖。

---

## 1. Representation

必须证明：

```text
accept exact {type:"viewport.state",width,height}
reject unknown members
reject missing members
reject width/height <= 0
reject fractional / NaN / Infinity / unsafe integer
reject wrong type or wrong direction
```

Malformed message必须进入 Data/Profile protocol-fatal path；不得静默 ignore 或当作 User Input。

---

## 2. Retained State

序列：

```text
start Runtime
→ author current === null
→ accept 640×480
→ current === 640×480
→ accept 640×480 again
→ no second author change callback
→ accept 800×600
→ current === 800×600
→ one change callback
```

Returned author objects必须 detached/immutable enough that listener/caller mutation不能改变 internal retained state或未来 delivery。

---

## 3. Subscribe Race Closure

必须证明：

```text
subscribe(listener)
→ synchronous first callback with current value
→ then future changes
```

不得存在：

```text
read current
resize commits
subscribe
→ changed value missed
```

unsubscribe重复调用无副作用；Runtime terminal后无新 callback。

Listener throw不得阻断其它 listener或 terminalize Data/Runtime。Listener returned Promise不得成为 Data reader flow control；reject必须 contained。

---

## 4. Input Independence

建立：

```text
map Frame active/InputTarget
→ viewport 640×480
→ child Frame call suspends map
→ child becomes sole InputTarget
→ viewport becomes 800×600
```

必须观察：

```text
map Subsystem scope.viewport converges to 800×600
```

且不得：

```text
create map ordinary Input authority
require map Input Interest
emit input.reset/state/event
```

Focus/blur keyboard availability变化不得清空 viewport retained state。

---

## 5. Fresh Carrier

### Same retained value

```text
carrier A: viewport 800×600 accepted
carrier A lost
current remains 800×600
carrier B installed
Renderer sends fresh 800×600 baseline
```

必须证明：fresh wire baseline存在，但 author subscriber不因 structural-equal value被重复通知。

### Changed retained value

```text
carrier A last 800×600
carrier B fresh baseline 1024×768
```

必须更新 retained value并通知一次。

### No legal sample yet

fresh carrier安装而 physical source尚无 positive legal sample时不得发送 fake `0×0`、`null`、默认 `640×480`。首次合法 sample出现后再 publish。

---

## 6. Physical Source

Desktop first realization至少覆盖：

```text
start legal size → initial publication
resize burst A→B→C before emission → latest C publication
same size → no duplicate physical publication required
0-size/invalid → does not publish illegal state or erase last legal source value
blur/focus → no viewport unavailable/reset
hidden→visible → resample converges if size changed
stop → pending callback/rAF inert
DPR-only change → no viewport semantic change
```

---

## 7. Profile Isolation

在 `loomrealm.renderer-data/1` carrier：

```text
viewport.state
→ protocol-invalid for profile v1
```

在 `loomrealm.renderer-data/2` carrier：

```text
viewport.state
→ dispatch only to Viewport child
```

Viewport malformed不得由 Input/Render handler消费；Input/Render消息也不得由 Viewport handler消费。

---

## 8. Failure Boundaries

必须证明：

```text
malformed viewport.state
→ retire current Data carrier
→ retained business RenderDomain not destroyed
→ Frame stack not automatically unwound
→ Runtime not automatically marked failed
```

Data恢复后 fresh baseline可以再次收敛。

---

## 9. Freeze Evidence

Freeze packet至少记录：

```text
subject commit SHA
Node versions for role-local protocol tests
Desktop/Chromium or Hostra version for physical-source tests
all conformance test commands
raw PASS logs/artifacts
cross-profile v1 regression PASS
```

任何 semantics change都建立新 subject；不能复用旧 PASS。
