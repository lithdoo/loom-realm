# Renderer Data Profile v2 Conformance

> 层级：正式契约 / Conformance  
> 状态：Draft / Candidate  
> 对应 Profile：[Renderer Data Profile v2](./renderer-data-profile-v2.md)  
> 最近复核：2026-09-16

本文定义 Profile v2 Freeze 前最低可执行证据。Profile v1 的 Frozen conformance继续独立成立；v2测试不能替代 v1 regression。

---

## 1. Profile Identity

必须证明：

```text
binding profile /1 → v1 peer semantics only
binding profile /2 → v2 peer semantics
unknown profile     → peer/install rejection according to existing authority boundary
```

`/1 → /2` replacement必须使用 fresh generation；same-generation profile replacement必须被拒绝/不安装。

Canonical target product subject的 Main/DataAuthority projection必须发布 `/2`，且 broker pairing两端 exact match `(S,G,P)`。

---

## 2. Namespace / Direction Matrix

Profile v2必须接受 exact legal direction：

```text
Subsystem → Renderer
  input.interest
  render.domains
  render.snapshot
  render.patch
  render.event

Renderer → Subsystem
  input.state
  input.event
  input.reset
  viewport.state
```

每个 known type在反方向发送必须 Data-fatal。Unknown top-level type必须 Data-fatal。

Profile v1 regression必须证明 `viewport.state` 在 `/1` carrier中无效，而不是被忽略。

---

## 3. Reader / Writer Ownership

Instrumentation必须证明：

```text
one inbound carrier reader per peer
one ordered dispatcher
one serialized outbound writer
```

Input/Render/Viewport manager不得直接竞争 raw `receive()`；各 child sender不得绕过 serialized writer。

并发 child sends必须按 writer提交顺序产生完整 application units，不 interleave JSON bytes/object fragments。

---

## 4. Common Preflight

继承/重跑 v1 common gates：

```text
non-string carrier unit rejected
>1 MiB UTF-8 rejected before child mutation
malformed JSON rejected
representation-invalid rejected
depth >64 rejected
```

Viewport也必须经过同一 common preflight，不得建立 special parser/limit bypass。

---

## 5. Child Isolation

合法消息只调用对应 child handler。

```text
viewport.state
→ exactly Viewport handler
→ zero Input/Render semantic mutation
```

Malformed viewport不得触发 Input reset；malformed Input不得清空 viewport；malformed Render不得改变 viewport retained value before carrier retirement。

---

## 6. Fresh Carrier Baselines

对 fresh carrier记录实际 outbound order并验证 child-independent convergence：

```text
Input Desired Interest republished
Render Registry/Snapshots republished
Viewport current legal state published when available
```

测试不得假设固定 cross-child order或 atomic super-snapshot。

Same-generation reconnect：

```text
Input publication baseline fresh
Render publication baseline fresh with same wire Domain identity semantics
Viewport publication baseline fresh
Subsystem author viewport retained value not reset
```

Fresh generation：

```text
all carrier publication baseline fresh
Render wire universe fresh per existing contract
Viewport author capability object remains Runtime-scoped if Runtime itself survives
```

---

## 7. Terminal First-wins

为 Input / Render / Viewport 各注入 protocol-invalid消息，证明：

```text
first child protocol fatal
→ one terminal result
→ queued/late child traffic cannot resurrect carrier
→ role cleanup idempotent
```

同时证明 Data terminal本身不直接创建 Main Frame unwind/Runtime failure。

---

## 8. Profile Selection Policy

目标 subject必须有测试锁定：

```text
Main canonical DataAuthority dataProfile == "loomrealm.renderer-data/2"
```

对所有该 subject current Renderer⇄Subsystem authorities一致使用 `/2`；测试中不得根据 subsystem name/map presence动态选择 profile。

若保留 v1 compatibility construction seam，必须独立测试且不能成为 canonical target subject的隐式 fallback。

---

## 9. Cross-version Regression

Freeze packet必须同时包括：

```text
renderer-data-profile-conformance-v1 PASS
renderer-data-profile-conformance-v2 PASS
user-input-v1 PASS
render-update-v1 PASS
viewport-state-v1 PASS
renderer-subsystem-data-connection-v1 PASS
```

v2 implementation不得修改 v1 wire acceptance集合。

---

## 10. Freeze Evidence

记录：

```text
subject SHA
all role-local test commands
Node 20/24 where repository governance requires
Desktop/Hostra product subject for physical pairing
raw logs/artifacts
profile selection snapshot evidence
fresh-carrier/reconnect evidence
```

任何 Profile composition/direction/currentness change都建立新 subject并重跑完整矩阵。
