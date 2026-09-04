import type { RendererDataBinding } from "@loomrealm/platform-ports";
import { type DataBufferPolicy } from "./data-websocket.js";
interface AuthorityTuple {
    readonly subsystemKey: string;
    readonly generation: number;
    readonly dataProfile: string;
}
export declare class DesktopRendererDataBinding {
    private readonly policy;
    readonly binding: RendererDataBinding;
    private readonly slots;
    constructor(policy: DataBufferPolicy);
    private slot;
    private acquire;
    prepare(candidateId: string, endpoint: string, tuple: AuthorityTuple, signal: AbortSignal): Promise<void>;
    commit(candidateId: string, tuple: AuthorityTuple): boolean;
    revoke(candidateId: string): void;
    close(): void;
}
export {};
