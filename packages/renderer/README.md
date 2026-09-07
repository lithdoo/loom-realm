# @loomrealm/renderer

Renderer Control holder with M8 Data reconciliation and qualified M10 User Input implementation.

> Status: **M8 Implemented / Qualified · M10 Implemented / Regression Verified**

Current implemented state remains one atomic Control `{ peer, snapshot } | null` record plus one private Data slot per desired subsystem authority. Protocol legality stays in `@loomrealm/renderer-control` and `@loomrealm/data`.

M10 exact additive construction surface：

```ts
createRendererControlHolder(
  data?: RendererDataBinding,
  input?: RendererInputSource,
): RendererControlHolder
```

Existing one-argument calls remain valid。

M10 adds only role-local behavior on top of existing holder/Data slots：

```text
one optional construction-time RendererInputSource object
→ 0..1 active source subscription for current Control peer
→ current Data-slot Interest Registry
→ Effective gate from Control + Data + Interest + Producer
→ bounded State/Event/Reset publisher
→ current RendererDataPeer
```

Source object is fixed for holder lifetime；Control replacement/terminal invalidates and stops the old active subscription，and a later current Control on the same holder restarts the same source object with fresh producer facts。Late callbacks from a stopped subscription are ignored。

No Store、EventBus、producer registry、mutable source replacement、InputTarget shadow authority、lease/heartbeat、generic queue framework、Broker、retry or replay layer is added。

ADR 0029 does not change Renderer Effective semantics：Subsystem mutation-gate State suppression/reopen convergence remains entirely Subsystem-local。

Implementation may choose private class/layout names only；the public construction surface、source lifetime、Effective semantics and publisher ordering are frozen by M10/02–M10/05。
