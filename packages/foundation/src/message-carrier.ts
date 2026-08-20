export type CarrierClosed =
  | {
      readonly kind: "closed";
    }
  | {
      readonly kind: "lost";
      readonly cause?: unknown;
    };

export interface MessageCarrier {
  /**
   * Accept one opaque application message for outbound delivery.
   * Resolution is local carrier acceptance only; never peer ACK.
   */
  send(message: string): Promise<void>;

  /** Exactly one logical inbound message stream. */
  messages(): AsyncIterable<string>;

  /** Resolves exactly once with the immutable terminal fact. */
  readonly closed: Promise<CarrierClosed>;

  /** Idempotently request orderly local termination. */
  close(): Promise<void>;
}
