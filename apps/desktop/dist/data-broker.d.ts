import type { DataConnectionAuthoritySink, HostedRuntime, RendererDataBinding } from "@loomrealm/platform-ports";
import type { HostraRuntimeDataProvisioner } from "@loomrealm/game-launcher-hostra";
import { type DataBufferPolicy } from "./data-websocket.js";
export interface DesktopDataBrokerOptions {
    readonly bufferPolicy?: DataBufferPolicy;
    readonly candidateId?: () => string;
}
export declare class DesktopDataConnectionBroker {
    readonly sink: DataConnectionAuthoritySink;
    readonly onRuntimeDataProvisioner: (runtime: HostedRuntime, provisioner: HostraRuntimeDataProvisioner) => void;
    private authority;
    private readonly provisioners;
    private readonly renderers;
    private readonly slots;
    private readonly policy;
    private readonly mintCandidateId;
    private closed;
    constructor(options?: DesktopDataBrokerOptions);
    rendererDataBinding(rendererControlToken: string): RendererDataBinding;
    requestCandidate(subsystemKey: string): Promise<boolean>;
    private slot;
    private replace;
    private authorityEntry;
    private authorized;
    private scheduleReconcile;
    private prepareCandidate;
    private install;
    private onPhysicalFailure;
    private disposePending;
    private retire;
    private cleanupRetired;
    private enqueue;
    close(): void;
}
