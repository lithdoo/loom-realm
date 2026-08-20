import type { CarrierClosed, MessageCarrier } from "../message-carrier.js";

export interface MemoryCarrierPair {
  readonly left: MessageCarrier;
  readonly right: MessageCarrier;

  /** Inject abrupt transport loss into both endpoints. */
  lose(cause?: unknown): void;
}

interface IteratorResultResolver {
  resolve(result: IteratorResult<string>): void;
}

class MemoryPairState {
  terminal: CarrierClosed | null = null;
  readonly left: MemoryEndpoint;
  readonly right: MemoryEndpoint;

  constructor() {
    this.left = new MemoryEndpoint(this);
    this.right = new MemoryEndpoint(this);
    this.left.connect(this.right);
    this.right.connect(this.left);
  }

  terminate(terminal: CarrierClosed): void {
    if (this.terminal !== null) return;

    this.terminal = terminal;
    this.left.observeTerminal(terminal);
    this.right.observeTerminal(terminal);
  }
}

class MemoryEndpoint implements MessageCarrier {
  readonly closed: Promise<CarrierClosed>;

  private peer: MemoryEndpoint | null = null;
  private readonly inboundQueue: string[] = [];
  private readonly waitingNext: IteratorResultResolver[] = [];
  private readerClaimed = false;
  private resolveClosed!: (terminal: CarrierClosed) => void;

  constructor(private readonly state: MemoryPairState) {
    this.closed = new Promise<CarrierClosed>((resolve) => {
      this.resolveClosed = resolve;
    });
  }

  connect(peer: MemoryEndpoint): void {
    this.peer = peer;
  }

  async send(message: string): Promise<void> {
    if (this.state.terminal !== null) {
      throw new Error("Message carrier is terminal");
    }

    // The pair is fully connected during construction. Keeping the check makes
    // an accidental internal construction error fail closed rather than drop.
    if (this.peer === null) {
      const cause = new Error("Memory carrier peer is unavailable");
      this.state.terminate({ kind: "lost", cause });
      throw cause;
    }

    this.peer.acceptInbound(message);
  }

  messages(): AsyncIterable<string> {
    const endpoint = this;

    return {
      [Symbol.asyncIterator](): AsyncIterator<string> {
        if (endpoint.readerClaimed) {
          throw new Error("Message carrier already has a logical reader");
        }
        endpoint.readerClaimed = true;

        return {
          next(): Promise<IteratorResult<string>> {
            return endpoint.nextInbound();
          },
        };
      },
    };
  }

  async close(): Promise<void> {
    this.state.terminate({ kind: "closed" });
  }

  acceptInbound(message: string): void {
    if (this.state.terminal !== null) {
      throw new Error("Cannot accept inbound message after terminal");
    }

    this.inboundQueue.push(message);
    this.flushWaitingReaders();
  }

  observeTerminal(terminal: CarrierClosed): void {
    this.resolveClosed(terminal);
    this.flushWaitingReaders();
  }

  private nextInbound(): Promise<IteratorResult<string>> {
    const message = this.inboundQueue.shift();
    if (message !== undefined) {
      return Promise.resolve({ done: false, value: message });
    }

    if (this.state.terminal !== null) {
      return Promise.resolve({ done: true, value: undefined });
    }

    return new Promise<IteratorResult<string>>((resolve) => {
      this.waitingNext.push({ resolve });
    });
  }

  private flushWaitingReaders(): void {
    while (this.waitingNext.length > 0 && this.inboundQueue.length > 0) {
      const waiter = this.waitingNext.shift();
      const message = this.inboundQueue.shift();
      if (waiter === undefined || message === undefined) break;
      waiter.resolve({ done: false, value: message });
    }

    if (this.state.terminal === null || this.inboundQueue.length > 0) return;

    for (const waiter of this.waitingNext.splice(0)) {
      waiter.resolve({ done: true, value: undefined });
    }
  }
}

export function createMemoryCarrierPair(): MemoryCarrierPair {
  const state = new MemoryPairState();

  return Object.freeze({
    left: state.left,
    right: state.right,
    lose(cause?: unknown): void {
      const terminal: CarrierClosed =
        cause === undefined ? { kind: "lost" } : { kind: "lost", cause };
      state.terminate(terminal);
    },
  });
}
