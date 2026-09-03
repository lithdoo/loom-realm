import {
  connectRendererControlPeer,
  type RendererAuthoritySnapshotV1,
  type RendererControlPeer,
  type RendererPeerConnectOptions,
  type RendererPeerConnectOutcome,
} from "@loomrealm/renderer-control";

export interface RendererControlCurrent {
  readonly peer: RendererControlPeer;
  readonly snapshot: RendererAuthoritySnapshotV1;
}

export type RendererControlHolderConnectOutcome =
  | { readonly kind: "installed"; readonly current: RendererControlCurrent }
  | { readonly kind: "rejected"; readonly code: "RENDERER_AUTHENTICATION_FAILED" | "RENDERER_CONTROL_PROTOCOL_UNSUPPORTED" | "PROTOCOL_STATE_ERROR" }
  | { readonly kind: "terminal" };

export interface RendererControlHolder {
  current(): RendererControlCurrent | null;
  connect(options: RendererPeerConnectOptions): Promise<RendererControlHolderConnectOutcome>;
}

class ControlHolder implements RendererControlHolder {
  private currentValue: RendererControlCurrent | null = null;
  private connecting = false;

  current(): RendererControlCurrent | null {
    return this.currentValue;
  }

  async connect(options: RendererPeerConnectOptions): Promise<RendererControlHolderConnectOutcome> {
    if (this.connecting)
      throw new TypeError("Renderer Control connect already in progress");
    this.connecting = true;
    let outcome: RendererPeerConnectOutcome;
    try {
      outcome = await connectRendererControlPeer(options);
    } finally {
      this.connecting = false;
    }
    if (outcome.kind === "rejected")
      return Object.freeze({ kind: "rejected", code: outcome.code });
    if (outcome.kind === "terminal") return Object.freeze({ kind: "terminal" });

    const peer = outcome.peer;
    const installed = Object.freeze({ peer, snapshot: outcome.snapshot });
    this.currentValue = installed;
    void this.consume(peer);
    void peer.terminal.then(() => {
      if (this.currentValue?.peer === peer) this.currentValue = null;
    });
    return Object.freeze({ kind: "installed", current: installed });
  }

  private async consume(peer: RendererControlPeer): Promise<void> {
    for await (const snapshot of peer.states()) {
      if (this.currentValue?.peer !== peer) continue;
      this.currentValue = Object.freeze({ peer, snapshot });
    }
  }
}

export function createRendererControlHolder(): RendererControlHolder {
  return new ControlHolder();
}
