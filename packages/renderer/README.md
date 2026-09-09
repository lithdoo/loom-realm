# @loomrealm/renderer

Renderer Control holder with M8 Data reconciliation, qualified M10 User Input, qualified M11 Render replica, M12 version-safe resources, and qualified M13 Web Presentation.

> Status: **M8/M10/M11/M12/M13 Implemented / Qualified**

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

M11 adds one internal Render replica per existing Data slot. Registry/Snapshot/Patch commits are atomic, Event delivery is transient, and same-generation carrier replacement preserves identity history while requiring a fresh Registry/Snapshot baseline. The Store and its qualification observation seam are not exported from the package root; M11 adds no presentation or subscription API.

M12 adds `@loomrealm/renderer/resource-client` as a platform-integration subpath while keeping the root surface unchanged. It resolves only logical namespace/hierarchical keys, requires `expectedContentVersion`, rejects version mismatch before returning bytes, and returns detached `Uint8Array` values.

M13 adds only trusted/internal Config/bootstrap helpers, a Control/Store reevaluation attachment, a thin stable-identity Web Projector, and a Window-lifetime resource façade. None is exported from the package root. Real Chromium qualification covers browser loading, Custom Element lifecycle, per-subsystem currentness, structural data delivery, unknown-tag permanent freeze, and resource cancellation. M14 supplies the first real `loom.map` business component vocabulary; it does not own the projection mechanism.
