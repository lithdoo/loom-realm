const KNOWN_HELPERS = Object.freeze([
  ["trainer-battle", /\b(?:pbTrainerBattle|TrainerBattle\.start)\b/u],
  ["item-event", /\b(?:pbItemBall|pbReceiveItem)\b/u],
  ["hidden-item", /\bpbHiddenItem\b/u],
  ["transfer-helper", /\b(?:pbTransferWithTransition|transfer_player)\b/u],
  ["phone-helper", /\bpbPhoneRegisterBattle\b/u],
]);

function rubyText(value) {
  if (value?.kind === "RubyString") return value.text;
  return typeof value === "string" ? value : null;
}

function arrayItems(value) {
  return value?.kind === "Array" ? value.items : [];
}

export function classifyEssentialsSemantics(rmxpCorpus, compilerPasses) {
  const scripts = [];
  const helperCalls = [];
  const messages = [];
  const warps = [];
  let eventCommands = 0;
  let unclassifiedEventMeaning = 0;
  const seen = new Set();

  function visit(value, filename) {
    if (value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (value.kind === "RmxpObject" && value.className === "RPG::EventCommand") {
      eventCommands += 1;
      const code = value.fields["@code"];
      const parameters = arrayItems(value.fields["@parameters"]);
      const source = Object.freeze({ filename, rubyObjectId: value.rubyObjectId, code });
      if (code === 101 || code === 401) {
        const text = rubyText(parameters[0]);
        if (text !== null) messages.push(Object.freeze({ text, source }));
      } else if (code === 201) {
        warps.push(Object.freeze({ parameters: Object.freeze([...parameters]), source }));
      } else if (code === 355 || code === 655) {
        const text = rubyText(parameters[0]) ?? "";
        const helper = KNOWN_HELPERS.find(([, pattern]) => pattern.test(text));
        const script = Object.freeze({ text, classification: helper?.[0] ?? "opaque-ruby", source });
        scripts.push(script);
        if (helper) helperCalls.push(script);
      } else {
        unclassifiedEventMeaning += 1;
      }
    }
    if (Array.isArray(value)) {
      for (const child of value) visit(child, filename);
      return;
    }
    if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return;
    for (const child of Object.values(value)) visit(child, filename);
  }

  for (const root of rmxpCorpus.roots) visit(root.root, root.filename);
  const passClassifications = Object.freeze(compilerPasses.map((pass) => Object.freeze({
    id: pass.id,
    classification: pass.id.startsWith("compile_") && !["compile_animations", "compile_trainer_events"].includes(pass.id)
      ? "canonical-pbs"
      : pass.id === "compile_animations" ? "static-animation-index"
        : pass.id === "compile_trainer_events" ? "derived-event-semantics"
          : "static-message-extraction",
  })));
  return Object.freeze({
    facts: Object.freeze({ scripts: Object.freeze(scripts), helperCalls: Object.freeze(helperCalls), messages: Object.freeze(messages), warps: Object.freeze(warps) }),
    coverage: Object.freeze({
      compilerPasses: passClassifications,
      opaqueRubyScripts: scripts.filter((script) => script.classification === "opaque-ruby").length,
      unclassifiedEventMeaning,
      classifiedHelperCalls: helperCalls.length,
      extractedMessages: messages.length,
      directWarps: warps.length,
      eventCommands,
      canonicalFactsMutated: 0,
    }),
  });
}
