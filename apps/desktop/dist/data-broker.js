import { randomBytes } from "node:crypto";
import { createDesktopDataWebSocketPair, DEFAULT_DATA_BUFFER_POLICY, } from "./data-websocket.js";
import { DesktopRendererDataBinding } from "./renderer-data-binding.js";
function deferred() {
    let settled = false;
    let resolvePromise;
    const promise = new Promise((resolve) => { resolvePromise = resolve; });
    return {
        promise,
        resolve(value) { if (!settled) {
            settled = true;
            resolvePromise(value);
        } },
    };
}
export class DesktopDataConnectionBroker {
    sink;
    onRuntimeDataProvisioner;
    authority = null;
    provisioners = new WeakMap();
    renderers = new Map();
    slots = new Map();
    policy;
    mintCandidateId;
    closed = false;
    constructor(options = {}) {
        this.policy = options.bufferPolicy ?? DEFAULT_DATA_BUFFER_POLICY;
        if (!Number.isSafeInteger(this.policy.maxMessages) || this.policy.maxMessages <= 0 ||
            !Number.isSafeInteger(this.policy.maxBytes) || this.policy.maxBytes <= 0) {
            throw new TypeError("Invalid Desktop Data buffer policy");
        }
        this.mintCandidateId = options.candidateId ?? (() => randomBytes(24).toString("base64url"));
        this.sink = Object.freeze({
            replace: (view) => this.replace(view),
        });
        this.onRuntimeDataProvisioner = (runtime, provisioner) => {
            this.provisioners.set(runtime, provisioner);
            this.scheduleReconcile();
        };
    }
    rendererDataBinding(rendererControlToken) {
        if (typeof rendererControlToken !== "string" || rendererControlToken.length === 0) {
            throw new TypeError("Invalid Renderer Control correlation token");
        }
        let renderer = this.renderers.get(rendererControlToken);
        if (renderer === undefined) {
            renderer = new DesktopRendererDataBinding(this.policy);
            this.renderers.set(rendererControlToken, renderer);
            this.scheduleReconcile();
        }
        return renderer.binding;
    }
    requestCandidate(subsystemKey) {
        if (this.closed)
            return Promise.resolve(false);
        const view = this.authority;
        const entry = view?.entries.find((candidate) => candidate.subsystemKey === subsystemKey);
        if (view === null || view === undefined || entry === undefined)
            return Promise.resolve(false);
        const slot = this.slot(subsystemKey);
        if (slot.pending !== null)
            return Promise.resolve(false);
        const renderer = this.renderers.get(view.rendererControlToken);
        const provisioner = this.provisioners.get(entry.runtime);
        if (renderer === undefined || provisioner === undefined)
            return Promise.resolve(false);
        let candidateId;
        try {
            candidateId = this.mintCandidateId();
        }
        catch {
            return Promise.resolve(false);
        }
        if (typeof candidateId !== "string" || candidateId.length === 0)
            return Promise.resolve(false);
        const completion = deferred();
        const candidate = {
            candidateId,
            rendererControlToken: view.rendererControlToken,
            runtime: entry.runtime,
            subsystemKey: entry.subsystemKey,
            generation: entry.generation,
            dataProfile: entry.dataProfile,
            provisioner,
            renderer,
            controller: new AbortController(),
            completion,
            physical: null,
            state: "preparing",
        };
        slot.pending = candidate;
        void this.prepareCandidate(slot, candidate);
        return completion.promise;
    }
    slot(subsystemKey) {
        let slot = this.slots.get(subsystemKey);
        if (slot === undefined) {
            slot = { current: null, pending: null, tail: Promise.resolve() };
            this.slots.set(subsystemKey, slot);
        }
        return slot;
    }
    replace(view) {
        try {
            if (this.closed && view !== null)
                return;
            this.authority = view;
            for (const slot of this.slots.values()) {
                if (slot.pending !== null && !this.authorized(slot.pending)) {
                    const stale = slot.pending;
                    slot.pending = null;
                    this.retire(stale);
                }
                if (slot.current !== null && !this.authorized(slot.current)) {
                    const stale = slot.current;
                    slot.current = null;
                    this.retire(stale);
                }
            }
            this.scheduleReconcile();
        }
        catch {
            // The sink contract never lets adapter cleanup failure escape Main's lane.
        }
    }
    authorityEntry(subsystemKey) {
        return this.authority?.entries.find((entry) => entry.subsystemKey === subsystemKey);
    }
    authorized(candidate) {
        const view = this.authority;
        if (view === null || view.rendererControlToken !== candidate.rendererControlToken)
            return false;
        const entry = this.authorityEntry(candidate.subsystemKey);
        return entry !== undefined &&
            entry.runtime === candidate.runtime &&
            entry.generation === candidate.generation &&
            entry.dataProfile === candidate.dataProfile;
    }
    scheduleReconcile() {
        queueMicrotask(() => {
            if (this.closed || this.authority === null)
                return;
            for (const entry of this.authority.entries) {
                const slot = this.slot(entry.subsystemKey);
                const currentMatches = slot.current !== null && this.authorized(slot.current);
                if (!currentMatches && slot.pending === null)
                    void this.requestCandidate(entry.subsystemKey);
            }
        });
    }
    async prepareCandidate(slot, candidate) {
        try {
            const physical = await createDesktopDataWebSocketPair(this.policy, (cause) => this.onPhysicalFailure(slot, candidate, cause));
            candidate.physical = physical;
            if (slot.pending !== candidate || !this.authorized(candidate) || candidate.controller.signal.aborted) {
                physical.dispose();
                this.disposePending(slot, candidate);
                return;
            }
            const tuple = {
                subsystemKey: candidate.subsystemKey,
                generation: candidate.generation,
                dataProfile: candidate.dataProfile,
            };
            await Promise.all([
                candidate.renderer.prepare(candidate.candidateId, physical.rendererEndpoint, tuple, candidate.controller.signal),
                candidate.provisioner.prepare({
                    candidateId: candidate.candidateId,
                    endpoint: physical.runnerEndpoint,
                    generation: candidate.generation,
                    dataProfile: candidate.dataProfile,
                }, candidate.controller.signal),
                physical.prepared,
            ]);
            candidate.state = "prepared";
            this.enqueue(slot, () => this.install(slot, candidate));
        }
        catch {
            this.enqueue(slot, () => this.disposePending(slot, candidate));
        }
    }
    install(slot, candidate) {
        if (slot.pending !== candidate ||
            candidate.state !== "prepared" ||
            candidate.physical === null ||
            !this.authorized(candidate)) {
            this.disposePending(slot, candidate);
            return;
        }
        const old = slot.current;
        if (old !== null) {
            old.state = "retired";
            old.controller.abort(new Error("Data Connection superseded"));
            slot.current = null;
        }
        slot.pending = null;
        slot.current = candidate;
        candidate.state = "current";
        const tuple = {
            subsystemKey: candidate.subsystemKey,
            generation: candidate.generation,
            dataProfile: candidate.dataProfile,
        };
        if (!candidate.physical.install() || !candidate.renderer.commit(candidate.candidateId, tuple)) {
            slot.current = null;
            this.retire(candidate);
            if (old !== null)
                this.cleanupRetired(old);
            return;
        }
        let delivery;
        try {
            delivery = candidate.provisioner.commit(candidate.candidateId, candidate.controller.signal);
        }
        catch (error) {
            delivery = Promise.reject(error);
        }
        if (old !== null)
            this.cleanupRetired(old);
        candidate.completion.resolve(true);
        void delivery.then(() => { }, () => this.enqueue(slot, () => {
            if (slot.current !== candidate)
                return;
            slot.current = null;
            this.retire(candidate);
            this.scheduleReconcile();
        }));
    }
    onPhysicalFailure(slot, candidate, _cause) {
        this.enqueue(slot, () => {
            if (slot.pending === candidate) {
                slot.pending = null;
                this.retire(candidate);
            }
            if (slot.current === candidate) {
                slot.current = null;
                this.retire(candidate);
                this.scheduleReconcile();
            }
        });
    }
    disposePending(slot, candidate) {
        if (slot.pending === candidate)
            slot.pending = null;
        this.retire(candidate);
    }
    retire(candidate) {
        if (candidate.state === "retired") {
            candidate.completion.resolve(false);
            return;
        }
        candidate.state = "retired";
        candidate.controller.abort(new Error("Data Connection retired"));
        candidate.renderer.revoke(candidate.candidateId);
        this.cleanupRetired(candidate);
        candidate.completion.resolve(false);
    }
    cleanupRetired(candidate) {
        try {
            candidate.provisioner.revoke(candidate.candidateId);
        }
        catch { }
        try {
            candidate.physical?.dispose();
        }
        catch { }
        candidate.renderer.revoke(candidate.candidateId);
        candidate.completion.resolve(candidate.state === "current");
    }
    enqueue(slot, operation) {
        const next = slot.tail.then(operation, operation);
        slot.tail = next.then(() => undefined, () => undefined);
    }
    close() {
        if (this.closed)
            return;
        this.closed = true;
        this.replace(null);
        for (const renderer of this.renderers.values())
            renderer.close();
        this.renderers.clear();
    }
}
