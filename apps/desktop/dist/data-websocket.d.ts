import type { MessageCarrier } from "@loomrealm/foundation";
export interface DataBufferPolicy {
    readonly maxMessages: number;
    readonly maxBytes: number;
}
export declare const DEFAULT_DATA_BUFFER_POLICY: DataBufferPolicy;
export interface DesktopDataWebSocketPair {
    readonly rendererEndpoint: string;
    readonly runnerEndpoint: string;
    readonly prepared: Promise<void>;
    install(): boolean;
    dispose(): void;
}
export declare function createDesktopDataWebSocketPair(policy: DataBufferPolicy, onFailure: (cause: unknown) => void): Promise<DesktopDataWebSocketPair>;
export declare function connectBoundedDataCarrier(endpoint: string, signal: AbortSignal, policy: DataBufferPolicy): Promise<MessageCarrier>;
