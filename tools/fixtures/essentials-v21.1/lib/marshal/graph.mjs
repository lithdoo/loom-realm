export function marshalNode(kind, fields = {}) {
  return { kind, ...fields, ivars: fields.ivars ?? Object.create(null), extensions: fields.extensions ?? [] };
}

export function decodeRubyBytes(bytes) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return null; }
}

export function graphStats(root, decoderStats) {
  return Object.freeze({
    ...decoderStats,
    rootKind: root?.kind ?? typeof root,
    unsupportedEncounteredTags: 0,
    invalidReferences: 0,
    discardedNodes: 0,
  });
}
