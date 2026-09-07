# @loomrealm/renderer

Renderer Control holder with M8 Data reconciliation and M10 User Input implementation boundary.

> Status: **M8 Implemented / Qualified · M10 Preimplementation Closed**

Current implemented state remains one atomic Control `{ peer, snapshot } | null` record plus one private Data slot per desired subsystem authority. Protocol legality stays in `@loomrealm/renderer-control` and `@loomrealm/data`.

M10 adds only role-local behavior on top of those existing slots:

```text
optional canonical input source injected once for holder lifetime
→ current Data-slot Interest Registry
→ Effective gate from Control + Data + Interest + Producer
→ bounded State/Event/Reset publisher
→ current RendererDataPeer
```

No Store, EventBus, producer registry, InputTarget shadow authority, lease/heartbeat, generic queue framework, Broker, retry or replay layer is added.

ADR 0029 does not change Renderer Effective semantics: Subsystem mutation-gate State suppression/reopen convergence is entirely Subsystem-local.

The precise M10 construction signature may evolve during implementation, but ownership is frozen: one source per holder lifetime, no mutable runtime producer-registration API, and old holder/source/Data-slot work cannot affect a replacement holder.
