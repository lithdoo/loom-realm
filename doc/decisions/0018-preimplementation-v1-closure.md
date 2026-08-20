# ADR 0018：首次实现前直接收口 current v1

> 状态：Accepted  
> 日期：2026-08-19  
> 影响范围：Game/Launcher历史收口、Subsystem SDK、Renderer Control/Data、Platform provisioning、Frame transport mapping、package/document governance  
> 后续修正：[ADR 0019](./0019-platform-launch-manifest-boundary.md) supersedes 本 ADR 原第 2–3 节的 `{key,module}` / same-Definition-artifact结论；其余 Frame/Data/SDK/governance结论继续有效

## 1. Preimplementation Direct-v1 Reset Rule

在首次 conformant implementation / public compatibility commitment前：

> **Current v1 MAY receive breaking corrections required to produce one coherent first implementation contract.**

旧 shape只留 Git/ADR历史；不保留 deprecated alias、dual parser、compatibility mode。

ADR 0019正依照此规则把 Game Package从 `{key,module}`直接收口为 `{key}`并引入 platform-specific Launch Manifest；没有 v2。

---

## 2. Frame Frozen 特例

本 ADR曾一次性修正 PWA Frame carrier representation：

```text
postMessage(plain object)
→ postMessage(string UTF-8 JSON text)
```

不改变 Frame seven methods/fields、FrameOutcome、identity/lifecycle/Activation、commit barriers、error/timeout/no-retry、failure unwind。

Frame v1继续 Frozen；ADR 0019不涉及 Frame语义。

---

## 3. Current Game / Runner Note

本 ADR在 2026-08-19 曾记录：

```text
Game Package {key,module}
Hostra/PWA same Definition Module
```

该部分现在明确 **Superseded by ADR 0019**。

Current：

```text
Game Package {key}
+ platform-specific Launch Manifest
→ exact join / full preflight LaunchPlan
→ Main launch(key)
→ Host-owned Runner
→ platform-selected Definition Module
```

---

## 4. Subsystem Author / Host Surface

继续有效：

```text
@loomrealm/subsystem       author API
@loomrealm/subsystem/host  trusted Runner integration
```

Author不见 carrier/bootstrap/generation/profile/provisioning/launch manifest。

---

## 5. FrameOutcome / Business Control-flow

继续有效：child completed/cancelled/failed → resolve FrameOutcome；明确 pre-commit rejection → typed reject；Runtime-fatal/ambiguous MUST NOT re-enter business continuation。

ordinary business exception在 authority明确健康时 → Frame failed outcome；protocol ambiguity/invariant corruption → Runtime failure。

---

## 6. DataAuthority / Renderer Data Profile

继续有效：

```text
DataAuthority {subsystemKey,generation,dataProfile}
loomrealm.renderer-data/1 = Connection1 + Input1 + Render1
```

`connectionProfile`已删除；profile change需要 fresh generation。

---

## 7. Unified JSON Text Carrier

继续有效：Runtime Control / Renderer Control / Renderer Data message-oriented profiles均为 one UTF-8 JSON text string per carrier unit。Structured Clone只用于 Platform bootstrap/Port transfer。

---

## 8. Late Data Provisioning

继续有效：Runtime ready不携 Data material；Hostra Broker→Runner IPC→Data WS；PWA Broker→Worker provisioning→MessagePort。Provisioning failure不失败 Runtime、不 unwind Frame、不修改 Main DataAuthority。

---

## 9. Document Governance

主要 definition dependency保持 DAG。Current Contract覆盖 historical/Superseded ADR示例。

Preimplementation direct-v1 reset不能在真实 compatibility boundary形成后继续滥用；届时 incompatible change必须进入正常 version/migration治理。
